"""
Library Quiz Game - Jackbox-style trivia for teens
FastAPI backend with WebSocket support for real-time gameplay
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.templating import Jinja2Templates
import json
import asyncio
import uuid
import time
import random
import string
import socket
from datetime import datetime
from pathlib import Path
import csv
import io
import os
from dotenv import load_dotenv
import bcrypt

# Load environment variables
load_dotenv()

app = FastAPI(title="Library Quiz Game")

# ─────────────────────────── Supabase Database Setup ─────────────────────────── #

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Connected to Supabase Database")
    except Exception as e:
        print(f"⚠️  Supabase connection failed: {e}")
        print("   Falling back to local authentication")
else:
    print("⚠️  No Supabase credentials found in .env file")
    print("   Using local authentication (data/admins.json)")

# Admin session tokens (in-memory)
admin_sessions: dict[str, dict] = {}  # token -> {username, name, user_id}

# Track active hosting sessions per admin
admin_hosting_sessions: dict[str, str] = {}  # admin_username -> room_code

# ─────────────────────────── Password Hashing ─────────────────────────── #

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))

# ─────────────────────────── Data Storage ─────────────────────────── #

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)
QUESTIONS_FILE = DATA_DIR / "questions.json"
ADMINS_FILE = DATA_DIR / "admins.json"

def load_admins():
    """Load admin accounts from JSON file (fallback when no Supabase)"""
    if ADMINS_FILE.exists():
        with open(ADMINS_FILE, "r") as f:
            return json.load(f)
    # Default admin account
    default = {
        "admins": {
            "admin": {
                "password": "library123",
                "name": "Admin"
            }
        }
    }
    save_admins(default)
    return default

def save_admins(data):
    """Save admin accounts to JSON file"""
    with open(ADMINS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def verify_admin_token(token: str) -> str | None:
    """Verify admin token and return email/username, or None if invalid"""
    if token in admin_sessions:
        return admin_sessions[token].get("email") or admin_sessions[token].get("username")
    return None

def load_questions():
    """Load questions from JSON file"""
    if QUESTIONS_FILE.exists():
        with open(QUESTIONS_FILE, "r") as f:
            return json.load(f)
    # Default questions with multiple types:
    # type: "choice" (default), "truefalse", "poll", "text", "number", "wager"
    default = {
        "categories": {
            "general": {
                "name": "General Knowledge",
                "questions": [
                    {
                        "id": "q1",
                        "type": "choice",
                        "question": "What is the largest planet in our solar system?",
                        "answers": ["Mars", "Jupiter", "Saturn", "Neptune"],
                        "correct": 1,
                        "time_limit": 20
                    },
                    {
                        "id": "q2",
                        "type": "truefalse",
                        "question": "The Great Wall of China is visible from space.",
                        "correct": False,
                        "time_limit": 10
                    },
                    {
                        "id": "q3",
                        "type": "number",
                        "question": "How many planets are in our solar system?",
                        "correct": 8,
                        "tolerance": 0,
                        "time_limit": 15
                    }
                ]
            },
            "books": {
                "name": "Books & Literature",
                "questions": [
                    {
                        "id": "b1",
                        "type": "choice",
                        "question": "Who wrote 'The Hunger Games'?",
                        "answers": ["J.K. Rowling", "Suzanne Collins", "Stephenie Meyer", "Veronica Roth"],
                        "correct": 1,
                        "time_limit": 15
                    },
                    {
                        "id": "b2",
                        "type": "text",
                        "question": "Complete the title: Harry Potter and the Sorcerer's ____",
                        "correct": ["stone", "Stone", "STONE"],
                        "time_limit": 20
                    },
                    {
                        "id": "b3",
                        "type": "truefalse", 
                        "question": "The Hobbit was written before The Lord of the Rings.",
                        "correct": True,
                        "time_limit": 10
                    }
                ]
            },
            "pop_culture": {
                "name": "Pop Culture",
                "questions": [
                    {
                        "id": "p1",
                        "type": "choice",
                        "question": "What streaming service makes 'Stranger Things'?",
                        "answers": ["Hulu", "Disney+", "Netflix", "Amazon Prime"],
                        "correct": 2,
                        "time_limit": 10
                    },
                    {
                        "id": "p2",
                        "type": "number",
                        "question": "What year did Minecraft officially release?",
                        "correct": 2011,
                        "tolerance": 0,
                        "time_limit": 15
                    },
                    {
                        "id": "p3",
                        "type": "wager",
                        "question": "Which movie has the highest box office of all time?",
                        "answers": ["Avengers: Endgame", "Avatar", "Titanic", "Star Wars: The Force Awakens"],
                        "correct": 1,
                        "time_limit": 25
                    }
                ]
            },
            "hot_takes": {
                "name": "🔥 Hot Takes (Polls)",
                "questions": [
                    {
                        "id": "ht1",
                        "type": "poll",
                        "question": "Which is the best pizza topping?",
                        "answers": ["Pepperoni", "Pineapple", "Mushrooms", "Extra Cheese"],
                        "time_limit": 15
                    },
                    {
                        "id": "ht2",
                        "type": "poll",
                        "question": "Would you rather have unlimited money or unlimited time?",
                        "answers": ["Unlimited Money", "Unlimited Time"],
                        "time_limit": 15
                    },
                    {
                        "id": "ht3",
                        "type": "poll",
                        "question": "What's the best way to spend a weekend?",
                        "answers": ["Gaming", "Reading", "Going Out", "Sleeping"],
                        "time_limit": 15
                    }
                ]
            }
        }
    }
    save_questions(default)
    return default

def save_questions(data):
    """Save questions to JSON file"""
    with open(QUESTIONS_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ─────────────────────────── Game State ─────────────────────────── #

def generate_room_code():
    """Generate a 4-letter room code"""
    return ''.join(random.choices(string.ascii_uppercase, k=4))

class Player:
    def __init__(self, player_id: str, name: str):
        self.id = player_id
        self.name = name
        self.score = 0
        self.current_answer = None
        self.answer_time = None
        self.streak = 0
        self.wager = 0  # For wager questions
        self.ws: WebSocket = None
        self.team_id: str = None  # Team assignment


class Team:
    """Represents a team in team mode"""
    COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e91e63", "#00bcd4"]
    NAMES = ["Red Team", "Blue Team", "Green Team", "Orange Team", "Purple Team", "Teal Team", "Pink Team", "Cyan Team"]
    
    def __init__(self, team_id: str, name: str = None, color: str = None):
        self.id = team_id
        self.name = name or f"Team {team_id}"
        self.color = color or "#6c5ce7"
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color
        }

class GameRoom:
    STATES = ["lobby", "question", "reveal", "leaderboard", "finished"]
    
    def __init__(self, room_code: str):
        self.code = room_code
        self.state = "lobby"
        self.players: dict[str, Player] = {}
        self.host_ws: WebSocket = None
        self.questions = []
        self.current_question_idx = -1
        self.question_start_time = None
        self.selected_categories = []
        self.questions_per_game = 10
        self.custom_time_limit = None  # None = use question default, 0 = wait for all
        self.last_activity = time.time()  # For room cleanup
        self.host_connected = False  # Track if host is connected
        self.host_admin = None  # Admin username who created/hosts the room
        
        # Team mode support
        self.team_mode = False
        self.teams: dict[str, Team] = {}  # team_id -> Team
        
        # Bowl mode support
        self.game_mode = "classic"  # "classic" or "bowl"
        self.buzz_winner = None     # player_id who buzzed first
        self.buzz_team = None       # team_id that buzzed
        self.buzz_answer = None     # answer submitted by buzz winner
        self.steal_eligible = []    # team_ids that can still steal
        self.awaiting_judgment = False
        self.bowl_phase = None      # "buzzing", "answering", "stealing", None
        
    def add_player(self, player: Player):
        self.players[player.id] = player
        
    def remove_player(self, player_id: str):
        if player_id in self.players:
            del self.players[player_id]
    
    # ─────────────────────────── Team Management ─────────────────────────── #
    
    def create_team(self, name: str = None, color: str = None) -> Team:
        """Create a new team"""
        team_id = str(len(self.teams) + 1)
        idx = len(self.teams)
        
        # Use default name/color if not provided
        if not name:
            name = Team.NAMES[idx % len(Team.NAMES)]
        if not color:
            color = Team.COLORS[idx % len(Team.COLORS)]
        
        team = Team(team_id, name, color)
        self.teams[team_id] = team
        return team
    
    def delete_team(self, team_id: str) -> bool:
        """Delete a team and unassign its players"""
        if team_id not in self.teams:
            return False
        
        # Unassign all players from this team
        for player in self.players.values():
            if player.team_id == team_id:
                player.team_id = None
        
        del self.teams[team_id]
        return True
    
    def assign_player_to_team(self, player_id: str, team_id: str | None) -> bool:
        """Assign a player to a team (or None to unassign)"""
        if player_id not in self.players:
            return False
        if team_id is not None and team_id not in self.teams:
            return False
        
        self.players[player_id].team_id = team_id
        return True
    
    def get_team_players(self, team_id: str) -> list[Player]:
        """Get all players in a team"""
        return [p for p in self.players.values() if p.team_id == team_id]
    
    def get_unassigned_players(self) -> list[Player]:
        """Get players not assigned to any team"""
        return [p for p in self.players.values() if p.team_id is None]
    
    def get_team_score(self, team_id: str) -> int:
        """Calculate total score for a team"""
        return sum(p.score for p in self.get_team_players(team_id))
    
    def get_team_leaderboard(self) -> list[dict]:
        """Get sorted team leaderboard"""
        team_scores = []
        for team_id, team in self.teams.items():
            players = self.get_team_players(team_id)
            total_score = sum(p.score for p in players)
            team_scores.append({
                "id": team.id,
                "name": team.name,
                "color": team.color,
                "score": total_score,
                "player_count": len(players),
                "players": [{"id": p.id, "name": p.name, "score": p.score} for p in players]
            })
        
        return sorted(team_scores, key=lambda t: -t["score"])
    
    def auto_assign_teams(self, num_teams: int = 2):
        """Automatically distribute players evenly across teams"""
        # Create teams if needed
        while len(self.teams) < num_teams:
            self.create_team()
        
        # Get all players and shuffle
        players = list(self.players.values())
        random.shuffle(players)
        
        # Distribute evenly
        team_ids = list(self.teams.keys())[:num_teams]
        for i, player in enumerate(players):
            player.team_id = team_ids[i % num_teams]
            
    def get_current_question(self):
        if 0 <= self.current_question_idx < len(self.questions):
            return self.questions[self.current_question_idx]
        return None
    
    def setup_game(self, categories: list, num_questions: int):
        """Setup game with selected categories"""
        self.selected_categories = categories
        self.questions_per_game = num_questions
        
        # Load and shuffle questions from selected categories
        all_questions = load_questions()
        available = []
        for cat_id in categories:
            if cat_id in all_questions["categories"]:
                available.extend(all_questions["categories"][cat_id]["questions"])
        
        random.shuffle(available)
        self.questions = available[:num_questions]
        
    def calculate_points(self, time_taken: float, time_limit: float):
        """Calculate points based on speed (faster = more points)"""
        if time_taken >= time_limit:
            return 100  # Base points for correct
        # Bonus points for speed (up to 900 extra)
        speed_bonus = int(900 * (1 - time_taken / time_limit))
        return 100 + speed_bonus
    
    def get_leaderboard(self):
        """Get sorted leaderboard"""
        sorted_players = sorted(
            self.players.values(),
            key=lambda p: (-p.score, p.name)
        )
        leaderboard = []
        for p in sorted_players:
            entry = {"id": p.id, "name": p.name, "score": p.score, "streak": p.streak}
            if self.team_mode and p.team_id and p.team_id in self.teams:
                team = self.teams[p.team_id]
                entry["team_id"] = p.team_id
                entry["team_name"] = team.name
                entry["team_color"] = team.color
            leaderboard.append(entry)
        return leaderboard
    
    def to_lobby_state(self):
        return {
            "room_code": self.code,
            "state": self.state,
            "players": [{"id": p.id, "name": p.name, "team_id": p.team_id} for p in self.players.values()],
            "player_count": len(self.players),
            "team_mode": self.team_mode,
            "teams": {tid: t.to_dict() for tid, t in self.teams.items()},
            "game_mode": self.game_mode
        }
    
    def to_full_state(self):
        """Get full game state for reconnection/mid-game join"""
        state_data = self.to_lobby_state()
        state_data["host_connected"] = self.host_connected
        
        # Include team leaderboard if in team mode
        if self.team_mode and self.teams:
            state_data["team_leaderboard"] = self.get_team_leaderboard()
        
        # Include bowl mode state
        if self.game_mode == "bowl":
            state_data["bowl_phase"] = self.bowl_phase
            state_data["buzz_winner"] = self.buzz_winner
            state_data["buzz_team"] = self.buzz_team
            state_data["awaiting_judgment"] = self.awaiting_judgment
            state_data["steal_eligible"] = self.steal_eligible
        
        if self.state in ["question", "reveal"] and self.current_question_idx >= 0:
            question = self.get_current_question()
            if question:
                q_type = question.get("type", "choice")
                state_data["current_question"] = {
                    "question_num": self.current_question_idx + 1,
                    "total_questions": len(self.questions),
                    "question": question["question"],
                    "question_type": q_type,
                    "time_limit": self.custom_time_limit if self.custom_time_limit is not None else question.get("time_limit", 15)
                }
                if q_type in ["choice", "poll", "wager"]:
                    state_data["current_question"]["answers"] = question.get("answers", [])
                elif q_type == "truefalse":
                    state_data["current_question"]["answers"] = ["TRUE", "FALSE"]
        
        return state_data
    
    def update_activity(self):
        """Update last activity timestamp"""
        self.last_activity = time.time()
    
    # ─────────────────────────── Bowl Mode ─────────────────────────── #
    
    def reset_bowl_state(self):
        """Reset bowl mode state for a new question"""
        self.buzz_winner = None
        self.buzz_team = None
        self.buzz_answer = None
        self.steal_eligible = list(self.teams.keys()) if self.team_mode else []
        self.awaiting_judgment = False
        self.bowl_phase = "buzzing" if self.game_mode == "bowl" else None
    
    def handle_buzz(self, player_id: str) -> bool:
        """Handle a buzz attempt. Returns True if this player won the buzz."""
        if self.bowl_phase != "buzzing":
            return False
        
        if self.buzz_winner is not None:
            return False  # Already buzzed
        
        player = self.players.get(player_id)
        if not player:
            return False
        
        # Check if player's team is eligible (for steal phase)
        if player.team_id and player.team_id not in self.steal_eligible:
            return False
        
        self.buzz_winner = player_id
        self.buzz_team = player.team_id
        self.bowl_phase = "answering"
        
        return True
    
    def handle_steal_buzz(self, player_id: str) -> bool:
        """Handle a steal buzz attempt. Returns True if this player won the steal."""
        if self.bowl_phase != "stealing":
            return False
        
        player = self.players.get(player_id)
        if not player:
            return False
        
        # Only players from eligible teams can steal
        if not player.team_id or player.team_id not in self.steal_eligible:
            return False
        
        self.buzz_winner = player_id
        self.buzz_team = player.team_id
        self.bowl_phase = "answering"
        self.buzz_answer = None
        
        return True


# Active game rooms
rooms: dict[str, GameRoom] = {}

# Room cleanup settings
ROOM_INACTIVE_TIMEOUT = 40 * 60  # 40 minutes in seconds

# ─────────────────────────── WebSocket Manager ─────────────────────────── #

async def broadcast_to_room(room: GameRoom, message: dict, exclude_player: str = None):
    """Send message to all players in a room"""
    # Send to host
    if room.host_ws:
        try:
            await room.host_ws.send_json(message)
        except:
            room.host_ws = None
    
    # Send to players
    disconnected = []
    for player_id, player in room.players.items():
        if player_id != exclude_player and player.ws:
            try:
                await player.ws.send_json(message)
            except:
                disconnected.append(player_id)
    
    for pid in disconnected:
        if pid in room.players:
            room.players[pid].ws = None


async def send_to_host(room: GameRoom, message: dict):
    """Send message only to room host"""
    if room.host_ws:
        try:
            await room.host_ws.send_json(message)
        except:
            room.host_ws = None


async def send_to_player(player: Player, message: dict):
    """Send message to specific player"""
    if player.ws:
        try:
            await player.ws.send_json(message)
        except:
            player.ws = None


# ─────────────────────────── Game Logic ─────────────────────────── #

async def start_question(room: GameRoom):
    """Start the next question"""
    room.current_question_idx += 1
    
    if room.current_question_idx >= len(room.questions):
        await end_game(room)
        return
    
    room.state = "question"
    question = room.get_current_question()
    room.question_start_time = time.time()
    q_type = question.get("type", "choice")
    
    # Determine time limit: custom setting overrides question default
    # 0 means "wait for all players" (no auto-timer)
    # Bowl mode has no timer - host controls flow
    if room.game_mode == "bowl":
        time_limit = 0
    elif room.custom_time_limit is not None:
        time_limit = room.custom_time_limit
    else:
        time_limit = question.get("time_limit", 15)
    
    # Reset player answers and wagers
    for player in room.players.values():
        player.current_answer = None
        player.answer_time = None
        player.wager = 0
    
    # Reset bowl state for new question
    if room.game_mode == "bowl":
        room.reset_bowl_state()
    
    # Build base question data
    question_data = {
        "type": "question",
        "question_type": q_type,
        "question_num": room.current_question_idx + 1,
        "total_questions": len(room.questions),
        "question": question["question"],
        "time_limit": time_limit,
        "wait_for_all": time_limit == 0,
        "game_mode": room.game_mode
    }
    
    # Add type-specific data (for classic mode display)
    if q_type in ["choice", "poll", "wager"]:
        question_data["answers"] = question.get("answers", [])
    elif q_type == "truefalse":
        question_data["answers"] = ["TRUE", "FALSE"]
    # text and number types don't have predefined answers
    
    # Send to host (with correct answer for non-polls)
    host_data = question_data.copy()
    if q_type != "poll":
        host_data["correct"] = question.get("correct")
    
    await send_to_host(room, host_data)
    
    # Send to players (without correct answer)
    for player in room.players.values():
        player_data = question_data.copy()
        # For wager questions, include player's current score for wagering
        if q_type == "wager":
            player_data["player_score"] = player.score
        # For bowl mode, include player's team eligibility for stealing
        if room.game_mode == "bowl" and room.team_mode:
            player_data["can_buzz"] = player.team_id in room.steal_eligible if room.bowl_phase == "stealing" else True
        await send_to_player(player, player_data)
    
    # Start timer only if there's a time limit (not waiting for all, not bowl mode)
    if time_limit > 0 and room.game_mode != "bowl":
        asyncio.create_task(question_timer(room, time_limit))


async def question_timer(room: GameRoom, time_limit: int):
    """Timer for question - ends when time runs out"""
    await asyncio.sleep(time_limit)
    
    if room.state == "question" and room.current_question_idx >= 0:
        await reveal_answer(room)


def check_answer(question: dict, player_answer, correct_answer) -> bool:
    """Check if an answer is correct based on question type"""
    q_type = question.get("type", "choice")
    
    if q_type == "poll":
        return True  # Polls have no wrong answers
    elif q_type == "truefalse":
        return player_answer == correct_answer
    elif q_type == "number":
        if player_answer is None:
            return False
        try:
            tolerance = question.get("tolerance", 0)
            return abs(float(player_answer) - float(correct_answer)) <= tolerance
        except (ValueError, TypeError):
            return False
    elif q_type == "text":
        if player_answer is None:
            return False
        # correct can be a list of acceptable answers
        if isinstance(correct_answer, list):
            return player_answer.strip().lower() in [a.lower() for a in correct_answer]
        return player_answer.strip().lower() == str(correct_answer).lower()
    else:  # choice, wager
        return player_answer == correct_answer


async def reveal_answer(room: GameRoom):
    """Reveal the correct answer and update scores"""
    if room.state != "question":
        return
        
    room.state = "reveal"
    question = room.get_current_question()
    q_type = question.get("type", "choice")
    correct_answer = question.get("correct")
    
    # For polls, calculate vote distribution
    poll_results = {}
    if q_type == "poll":
        for player in room.players.values():
            if player.current_answer is not None:
                poll_results[player.current_answer] = poll_results.get(player.current_answer, 0) + 1
    
    # Calculate scores
    results = []
    for player in room.players.values():
        was_correct = check_answer(question, player.current_answer, correct_answer)
        points_earned = 0
        
        if q_type == "poll":
            # Polls give participation points only
            if player.current_answer is not None:
                points_earned = 50
                player.score += points_earned
        elif was_correct and player.answer_time:
            time_taken = player.answer_time - room.question_start_time
            time_limit = room.custom_time_limit if room.custom_time_limit else question.get("time_limit", 15)
            if time_limit == 0:
                time_limit = 30  # Default for "wait for all" mode
            
            base_points = room.calculate_points(time_taken, time_limit)
            
            # For wager questions, multiply by wager
            if q_type == "wager" and player.wager > 0:
                points_earned = player.wager * 2  # Double the wager if correct
            else:
                points_earned = base_points
            
            player.score += points_earned
            player.streak += 1
        elif q_type == "wager" and player.wager > 0:
            # Lose wager if wrong
            player.score = max(0, player.score - player.wager)
            points_earned = -player.wager
            player.streak = 0
        else:
            player.streak = 0
        
        results.append({
            "id": player.id,
            "name": player.name,
            "answer": player.current_answer,
            "wager": player.wager if q_type == "wager" else None,
            "correct": was_correct,
            "points_earned": points_earned,
            "total_score": player.score,
            "streak": player.streak
        })
    
    # Build reveal message based on question type
    reveal_msg = {
        "type": "reveal",
        "question_type": q_type,
        "results": results,
        "leaderboard": room.get_leaderboard(),
        "team_mode": room.team_mode
    }
    
    # Include team leaderboard if in team mode
    if room.team_mode and room.teams:
        reveal_msg["team_leaderboard"] = room.get_team_leaderboard()
    
    if q_type == "poll":
        reveal_msg["poll_results"] = poll_results
        reveal_msg["answers"] = question.get("answers", [])
    elif q_type == "truefalse":
        reveal_msg["correct_answer"] = correct_answer
        reveal_msg["correct_text"] = "TRUE" if correct_answer else "FALSE"
    elif q_type == "number":
        reveal_msg["correct_answer"] = correct_answer
        reveal_msg["correct_text"] = str(correct_answer)
    elif q_type == "text":
        reveal_msg["correct_answer"] = correct_answer[0] if isinstance(correct_answer, list) else correct_answer
        reveal_msg["correct_text"] = correct_answer[0] if isinstance(correct_answer, list) else str(correct_answer)
    else:  # choice, wager
        reveal_msg["correct_answer"] = correct_answer
        reveal_msg["correct_text"] = question["answers"][correct_answer] if "answers" in question else str(correct_answer)
    
    await broadcast_to_room(room, reveal_msg)


async def end_game(room: GameRoom):
    """End the game and show final results"""
    room.state = "finished"
    
    game_over_msg = {
        "type": "game_over",
        "leaderboard": room.get_leaderboard(),
        "total_questions": len(room.questions),
        "team_mode": room.team_mode
    }
    
    # Include team standings if in team mode
    if room.team_mode and room.teams:
        game_over_msg["team_leaderboard"] = room.get_team_leaderboard()
    
    await broadcast_to_room(room, game_over_msg)


# ─────────────────────────── Room Cleanup ─────────────────────────── #

async def cleanup_inactive_rooms():
    """Background task to clean up inactive rooms"""
    while True:
        await asyncio.sleep(60)  # Check every minute
        
        current_time = time.time()
        rooms_to_delete = []
        
        for room_code, room in rooms.items():
            inactive_time = current_time - room.last_activity
            
            # Delete rooms inactive for ROOM_INACTIVE_TIMEOUT
            if inactive_time > ROOM_INACTIVE_TIMEOUT:
                rooms_to_delete.append(room_code)
                print(f"🧹 Cleaning up inactive room: {room_code} (inactive for {int(inactive_time/60)} mins)")
                
                # Notify any remaining players
                for player in room.players.values():
                    if player.ws:
                        try:
                            await player.ws.send_json({
                                "type": "room_closed",
                                "message": "Room closed due to inactivity"
                            })
                            await player.ws.close()
                        except:
                            pass
        
        for room_code in rooms_to_delete:
            del rooms[room_code]
        
        if rooms_to_delete:
            print(f"🧹 Cleaned up {len(rooms_to_delete)} inactive rooms. Active rooms: {len(rooms)}")

@app.on_event("startup")
async def startup_event():
    """Start background tasks on server startup"""
    asyncio.create_task(cleanup_inactive_rooms())
    print("🧹 Room cleanup task started (timeout: 40 mins)")


# ─────────────────────────── WebSocket Endpoints ─────────────────────────── #

@app.websocket("/ws/host/{room_code}")
async def host_websocket(websocket: WebSocket, room_code: str, token: str = None):
    """WebSocket for the host/display screen - requires admin authentication"""
    await websocket.accept()
    
    # Verify admin token
    if not token or token not in admin_sessions:
        await websocket.send_json({
            "type": "error",
            "message": "Authentication required. Please login as admin."
        })
        await websocket.close(code=4001, reason="Unauthorized")
        return
    
    admin_info = admin_sessions[token]
    
    if room_code not in rooms:
        rooms[room_code] = GameRoom(room_code)
    
    room = rooms[room_code]
    room.host_ws = websocket
    room.host_connected = True
    room.host_admin = admin_info.get("username") or admin_info.get("email", "admin")
    room.update_activity()
    
    # Send current state (full state for reconnection)
    await websocket.send_json({
        "type": "room_state",
        **room.to_full_state()
    })
    
    # Notify players that host (re)connected
    for player in room.players.values():
        if player.ws:
            try:
                await player.ws.send_json({
                    "type": "host_connected",
                    "message": "Host is connected"
                })
            except:
                pass
    
    try:
        while True:
            data = await websocket.receive_json()
            room.update_activity()
            await handle_host_message(room, data)
    except WebSocketDisconnect:
        room.host_ws = None
        room.host_connected = False
        
        # Notify all players that host disconnected
        for player in room.players.values():
            if player.ws:
                try:
                    await player.ws.send_json({
                        "type": "host_disconnected",
                        "message": "Host disconnected. Waiting for host to reconnect..."
                    })
                except:
                    pass
        
        print(f"⚠️ Host disconnected from room {room_code}")


@app.websocket("/ws/play/{room_code}/{player_id}")
async def player_websocket(websocket: WebSocket, room_code: str, player_id: str):
    """WebSocket for players"""
    await websocket.accept()
    
    if room_code not in rooms:
        await websocket.send_json({"type": "error", "message": "Room not found"})
        await websocket.close()
        return
    
    room = rooms[room_code]
    room.update_activity()
    
    if player_id not in room.players:
        await websocket.send_json({"type": "error", "message": "Player not in room"})
        await websocket.close()
        return
    
    player = room.players[player_id]
    player.ws = websocket
    
    # Build join message with full game state for mid-game reconnection
    join_msg = {
        "type": "joined",
        "player_id": player.id,
        "player_name": player.name,
        "room_code": room.code,
        "state": room.state,
        "host_connected": room.host_connected,
        "score": player.score,
        "team_id": player.team_id,
        "team": room.teams[player.team_id].to_dict() if player.team_id and player.team_id in room.teams else None
    }
    
    # If game is in progress, send current question info
    if room.state == "question" and room.current_question_idx >= 0:
        question = room.get_current_question()
        if question:
            q_type = question.get("type", "choice")
            time_limit = room.custom_time_limit if room.custom_time_limit is not None else question.get("time_limit", 15)
            
            join_msg["current_question"] = {
                "type": "question",
                "question_type": q_type,
                "question_num": room.current_question_idx + 1,
                "total_questions": len(room.questions),
                "question": question["question"],
                "time_limit": time_limit,
                "wait_for_all": time_limit == 0
            }
            
            if q_type in ["choice", "poll", "wager"]:
                join_msg["current_question"]["answers"] = question.get("answers", [])
                if q_type == "wager":
                    join_msg["current_question"]["player_score"] = player.score
            elif q_type == "truefalse":
                join_msg["current_question"]["answers"] = ["TRUE", "FALSE"]
            
            # Check if player already answered
            if player.current_answer is not None:
                join_msg["already_answered"] = True
    
    await websocket.send_json(join_msg)
    
    try:
        while True:
            data = await websocket.receive_json()
            room.update_activity()
            await handle_player_message(room, player, data)
    except WebSocketDisconnect:
        player.ws = None
        # Notify host
        await send_to_host(room, {
            "type": "player_disconnected",
            "player_id": player.id,
            "player_name": player.name,
            "player_count": len([p for p in room.players.values() if p.ws])
        })


async def handle_host_message(room: GameRoom, data: dict):
    """Handle messages from host"""
    msg_type = data.get("type")
    
    if msg_type == "start_game":
        categories = data.get("categories", list(load_questions()["categories"].keys()))
        num_questions = data.get("num_questions", 10)
        time_limit = data.get("time_limit", None)  # None = use default, 0 = wait for all
        
        room.setup_game(categories, num_questions)
        room.custom_time_limit = time_limit
        room.current_question_idx = -1
        
        await broadcast_to_room(room, {
            "type": "game_starting",
            "total_questions": len(room.questions)
        })
        
        await asyncio.sleep(3)  # Countdown
        await start_question(room)
    
    elif msg_type == "next_question":
        if room.state == "reveal":
            await asyncio.sleep(1)
            await start_question(room)
    
    elif msg_type == "skip_question":
        if room.state == "question":
            await reveal_answer(room)
    
    elif msg_type == "end_game":
        await end_game(room)
    
    elif msg_type == "reset_room":
        room.state = "lobby"
        room.current_question_idx = -1
        room.questions = []
        for player in room.players.values():
            player.score = 0
            player.streak = 0
            # Keep team assignments when resetting
        await broadcast_to_room(room, {
            "type": "room_reset",
            **room.to_lobby_state()
        })
    
    elif msg_type == "kick_player":
        player_id = data.get("player_id")
        if player_id in room.players:
            player = room.players[player_id]
            if player.ws:
                await player.ws.send_json({"type": "kicked"})
                await player.ws.close()
            room.remove_player(player_id)
            await broadcast_to_room(room, {
                "type": "player_left",
                "player_id": player_id,
                **room.to_lobby_state()
            })
    
    elif msg_type == "set_game_mode":
        new_mode = data.get("mode", "classic")
        if new_mode in ["classic", "bowl"]:
            room.game_mode = new_mode
            
            # Bowl mode requires teams - auto-enable if switching to bowl
            if new_mode == "bowl" and not room.team_mode:
                room.team_mode = True
                # Create 2 default teams if none exist
                if len(room.teams) < 2:
                    while len(room.teams) < 2:
                        room.create_team()
            
            await broadcast_to_room(room, {
                "type": "game_mode_changed",
                "game_mode": room.game_mode,
                "team_mode": room.team_mode,
                "teams": {tid: t.to_dict() for tid, t in room.teams.items()}
            })
    
    # ─────────────────────────── Bowl Mode Host Handlers ─────────────────────────── #
    
    elif msg_type == "judge":
        # Host judging an answer in bowl mode
        if room.game_mode != "bowl" or room.state != "question":
            return
        
        if not room.awaiting_judgment:
            return
        
        is_correct = data.get("correct", False)
        room.awaiting_judgment = False
        
        # Get the player who answered
        player = room.players.get(room.buzz_winner)
        if not player:
            return
        
        # Determine if this was a steal attempt
        is_steal = len(room.steal_eligible) < len(room.teams) if room.team_mode else False
        
        if is_correct:
            # Award points
            points = 5 if is_steal else 10  # Steal is worth less
            player.score += points
            player.streak += 1
            
            # Get the correct answer for display
            question = room.get_current_question()
            correct_text = room.buzz_answer  # Use their answer as the "correct" one
            
            # Notify everyone
            await broadcast_to_room(room, {
                "type": "bowl_correct",
                "player_id": player.id,
                "player_name": player.name,
                "team_id": player.team_id,
                "answer": room.buzz_answer,
                "points": points,
                "is_steal": is_steal,
                "leaderboard": room.get_leaderboard(),
                "team_leaderboard": room.get_team_leaderboard() if room.team_mode else None
            })
            
            # Move to reveal/next question after a short delay
            room.state = "reveal"
            room.reset_bowl_state()
            
        else:
            # Wrong answer
            player.streak = 0
            
            # Remove this team from steal eligibility
            if player.team_id and player.team_id in room.steal_eligible:
                room.steal_eligible.remove(player.team_id)
            
            # Check if any teams can still steal
            if room.team_mode and len(room.steal_eligible) > 0:
                # Start steal phase
                room.bowl_phase = "stealing"
                room.buzz_winner = None
                room.buzz_team = None
                room.buzz_answer = None
                
                await broadcast_to_room(room, {
                    "type": "bowl_incorrect_steal",
                    "player_id": player.id,
                    "player_name": player.name,
                    "team_id": player.team_id,
                    "steal_eligible": room.steal_eligible,
                    "message": "Incorrect! Other teams can steal..."
                })
            else:
                # No one can steal - reveal the answer
                question = room.get_current_question()
                correct_answer = question.get("correct") if question else None
                
                # Format correct answer for display
                if isinstance(correct_answer, list):
                    correct_text = correct_answer[0]
                elif isinstance(correct_answer, bool):
                    correct_text = "TRUE" if correct_answer else "FALSE"
                elif isinstance(correct_answer, int) and "answers" in question:
                    correct_text = question["answers"][correct_answer]
                else:
                    correct_text = str(correct_answer) if correct_answer else "N/A"
                
                await broadcast_to_room(room, {
                    "type": "bowl_no_correct",
                    "player_id": player.id,
                    "player_name": player.name,
                    "team_id": player.team_id,
                    "given_answer": room.buzz_answer,
                    "correct_answer": correct_text,
                    "leaderboard": room.get_leaderboard(),
                    "team_leaderboard": room.get_team_leaderboard() if room.team_mode else None
                })
                
                room.state = "reveal"
                room.reset_bowl_state()
    
    elif msg_type == "skip_steal":
        # Host skipping the steal phase
        if room.game_mode != "bowl" or room.bowl_phase != "stealing":
            return
        
        question = room.get_current_question()
        correct_answer = question.get("correct") if question else None
        
        # Format correct answer
        if isinstance(correct_answer, list):
            correct_text = correct_answer[0]
        elif isinstance(correct_answer, bool):
            correct_text = "TRUE" if correct_answer else "FALSE"
        elif isinstance(correct_answer, int) and "answers" in question:
            correct_text = question["answers"][correct_answer]
        else:
            correct_text = str(correct_answer) if correct_answer else "N/A"
        
        await broadcast_to_room(room, {
            "type": "bowl_steal_skipped",
            "correct_answer": correct_text,
            "leaderboard": room.get_leaderboard(),
            "team_leaderboard": room.get_team_leaderboard() if room.team_mode else None
        })
        
        room.state = "reveal"
        room.reset_bowl_state()


async def handle_player_message(room: GameRoom, player: Player, data: dict):
    """Handle messages from players"""
    msg_type = data.get("type")
    
    if msg_type == "answer":
        if room.state == "question" and player.current_answer is None:
            player.current_answer = data.get("answer")
            player.answer_time = time.time()
            
            # Handle wager if provided
            wager = data.get("wager", 0)
            if wager > 0:
                # Limit wager to player's current score (min 100 if they have points)
                max_wager = min(player.score, 500)
                player.wager = max(100, min(wager, max_wager)) if player.score >= 100 else 0
            
            # Notify host that player answered
            await send_to_host(room, {
                "type": "player_answered",
                "player_id": player.id,
                "player_name": player.name,
                "answers_in": sum(1 for p in room.players.values() if p.current_answer is not None),
                "total_players": len(room.players)
            })
            
            # Confirm to player
            await send_to_player(player, {
                "type": "answer_received",
                "answer": player.current_answer,
                "wager": player.wager
            })
            
            # If all players answered, reveal early
            if all(p.current_answer is not None for p in room.players.values()):
                await reveal_answer(room)
    
    # ─────────────────────────── Bowl Mode Handlers ─────────────────────────── #
    
    elif msg_type == "buzz":
        # Player attempting to buzz in
        if room.game_mode != "bowl" or room.state != "question":
            return
        
        won_buzz = room.handle_buzz(player.id)
        
        if won_buzz:
            # Get team info if in team mode
            team_info = None
            if player.team_id and player.team_id in room.teams:
                team_info = room.teams[player.team_id].to_dict()
            
            # Notify all players who won the buzz
            await broadcast_to_room(room, {
                "type": "buzz_winner",
                "player_id": player.id,
                "player_name": player.name,
                "team_id": player.team_id,
                "team": team_info
            })
            
            # Tell the winner they can now answer
            await send_to_player(player, {
                "type": "you_buzzed_first",
                "message": "You buzzed first! Type your answer."
            })
        else:
            # Tell player they were too slow
            await send_to_player(player, {
                "type": "buzz_too_slow",
                "message": "Too slow! Someone else buzzed first."
            })
    
    elif msg_type == "bowl_answer":
        # Player submitting their answer in bowl mode
        if room.game_mode != "bowl" or room.state != "question":
            return
        
        if room.buzz_winner != player.id:
            return  # Only the buzz winner can submit
        
        if room.bowl_phase != "answering":
            return
        
        answer = data.get("answer", "").strip()
        room.buzz_answer = answer
        room.awaiting_judgment = True
        
        # Get team info
        team_info = None
        if player.team_id and player.team_id in room.teams:
            team_info = room.teams[player.team_id].to_dict()
        
        # Notify host to judge
        await send_to_host(room, {
            "type": "bowl_answer_submitted",
            "player_id": player.id,
            "player_name": player.name,
            "team_id": player.team_id,
            "team": team_info,
            "answer": answer,
            "is_steal": len(room.steal_eligible) < len(room.teams) if room.team_mode else False
        })
        
        # Confirm to player
        await send_to_player(player, {
            "type": "bowl_answer_received",
            "answer": answer,
            "message": "Waiting for host judgment..."
        })
        
        # Notify other players
        for p in room.players.values():
            if p.id != player.id and p.ws:
                await send_to_player(p, {
                    "type": "awaiting_judgment",
                    "player_name": player.name,
                    "team_id": player.team_id
                })
    
    elif msg_type == "steal_buzz":
        # Player attempting to steal
        if room.game_mode != "bowl" or room.state != "question":
            return
        
        if room.bowl_phase != "stealing":
            return
        
        won_steal = room.handle_steal_buzz(player.id)
        
        if won_steal:
            team_info = None
            if player.team_id and player.team_id in room.teams:
                team_info = room.teams[player.team_id].to_dict()
            
            # Notify all players who won the steal
            await broadcast_to_room(room, {
                "type": "steal_winner",
                "player_id": player.id,
                "player_name": player.name,
                "team_id": player.team_id,
                "team": team_info
            })
            
            # Tell the winner they can now answer
            await send_to_player(player, {
                "type": "you_can_steal",
                "message": "Your turn to steal! Type your answer."
            })
        else:
            await send_to_player(player, {
                "type": "steal_not_eligible",
                "message": "Your team already attempted or was too slow."
            })


# ─────────────────────────── HTTP Routes ─────────────────────────── #

@app.post("/api/room/create")
async def create_room(request: Request):
    """Create a new game room - requires admin authentication"""
    # Verify admin token
    token = request.headers.get("X-Admin-Token")
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Admin authentication required to host a game")
    
    admin_info = admin_sessions[token]
    admin_username = admin_info.get("username") or admin_info.get("email", "admin")
    
    # Check if admin already has an active session
    if admin_username in admin_hosting_sessions:
        existing_room_code = admin_hosting_sessions[admin_username]
        if existing_room_code in rooms:
            raise HTTPException(
                status_code=409, 
                detail=f"You already have an active session (Room: {existing_room_code}). Close it first or rejoin."
            )
        else:
            # Room was cleaned up, remove stale reference
            del admin_hosting_sessions[admin_username]
    
    code = generate_room_code()
    while code in rooms:
        code = generate_room_code()
    
    room = GameRoom(code)
    room.host_admin = admin_username
    rooms[code] = room
    
    # Track this admin's active session
    admin_hosting_sessions[admin_username] = code
    
    return {"room_code": code, "host": admin_username}


@app.post("/api/room/{room_code}/join")
async def join_room(room_code: str, request: Request):
    """Join a game room as a player"""
    room_code = room_code.upper()
    
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = rooms[room_code]
    
    if room.state != "lobby":
        raise HTTPException(status_code=400, detail="Game already in progress")
    
    data = await request.json()
    name = data.get("name", "").strip()[:20]
    
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    
    player_id = str(uuid.uuid4())[:8]
    player = Player(player_id, name)
    room.add_player(player)
    
    # Notify host
    if room.host_ws:
        await room.host_ws.send_json({
            "type": "player_joined",
            "player": {"id": player.id, "name": player.name},
            **room.to_lobby_state()
        })
    
    return {"player_id": player_id, "room_code": room_code}


@app.get("/api/room/{room_code}")
async def get_room(room_code: str):
    """Get room info"""
    room_code = room_code.upper()
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = rooms[room_code]
    return room.to_full_state()


@app.get("/api/room/{room_code}/exists")
async def room_exists(room_code: str):
    """Check if a room exists (for host reconnection)"""
    room_code = room_code.upper()
    exists = room_code in rooms
    if exists:
        room = rooms[room_code]
        return {
            "exists": True,
            "room_code": room_code,
            "state": room.state,
            "player_count": len(room.players),
            "host_connected": room.host_connected
        }
    return {"exists": False, "room_code": room_code}


@app.get("/api/categories")
async def get_categories():
    """Get available question categories"""
    questions = load_questions()
    return {
        "categories": [
            {"id": cat_id, "name": cat["name"], "count": len(cat["questions"])}
            for cat_id, cat in questions["categories"].items()
        ]
    }


# ─────────────────────────── Admin Session Management ─────────────────────────── #

@app.get("/api/admin/session")
async def get_admin_session(request: Request):
    """Get admin's current hosting session status"""
    token = request.headers.get("X-Admin-Token")
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    admin_info = admin_sessions[token]
    admin_username = admin_info.get("username") or admin_info.get("email", "admin")
    
    # Check if admin has an active session
    if admin_username in admin_hosting_sessions:
        room_code = admin_hosting_sessions[admin_username]
        if room_code in rooms:
            room = rooms[room_code]
            return {
                "has_session": True,
                "room_code": room_code,
                "state": room.state,
                "player_count": len(room.players),
                "host_connected": room.host_connected,
                "players": [{"id": p.id, "name": p.name, "score": p.score} for p in room.players.values()]
            }
        else:
            # Room was cleaned up, remove stale reference
            del admin_hosting_sessions[admin_username]
    
    return {"has_session": False}


@app.post("/api/admin/session/close")
async def close_admin_session(request: Request):
    """Close admin's current hosting session"""
    token = request.headers.get("X-Admin-Token")
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    admin_info = admin_sessions[token]
    admin_username = admin_info.get("username") or admin_info.get("email", "admin")
    
    if admin_username not in admin_hosting_sessions:
        return {"status": "no_session", "message": "No active session to close"}
    
    room_code = admin_hosting_sessions[admin_username]
    
    if room_code in rooms:
        room = rooms[room_code]
        
        # Notify all players that room is closing
        for player in room.players.values():
            if player.ws:
                try:
                    await player.ws.send_json({
                        "type": "room_closed",
                        "message": "The host has ended the session"
                    })
                    await player.ws.close()
                except:
                    pass
        
        # Close host websocket if connected
        if room.host_ws:
            try:
                await room.host_ws.send_json({
                    "type": "session_closed",
                    "message": "Session closed from admin panel"
                })
                await room.host_ws.close()
            except:
                pass
        
        # Delete the room
        del rooms[room_code]
    
    # Remove the session tracking
    del admin_hosting_sessions[admin_username]
    
    return {"status": "closed", "message": f"Session {room_code} has been closed"}


@app.get("/api/ip")
async def get_ip():
    """Get server IP for display"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except:
        ip = "127.0.0.1"
    return {"ip": ip, "port": 8000}


# ─────────────────────────── Admin Routes ─────────────────────────── #

def get_admin_from_request(request: Request) -> str | None:
    """Extract and verify admin token from request"""
    token = request.headers.get("X-Admin-Token") or request.cookies.get("admin_token")
    if token:
        return verify_admin_token(token)
    return None


@app.post("/api/admin/login")
async def admin_login(request: Request):
    """Login as admin - uses Supabase database if configured, else local JSON"""
    data = await request.json()
    username = data.get("username", data.get("email", "")).strip()
    password = data.get("password", "")
    
    # Try Supabase database first
    if supabase_client:
        try:
            # Query the admins table
            result = supabase_client.table("admins").select("*").eq("username", username).execute()
            
            if result.data and len(result.data) > 0:
                admin = result.data[0]
                # Verify password
                if verify_password(password, admin["password_hash"]):
                    # Generate session token
                    token = str(uuid.uuid4())
                    admin_sessions[token] = {
                        "username": admin["username"],
                        "user_id": admin["id"],
                        "name": admin.get("name", admin["username"])
                    }
                    
                    # Update last_login timestamp
                    supabase_client.table("admins").update({
                        "last_login": datetime.utcnow().isoformat()
                    }).eq("id", admin["id"]).execute()
                    
                    return {
                        "status": "success",
                        "token": token,
                        "username": admin["username"],
                        "name": admin.get("name", admin["username"])
                    }
            
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
        except HTTPException:
            raise
        except Exception as e:
            print(f"Supabase login error: {e}")
            raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Fallback to local authentication (when Supabase not configured)
    admins = load_admins()
    if username in admins["admins"]:
        if admins["admins"][username]["password"] == password:
            token = str(uuid.uuid4())
            admin_sessions[token] = {
                "username": username,
                "name": admins["admins"][username].get("name", username)
            }
            return {
                "status": "success",
                "token": token,
                "username": username,
                "name": admins["admins"][username].get("name", username)
            }
    
    raise HTTPException(status_code=401, detail="Invalid username or password")


@app.post("/api/admin/signup")
async def admin_signup(request: Request):
    """Sign up a new admin - stores in Supabase database"""
    if not supabase_client:
        raise HTTPException(status_code=400, detail="Supabase not configured. Use local admins.json instead.")
    
    data = await request.json()
    username = data.get("username", "").strip()
    password = data.get("password", "")
    name = data.get("name", username)
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")
    
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    try:
        # Check if username already exists
        existing = supabase_client.table("admins").select("id").eq("username", username).execute()
        if existing.data and len(existing.data) > 0:
            raise HTTPException(status_code=400, detail="Username already taken")
        
        # Hash the password
        password_hash = hash_password(password)
        
        # Insert new admin into database
        result = supabase_client.table("admins").insert({
            "username": username,
            "password_hash": password_hash,
            "name": name
        }).execute()
        
        if result.data:
            return {
                "status": "success",
                "message": "Account created! You can now log in."
            }
        else:
            raise HTTPException(status_code=400, detail="Signup failed")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Signup error: {e}")
        raise HTTPException(status_code=400, detail="Signup failed. Please try again.")


@app.post("/api/admin/logout")
async def admin_logout(request: Request):
    """Logout admin - removes session token"""
    token = request.headers.get("X-Admin-Token")
    
    if token and token in admin_sessions:
        del admin_sessions[token]
    return {"status": "logged_out"}


@app.get("/api/admin/me")
async def admin_me(request: Request):
    """Get current admin info"""
    token = request.headers.get("X-Admin-Token") or request.cookies.get("admin_token")
    
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = admin_sessions[token]
    username = session.get("email") or session.get("username", "")
    name = session.get("name", username)
    
    return {
        "username": username,
        "name": name
    }


@app.get("/api/admin/auth-mode")
async def admin_auth_mode():
    """Check which authentication mode is active"""
    return {
        "mode": "supabase" if supabase_client else "local",
        "supabase_configured": supabase_client is not None
    }


@app.get("/api/admin/questions")
async def get_all_questions(request: Request):
    """Get all questions for admin"""
    username = get_admin_from_request(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return load_questions()


@app.post("/api/admin/questions")
async def save_all_questions(request: Request):
    """Save all questions from admin"""
    username = get_admin_from_request(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    data = await request.json()
    save_questions(data)
    return {"status": "saved"}


@app.post("/api/admin/category")
async def add_category(request: Request):
    """Add a new category"""
    username = get_admin_from_request(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    data = await request.json()
    questions = load_questions()
    
    cat_id = data.get("id", "").lower().replace(" ", "_")
    cat_name = data.get("name", "")
    
    if not cat_id or not cat_name:
        raise HTTPException(status_code=400, detail="ID and name required")
    
    if cat_id in questions["categories"]:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    questions["categories"][cat_id] = {
        "name": cat_name,
        "questions": []
    }
    save_questions(questions)
    return {"status": "created", "id": cat_id}


@app.post("/api/admin/question")
async def add_question(request: Request):
    """Add a question to a category"""
    username = get_admin_from_request(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    data = await request.json()
    questions = load_questions()
    
    cat_id = data.get("category")
    if cat_id not in questions["categories"]:
        raise HTTPException(status_code=404, detail="Category not found")
    
    q_type = data.get("type", "choice")
    
    question = {
        "id": f"q_{uuid.uuid4().hex[:8]}",
        "type": q_type,
        "question": data.get("question", ""),
        "time_limit": data.get("time_limit", 15),
        "created_by": username
    }
    
    # Add type-specific fields
    if q_type in ["choice", "poll", "wager"]:
        question["answers"] = data.get("answers", ["", "", "", ""])
        if q_type != "poll":
            question["correct"] = data.get("correct", 0)
    elif q_type == "truefalse":
        question["correct"] = data.get("correct", True)
    elif q_type == "number":
        question["correct"] = data.get("correct", 0)
        question["tolerance"] = data.get("tolerance", 0)
    elif q_type == "text":
        # correct can be string or list of acceptable answers
        correct = data.get("correct", "")
        question["correct"] = correct if isinstance(correct, list) else [correct]
    
    questions["categories"][cat_id]["questions"].append(question)
    save_questions(questions)
    return {"status": "created", "question": question}


@app.put("/api/admin/question/{question_id}")
async def update_question(question_id: str, request: Request):
    """Update a question"""
    username = get_admin_from_request(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    data = await request.json()
    questions = load_questions()
    
    for cat in questions["categories"].values():
        for i, q in enumerate(cat["questions"]):
            if q["id"] == question_id:
                q_type = data.get("type", q.get("type", "choice"))
                
                updated = {
                    "id": question_id,
                    "type": q_type,
                    "question": data.get("question", q.get("question", "")),
                    "time_limit": data.get("time_limit", q.get("time_limit", 15)),
                    "created_by": q.get("created_by", username)
                }
                
                # Add type-specific fields
                if q_type in ["choice", "poll", "wager"]:
                    updated["answers"] = data.get("answers", q.get("answers", []))
                    if q_type != "poll":
                        updated["correct"] = data.get("correct", q.get("correct", 0))
                elif q_type == "truefalse":
                    updated["correct"] = data.get("correct", q.get("correct", True))
                elif q_type == "number":
                    updated["correct"] = data.get("correct", q.get("correct", 0))
                    updated["tolerance"] = data.get("tolerance", q.get("tolerance", 0))
                elif q_type == "text":
                    correct = data.get("correct", q.get("correct", []))
                    updated["correct"] = correct if isinstance(correct, list) else [correct]
                
                cat["questions"][i] = updated
                save_questions(questions)
                return {"status": "updated"}
    
    raise HTTPException(status_code=404, detail="Question not found")


@app.delete("/api/admin/question/{question_id}")
async def delete_question(question_id: str, request: Request):
    """Delete a question"""
    username = get_admin_from_request(request)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    questions = load_questions()
    
    for cat in questions["categories"].values():
        for i, q in enumerate(cat["questions"]):
            if q["id"] == question_id:
                del cat["questions"][i]
                save_questions(questions)
                return {"status": "deleted"}
    
    raise HTTPException(status_code=404, detail="Question not found")


# ─────────────────────────── Team Management Routes ─────────────────────────── #

@app.post("/api/room/{room_code}/team-mode")
async def toggle_team_mode(room_code: str, request: Request):
    """Enable/disable team mode for a room"""
    room_code = room_code.upper()
    token = request.headers.get("X-Admin-Token")
    
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = rooms[room_code]
    data = await request.json()
    room.team_mode = data.get("enabled", False)
    
    # If disabling, clear team assignments but keep teams
    if not room.team_mode:
        for player in room.players.values():
            player.team_id = None
    
    # Notify all clients
    await broadcast_to_room(room, {
        "type": "team_mode_changed",
        "team_mode": room.team_mode,
        "teams": {tid: t.to_dict() for tid, t in room.teams.items()}
    })
    
    return {"team_mode": room.team_mode}


@app.post("/api/room/{room_code}/teams")
async def create_team(room_code: str, request: Request):
    """Create a new team in the room"""
    room_code = room_code.upper()
    token = request.headers.get("X-Admin-Token")
    
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = rooms[room_code]
    data = await request.json()
    
    team = room.create_team(
        name=data.get("name"),
        color=data.get("color")
    )
    
    # Enable team mode if creating first team
    if len(room.teams) == 1:
        room.team_mode = True
    
    # Notify all clients
    await broadcast_to_room(room, {
        "type": "team_created",
        "team": team.to_dict(),
        "teams": {tid: t.to_dict() for tid, t in room.teams.items()},
        "team_mode": room.team_mode
    })
    
    return {"team": team.to_dict()}


@app.delete("/api/room/{room_code}/teams/{team_id}")
async def delete_team(room_code: str, team_id: str, request: Request):
    """Delete a team"""
    room_code = room_code.upper()
    token = request.headers.get("X-Admin-Token")
    
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = rooms[room_code]
    
    if not room.delete_team(team_id):
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Disable team mode if no teams left
    if len(room.teams) == 0:
        room.team_mode = False
    
    # Notify all clients
    await broadcast_to_room(room, {
        "type": "team_deleted",
        "team_id": team_id,
        "teams": {tid: t.to_dict() for tid, t in room.teams.items()},
        "team_mode": room.team_mode,
        "players": [{"id": p.id, "name": p.name, "team_id": p.team_id} for p in room.players.values()]
    })
    
    return {"status": "deleted"}


@app.put("/api/room/{room_code}/teams/{team_id}")
async def update_team(room_code: str, team_id: str, request: Request):
    """Update team name/color"""
    room_code = room_code.upper()
    token = request.headers.get("X-Admin-Token")
    
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = rooms[room_code]
    
    if team_id not in room.teams:
        raise HTTPException(status_code=404, detail="Team not found")
    
    data = await request.json()
    team = room.teams[team_id]
    
    if "name" in data:
        team.name = data["name"]
    if "color" in data:
        team.color = data["color"]
    
    # Notify all clients
    await broadcast_to_room(room, {
        "type": "team_updated",
        "team": team.to_dict(),
        "teams": {tid: t.to_dict() for tid, t in room.teams.items()}
    })
    
    return {"team": team.to_dict()}


@app.post("/api/room/{room_code}/teams/assign")
async def assign_player_to_team(room_code: str, request: Request):
    """Assign a player to a team"""
    room_code = room_code.upper()
    token = request.headers.get("X-Admin-Token")
    
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = rooms[room_code]
    data = await request.json()
    
    player_id = data.get("player_id")
    team_id = data.get("team_id")  # None to unassign
    
    if not room.assign_player_to_team(player_id, team_id):
        raise HTTPException(status_code=400, detail="Invalid player or team ID")
    
    player = room.players[player_id]
    
    # Notify all clients
    await broadcast_to_room(room, {
        "type": "player_team_changed",
        "player_id": player_id,
        "player_name": player.name,
        "team_id": team_id,
        "players": [{"id": p.id, "name": p.name, "team_id": p.team_id} for p in room.players.values()]
    })
    
    # Notify the specific player
    if player.ws:
        team_info = None
        if team_id and team_id in room.teams:
            team_info = room.teams[team_id].to_dict()
        await send_to_player(player, {
            "type": "your_team_changed",
            "team_id": team_id,
            "team": team_info
        })
    
    return {"status": "assigned", "player_id": player_id, "team_id": team_id}


@app.post("/api/room/{room_code}/teams/auto-assign")
async def auto_assign_teams(room_code: str, request: Request):
    """Automatically distribute players across teams"""
    room_code = room_code.upper()
    token = request.headers.get("X-Admin-Token")
    
    if not token or token not in admin_sessions:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = rooms[room_code]
    data = await request.json()
    num_teams = data.get("num_teams", 2)
    
    room.auto_assign_teams(num_teams)
    room.team_mode = True
    
    # Notify all clients about team mode and assignments
    await broadcast_to_room(room, {
        "type": "teams_auto_assigned",
        "team_mode": True,
        "teams": {tid: t.to_dict() for tid, t in room.teams.items()},
        "players": [{"id": p.id, "name": p.name, "team_id": p.team_id} for p in room.players.values()]
    })
    
    # Notify each player of their team
    for player in room.players.values():
        if player.ws and player.team_id:
            team_info = room.teams[player.team_id].to_dict()
            await send_to_player(player, {
                "type": "your_team_changed",
                "team_id": player.team_id,
                "team": team_info
            })
    
    return {
        "status": "assigned",
        "teams": {tid: t.to_dict() for tid, t in room.teams.items()},
        "players": [{"id": p.id, "name": p.name, "team_id": p.team_id} for p in room.players.values()]
    }


# Mount static files
app.mount("/", StaticFiles(directory="static", html=True), name="static")


# ─────────────────────────── Run ─────────────────────────── #

if __name__ == "__main__":
    import uvicorn
    print("\n🎮 Library Quiz Game Starting...")
    print("📺 Host display: http://localhost:8000/host.html")
    print("👤 Players join: http://localhost:8000")
    print("⚙️  Admin panel: http://localhost:8000/admin.html\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
