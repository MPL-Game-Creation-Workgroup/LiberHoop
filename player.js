/**
 * Library Quiz Game - Player Interface
 * Mobile-friendly join and answer experience
 */

const AVATARS = ['😎', '🤓', '🧠', '📚', '🎮', '🎯', '⭐', '🔥', '💡', '🚀', '🎨', '🎭'];

const state = {
    playerId: null,
    playerName: '',
    roomCode: '',
    ws: null,
    currentQuestion: null,
    answered: false,
    score: 0,
    timerInterval: null,
    // Team info
    teamId: null,
    team: null,  // {id, name, color}
    // Game mode
    gameMode: 'classic',
    // Bowl mode state
    bowlPhase: null,  // 'buzzing', 'answering', 'stealing', 'waiting'
    canBuzz: true,
    wonBuzz: false,
    // Minigame state
    minigameState: null,
    drawingCanvas: null,
    drawingCtx: null,
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    currentColor: '#000000',
    brushSize: 5,
    currentMicrogame: null,
    microgameScore: 0,
    microgameRound: 0,
    minigameTimerInterval: null
};

// ─────────────────────────── Screens ─────────────────────────── #

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ─────────────────────────── Join Flow ─────────────────────────── #

document.getElementById('joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const roomCode = document.getElementById('roomCode').value.toUpperCase().trim();
    const playerName = document.getElementById('playerName').value.trim();
    const errorMsg = document.getElementById('errorMsg');
    
    errorMsg.textContent = '';
    
    if (roomCode.length !== 4) {
        errorMsg.textContent = 'Room code must be 4 letters';
        return;
    }
    
    if (playerName.length < 1) {
        errorMsg.textContent = 'Please enter your name';
        return;
    }
    
    try {
        // Check service connectivity first
        let serverCheck;
        try {
            serverCheck = await fetch('/api/ip', {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
        } catch (checkErr) {
            errorMsg.textContent = 'Unable to connect. Please check your internet connection and try again.';
            console.error('Service check failed:', checkErr);
            return;
        }
        
        if (!serverCheck.ok) {
            errorMsg.textContent = 'Service temporarily unavailable or down for maintenance. Please try again later.';
            return;
        }
        
        const response = await fetch(`/api/room/${roomCode}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: playerName }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            if (response.status === 404) {
                errorMsg.textContent = `Room "${roomCode}" not found. Please check the room code and try again.`;
            } else if (response.status === 0 || response.status >= 500) {
                errorMsg.textContent = 'Service temporarily unavailable or down for maintenance. Please try again later.';
            } else {
                errorMsg.textContent = data.detail || 'Could not join room. Please check the room code and try again.';
            }
            return;
        }
        
        const data = await response.json();
        state.playerId = data.player_id;
        state.roomCode = data.room_code;
        state.playerName = playerName;
        
        // Show lobby
        document.getElementById('lobbyRoomCode').textContent = state.roomCode;
        document.getElementById('playerNameDisplay').textContent = state.playerName;
        document.getElementById('playerAvatar').textContent = AVATARS[Math.floor(Math.random() * AVATARS.length)];
        showScreen('lobbyScreen');
        
        // Connect WebSocket
        connectWebSocket();
        
    } catch (err) {
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
            errorMsg.textContent = 'Connection timeout. Please check your internet connection and try again.';
        } else if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
            errorMsg.textContent = 'The game may be temporarily unavailable due to maintenance.';
        } else {
            errorMsg.textContent = `Unable to connect. Please try again later.`;
        }
        console.error('Join error:', err);
    }
});

// Auto-capitalize room code
document.getElementById('roomCode').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
});

// ─────────────────────────── WebSocket ─────────────────────────── #

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/play/${state.roomCode}/${state.playerId}`;
    
    try {
        state.ws = new WebSocket(wsUrl);
        
        state.ws.onopen = () => {
            console.log('Connected to game');
            reconnectAttempts = 0; // Reset on successful connection
            hideHostDisconnected();  // Clear any disconnection overlay
        };
        
        state.ws.onclose = (event) => {
            console.log('Disconnected:', event.code, event.reason);
            
            // Show error for specific close codes
            if (event.code === 1006) {
                // Abnormal closure (service crash, network issue)
                showHostDisconnected('Connection lost. Attempting to reconnect...');
            } else if (event.code === 1002) {
                showHostDisconnected('Connection error. Please refresh the page and try again.');
            } else if (event.code === 1003) {
                showHostDisconnected('Connection error. Please refresh the page.');
            }
            
            // Attempt to reconnect after 2 seconds (unless kicked or room closed)
            if (event.code !== 1000 && state.playerId && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(() => {
                    if (state.playerId) {
                        connectWebSocket();
                    }
                }, 2000);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                showHostDisconnected('Unable to reconnect. Please refresh the page and try again.');
            }
        };
        
        state.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            showHostDisconnected('Connection error. Please check your internet connection.');
        };
        
        state.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (parseError) {
                console.error('Error parsing WebSocket message:', parseError);
            }
        };
    } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        showHostDisconnected('Unable to connect. Please check your internet connection and try again.');
    }
}

function handleMessage(data) {
    console.log('Received:', data);
    
    switch (data.type) {
        case 'joined':
            // Update score if reconnecting
            if (data.score) {
                state.score = data.score;
            }
            
            // Update team info if provided
            if (data.team_id && data.team) {
                updateMyTeam(data.team_id, data.team);
            }
            
            // Handle mid-game join - if there's a current question, show it
            if (data.current_question && data.state === 'question') {
                if (data.already_answered) {
                    // Show waiting state
                    showQuestion(data.current_question);
                    document.getElementById('answeredOverlay').classList.add('visible');
                    state.answered = true;
                } else {
                    showQuestion(data.current_question);
                }
            }
            
            // Handle minigame state
            if (data.state === 'minigame' && data.minigame_state) {
                showMinigame({
                    minigame_type: data.minigame_state.type,
                    prompt: data.minigame_state.prompt,
                    duration: data.minigame_state.duration
                });
            }
            
            // Show host disconnected warning if needed
            if (data.host_connected === false) {
                showHostDisconnected();
            }
            break;
            
        case 'game_starting':
            hideHostDisconnected();
            // Show countdown or transition
            break;
            
        case 'question':
            hideHostDisconnected();
            showQuestion(data);
            break;
            
        case 'answer_received':
            showAnswerConfirmation(data.answer);
            break;
            
        case 'reveal':
            showResults(data);
            break;
            
        case 'game_over':
            showGameOver(data);
            break;
            
        case 'room_reset':
            hideHostDisconnected();
            showScreen('lobbyScreen');
            state.score = 0;
            break;
            
        case 'kicked':
            showScreen('kickedScreen');
            if (state.ws) state.ws.close();
            break;
            
        case 'host_disconnected':
            showHostDisconnected();
            break;
            
        case 'host_connected':
            hideHostDisconnected();
            break;
            
        case 'room_closed':
            alert(data.message || 'Room has been closed');
            window.location.href = '/';
            break;
            
        case 'error':
            alert(data.message);
            break;
        
        // Team events
        case 'your_team_changed':
            updateMyTeam(data.team_id, data.team);
            break;
            
        case 'team_mode_changed':
        case 'teams_auto_assigned':
            // Team mode changed - team info will come via your_team_changed
            break;
        
        // Bowl mode events
        case 'you_buzzed_first':
            showBowlAnswerInput();
            break;
            
        case 'buzz_too_slow':
            showBowlWaiting('Too slow! Someone else buzzed first.');
            break;
            
        case 'buzz_winner':
            // Someone else won the buzz
            if (data.player_id !== state.playerId) {
                showBowlWaiting(`${data.player_name} buzzed first!`);
            }
            break;
            
        case 'bowl_answer_received':
            showBowlWaiting('Waiting for host judgment...');
            break;
            
        case 'awaiting_judgment':
            showBowlWaiting(`Waiting for ${data.player_name}'s answer...`);
            break;
            
        case 'bowl_correct':
            showBowlResult(data, true);
            break;
            
        case 'bowl_incorrect_steal':
            handleStealPhase(data);
            break;
            
        case 'bowl_no_correct':
        case 'bowl_steal_skipped':
            showBowlResult(data, false);
            break;
            
        case 'steal_winner':
            if (data.player_id !== state.playerId) {
                showBowlWaiting(`${data.player_name} is stealing!`);
            }
            break;
            
        case 'you_can_steal':
            showBowlAnswerInput();
            break;
            
        case 'steal_not_eligible':
            showBowlWaiting('Your team already attempted.');
            break;
        
        // Minigame events
        case 'minigame_start':
            showMinigame(data);
            break;
            
        case 'minigame_end':
            hideMinigame();
            break;
            
        case 'minigame_submission_received':
            // Show confirmation
            const submitBtn = document.getElementById('submitMinigameBtn');
            if (submitBtn) {
                const originalText = submitBtn.textContent;
                submitBtn.textContent = '✓ Submitted!';
                submitBtn.disabled = true;
                setTimeout(() => {
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }, 2000);
            }
            break;
    }
}

// ─────────────────────────── Host Disconnection UI ─────────────────────────── #

function showHostDisconnected(customMessage = null) {
    let overlay = document.getElementById('hostDisconnectedOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'hostDisconnectedOverlay';
        overlay.className = 'host-disconnected-overlay';
        document.body.appendChild(overlay);
    }
    
    const message = customMessage || 'Waiting for host to reconnect...';
    overlay.innerHTML = `
        <div class="host-disconnected-content">
            <div class="spinner"></div>
            <p>⚠️ Connection Issue</p>
            <p class="subtext">${message}</p>
            <button class="retry-btn" onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1.5rem; background: var(--primary); color: white; border: none; border-radius: 25px; cursor: pointer; font-weight: 600;">Refresh Page</button>
        </div>
    `;
    overlay.classList.add('visible');
}

function hideHostDisconnected() {
    const overlay = document.getElementById('hostDisconnectedOverlay');
    if (overlay) {
        overlay.classList.remove('visible');
    }
}

// ─────────────────────────── Question Display ─────────────────────────── #

function showQuestion(data) {
    state.currentQuestion = data;
    state.answered = false;
    state.gameMode = data.game_mode || 'classic';
    
    const qType = data.question_type || 'choice';
    
    // Update header
    document.getElementById('questionNumber').textContent = `${data.question_num}/${data.total_questions}`;
    document.getElementById('questionText').textContent = data.question;
    
    // Handle bowl mode vs classic mode
    const answersContainer = document.getElementById('answersContainer');
    const bowlPlayerUI = document.getElementById('bowlPlayerUI');
    
    if (state.gameMode === 'bowl') {
        // Bowl mode - show buzz UI
        answersContainer.classList.add('hidden');
        bowlPlayerUI.classList.remove('hidden');
        
        // Reset bowl state
        state.bowlPhase = 'buzzing';
        state.canBuzz = data.can_buzz !== false;
        state.wonBuzz = false;
        
        // Show buzz button
        showBuzzButton();
        
        // Hide timer in bowl mode
        document.getElementById('timer').classList.add('hidden');
        
        // Hide overlay
        document.getElementById('answeredOverlay').classList.remove('visible');
        
        showScreen('questionScreen');
        return;
    }
    
    // Classic mode - normal flow
    answersContainer.classList.remove('hidden');
    bowlPlayerUI.classList.add('hidden');
    document.getElementById('timer').classList.remove('hidden');
    
    // Create answer UI based on question type
    const container = document.getElementById('answersContainer');
    container.innerHTML = '';
    container.className = 'answers';  // Reset class
    
    const colors = ['btn-red', 'btn-blue', 'btn-yellow', 'btn-green'];
    const shapes = ['▲', '◆', '●', '■'];
    
    if (qType === 'text') {
        // Text input
        container.classList.add('text-input-mode');
        container.innerHTML = `
            <div class="text-input-container">
                <input type="text" id="textAnswer" placeholder="Type your answer..." autocomplete="off" maxlength="50">
                <button class="submit-text-btn" onclick="submitTextAnswer()">SUBMIT</button>
            </div>
        `;
        setTimeout(() => document.getElementById('textAnswer').focus(), 100);
        
    } else if (qType === 'number') {
        // Number input
        container.classList.add('number-input-mode');
        container.innerHTML = `
            <div class="number-input-container">
                <input type="number" id="numberAnswer" placeholder="Enter a number..." autocomplete="off">
                <button class="submit-text-btn" onclick="submitNumberAnswer()">SUBMIT</button>
            </div>
        `;
        setTimeout(() => document.getElementById('numberAnswer').focus(), 100);
        
    } else if (qType === 'wager') {
        // Wager question - show wager selector first, then choices
        const playerScore = data.player_score || 0;
        const canWager = playerScore >= 100;
        
        container.classList.add('wager-mode');
        let wagerHtml = '<div class="wager-section">';
        
        if (canWager) {
            const maxWager = Math.min(playerScore, 500);
            wagerHtml += `
                <p class="wager-label">🎲 WAGER YOUR POINTS</p>
                <div class="wager-buttons">
                    <button class="wager-btn" data-wager="100">100</button>
                    <button class="wager-btn" data-wager="200" ${maxWager < 200 ? 'disabled' : ''}>200</button>
                    <button class="wager-btn" data-wager="300" ${maxWager < 300 ? 'disabled' : ''}>300</button>
                    <button class="wager-btn" data-wager="500" ${maxWager < 500 ? 'disabled' : ''}>500</button>
                </div>
                <p class="wager-info">Your score: ${playerScore}</p>
            `;
        } else {
            wagerHtml += `<p class="wager-info">Need 100+ points to wager</p>`;
        }
        wagerHtml += '</div>';
        
        // Add answer choices
        wagerHtml += '<div class="wager-answers">';
        data.answers.forEach((answer, index) => {
            wagerHtml += `<button class="answer-btn ${colors[index]}" data-answer="${index}">
                <span class="shape">${shapes[index]}</span><span class="text">${answer}</span>
            </button>`;
        });
        wagerHtml += '</div>';
        
        container.innerHTML = wagerHtml;
        
        // Setup wager button handlers
        let selectedWager = 0;
        container.querySelectorAll('.wager-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.wager-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedWager = parseInt(btn.dataset.wager);
            });
        });
        
        // Setup answer handlers
        container.querySelectorAll('.answer-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                submitAnswer(parseInt(btn.dataset.answer), selectedWager);
            });
        });
        
    } else if (qType === 'poll') {
        // Poll - same as choice but with poll styling
        container.classList.add('poll-mode');
        data.answers.forEach((answer, index) => {
            const btn = document.createElement('button');
            btn.className = `answer-btn poll-btn ${colors[index % colors.length]}`;
            btn.innerHTML = `<span class="text">${answer}</span>`;
            btn.addEventListener('click', () => submitAnswer(index));
            container.appendChild(btn);
        });
        
    } else if (qType === 'open_poll') {
        // Open poll - text input for free-form answers
        container.classList.add('open-poll-mode');
        container.innerHTML = `
            <div class="text-input-container">
                <p class="open-poll-prompt">Share your answer:</p>
                <input type="text" id="openPollAnswer" placeholder="Type your answer..." autocomplete="off" maxlength="100">
                <button class="submit-text-btn" onclick="submitOpenPollAnswer()">SUBMIT</button>
            </div>
        `;
        setTimeout(() => document.getElementById('openPollAnswer').focus(), 100);
        
    } else {
        // Choice or truefalse - standard buttons
        data.answers.forEach((answer, index) => {
            const btn = document.createElement('button');
            btn.className = `answer-btn ${colors[index % colors.length]}`;
            btn.innerHTML = `<span class="shape">${shapes[index % shapes.length]}</span><span class="text">${answer}</span>`;
            btn.addEventListener('click', () => submitAnswer(index));
            container.appendChild(btn);
        });
    }
    
    // Hide overlay
    document.getElementById('answeredOverlay').classList.remove('visible');
    
    // Start timer (or show waiting mode)
    if (data.wait_for_all || data.time_limit === 0) {
        document.getElementById('timerText').textContent = '∞';
        document.getElementById('timerBar').style.width = '100%';
        document.getElementById('timer').classList.remove('urgent');
    } else {
        startTimer(data.time_limit);
    }
    
    showScreen('questionScreen');
}

function submitTextAnswer() {
    const input = document.getElementById('textAnswer');
    if (input && input.value.trim()) {
        submitAnswer(input.value.trim());
    }
}

function submitOpenPollAnswer() {
    const input = document.getElementById('openPollAnswer');
    if (input && input.value.trim()) {
        submitAnswer(input.value.trim());
    }
}

function submitNumberAnswer() {
    const input = document.getElementById('numberAnswer');
    if (input && input.value !== '') {
        submitAnswer(parseFloat(input.value));
    }
}

function startTimer(seconds) {
    clearInterval(state.timerInterval);
    
    const timerText = document.getElementById('timerText');
    const timerBar = document.getElementById('timerBar');
    let remaining = seconds;
    
    timerText.textContent = remaining;
    timerBar.style.width = '100%';
    
    state.timerInterval = setInterval(() => {
        remaining -= 0.1;
        timerText.textContent = Math.ceil(remaining);
        timerBar.style.width = `${(remaining / seconds) * 100}%`;
        
        if (remaining <= 5) {
            document.getElementById('timer').classList.add('urgent');
        }
        
        if (remaining <= 0) {
            clearInterval(state.timerInterval);
        }
    }, 100);
}

function submitAnswer(answer, wager = 0) {
    if (state.answered) return;
    state.answered = true;
    
    clearInterval(state.timerInterval);
    
    // Highlight selected for button-based answers
    const buttons = document.querySelectorAll('.answer-btn');
    buttons.forEach((btn, i) => {
        if (typeof answer === 'number' && i === answer) {
            btn.classList.add('selected');
        }
        btn.disabled = true;
    });
    
    // Disable text inputs
    const textInput = document.getElementById('textAnswer');
    const numberInput = document.getElementById('numberAnswer');
    if (textInput) textInput.disabled = true;
    if (numberInput) numberInput.disabled = true;
    
    // Send answer
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        const msg = {
            type: 'answer',
            answer: answer
        };
        if (wager > 0) {
            msg.wager = wager;
        }
        state.ws.send(JSON.stringify(msg));
    }
}

function showAnswerConfirmation(answerIndex) {
    document.getElementById('answeredOverlay').classList.add('visible');
}

// ─────────────────────────── Results Display ─────────────────────────── #

function showResults(data) {
    clearInterval(state.timerInterval);
    
    // Find this player's result
    const myResult = data.results.find(r => r.id === state.playerId);
    const myRank = data.leaderboard.findIndex(p => p.id === state.playerId) + 1;
    
    state.score = myResult ? myResult.total_score : state.score;
    
    // Result header
    const header = document.getElementById('resultHeader');
    if (myResult && myResult.correct) {
        header.innerHTML = '<span class="correct">✓ CORRECT!</span>';
        header.className = 'result-header correct';
    } else {
        header.innerHTML = `<span class="incorrect">✗ WRONG</span><p>Answer: ${data.correct_text}</p>`;
        header.className = 'result-header incorrect';
    }
    
    // Points display
    const pointsDisplay = document.getElementById('pointsDisplay');
    if (myResult && myResult.points_earned > 0) {
        pointsDisplay.innerHTML = `<span class="points-earned">+${myResult.points_earned}</span><span class="total-score">${myResult.total_score} total</span>`;
    } else {
        pointsDisplay.innerHTML = `<span class="total-score">${state.score} total</span>`;
    }
    
    // Streak
    const streakDisplay = document.getElementById('streakDisplay');
    if (myResult && myResult.streak > 1) {
        streakDisplay.innerHTML = `<span class="streak">🔥 ${myResult.streak} streak!</span>`;
        streakDisplay.style.display = 'block';
    } else {
        streakDisplay.style.display = 'none';
    }
    
    // Rank
    document.getElementById('yourRank').textContent = `#${myRank}`;
    
    showScreen('resultsScreen');
}

// ─────────────────────────── Game Over ─────────────────────────── #

function showGameOver(data) {
    clearInterval(state.timerInterval);
    
    const myRank = data.leaderboard.findIndex(p => p.id === state.playerId) + 1;
    const myData = data.leaderboard.find(p => p.id === state.playerId);
    
    document.getElementById('finalScore').textContent = myData ? myData.score : state.score;
    document.getElementById('finalRank').textContent = `#${myRank} of ${data.leaderboard.length}`;
    
    // Show team result if in team mode
    const teamResultContainer = document.getElementById('teamResult');
    if (data.team_mode && data.team_leaderboard && state.team) {
        const myTeamResult = data.team_leaderboard.find(t => t.id === state.teamId);
        const teamRank = data.team_leaderboard.findIndex(t => t.id === state.teamId) + 1;
        
        if (myTeamResult) {
            if (!teamResultContainer) {
                // Create team result element
                const teamDiv = document.createElement('div');
                teamDiv.id = 'teamResult';
                teamDiv.className = `team-result ${teamRank === 1 ? 'winner' : ''}`;
                teamDiv.style.borderColor = state.team.color;
                teamDiv.innerHTML = `
                    <span class="team-label">${teamRank === 1 ? '🏆 WINNING TEAM' : 'YOUR TEAM'}</span>
                    <span class="team-name" style="color: ${state.team.color}">${escapeHtml(state.team.name)}</span>
                    <span class="team-score">${myTeamResult.score} points • #${teamRank} of ${data.team_leaderboard.length}</span>
                `;
                
                // Insert after game over title
                const title = document.querySelector('.game-over-title');
                title.after(teamDiv);
            }
        }
    } else if (teamResultContainer) {
        teamResultContainer.remove();
    }
    
    showScreen('gameOverScreen');
}

// ─────────────────────────── Team Management ─────────────────────────── #

function updateMyTeam(teamId, teamInfo) {
    state.teamId = teamId;
    state.team = teamInfo;
    
    updateTeamDisplay();
}

function updateTeamDisplay() {
    // Update lobby screen team indicator
    const lobbyTeamDisplay = document.getElementById('lobbyTeamDisplay');
    const playerAvatar = document.getElementById('playerAvatar');
    
    if (state.team) {
        // Show team badge in lobby
        if (!lobbyTeamDisplay) {
            // Create team display element
            const teamDiv = document.createElement('div');
            teamDiv.id = 'lobbyTeamDisplay';
            teamDiv.className = 'team-badge';
            document.querySelector('.player-info').appendChild(teamDiv);
        }
        
        const display = document.getElementById('lobbyTeamDisplay') || lobbyTeamDisplay;
        if (display) {
            display.innerHTML = `<span class="team-name" style="color: ${state.team.color}">${escapeHtml(state.team.name)}</span>`;
            display.style.borderColor = state.team.color;
        }
        
        // Update avatar border color
        if (playerAvatar) {
            playerAvatar.style.borderColor = state.team.color;
        }
    } else {
        // Remove team display
        const display = document.getElementById('lobbyTeamDisplay');
        if (display) {
            display.remove();
        }
        
        // Reset avatar border
        if (playerAvatar) {
            playerAvatar.style.borderColor = '#6c5ce7';  // default primary color
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─────────────────────────── Bowl Mode ─────────────────────────── #

function showBuzzButton() {
    document.getElementById('buzzContainer').classList.remove('hidden');
    document.getElementById('bowlAnswerInput').classList.add('hidden');
    document.getElementById('bowlWaitingState').classList.add('hidden');
    document.getElementById('stealContainer').classList.add('hidden');
    document.getElementById('stealIneligible').classList.add('hidden');
    
    const buzzBtn = document.getElementById('buzzBtn');
    buzzBtn.disabled = !state.canBuzz;
    buzzBtn.classList.remove('buzzed');
}

function showBowlAnswerInput() {
    state.wonBuzz = true;
    state.bowlPhase = 'answering';
    
    document.getElementById('buzzContainer').classList.add('hidden');
    document.getElementById('bowlAnswerInput').classList.remove('hidden');
    document.getElementById('bowlWaitingState').classList.add('hidden');
    document.getElementById('stealContainer').classList.add('hidden');
    document.getElementById('stealIneligible').classList.add('hidden');
    
    // Focus the input
    const input = document.getElementById('bowlAnswerText');
    input.value = '';
    setTimeout(() => input.focus(), 100);
}

function showBowlWaiting(message) {
    state.bowlPhase = 'waiting';
    
    document.getElementById('buzzContainer').classList.add('hidden');
    document.getElementById('bowlAnswerInput').classList.add('hidden');
    document.getElementById('bowlWaitingState').classList.remove('hidden');
    document.getElementById('stealContainer').classList.add('hidden');
    document.getElementById('stealIneligible').classList.add('hidden');
    
    document.getElementById('bowlWaitText').textContent = message;
}

function handleStealPhase(data) {
    state.bowlPhase = 'stealing';
    
    // Check if my team can steal
    const canSteal = data.steal_eligible && state.teamId && data.steal_eligible.includes(state.teamId);
    
    document.getElementById('buzzContainer').classList.add('hidden');
    document.getElementById('bowlAnswerInput').classList.add('hidden');
    document.getElementById('bowlWaitingState').classList.add('hidden');
    
    if (canSteal) {
        document.getElementById('stealContainer').classList.remove('hidden');
        document.getElementById('stealIneligible').classList.add('hidden');
    } else {
        document.getElementById('stealContainer').classList.add('hidden');
        document.getElementById('stealIneligible').classList.remove('hidden');
    }
}

function showBowlResult(data, wasCorrect) {
    clearInterval(state.timerInterval);
    
    // Find this player's data in leaderboard
    const myRank = data.leaderboard ? data.leaderboard.findIndex(p => p.id === state.playerId) + 1 : 0;
    const myData = data.leaderboard ? data.leaderboard.find(p => p.id === state.playerId) : null;
    
    if (myData) {
        state.score = myData.score;
    }
    
    // Show results screen
    const header = document.getElementById('resultHeader');
    
    if (data.player_id === state.playerId && wasCorrect) {
        // I got it right
        const stealText = data.is_steal ? ' (STEAL)' : '';
        header.innerHTML = `<span class="correct">✓ CORRECT!${stealText}</span>`;
        header.className = 'result-header correct';
    } else if (data.player_id === state.playerId && !wasCorrect) {
        // I got it wrong
        header.innerHTML = `<span class="incorrect">✗ WRONG</span><p>Answer: ${escapeHtml(data.correct_answer || '')}</p>`;
        header.className = 'result-header incorrect';
    } else if (wasCorrect) {
        // Someone else got it right
        header.innerHTML = `<span class="neutral">${escapeHtml(data.player_name)} got it!</span>`;
        header.className = 'result-header neutral';
    } else {
        // No one got it
        header.innerHTML = `<span class="neutral">No one got it</span><p>Answer: ${escapeHtml(data.correct_answer || '')}</p>`;
        header.className = 'result-header neutral';
    }
    
    // Points display
    const pointsDisplay = document.getElementById('pointsDisplay');
    pointsDisplay.innerHTML = `<span class="total-score">${state.score} total</span>`;
    
    // Hide streak for bowl mode
    document.getElementById('streakDisplay').style.display = 'none';
    
    // Rank
    document.getElementById('yourRank').textContent = `#${myRank || '?'}`;
    
    showScreen('resultsScreen');
}

function sendBuzz() {
    if (!state.canBuzz || state.answered) return;
    
    // Disable buzz button immediately
    const buzzBtn = document.getElementById('buzzBtn');
    buzzBtn.disabled = true;
    buzzBtn.classList.add('buzzed');
    
    // Send buzz to server
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'buzz' }));
    }
}

function sendStealBuzz() {
    if (state.bowlPhase !== 'stealing') return;
    
    // Disable steal button immediately
    const stealBtn = document.getElementById('stealBtn');
    stealBtn.disabled = true;
    
    // Send steal buzz to server
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'steal_buzz' }));
    }
}

function submitBowlAnswer() {
    if (!state.wonBuzz) return;
    
    const input = document.getElementById('bowlAnswerText');
    const answer = input.value.trim();
    
    if (!answer) return;
    
    // Disable input and button
    input.disabled = true;
    document.getElementById('bowlSubmitBtn').disabled = true;
    
    // Send answer to server
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'bowl_answer', answer: answer }));
    }
    
    // Show waiting state
    showBowlWaiting('Waiting for host judgment...');
}

// Setup bowl mode event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Buzz button
    const buzzBtn = document.getElementById('buzzBtn');
    if (buzzBtn) {
        buzzBtn.addEventListener('click', sendBuzz);
        // Also allow tapping/touching
        buzzBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendBuzz();
        });
    }
    
    // Steal button
    const stealBtn = document.getElementById('stealBtn');
    if (stealBtn) {
        stealBtn.addEventListener('click', sendStealBuzz);
        stealBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendStealBuzz();
        });
    }
    
    // Bowl answer submit
    const bowlSubmitBtn = document.getElementById('bowlSubmitBtn');
    if (bowlSubmitBtn) {
        bowlSubmitBtn.addEventListener('click', submitBowlAnswer);
    }
    
    // Allow Enter key to submit bowl answer
    const bowlAnswerText = document.getElementById('bowlAnswerText');
    if (bowlAnswerText) {
        bowlAnswerText.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitBowlAnswer();
            }
        });
    }
    
    // Lobby minigame buttons (client-side only)
    document.querySelectorAll('.minigame-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const minigameType = btn.dataset.type;
            if (minigameType === 'draw_prompt') {
                // Show prompt input
                const promptInput = document.getElementById('lobbyPromptInput');
                if (promptInput) {
                    promptInput.classList.remove('hidden');
                    const input = document.getElementById('lobbyMinigamePrompt');
                    if (input) input.focus();
                }
                // Start minigame when prompt is entered
                const promptField = document.getElementById('lobbyMinigamePrompt');
                if (promptField) {
                    const startHandler = (e) => {
                        if (e.key === 'Enter' && promptField.value.trim()) {
                            startLocalMinigame('draw_prompt', promptField.value.trim());
                            promptInput.classList.add('hidden');
                            promptField.removeEventListener('keypress', startHandler);
                        }
                    };
                    promptField.addEventListener('keypress', startHandler);
                }
            } else {
                startLocalMinigame(minigameType);
            }
        });
    });
});

function startLocalMinigame(minigameType, prompt = null) {
    // Client-side only minigame (no server sync)
    showMinigame({
        minigame_type: minigameType,
        prompt: prompt,
        duration: 0, // No timer for local minigames
        local: true
    });
}

// ─────────────────────────── Minigame Functions ─────────────────────────── #

function showMinigame(data) {
    state.minigameState = data;
    
    const minigameType = data.minigame_type || 'draw_freestyle';
    const prompt = data.prompt || '';
    
    // Update UI based on minigame type
    if (minigameType === 'microgame') {
        showMicrogame(data);
        return;
    }
    
    // Drawing games
    document.getElementById('minigameTitle').textContent = minigameType === 'draw_prompt' ? '🎨 DRAW IT!' : '🎨 FREE DRAW';
    document.getElementById('minigamePrompt').textContent = prompt || 'Draw anything you want!';
    
    // Show drawing container, hide microgame UI
    const drawingContainer = document.getElementById('drawingContainer');
    const drawingControls = document.getElementById('drawingControls');
    const microgameUI = document.getElementById('microgameUI');
    
    if (drawingContainer) drawingContainer.style.display = 'block';
    if (drawingControls) drawingControls.style.display = 'flex';
    if (microgameUI) microgameUI.style.display = 'none';
    
    // Initialize canvas
    initDrawingCanvas();
    
    // Start timer if duration is set
    if (data.duration && data.duration > 0) {
        startMinigameTimer(data.duration);
    }
    
    showScreen('minigameScreen');
}

function showMicrogame(data) {
    // Hide drawing UI, show microgame UI
    const drawingContainer = document.getElementById('drawingContainer');
    const drawingControls = document.getElementById('drawingControls');
    const microgameUI = document.getElementById('microgameUI');
    
    if (drawingContainer) drawingContainer.style.display = 'none';
    if (drawingControls) drawingControls.style.display = 'none';
    if (microgameUI) {
        microgameUI.style.display = 'block';
        microgameUI.classList.remove('hidden');
    }
    
    const titleEl = document.getElementById('minigameTitle');
    const promptEl = document.getElementById('minigamePrompt');
    if (titleEl) titleEl.textContent = '⚡ MICROGAME';
    if (promptEl) promptEl.textContent = 'Get ready...';
    
    // Start a random microgame
    startRandomMicrogame();
    
    showScreen('minigameScreen');
}

function startRandomMicrogame() {
    const games = [
        'tap_when_red',
        'quick_math',
        'count_clicks'
    ];
    const gameType = games[Math.floor(Math.random() * games.length)];
    
    state.currentMicrogame = gameType;
    state.microgameScore = 0;
    state.microgameRound = 0;
    
    runMicrogame(gameType);
}

function runMicrogame(gameType) {
    const microgameUI = document.getElementById('microgameUI');
    if (!microgameUI) {
        console.error('Microgame UI not found');
        return;
    }
    
    state.microgameRound++;
    
    if (gameType === 'tap_when_red') {
        // Tap when the screen turns red
        microgameUI.innerHTML = `
            <div class="microgame-instruction">Tap when the screen turns RED!</div>
            <div class="microgame-display" id="microgameDisplay" style="background: #3498db; width: 100%; height: 300px; border-radius: 12px; margin: 1rem 0;"></div>
            <div class="microgame-score">Score: <span id="microgameScore">0</span></div>
        `;
        
        const display = document.getElementById('microgameDisplay');
        let clicked = false;
        
        const clickHandler = () => {
            if (!clicked && display.style.background === 'rgb(231, 76, 60)') {
                clicked = true;
                state.microgameScore++;
                document.getElementById('microgameScore').textContent = state.microgameScore;
                display.textContent = '✓ CORRECT!';
                display.style.background = '#2ecc71';
                setTimeout(() => {
                    if (state.microgameRound < 5) {
                        runMicrogame(gameType);
                    } else {
                        endLocalMinigame();
                    }
                }, 1000);
            } else if (!clicked) {
                // Too early
                display.textContent = '✗ TOO EARLY!';
                display.style.background = '#e74c3c';
                setTimeout(() => {
                    if (state.microgameRound < 5) {
                        runMicrogame(gameType);
                    } else {
                        endLocalMinigame();
                    }
                }, 1000);
            }
        };
        
        display.addEventListener('click', clickHandler);
        display.addEventListener('touchstart', clickHandler);
        
        // Change to red after random delay (1-3 seconds)
        const delay = 1000 + Math.random() * 2000;
        setTimeout(() => {
            if (!clicked) {
                display.style.background = '#e74c3c'; // Red
            }
        }, delay);
        
        // Auto-advance if not clicked
        setTimeout(() => {
            if (!clicked && state.microgameRound < 5) {
                runMicrogame(gameType);
            } else if (!clicked) {
                endLocalMinigame();
            }
        }, delay + 2000);
        
    } else if (gameType === 'quick_math') {
        // Quick math problems
        const a = Math.floor(Math.random() * 20) + 1;
        const b = Math.floor(Math.random() * 20) + 1;
        const answer = a + b;
        
        microgameUI.innerHTML = `
            <div class="microgame-instruction">Solve quickly!</div>
            <div class="microgame-question">${a} + ${b} = ?</div>
            <div class="microgame-options">
                <button class="microgame-option" data-answer="${answer}">${answer}</button>
                <button class="microgame-option" data-answer="${answer + Math.floor(Math.random() * 10) + 1}">${answer + Math.floor(Math.random() * 10) + 1}</button>
                <button class="microgame-option" data-answer="${Math.max(1, answer - Math.floor(Math.random() * 10) - 1)}">${Math.max(1, answer - Math.floor(Math.random() * 10) - 1)}</button>
            </div>
            <div class="microgame-score">Score: <span id="microgameScore">${state.microgameScore}</span></div>
        `;
        
        // Shuffle options
        const options = microgameUI.querySelectorAll('.microgame-option');
        const optionsArray = Array.from(options);
        optionsArray.sort(() => Math.random() - 0.5);
        const container = microgameUI.querySelector('.microgame-options');
        container.innerHTML = '';
        optionsArray.forEach(opt => container.appendChild(opt));
        
        options.forEach(btn => {
            btn.addEventListener('click', () => {
                if (parseInt(btn.dataset.answer) === answer) {
                    state.microgameScore++;
                    document.getElementById('microgameScore').textContent = state.microgameScore;
                    btn.style.background = '#2ecc71';
                } else {
                    btn.style.background = '#e74c3c';
                }
                setTimeout(() => {
                    if (state.microgameRound < 5) {
                        runMicrogame(gameType);
                    } else {
                        endLocalMinigame();
                    }
                }, 1000);
            });
        });
        
    } else if (gameType === 'count_clicks') {
        // Count the number of clicks shown
        const target = Math.floor(Math.random() * 5) + 3;
        
        microgameUI.innerHTML = `
            <div class="microgame-instruction">Count the clicks!</div>
            <div class="microgame-display" id="microgameDisplay" style="width: 100%; height: 200px; border-radius: 12px; margin: 1rem 0; background: var(--bg-card); display: flex; align-items: center; justify-content: center; font-size: 3rem;">🔊</div>
            <div class="microgame-input">
                <input type="number" id="clickCountInput" placeholder="How many?" min="1" max="10">
                <button id="submitCountBtn">Submit</button>
            </div>
            <div class="microgame-score">Score: <span id="microgameScore">${state.microgameScore}</span></div>
        `;
        
        const display = document.getElementById('microgameDisplay');
        let clickCount = 0;
        
        // Play clicks
        const playClicks = () => {
            for (let i = 0; i < target; i++) {
                setTimeout(() => {
                    display.textContent = '🔊';
                    setTimeout(() => {
                        display.textContent = '';
                    }, 200);
                }, i * 500);
            }
        };
        
        playClicks();
        
        document.getElementById('submitCountBtn').addEventListener('click', () => {
            const guess = parseInt(document.getElementById('clickCountInput').value);
            if (guess === target) {
                state.microgameScore++;
                document.getElementById('microgameScore').textContent = state.microgameScore;
                display.textContent = '✓ CORRECT!';
                display.style.background = '#2ecc71';
            } else {
                display.textContent = `✗ It was ${target}`;
                display.style.background = '#e74c3c';
            }
            setTimeout(() => {
                if (state.microgameRound < 5) {
                    runMicrogame(gameType);
                } else {
                    endLocalMinigame();
                }
            }, 2000);
        });
    }
}

function endLocalMinigame() {
    const microgameUI = document.getElementById('microgameUI');
    if (microgameUI) {
        microgameUI.innerHTML = `
            <div class="microgame-result">
                <h2>Game Over!</h2>
                <p>Final Score: ${state.microgameScore}</p>
                <button class="minigame-back-btn" onclick="hideMinigame()">Back to Lobby</button>
            </div>
        `;
    }
}

function hideMinigame() {
    state.minigameState = null;
    state.currentMicrogame = null;
    if (state.minigameTimerInterval) {
        clearInterval(state.minigameTimerInterval);
        state.minigameTimerInterval = null;
    }
    // Return to previous screen (lobby or results)
    if (state.answered) {
        showScreen('resultsScreen');
    } else {
        showScreen('lobbyScreen');
    }
}

function startMinigameTimer(duration) {
    const timerEl = document.getElementById('minigameTimer');
    if (!timerEl) return;
    
    let timeLeft = duration;
    timerEl.textContent = `Time: ${timeLeft}s`;
    
    if (state.minigameTimerInterval) {
        clearInterval(state.minigameTimerInterval);
    }
    
    state.minigameTimerInterval = setInterval(() => {
        timeLeft--;
        if (timerEl) {
            timerEl.textContent = `Time: ${timeLeft}s`;
        }
        if (timeLeft <= 0) {
            clearInterval(state.minigameTimerInterval);
            state.minigameTimerInterval = null;
            submitMinigameAnswer();
        }
    }, 1000);
}

function initDrawingCanvas() {
    const canvas = document.getElementById('drawingCanvas');
    if (!canvas) return;
    
    const container = document.getElementById('drawingContainer');
    if (container) {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width - 20;
        canvas.height = Math.min(rect.width - 20, window.innerHeight * 0.5);
    } else {
        canvas.width = window.innerWidth - 40;
        canvas.height = window.innerHeight * 0.5;
    }
    
    state.drawingCanvas = canvas;
    state.drawingCtx = canvas.getContext('2d');
    
    // Set default drawing style
    state.drawingCtx.strokeStyle = state.currentColor;
    state.drawingCtx.lineWidth = state.brushSize;
    state.drawingCtx.lineCap = 'round';
    state.drawingCtx.lineJoin = 'round';
    
    // Clear canvas
    state.drawingCtx.fillStyle = '#ffffff';
    state.drawingCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch events
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        state.lastX = touch.clientX - rect.left;
        state.lastY = touch.clientY - rect.top;
        state.isDrawing = true;
    });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!state.isDrawing) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const currentX = touch.clientX - rect.left;
        const currentY = touch.clientY - rect.top;
        
        state.drawingCtx.beginPath();
        state.drawingCtx.moveTo(state.lastX, state.lastY);
        state.drawingCtx.lineTo(currentX, currentY);
        state.drawingCtx.stroke();
        
        state.lastX = currentX;
        state.lastY = currentY;
    });
    
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        state.isDrawing = false;
    });
    
    // Color picker
    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker) {
        colorPicker.value = state.currentColor;
        colorPicker.addEventListener('input', (e) => {
            state.currentColor = e.target.value;
            state.drawingCtx.strokeStyle = state.currentColor;
        });
    }
    
    // Brush size
    const brushSize = document.getElementById('brushSize');
    const brushSizeValue = document.getElementById('brushSizeValue');
    if (brushSize) {
        brushSize.value = state.brushSize;
        brushSize.addEventListener('input', (e) => {
            state.brushSize = parseInt(e.target.value);
            state.drawingCtx.lineWidth = state.brushSize;
            if (brushSizeValue) {
                brushSizeValue.textContent = state.brushSize;
            }
        });
    }
    
    // Clear button
    const clearBtn = document.getElementById('clearCanvasBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            state.drawingCtx.fillStyle = '#ffffff';
            state.drawingCtx.fillRect(0, 0, canvas.width, canvas.height);
        });
    }
    
    // Submit button
    const submitBtn = document.getElementById('submitMinigameBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitMinigameAnswer);
    }
}

function startDrawing(e) {
    state.isDrawing = true;
    const rect = state.drawingCanvas.getBoundingClientRect();
    state.lastX = e.clientX - rect.left;
    state.lastY = e.clientY - rect.top;
}

function draw(e) {
    if (!state.isDrawing) return;
    
    const rect = state.drawingCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    state.drawingCtx.beginPath();
    state.drawingCtx.moveTo(state.lastX, state.lastY);
    state.drawingCtx.lineTo(currentX, currentY);
    state.drawingCtx.stroke();
    
    state.lastX = currentX;
    state.lastY = currentY;
}

function stopDrawing() {
    state.isDrawing = false;
}

function submitMinigameAnswer() {
    if (!state.drawingCanvas) return;
    
    // Convert canvas to base64
    const imageData = state.drawingCanvas.toDataURL('image/png');
    
    // Only send to server if it's a synchronized minigame (not local)
    if (state.ws && state.minigameState && !state.minigameState.local) {
        state.ws.send(JSON.stringify({
            type: 'minigame_submit',
            minigame_type: state.minigameState.minigame_type || 'draw_freestyle',
            data: imageData,
            prompt: state.minigameState.prompt
        }));
    } else {
        // Local minigame - just show result
        setTimeout(() => {
            hideMinigame();
        }, 2000);
    }
}

// ─────────────────────────── Init ─────────────────────────── #

// Check for room code in URL
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) {
    document.getElementById('roomCode').value = urlRoom.toUpperCase();
}

