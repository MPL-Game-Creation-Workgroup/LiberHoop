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
    wonBuzz: false
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
        const response = await fetch(`/api/room/${roomCode}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: playerName })
        });
        
        if (!response.ok) {
            const data = await response.json();
            errorMsg.textContent = data.detail || 'Could not join room';
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
        errorMsg.textContent = 'Connection error. Please try again.';
        console.error(err);
    }
});

// Auto-capitalize room code
document.getElementById('roomCode').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
});

// ─────────────────────────── WebSocket ─────────────────────────── #

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/play/${state.roomCode}/${state.playerId}`;
    
    state.ws = new WebSocket(wsUrl);
    
    state.ws.onopen = () => {
        console.log('Connected to game');
        hideHostDisconnected();  // Clear any disconnection overlay
    };
    
    state.ws.onclose = (event) => {
        console.log('Disconnected:', event.code);
        // Attempt to reconnect after 2 seconds (unless kicked or room closed)
        if (event.code !== 1000 && state.playerId) {
            console.log('Attempting to reconnect in 2s...');
            setTimeout(() => {
                if (state.playerId) {
                    connectWebSocket();
                }
            }, 2000);
        }
    };
    
    state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    state.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };
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
    }
}

// ─────────────────────────── Host Disconnection UI ─────────────────────────── #

function showHostDisconnected() {
    let overlay = document.getElementById('hostDisconnectedOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'hostDisconnectedOverlay';
        overlay.className = 'host-disconnected-overlay';
        overlay.innerHTML = `
            <div class="host-disconnected-content">
                <div class="spinner"></div>
                <p>⚠️ Host Disconnected</p>
                <p class="subtext">Waiting for host to reconnect...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
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
});

// ─────────────────────────── Init ─────────────────────────── #

// Check for room code in URL
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) {
    document.getElementById('roomCode').value = urlRoom.toUpperCase();
}

