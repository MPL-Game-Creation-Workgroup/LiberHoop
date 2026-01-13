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
    currentMicrogame: null,
    microgameScore: 0,
    microgameRound: 0,
    minigameTimerInterval: null,
    currentPuzzle: null,
    puzzleScore: 0
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
                // Restore bowl mode state if present
                if (data.bowl_phase !== undefined) {
                    state.gameMode = 'bowl';
                    state.bowlPhase = data.bowl_phase;
                    state.canBuzz = data.can_buzz !== false;
                    state.wonBuzz = data.is_buzz_winner === true;
                    
                    // Update current question with bowl mode info
                    data.current_question.game_mode = 'bowl';
                    data.current_question.can_buzz = data.can_buzz;
                }
                
                if (data.already_answered) {
                    // Show waiting state
                    showQuestion(data.current_question);
                    document.getElementById('answeredOverlay').classList.add('visible');
                    state.answered = true;
                } else {
                    showQuestion(data.current_question);
                    
                    // If reconnecting as buzz winner and can submit answer, show answer input
                    if (data.is_buzz_winner && data.can_submit_answer && state.bowlPhase === 'answering') {
                        showBowlAnswerInput();
                    } else if (data.bowl_phase === 'stealing' && data.can_buzz) {
                        // Show steal button if eligible
                        handleStealPhase({
                            steal_eligible: data.steal_eligible || []
                        });
                    } else if (data.bowl_phase === 'waiting' || data.awaiting_judgment) {
                        // Show waiting state
                        showBowlWaiting(data.awaiting_judgment ? 'Waiting for host judgment...' : 'Waiting...');
                    }
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
            
            // Load chat messages if in lobby
            if (data.state === 'lobby' && data.chat_messages) {
                clearChat();
                data.chat_messages.forEach(msg => addChatMessage(msg));
            }
            break;
            
        case 'game_starting':
            hideHostDisconnected();
            // Close any active lobby minigames when game starts
            if (state.minigameState && state.minigameState.local) {
                state.minigameState = null;
                state.currentMicrogame = null;
                state.currentPuzzle = null;
                if (state.minigameTimerInterval) {
                    clearInterval(state.minigameTimerInterval);
                    state.minigameTimerInterval = null;
                }
            }
            // Clear chat when game starts
            clearChat();
            // Show countdown or transition
            break;
            
        case 'question':
            hideHostDisconnected();
            // Close any active lobby minigames when question arrives
            if (state.minigameState && state.minigameState.local) {
                state.minigameState = null;
                state.currentMicrogame = null;
                state.currentPuzzle = null;
                if (state.minigameTimerInterval) {
                    clearInterval(state.minigameTimerInterval);
                    state.minigameTimerInterval = null;
                }
            }
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
            clearChat();
            break;
            
        case 'chat_message':
            addChatMessage(data);
            break;
            
        case 'chat_message_deleted':
            removeChatMessage(data.message_id);
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
        
        case 'bowl_buzz_winner_disconnected':
            // Buzz winner disconnected - handle based on whether steal is possible
            if (data.steal_eligible && data.steal_eligible.length > 0) {
                handleStealPhase(data);
            } else {
                // No steal possible - show result
                showBowlResult({
                    correct_answer: data.correct_answer || 'N/A',
                    message: data.message
                }, false);
            }
            break;
            
        case 'bowl_host_disconnected_steal':
            // Host disconnected during judgment, transition to steal
            handleStealPhase(data);
            break;
            
        case 'bowl_host_disconnected_reveal':
            // Host disconnected during judgment, reveal answer
            showBowlResult(data, false);
            break;
            
        case 'bowl_reset_steal':
            // Bowl state reset, transition to steal
            handleStealPhase(data);
            break;
            
        case 'bowl_reset_reveal':
            // Bowl state reset, reveal answer
            showBowlResult(data, false);
            break;
        
        // Minigame events
        case 'minigame_start':
            showMinigame(data);
            break;
            
        case 'minigame_end':
            // Synchronized minigame ended - return to appropriate screen
            state.minigameState = null;
            state.currentMicrogame = null;
            state.currentPuzzle = null;
            if (state.minigameTimerInterval) {
                clearInterval(state.minigameTimerInterval);
                state.minigameTimerInterval = null;
            }
            // Return to results/reveal screen if we were in a game
            // The server will send a room_state message to properly restore the reveal screen
            // For now, just hide the minigame - the room_state handler will show the correct screen
            if (state.answered) {
                showScreen('resultsScreen');
            } else {
                showScreen('lobbyScreen');
            }
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
            startLocalMinigame(minigameType);
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
    
    const minigameType = data.minigame_type || 'microgame';
    const isLocal = data.local === true; // Lobby minigame (can exit)
    const isSynchronized = !isLocal && data.duration && data.duration > 0; // Mid-game break (timer)
    
    // Show/hide exit button based on whether it's a lobby minigame
    const exitBtn = document.getElementById('exitMinigameBtn');
    if (exitBtn) {
        exitBtn.style.display = isLocal ? 'block' : 'none';
    }
    
    // Show timer for synchronized minigames
    const timerEl = document.getElementById('minigameTimer');
    if (timerEl) {
        if (isSynchronized && data.duration) {
            timerEl.style.display = 'block';
            startMinigameTimer(data.duration);
        } else {
            timerEl.style.display = 'none';
            if (state.minigameTimerInterval) {
                clearInterval(state.minigameTimerInterval);
                state.minigameTimerInterval = null;
            }
        }
    }
    
    // Update UI based on minigame type
    if (minigameType === 'microgame') {
        showMicrogame(data);
        return;
    }
    
    // Puzzle games
    if (['word_search', 'pattern_match', 'sequence_puzzle'].includes(minigameType)) {
        showPuzzleGame(data);
        return;
    }
    
    // Fallback to microgame
    showMicrogame(data);
}

function showMicrogame(data) {
    // Show microgame UI, hide puzzle UI
    const microgameUI = document.getElementById('microgameUI');
    const puzzleUI = document.getElementById('puzzleGameUI');
    
    if (microgameUI) {
        microgameUI.style.display = 'block';
        microgameUI.classList.remove('hidden');
    }
    if (puzzleUI) puzzleUI.style.display = 'none';
    
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
        // Tap when the screen turns red - Enhanced with graphics
        microgameUI.innerHTML = `
            <div class="microgame-instruction">⚡ Tap when the screen turns RED!</div>
            <div class="microgame-display" id="microgameDisplay" style="background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); width: 100%; height: 300px; border-radius: 12px; margin: 1rem 0; display: flex; align-items: center; justify-content: center; font-size: 4rem; color: white; box-shadow: 0 8px 32px rgba(52, 152, 219, 0.4); transition: all 0.3s ease;">
                <div style="text-align: center;">
                    <div style="font-size: 5rem; margin-bottom: 1rem;">🔵</div>
                    <div style="font-size: 1.5rem; font-weight: bold;">WAIT FOR RED...</div>
                </div>
            </div>
            <div class="microgame-score">Score: <span id="microgameScore">${state.microgameScore}</span></div>
        `;
        
        const display = document.getElementById('microgameDisplay');
        let clicked = false;
        
        const clickHandler = () => {
            if (!clicked && display.style.background.includes('rgb(231, 76, 60)')) {
                clicked = true;
                state.microgameScore++;
                document.getElementById('microgameScore').textContent = state.microgameScore;
                display.innerHTML = '<div style="text-align: center;"><div style="font-size: 5rem; margin-bottom: 1rem;">✅</div><div style="font-size: 2rem; font-weight: bold;">CORRECT!</div></div>';
                display.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
                display.style.boxShadow = '0 8px 32px rgba(46, 204, 113, 0.4)';
                setTimeout(() => {
                    if (state.microgameRound < 5) {
                        runMicrogame(gameType);
                    } else {
                        endLocalMinigame();
                    }
                }, 1000);
            } else if (!clicked) {
                // Too early
                display.innerHTML = '<div style="text-align: center;"><div style="font-size: 5rem; margin-bottom: 1rem;">❌</div><div style="font-size: 2rem; font-weight: bold;">TOO EARLY!</div></div>';
                display.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
                display.style.boxShadow = '0 8px 32px rgba(231, 76, 60, 0.4)';
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
                display.innerHTML = '<div style="text-align: center;"><div style="font-size: 5rem; margin-bottom: 1rem;">🔴</div><div style="font-size: 2rem; font-weight: bold;">TAP NOW!</div></div>';
                display.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
                display.style.boxShadow = '0 8px 32px rgba(231, 76, 60, 0.6)';
                display.style.transform = 'scale(1.05)';
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
        // Quick math problems - Enhanced with graphics
        const a = Math.floor(Math.random() * 20) + 1;
        const b = Math.floor(Math.random() * 20) + 1;
        const answer = a + b;
        const wrong1 = answer + Math.floor(Math.random() * 10) + 1;
        const wrong2 = Math.max(1, answer - Math.floor(Math.random() * 10) - 1);
        
        microgameUI.innerHTML = `
            <div class="microgame-instruction">🧮 Solve quickly!</div>
            <div class="microgame-question" style="font-size: 3rem; font-weight: bold; margin: 2rem 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                ${a} + ${b} = ?
            </div>
            <div class="microgame-options" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 2rem 0;">
                <button class="microgame-option" data-answer="${answer}" style="padding: 1.5rem; font-size: 2rem; border-radius: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">${answer}</button>
                <button class="microgame-option" data-answer="${wrong1}" style="padding: 1.5rem; font-size: 2rem; border-radius: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">${wrong1}</button>
                <button class="microgame-option" data-answer="${wrong2}" style="padding: 1.5rem; font-size: 2rem; border-radius: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">${wrong2}</button>
            </div>
            <div class="microgame-score" style="font-size: 1.5rem; font-weight: bold;">Score: <span id="microgameScore">${state.microgameScore}</span></div>
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
                const isCorrect = parseInt(btn.dataset.answer) === answer;
                if (isCorrect) {
                    state.microgameScore++;
                    document.getElementById('microgameScore').textContent = state.microgameScore;
                    btn.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
                    btn.style.transform = 'scale(1.1)';
                    btn.style.boxShadow = '0 8px 25px rgba(46, 204, 113, 0.6)';
                } else {
                    btn.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
                    btn.style.transform = 'scale(0.95)';
                    btn.style.boxShadow = '0 4px 15px rgba(231, 76, 60, 0.4)';
                    // Highlight correct answer
                    options.forEach(opt => {
                        if (parseInt(opt.dataset.answer) === answer) {
                            opt.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
                            opt.style.boxShadow = '0 8px 25px rgba(46, 204, 113, 0.6)';
                        }
                    });
                }
                setTimeout(() => {
                    if (state.microgameRound < 5) {
                        runMicrogame(gameType);
                    } else {
                        endLocalMinigame();
                    }
                }, 1500);
            });
        });
        
    } else if (gameType === 'count_clicks') {
        // Count the number of clicks shown - Enhanced with graphics
        const target = Math.floor(Math.random() * 5) + 3;
        
        microgameUI.innerHTML = `
            <div class="microgame-instruction">🔊 Count the clicks!</div>
            <div class="microgame-display" id="microgameDisplay" style="width: 100%; height: 250px; border-radius: 12px; margin: 1rem 0; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); display: flex; align-items: center; justify-content: center; font-size: 5rem; box-shadow: 0 8px 32px rgba(245, 87, 108, 0.4); transition: all 0.2s ease;"></div>
            <div class="microgame-input" style="display: flex; gap: 1rem; margin: 2rem 0; align-items: center; justify-content: center;">
                <input type="number" id="clickCountInput" placeholder="How many?" min="1" max="10" style="padding: 1rem; font-size: 1.5rem; border-radius: 8px; border: 2px solid var(--accent); width: 150px; text-align: center;">
                <button id="submitCountBtn" style="padding: 1rem 2rem; font-size: 1.2rem; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">Submit</button>
            </div>
            <div class="microgame-score" style="font-size: 1.5rem; font-weight: bold;">Score: <span id="microgameScore">${state.microgameScore}</span></div>
        `;
        
        const display = document.getElementById('microgameDisplay');
        let clickCount = 0;
        
        // Play clicks with visual feedback
        const playClicks = () => {
            for (let i = 0; i < target; i++) {
                setTimeout(() => {
                    display.innerHTML = '<div style="font-size: 6rem; animation: pulse 0.3s ease;">🔊</div>';
                    display.style.transform = 'scale(1.2)';
                    display.style.boxShadow = '0 12px 40px rgba(245, 87, 108, 0.6)';
                    setTimeout(() => {
                        display.innerHTML = '';
                        display.style.transform = 'scale(1)';
                        display.style.boxShadow = '0 8px 32px rgba(245, 87, 108, 0.4)';
                    }, 200);
                }, i * 500);
            }
        };
        
        playClicks();
        
        document.getElementById('submitCountBtn').addEventListener('click', () => {
            const guess = parseInt(document.getElementById('clickCountInput').value);
            const isCorrect = guess === target;
            if (isCorrect) {
                state.microgameScore++;
                document.getElementById('microgameScore').textContent = state.microgameScore;
                display.innerHTML = '<div style="text-align: center;"><div style="font-size: 5rem; margin-bottom: 1rem;">✅</div><div style="font-size: 2rem; font-weight: bold;">CORRECT!</div></div>';
                display.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
                display.style.boxShadow = '0 8px 32px rgba(46, 204, 113, 0.4)';
            } else {
                display.innerHTML = `<div style="text-align: center;"><div style="font-size: 5rem; margin-bottom: 1rem;">❌</div><div style="font-size: 1.5rem; font-weight: bold;">It was ${target}</div></div>`;
                display.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
                display.style.boxShadow = '0 8px 32px rgba(231, 76, 60, 0.4)';
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

function startMinigameTimer(duration) {
    const timerEl = document.getElementById('minigameTimer');
    if (!timerEl) return;
    
    let timeLeft = duration;
    timerEl.textContent = `⏱️ Break ends in: ${timeLeft}s`;
    timerEl.style.display = 'block';
    
    if (state.minigameTimerInterval) {
        clearInterval(state.minigameTimerInterval);
    }
    
    state.minigameTimerInterval = setInterval(() => {
        timeLeft--;
        if (timerEl) {
            timerEl.textContent = `⏱️ Break ends in: ${timeLeft}s`;
            if (timeLeft <= 10) {
                timerEl.style.color = 'var(--warning)';
            }
        }
        if (timeLeft <= 0) {
            clearInterval(state.minigameTimerInterval);
            state.minigameTimerInterval = null;
            // Timer ended - minigame will end via server message (minigame_end)
            // Just hide the timer
            if (timerEl) {
                timerEl.style.display = 'none';
            }
        }
    }, 1000);
}

function hideMinigame() {
    // Only allow exit if it's a local/lobby minigame
    if (state.minigameState && !state.minigameState.local) {
        // Synchronized minigame - don't allow manual exit, wait for timer
        return;
    }
    
    state.minigameState = null;
    state.currentMicrogame = null;
    state.currentPuzzle = null;
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

// ─────────────────────────── Puzzle Game Functions ─────────────────────────── #

function showPuzzleGame(data) {
    const minigameType = data.minigame_type;
    const isLocal = data.local === true;
    const puzzleUI = document.getElementById('puzzleGameUI');
    const microgameUI = document.getElementById('microgameUI');
    
    if (puzzleUI) {
        puzzleUI.style.display = 'block';
    }
    if (microgameUI) microgameUI.style.display = 'none';
    
    // Show/hide exit button for lobby puzzles
    const exitBtn = document.getElementById('exitMinigameBtn');
    if (exitBtn) {
        exitBtn.style.display = isLocal ? 'block' : 'none';
    }
    
    const titleEl = document.getElementById('minigameTitle');
    if (titleEl) {
        const titles = {
            'word_search': '🔍 WORD SEARCH',
            'pattern_match': '🧩 PATTERN MATCH',
            'sequence_puzzle': '🔢 SEQUENCE PUZZLE'
        };
        titleEl.textContent = titles[minigameType] || '🧩 PUZZLE';
    }
    
    state.currentPuzzle = minigameType;
    state.puzzleScore = 0;
    
    if (minigameType === 'word_search') {
        startWordSearch();
    } else if (minigameType === 'pattern_match') {
        startPatternMatch();
    } else if (minigameType === 'sequence_puzzle') {
        startSequencePuzzle();
    }
    
    showScreen('minigameScreen');
}

function startWordSearch() {
    const words = ['QUIZ', 'BOOK', 'GAME', 'FUN', 'PLAY'];
    const gridSize = 8;
    const puzzleUI = document.getElementById('puzzleGameUI');
    
    // Create a simple word search grid
    const grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(''));
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    // Fill grid with random letters
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            grid[i][j] = letters[Math.floor(Math.random() * letters.length)];
        }
    }
    
    // Place a word horizontally (simplified)
    const word = words[Math.floor(Math.random() * words.length)];
    const row = Math.floor(Math.random() * (gridSize - word.length));
    const col = Math.floor(Math.random() * (gridSize - word.length));
    for (let i = 0; i < word.length; i++) {
        grid[row][col + i] = word[i];
    }
    
    let gridHTML = '<div style="display: grid; grid-template-columns: repeat(' + gridSize + ', 1fr); gap: 4px; max-width: 400px; margin: 2rem auto;">';
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            gridHTML += `<div style="aspect-ratio: 1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold; border-radius: 8px; cursor: pointer; transition: all 0.2s;" data-row="${i}" data-col="${j}">${grid[i][j]}</div>`;
        }
    }
    gridHTML += '</div>';
    
    puzzleUI.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="microgame-instruction">Find the word: <strong style="font-size: 2rem; color: var(--accent);">${word}</strong></div>
            ${gridHTML}
            <div style="margin-top: 2rem;">
                <input type="text" id="wordInput" placeholder="Type the word you found..." style="padding: 1rem; font-size: 1.2rem; border-radius: 8px; border: 2px solid var(--accent); width: 250px; text-align: center;">
                <button id="submitWordBtn" style="padding: 1rem 2rem; font-size: 1.2rem; margin-left: 1rem; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: bold;">Submit</button>
            </div>
            <div class="microgame-score" style="margin-top: 1rem; font-size: 1.5rem; font-weight: bold;">Score: <span id="puzzleScore">${state.puzzleScore}</span></div>
        </div>
    `;
    
    document.getElementById('submitWordBtn').addEventListener('click', () => {
        const guess = document.getElementById('wordInput').value.toUpperCase().trim();
        if (guess === word) {
            state.puzzleScore++;
            document.getElementById('puzzleScore').textContent = state.puzzleScore;
            puzzleUI.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <div style="font-size: 5rem; margin-bottom: 1rem;">✅</div>
                    <div style="font-size: 2rem; font-weight: bold; margin-bottom: 2rem;">Correct! Found: ${word}</div>
                    <button onclick="startWordSearch()" style="padding: 1rem 2rem; font-size: 1.2rem; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: bold;">Next Puzzle</button>
                </div>
            `;
        } else {
            puzzleUI.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <div style="font-size: 5rem; margin-bottom: 1rem;">❌</div>
                    <div style="font-size: 1.5rem; margin-bottom: 2rem;">The word was: <strong>${word}</strong></div>
                    <button onclick="startWordSearch()" style="padding: 1rem 2rem; font-size: 1.2rem; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: bold;">Try Again</button>
                </div>
            `;
        }
    });
}

function startPatternMatch() {
    const patterns = [
        { pattern: ['🔴', '🔵', '🔴', '🔵'], answer: '🔴' },
        { pattern: ['⭐', '⭐', '⭐', '⭐'], answer: '⭐' },
        { pattern: ['🟢', '🟡', '🟢', '🟡'], answer: '🟢' },
        { pattern: ['🔷', '🔶', '🔷', '🔶'], answer: '🔷' }
    ];
    
    const puzzle = patterns[Math.floor(Math.random() * patterns.length)];
    const nextItem = puzzle.answer;
    
    const puzzleUI = document.getElementById('puzzleGameUI');
    puzzleUI.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="microgame-instruction">What comes next in the pattern?</div>
            <div style="display: flex; justify-content: center; gap: 1rem; margin: 2rem 0; font-size: 4rem;">
                ${puzzle.pattern.map((item, i) => `<div style="padding: 1rem; background: var(--bg-card); border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">${item}</div>`).join('')}
                <div style="padding: 1rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); color: white; font-size: 2rem; display: flex; align-items: center; justify-content: center; min-width: 80px;">?</div>
            </div>
            <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; margin: 2rem 0;">
                ${['🔴', '🔵', '🟢', '🟡', '⭐', '🔷', '🔶'].map(emoji => 
                    `<button onclick="checkPatternAnswer('${emoji}', '${nextItem}')" style="padding: 1.5rem; font-size: 3rem; border-radius: 12px; background: var(--bg-card); border: 3px solid var(--accent); cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">${emoji}</button>`
                ).join('')}
            </div>
            <div class="microgame-score" style="margin-top: 1rem; font-size: 1.5rem; font-weight: bold;">Score: <span id="puzzleScore">${state.puzzleScore}</span></div>
        </div>
    `;
}

function checkPatternAnswer(selected, correct) {
    const puzzleUI = document.getElementById('puzzleGameUI');
    if (selected === correct) {
        state.puzzleScore++;
        document.getElementById('puzzleScore').textContent = state.puzzleScore;
        puzzleUI.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div style="font-size: 5rem; margin-bottom: 1rem;">✅</div>
                <div style="font-size: 2rem; font-weight: bold; margin-bottom: 2rem;">Correct!</div>
                <button onclick="startPatternMatch()" style="padding: 1rem 2rem; font-size: 1.2rem; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: bold;">Next Puzzle</button>
            </div>
        `;
    } else {
        puzzleUI.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div style="font-size: 5rem; margin-bottom: 1rem;">❌</div>
                <div style="font-size: 1.5rem; margin-bottom: 2rem;">The correct answer was: <span style="font-size: 3rem;">${correct}</span></div>
                <button onclick="startPatternMatch()" style="padding: 1rem 2rem; font-size: 1.2rem; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: bold;">Try Again</button>
            </div>
        `;
    }
}

function startSequencePuzzle() {
    const sequences = [
        { seq: [2, 4, 6, 8], answer: 10 },
        { seq: [1, 3, 5, 7], answer: 9 },
        { seq: [5, 10, 15, 20], answer: 25 },
        { seq: [3, 6, 9, 12], answer: 15 },
        { seq: [1, 4, 9, 16], answer: 25 } // squares
    ];
    
    const puzzle = sequences[Math.floor(Math.random() * sequences.length)];
    const puzzleUI = document.getElementById('puzzleGameUI');
    
    puzzleUI.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="microgame-instruction">What number comes next?</div>
            <div style="display: flex; justify-content: center; gap: 1rem; margin: 2rem 0; flex-wrap: wrap;">
                ${puzzle.seq.map((num, i) => 
                    `<div style="padding: 1.5rem 2rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; font-size: 2rem; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">${num}</div>`
                ).join('')}
                <div style="padding: 1.5rem 2rem; background: var(--bg-card); border: 3px solid var(--accent); border-radius: 12px; font-size: 2rem; font-weight: bold; min-width: 80px; display: flex; align-items: center; justify-content: center;">?</div>
            </div>
            <div style="margin-top: 2rem;">
                <input type="number" id="sequenceInput" placeholder="Enter number..." style="padding: 1rem; font-size: 1.5rem; border-radius: 8px; border: 2px solid var(--accent); width: 200px; text-align: center;">
                <button id="submitSequenceBtn" style="padding: 1rem 2rem; font-size: 1.2rem; margin-left: 1rem; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: bold;">Submit</button>
            </div>
            <div class="microgame-score" style="margin-top: 1rem; font-size: 1.5rem; font-weight: bold;">Score: <span id="puzzleScore">${state.puzzleScore}</span></div>
        </div>
    `;
    
    document.getElementById('submitSequenceBtn').addEventListener('click', () => {
        const guess = parseInt(document.getElementById('sequenceInput').value);
        if (guess === puzzle.answer) {
            state.puzzleScore++;
            document.getElementById('puzzleScore').textContent = state.puzzleScore;
            puzzleUI.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <div style="font-size: 5rem; margin-bottom: 1rem;">✅</div>
                    <div style="font-size: 2rem; font-weight: bold; margin-bottom: 2rem;">Correct! The answer was ${puzzle.answer}</div>
                    <button onclick="startSequencePuzzle()" style="padding: 1rem 2rem; font-size: 1.2rem; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: bold;">Next Puzzle</button>
                </div>
            `;
        } else {
            puzzleUI.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <div style="font-size: 5rem; margin-bottom: 1rem;">❌</div>
                    <div style="font-size: 1.5rem; margin-bottom: 2rem;">The answer was: <strong>${puzzle.answer}</strong></div>
                    <button onclick="startSequencePuzzle()" style="padding: 1rem 2rem; font-size: 1.2rem; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: bold;">Try Again</button>
                </div>
            `;
        }
    });
}

// ─────────────────────────── Chat Functions ─────────────────────────── #

function addChatMessage(messageData) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.dataset.messageId = messageData.id;
    
    const isOwnMessage = messageData.player_id === state.playerId;
    messageDiv.classList.add(isOwnMessage ? 'own-message' : 'other-message');
    
    const time = new Date(messageData.timestamp * 1000);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="chat-message-header">
            <span class="chat-player-name">${escapeHtml(messageData.player_name)}</span>
            <span class="chat-time">${timeStr}</span>
        </div>
        <div class="chat-message-text">${escapeHtml(messageData.message)}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeChatMessage(messageId) {
    const messageDiv = document.querySelector(`.chat-message[data-message-id="${messageId}"]`);
    if (messageDiv) {
        messageDiv.remove();
    }
}

function clearChat() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }
}

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    state.ws.send(JSON.stringify({
        type: 'chat_message',
        message: message
    }));
    
    chatInput.value = '';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize chat event listeners
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
    
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendChatMessage);
    }
});

// ─────────────────────────── Init ─────────────────────────── #

// Check for room code in URL
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) {
    document.getElementById('roomCode').value = urlRoom.toUpperCase();
}

