/**
 * Library Quiz Game - Host Display
 * Main screen for projector/TV showing game state
 * Requires admin authentication
 */

const STORAGE_KEY = 'libraryQuiz_hostRoom';

const state = {
    roomCode: null,
    ws: null,
    players: {},
    currentQuestion: null,
    categories: [],
    selectedCategories: [],
    timerInterval: null,
    answeredCount: 0,
    reconnecting: false,
    adminToken: null,
    adminName: '',
    // Team mode
    teamMode: false,
    teams: {},
    draggedPlayer: null,
    // Game mode (classic or bowl)
    gameMode: 'classic',
    // Bowl mode state
    bowlPhase: null,  // 'buzzing', 'answering', 'stealing'
    buzzWinner: null,
    buzzTeam: null,
    awaitingJudgment: false,
    // Minigame state
    previousScreen: 'lobbyScreen',
    minigameTimerInterval: null
};

// Helper function to get API URL (similar to admin.js)
function getApiUrl(path) {
    // Get server URL from localStorage (set by admin.js when user logs in)
    const serverBaseUrl = localStorage.getItem('liberHoopServerUrl') || '';
    
    // Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    
    // If we have a server URL, use it; otherwise use relative path (same origin)
    if (serverBaseUrl) {
        const base = serverBaseUrl.endsWith('/') ? serverBaseUrl.slice(0, -1) : serverBaseUrl;
        return `${base}/${cleanPath}`;
    }
    return `/${cleanPath}`;
}

// ─────────────────────────── Initialization ─────────────────────────── #

async function init() {
    try {
        console.log('Initializing host...');
        
        // Check for admin authentication
        state.adminToken = localStorage.getItem('adminToken');
        if (!state.adminToken) {
            showAuthRequired();
            return;
        }
        
        // Verify token is still valid
        const authCheck = await fetch(getApiUrl('/api/admin/me'), {
            headers: { 'X-Admin-Token': state.adminToken }
        });
        
        if (!authCheck.ok) {
            showAuthRequired();
            return;
        }
        
        const adminData = await authCheck.json();
        state.adminName = adminData.name || adminData.username;
        console.log('Authenticated as:', state.adminName);
        
        // Check if admin already has an active session on the server
        const sessionResponse = await fetch(getApiUrl('/api/admin/session'), {
            headers: { 'X-Admin-Token': state.adminToken }
        });
        
        if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            if (sessionData.has_session) {
                // Admin has an existing session - reconnect to it
                state.roomCode = sessionData.room_code;
                state.reconnecting = true;
                console.log('Rejoining existing session:', state.roomCode);
            }
        }
        
        // Fallback: Check localStorage for room reference
        if (!state.roomCode) {
            const savedRoom = localStorage.getItem(STORAGE_KEY);
            if (savedRoom) {
                const { roomCode, timestamp } = JSON.parse(savedRoom);
                // Check if room still exists and was created less than 40 mins ago
                const age = (Date.now() - timestamp) / 1000 / 60; // minutes
                
                if (age < 40) {
                    const exists = await checkRoomExists(roomCode);
                    if (exists) {
                        state.roomCode = roomCode;
                        state.reconnecting = true;
                        console.log('Reconnecting to room from localStorage:', roomCode);
                    }
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
        }
        
        // Create new room if not reconnecting
        if (!state.roomCode) {
            const response = await fetch(getApiUrl('/api/room/create'), { 
                method: 'POST',
                headers: { 'X-Admin-Token': state.adminToken }
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    showAuthRequired();
                    return;
                }
                throw new Error('Failed to create room');
            }
            
            const data = await response.json();
            state.roomCode = data.room_code;
            console.log('Room created:', state.roomCode);
        }
        
        // Save room to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            roomCode: state.roomCode,
            timestamp: Date.now()
        }));
        
        document.getElementById('roomCodeDisplay').textContent = state.roomCode;
        
        // Get URL for QR code - use current page URL (works with tunnels)
        const currentUrl = window.location.origin;
        const joinUrl = `${currentUrl}?room=${state.roomCode}`;
        
        // Display the URL (shortened if it's a tunnel)
        const displayUrl = window.location.host;
        document.getElementById('joinUrl').textContent = displayUrl;
        
        // Generate QR code using API (more reliable than JS library)
        const qrContainer = document.getElementById('qrCode');
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}`;
        qrContainer.innerHTML = `<img src="${qrApiUrl}" alt="QR Code" width="200" height="200" style="background:white;padding:10px;border-radius:8px;">`;
        
        // Load categories
        await loadCategories();
        console.log('Categories loaded');
        
        // Connect WebSocket - THIS IS CRITICAL
        console.log('Connecting WebSocket...');
        connectWebSocket();
        
        // Setup event listeners
        setupEventListeners();
        console.log('Host initialized successfully');
        
    } catch (error) {
        console.error('Host initialization failed:', error);
        alert('Failed to initialize: ' + error.message);
    }
}

async function checkRoomExists(roomCode) {
    try {
        const response = await fetch(getApiUrl(`/api/room/${roomCode}/exists`));
        const data = await response.json();
        return data.exists ? data : null;
    } catch {
        return null;
    }
}

function showAuthRequired() {
    // Show authentication required message
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%);
            color: white;
            font-family: 'Nunito', sans-serif;
            text-align: center;
            padding: 2rem;
        ">
            <div style="font-size: 5rem; margin-bottom: 1rem;">🔐</div>
            <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">Admin Login Required</h1>
            <p style="font-size: 1.2rem; color: #a0a0a0; margin-bottom: 2rem;">
                You need to be logged in as an admin to host a quiz game.
            </p>
            <a href="/admin.html" style="
                display: inline-block;
                padding: 1rem 2rem;
                font-size: 1.2rem;
                font-weight: 700;
                background: linear-gradient(135deg, #6c5ce7, #5541d7);
                color: white;
                text-decoration: none;
                border-radius: 12px;
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 10px 30px rgba(108, 92, 231, 0.4)'"
               onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none'">
                Go to Admin Panel
            </a>
        </div>
    `;
}

async function loadCategories() {
    const response = await fetch(getApiUrl('/api/categories'));
    const data = await response.json();
    state.categories = data.categories;
    
    const container = document.getElementById('categoriesContainer');
    container.innerHTML = '';
    
    data.categories.forEach(cat => {
        const label = document.createElement('label');
        label.className = 'category-checkbox';
        label.innerHTML = `
            <input type="checkbox" value="${cat.id}" checked>
            <span>${cat.name} (${cat.count})</span>
        `;
        container.appendChild(label);
    });
    
    updateSelectedCategories();
}

function updateSelectedCategories() {
    const checkboxes = document.querySelectorAll('#categoriesContainer input:checked');
    state.selectedCategories = Array.from(checkboxes).map(cb => cb.value);
}

function setupEventListeners() {
    // Category selection
    document.getElementById('categoriesContainer').addEventListener('change', () => {
        updateSelectedCategories();
    });
    
    // Start game
    document.getElementById('startGameBtn').addEventListener('click', startGame);
    
    // Minigame controls
    const startMinigameBtn = document.getElementById('startMinigameBtn');
    if (startMinigameBtn) {
        startMinigameBtn.addEventListener('click', startMinigame);
    }
    
    const minigameType = document.getElementById('minigameType');
    if (minigameType) {
        minigameType.addEventListener('change', (e) => {
            const promptInput = document.getElementById('minigamePrompt');
            if (promptInput) {
                promptInput.style.display = e.target.value === 'draw_prompt' ? 'block' : 'none';
            }
        });
    }
    
    const revealStartMinigameBtn = document.getElementById('revealStartMinigameBtn');
    if (revealStartMinigameBtn) {
        revealStartMinigameBtn.addEventListener('click', startMinigameFromReveal);
    }
    
    const revealMinigameType = document.getElementById('revealMinigameType');
    const revealMinigameDuration = document.getElementById('revealMinigameDuration');
    if (revealMinigameType && revealMinigameDuration) {
        // Minigame controls are ready
    }
    
    // Skip to answer / show results
    document.getElementById('skipBtn').addEventListener('click', () => {
        sendToHost({ type: 'skip_question' });
    });
    
    // Next question
    document.getElementById('nextQuestionBtn').addEventListener('click', () => {
        sendToHost({ type: 'next_question' });
    });
    
    // Play again (same room)
    document.getElementById('playAgainBtn').addEventListener('click', () => {
        sendToHost({ type: 'reset_room' });
    });
    
    // New room (clear localStorage and reload)
    document.getElementById('newRoomBtn').addEventListener('click', () => {
        if (confirm('This will close the current room and remove all players. Continue?')) {
            localStorage.removeItem(STORAGE_KEY);
            window.location.reload();
        }
    });
    
    // Team mode controls
    document.getElementById('toggleTeamModeBtn').addEventListener('click', toggleTeamMode);
    document.getElementById('autoAssignBtn').addEventListener('click', autoAssignTeams);
    document.getElementById('addTeamBtn').addEventListener('click', addTeam);
    
    // Game mode controls
    document.getElementById('classicModeBtn').addEventListener('click', () => setGameMode('classic'));
    document.getElementById('bowlModeBtn').addEventListener('click', () => setGameMode('bowl'));
    
    // Bowl mode judgment buttons
    document.getElementById('judgeCorrectBtn').addEventListener('click', () => judgeAnswer(true));
    document.getElementById('judgeIncorrectBtn').addEventListener('click', () => judgeAnswer(false));
    document.getElementById('skipStealBtn').addEventListener('click', skipSteal);
}

// ─────────────────────────── WebSocket ─────────────────────────── #

function connectWebSocket() {
    // Get server URL from localStorage (set by admin.js when user logs in)
    const serverBaseUrl = localStorage.getItem('liberHoopServerUrl') || '';
    
    // Determine WebSocket protocol and host
    let wsUrl;
    if (serverBaseUrl) {
        // Use the server URL from localStorage
        const wsProtocol = serverBaseUrl.startsWith('https://') ? 'wss:' : 'ws:';
        const wsHost = serverBaseUrl.replace(/^https?:\/\//, '');
        wsUrl = `${wsProtocol}//${wsHost}/ws/host/${state.roomCode}?token=${encodeURIComponent(state.adminToken)}`;
    } else {
        // Use same origin
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws/host/${state.roomCode}?token=${encodeURIComponent(state.adminToken)}`;
    }
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    state.ws = new WebSocket(wsUrl);
    
    state.ws.onopen = () => {
        console.log('Host WebSocket connected!');
    };
    
    state.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setTimeout(connectWebSocket, 2000);
    };
    
    state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    state.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data);
        handleMessage(data);
    };
}

function sendToHost(data) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(data));
    }
}

function handleMessage(data) {
    console.log('Host received:', data);
    
    switch (data.type) {
        case 'room_state':
            updateLobby(data);
            // Handle reconnection or state change - restore to correct screen
            if (state.reconnecting || data.return_to_reveal) {
                if (state.reconnecting) {
                    state.reconnecting = false;
                }
                if (data.state === 'finished') {
                    showScreen('leaderboardScreen');
                } else if (data.state === 'question') {
                    showScreen('questionScreen');
                } else if (data.state === 'reveal' || data.return_to_reveal) {
                    // Return to reveal screen if we were there before minigame
                    showScreen('revealScreen');
                } else if (data.state === 'lobby') {
                    showScreen('lobbyScreen');
                }
                console.log('State changed to:', data.state);
            }
            // Also handle normal state updates (not just reconnection)
            if (!state.reconnecting && !data.return_to_reveal) {
                if (data.state === 'reveal' && document.getElementById('revealScreen').classList.contains('active')) {
                    // Already on reveal screen, stay there
                } else if (data.state === 'lobby' && !document.getElementById('minigameScreen').classList.contains('active')) {
                    showScreen('lobbyScreen');
                }
            }
            break;
            
        case 'player_joined':
            addPlayer(data.player);
            updatePlayerCount(data.player_count);
            break;
            
        case 'player_left':
        case 'player_disconnected':
            if (data.player_id) {
                removePlayer(data.player_id);
            }
            if (data.player_count !== undefined) {
                updatePlayerCount(data.player_count);
            }
            break;
            
        case 'game_starting':
            showScreen('questionScreen');
            break;
            
        case 'question':
            showQuestion(data);
            break;
            
        case 'player_answered':
            updateAnswerCount(data.answers_in, data.total_players);
            break;
            
        case 'reveal':
            showReveal(data);
            break;
            
        case 'game_over':
            showFinalLeaderboard(data);
            break;
            
        case 'room_reset':
            resetToLobby(data);
            break;
            
        case 'session_closed':
            // Session was closed from admin panel
            showSessionClosed(data.message);
            break;
            
        case 'error':
            console.error('Server error:', data.message);
            if (data.message.includes('Authentication')) {
                showAuthRequired();
            }
            break;
        
        // Team mode events
        case 'team_mode_changed':
        case 'team_created':
        case 'team_deleted':
        case 'team_updated':
        case 'teams_auto_assigned':
            updateTeamState(data);
            break;
            
        case 'player_team_changed':
            updatePlayerTeamAssignment(data);
            break;
        
        // Game mode events
        case 'game_mode_changed':
            updateGameMode(data);
            break;
        
        // Bowl mode events
        case 'buzz_winner':
            showBuzzWinner(data);
            break;
            
        case 'bowl_answer_submitted':
            showBowlAnswer(data);
            break;
            
        case 'bowl_correct':
            showBowlCorrect(data);
            break;
            
        case 'bowl_incorrect_steal':
            showStealPhase(data);
            break;
            
        case 'bowl_no_correct':
            showBowlNoCorrect(data);
            break;
            
        case 'bowl_steal_skipped':
            showBowlStealSkipped(data);
            break;
            
        case 'steal_winner':
            showStealWinner(data);
            break;
        
        // Minigame events
        case 'minigame_start':
            showMinigameHost(data);
            break;
            
        case 'minigame_end':
            showMinigameResults(data);
            break;
            
        case 'minigame_submission':
            addMinigameSubmission(data);
            break;
    }
}

function showSessionClosed(message) {
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%);
            color: white;
            font-family: 'Nunito', sans-serif;
            text-align: center;
            padding: 2rem;
        ">
            <div style="font-size: 5rem; margin-bottom: 1rem;">👋</div>
            <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">Session Closed</h1>
            <p style="font-size: 1.2rem; color: #a0a0a0; margin-bottom: 2rem;">
                ${message || 'This session has been closed.'}
            </p>
            <a href="/admin.html" style="
                display: inline-block;
                padding: 1rem 2rem;
                font-size: 1.2rem;
                font-weight: 700;
                background: linear-gradient(135deg, #6c5ce7, #5541d7);
                color: white;
                text-decoration: none;
                border-radius: 12px;
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'"
               onmouseout="this.style.transform='scale(1)'">
                Back to Admin Panel
            </a>
        </div>
    `;
}

// ─────────────────────────── Screens ─────────────────────────── #

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ─────────────────────────── Lobby ─────────────────────────── #

function updateLobby(data) {
    document.getElementById('roomCodeDisplay').textContent = data.room_code;
    updatePlayerCount(data.player_count);
    
    // Update team state
    state.teamMode = data.team_mode || false;
    state.teams = data.teams || {};
    
    // Update game mode
    state.gameMode = data.game_mode || 'classic';
    updateGameModeUI();
    
    // Store all players with team info
    state.players = {};
    data.players.forEach(p => {
        state.players[p.id] = p;
    });
    
    // Update UI based on team mode
    updateTeamModeUI();
    
    // Re-render all players
    renderPlayers();
}

function addPlayer(player) {
    state.players[player.id] = player;
    
    // Re-render to place player in correct container
    renderPlayers();
    updateStartButton();
}

function createPlayerCard(player) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.id = `player-${player.id}`;
    card.draggable = state.teamMode;
    card.dataset.playerId = player.id;
    
    // Add team color indicator if assigned
    let teamIndicator = '';
    if (state.teamMode && player.team_id && state.teams[player.team_id]) {
        const team = state.teams[player.team_id];
        card.style.borderLeftColor = team.color;
    }
    
    card.innerHTML = `
        <span class="player-name">${escapeHtml(player.name)}</span>
        <button class="kick-btn" onclick="kickPlayer('${player.id}')" title="Remove player">✕</button>
    `;
    
    // Add drag events for team mode
    if (state.teamMode) {
        card.addEventListener('dragstart', (e) => {
            state.draggedPlayer = player.id;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            state.draggedPlayer = null;
        });
    }
    
    return card;
}

function renderPlayers() {
    if (state.teamMode) {
        renderTeamMode();
    } else {
        renderNormalMode();
    }
}

function renderNormalMode() {
    // Hide team containers
    document.getElementById('teamsContainer').classList.add('hidden');
    document.getElementById('unassignedContainer').classList.add('hidden');
    document.getElementById('playersGrid').classList.remove('hidden');
    
    const grid = document.getElementById('playersGrid');
    grid.innerHTML = '';
    
    Object.values(state.players).forEach(player => {
        const card = createPlayerCard(player);
        card.style.animation = 'popIn 0.3s ease';
        grid.appendChild(card);
    });
}

function renderTeamMode() {
    // Show team containers, hide normal grid
    document.getElementById('teamsContainer').classList.remove('hidden');
    document.getElementById('unassignedContainer').classList.remove('hidden');
    document.getElementById('playersGrid').classList.add('hidden');
    
    // Render teams
    const teamsContainer = document.getElementById('teamsContainer');
    teamsContainer.innerHTML = '';
    
    Object.values(state.teams).forEach(team => {
        const teamDiv = createTeamContainer(team);
        teamsContainer.appendChild(teamDiv);
    });
    
    // Render unassigned players
    const unassignedGrid = document.getElementById('unassignedGrid');
    unassignedGrid.innerHTML = '';
    
    const unassigned = Object.values(state.players).filter(p => !p.team_id);
    unassigned.forEach(player => {
        const card = createPlayerCard(player);
        unassignedGrid.appendChild(card);
    });
    
    // Hide unassigned section if empty
    const unassignedContainer = document.getElementById('unassignedContainer');
    if (unassigned.length === 0) {
        unassignedContainer.classList.add('empty');
    } else {
        unassignedContainer.classList.remove('empty');
    }
}

function createTeamContainer(team) {
    const teamDiv = document.createElement('div');
    teamDiv.className = 'team-box';
    teamDiv.id = `team-${team.id}`;
    teamDiv.style.borderColor = team.color;
    
    // Get players in this team
    const teamPlayers = Object.values(state.players).filter(p => p.team_id === team.id);
    
    teamDiv.innerHTML = `
        <div class="team-header" style="background: ${team.color}">
            <span class="team-name">${escapeHtml(team.name)}</span>
            <span class="team-count">${teamPlayers.length} players</span>
            <button class="team-delete-btn" onclick="deleteTeam('${team.id}')" title="Delete team">✕</button>
        </div>
        <div class="team-players" data-team-id="${team.id}">
            <!-- Players added below -->
        </div>
    `;
    
    const playersDiv = teamDiv.querySelector('.team-players');
    
    // Add drop zone functionality
    playersDiv.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        playersDiv.classList.add('drag-over');
    });
    playersDiv.addEventListener('dragleave', () => {
        playersDiv.classList.remove('drag-over');
    });
    playersDiv.addEventListener('drop', (e) => {
        e.preventDefault();
        playersDiv.classList.remove('drag-over');
        if (state.draggedPlayer) {
            assignPlayerToTeam(state.draggedPlayer, team.id);
        }
    });
    
    // Add player cards
    teamPlayers.forEach(player => {
        const card = createPlayerCard(player);
        playersDiv.appendChild(card);
    });
    
    return teamDiv;
}

function removePlayer(playerId) {
    delete state.players[playerId];
    const card = document.getElementById(`player-${playerId}`);
    if (card) {
        card.style.animation = 'popOut 0.3s ease';
        setTimeout(() => card.remove(), 300);
    }
    updateStartButton();
}

function updatePlayerCount(count) {
    document.getElementById('playerCount').textContent = `(${count})`;
    updateStartButton();
}

function updateStartButton() {
    const btn = document.getElementById('startGameBtn');
    const playerCount = Object.keys(state.players).length;
    btn.disabled = playerCount < 1;
    btn.textContent = playerCount < 1 ? 'WAITING FOR PLAYERS...' : 'START GAME';
}

function kickPlayer(playerId) {
    sendToHost({ type: 'kick_player', player_id: playerId });
}

function startGame() {
    const numQuestions = parseInt(document.getElementById('numQuestions').value);
    const timeLimit = parseInt(document.getElementById('timeLimit').value);
    sendToHost({
        type: 'start_game',
        categories: state.selectedCategories,
        num_questions: numQuestions,
        time_limit: timeLimit  // 0 means wait for all players
    });
}

function resetToLobby(data) {
    state.players = {};
    clearInterval(state.timerInterval);
    updateLobby(data);
    showScreen('lobbyScreen');
}

// ─────────────────────────── Question ─────────────────────────── #

function showQuestion(data) {
    state.currentQuestion = data;
    state.answeredCount = 0;
    
    const qType = data.question_type || 'choice';
    const gameMode = data.game_mode || 'classic';
    
    // Update question number with type indicator
    let typeLabel = '';
    if (gameMode === 'bowl') typeLabel = '🔔 BOWL: ';
    else if (qType === 'poll') typeLabel = '📊 POLL: ';
    else if (qType === 'open_poll') typeLabel = '💬 OPEN POLL: ';
    else if (qType === 'wager') typeLabel = '🎲 WAGER: ';
    else if (qType === 'text') typeLabel = '✏️ TYPE: ';
    else if (qType === 'number') typeLabel = '🔢 NUMBER: ';
    else if (qType === 'truefalse') typeLabel = '✓✗ TRUE/FALSE: ';
    
    document.getElementById('questionNumber').textContent = 
        `${typeLabel}Question ${data.question_num} of ${data.total_questions}`;
    document.getElementById('questionText').textContent = data.question;
    
    // Update answer display based on game mode and type
    const answersGrid = document.getElementById('answersGrid');
    
    if (gameMode === 'bowl') {
        // Bowl mode - show buzz UI instead of answers
        showBowlUI();
        state.bowlPhase = 'buzzing';
        state.buzzWinner = null;
        state.buzzTeam = null;
        state.awaitingJudgment = false;
        
        // Hide the skip button in bowl mode, show answers count differently
        document.getElementById('skipBtn').classList.add('hidden');
        document.getElementById('answersCount').textContent = 'Waiting for buzz...';
        
    } else {
        // Classic mode
        hideBowlUI();
        document.getElementById('skipBtn').classList.remove('hidden');
        
        if (qType === 'text') {
            // Show text input hint
            answersGrid.innerHTML = `
                <div class="type-hint" style="grid-column: 1/-1; text-align:center; padding:3rem;">
                    <p style="font-size:2rem; color:var(--secondary);">✏️ Players are typing their answers...</p>
                </div>
            `;
        } else if (qType === 'number') {
            // Show number input hint
            answersGrid.innerHTML = `
                <div class="type-hint" style="grid-column: 1/-1; text-align:center; padding:3rem;">
                    <p style="font-size:2rem; color:var(--secondary);">🔢 Players are entering a number...</p>
                </div>
            `;
        } else {
            // Standard answer cards for choice/poll/truefalse/wager
            const colors = ['red', 'blue', 'yellow', 'green'];
            const shapes = ['▲', '◆', '●', '■'];
            const answers = data.answers || [];
            
            answersGrid.innerHTML = answers.map((answer, i) => `
                <div class="answer-card ${colors[i % colors.length]}" data-index="${i}">
                    <span class="shape">${shapes[i % shapes.length]}</span>
                    <span class="text">${answer}</span>
                </div>
            `).join('');
        }
        
        // Update answer count
        updateAnswerCount(0, Object.keys(state.players).length);
    }
    
    // Reset answer cards
    document.querySelectorAll('.answer-card').forEach(card => {
        card.classList.remove('correct', 'incorrect', 'revealed');
    });
    
    // Start timer (or show "waiting" if wait_for_all mode or bowl mode)
    if (gameMode === 'bowl') {
        // No timer in bowl mode
        showWaitingForAll();
    } else if (data.wait_for_all) {
        showWaitingForAll();
    } else {
        startTimer(data.time_limit);
    }
    
    showScreen('questionScreen');
}

function showWaitingForAll() {
    clearInterval(state.timerInterval);
    
    const timerText = document.getElementById('timerText');
    const timerProgress = document.getElementById('timerProgress');
    const circumference = 2 * Math.PI * 45;
    
    timerText.textContent = '∞';
    timerText.classList.remove('urgent');
    timerProgress.style.strokeDasharray = circumference;
    timerProgress.style.strokeDashoffset = 0;  // Full circle
}

function startTimer(seconds) {
    clearInterval(state.timerInterval);
    
    const timerText = document.getElementById('timerText');
    const timerProgress = document.getElementById('timerProgress');
    const circumference = 2 * Math.PI * 45;
    timerProgress.style.strokeDasharray = circumference;
    
    let remaining = seconds;
    
    const update = () => {
        timerText.textContent = Math.ceil(remaining);
        const progress = remaining / seconds;
        timerProgress.style.strokeDashoffset = circumference * (1 - progress);
        
        if (remaining <= 5) {
            timerText.classList.add('urgent');
        } else {
            timerText.classList.remove('urgent');
        }
    };
    
    update();
    
    state.timerInterval = setInterval(() => {
        remaining -= 0.1;
        if (remaining <= 0) {
            remaining = 0;
            clearInterval(state.timerInterval);
        }
        update();
    }, 100);
}

function updateAnswerCount(answered, total) {
    state.answeredCount = answered;
    document.getElementById('answersCount').textContent = `${answered}/${total} answered`;
}

// ─────────────────────────── Reveal ─────────────────────────── #

function showReveal(data) {
    clearInterval(state.timerInterval);
    
    const qType = data.question_type || 'choice';
    const colors = ['red', 'blue', 'yellow', 'green'];
    const shapes = ['▲', '◆', '●', '■'];
    
    const correctCard = document.getElementById('correctAnswer');
    const resultStats = document.getElementById('resultStats');
    
    if (qType === 'poll') {
        // Show poll results as bar chart
        const pollResults = data.poll_results || {};
        const answers = data.answers || [];
        const totalVotes = Object.values(pollResults).reduce((a, b) => a + b, 0);
        
        correctCard.className = 'correct-answer poll-results';
        correctCard.innerHTML = '<span class="poll-title">📊 RESULTS</span>';
        
        let pollHtml = '<div class="poll-bars">';
        answers.forEach((answer, i) => {
            const votes = pollResults[i] || 0;
            const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            pollHtml += `
                <div class="poll-bar-row">
                    <span class="poll-answer">${answer}</span>
                    <div class="poll-bar-container">
                        <div class="poll-bar ${colors[i % colors.length]}" style="width: ${pct}%"></div>
                    </div>
                    <span class="poll-pct">${pct}%</span>
                </div>
            `;
        });
        pollHtml += '</div>';
        correctCard.innerHTML += pollHtml;
        
        resultStats.innerHTML = `
            <div class="stat">
                <span class="stat-value">${totalVotes}</span>
                <span class="stat-label">votes cast</span>
            </div>
        `;
    } else if (qType === 'open_poll') {
        // Show open poll results - grouped answers sorted by count
        const pollResults = data.poll_results || {};
        const sortedAnswers = data.sorted_answers || [];
        const totalVotes = Object.values(pollResults).reduce((a, b) => a + b, 0);
        
        correctCard.className = 'correct-answer poll-results open-poll-results';
        correctCard.innerHTML = '<span class="poll-title">💬 OPEN POLL RESULTS</span>';
        
        if (sortedAnswers.length === 0) {
            correctCard.innerHTML += '<p class="no-answers">No answers submitted</p>';
        } else {
            let pollHtml = '<div class="poll-bars open-poll-bars">';
            sortedAnswers.forEach(([answer, count], index) => {
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                const colorIndex = index % colors.length;
                pollHtml += `
                    <div class="poll-bar-row open-poll-row">
                        <span class="poll-answer open-poll-answer">${escapeHtml(answer)}</span>
                        <div class="poll-bar-container">
                            <div class="poll-bar ${colors[colorIndex]}" style="width: ${pct}%"></div>
                        </div>
                        <span class="poll-count">${count}</span>
                        <span class="poll-pct">${pct}%</span>
                    </div>
                `;
            });
            pollHtml += '</div>';
            correctCard.innerHTML += pollHtml;
        }
        
        resultStats.innerHTML = `
            <div class="stat">
                <span class="stat-value">${totalVotes}</span>
                <span class="stat-label">responses</span>
            </div>
            <div class="stat">
                <span class="stat-value">${sortedAnswers.length}</span>
                <span class="stat-label">unique answers</span>
            </div>
        `;
    } else {
        // Show correct answer for other types
        const correctIdx = data.correct_answer;
        
        if (typeof correctIdx === 'number' && correctIdx < colors.length) {
            correctCard.className = `correct-answer ${colors[correctIdx]}`;
            correctCard.innerHTML = `
                <span class="shape">${shapes[correctIdx]}</span>
                <span class="text">${data.correct_text}</span>
            `;
        } else {
            // Text/number answer
            correctCard.className = 'correct-answer text-answer';
            correctCard.innerHTML = `<span class="text">${data.correct_text}</span>`;
        }
        
        // Calculate stats
        const correctCount = data.results.filter(r => r.correct).length;
        const totalPlayers = data.results.length;
        const percentage = totalPlayers > 0 ? Math.round((correctCount / totalPlayers) * 100) : 0;
        
        resultStats.innerHTML = `
            <div class="stat">
                <span class="stat-value">${correctCount}/${totalPlayers}</span>
                <span class="stat-label">got it right</span>
            </div>
            <div class="stat">
                <span class="stat-value">${percentage}%</span>
                <span class="stat-label">correct</span>
            </div>
        `;
    }
    
    // Mini leaderboard (top 5)
    const leaderboard = document.getElementById('miniLeaderboard');
    leaderboard.innerHTML = '<h3>LEADERBOARD</h3>';
    
    data.leaderboard.slice(0, 5).forEach((player, idx) => {
        const result = data.results.find(r => r.id === player.id);
        const pointsEarned = result ? result.points_earned : 0;
        
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        
        let pointsDisplay = '';
        if (pointsEarned > 0) {
            pointsDisplay = `<span class="points-earned gained">+${pointsEarned}</span>`;
        } else if (pointsEarned < 0) {
            pointsDisplay = `<span class="points-earned lost">${pointsEarned}</span>`;
        }
        
        // Add team color indicator if in team mode
        let teamDot = '';
        if (data.team_mode && player.team_color) {
            teamDot = `<span class="team-dot" style="background: ${player.team_color}"></span>`;
        }
        
        row.innerHTML = `
            <span class="rank">#${idx + 1}</span>
            ${teamDot}
            <span class="name">${escapeHtml(player.name)}</span>
            ${pointsDisplay}
            <span class="score">${player.score}</span>
        `;
        leaderboard.appendChild(row);
    });
    
    // Show team standings if in team mode
    if (data.team_mode && data.team_leaderboard) {
        renderTeamStandings(data.team_leaderboard);
    } else {
        document.getElementById('teamStandings').classList.add('hidden');
    }
    
    showScreen('revealScreen');
}

// ─────────────────────────── Final Leaderboard ─────────────────────────── #

function showFinalLeaderboard(data) {
    clearInterval(state.timerInterval);
    
    const leaderboard = data.leaderboard;
    
    // Show team podium if in team mode
    if (data.team_mode && data.team_leaderboard) {
        renderTeamPodium(data.team_leaderboard);
    } else {
        document.getElementById('teamPodium').classList.add('hidden');
    }
    
    // Player Podium (top 3)
    const podium = document.getElementById('podium');
    podium.innerHTML = '';
    
    const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd for visual layout
    const medals = ['🥇', '🥈', '🥉'];
    
    podiumOrder.forEach((place) => {
        const player = leaderboard[place];
        if (!player) return;
        
        // Add team color indicator
        let teamStyle = '';
        if (data.team_mode && player.team_color) {
            teamStyle = `border-bottom: 4px solid ${player.team_color}`;
        }
        
        const div = document.createElement('div');
        div.className = `podium-place place-${place + 1}`;
        div.innerHTML = `
            <div class="podium-medal">${medals[place]}</div>
            <div class="podium-name">${escapeHtml(player.name)}</div>
            ${data.team_mode && player.team_name ? `<div class="podium-team" style="color: ${player.team_color}">${escapeHtml(player.team_name)}</div>` : ''}
            <div class="podium-score">${player.score}</div>
            <div class="podium-block" style="${teamStyle}"></div>
        `;
        podium.appendChild(div);
    });
    
    // Full leaderboard (4th onwards)
    const fullLeaderboard = document.getElementById('fullLeaderboard');
    fullLeaderboard.innerHTML = '';
    
    leaderboard.slice(3).forEach((player, idx) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        
        let teamDot = '';
        if (data.team_mode && player.team_color) {
            teamDot = `<span class="team-dot" style="background: ${player.team_color}"></span>`;
        }
        
        row.innerHTML = `
            <span class="rank">#${idx + 4}</span>
            ${teamDot}
            <span class="name">${escapeHtml(player.name)}</span>
            <span class="score">${player.score}</span>
        `;
        fullLeaderboard.appendChild(row);
    });
    
    showScreen('leaderboardScreen');
}

// ─────────────────────────── Utilities ─────────────────────────── #

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─────────────────────────── Team Management ─────────────────────────── #

function updateTeamModeUI() {
    const toggleBtn = document.getElementById('toggleTeamModeBtn');
    const autoAssignBtn = document.getElementById('autoAssignBtn');
    const addTeamBtn = document.getElementById('addTeamBtn');
    
    if (state.teamMode) {
        toggleBtn.textContent = '👥 Teams On';
        toggleBtn.classList.add('active');
        autoAssignBtn.classList.remove('hidden');
        addTeamBtn.classList.remove('hidden');
    } else {
        toggleBtn.textContent = '👥 Teams Off';
        toggleBtn.classList.remove('active');
        autoAssignBtn.classList.add('hidden');
        addTeamBtn.classList.add('hidden');
    }
}

async function toggleTeamMode() {
    const newMode = !state.teamMode;
    
    try {
        const response = await fetch(getApiUrl(`/api/room/${state.roomCode}/team-mode`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': state.adminToken
            },
            body: JSON.stringify({ enabled: newMode })
        });
        
        if (!response.ok) throw new Error('Failed to toggle team mode');
        
        // State will be updated via WebSocket
    } catch (error) {
        console.error('Error toggling team mode:', error);
        alert('Failed to toggle team mode');
    }
}

async function autoAssignTeams() {
    const numTeams = prompt('How many teams?', '2');
    if (!numTeams) return;
    
    const num = parseInt(numTeams);
    if (isNaN(num) || num < 2 || num > 8) {
        alert('Please enter a number between 2 and 8');
        return;
    }
    
    try {
        const response = await fetch(getApiUrl(`/api/room/${state.roomCode}/teams/auto-assign`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': state.adminToken
            },
            body: JSON.stringify({ num_teams: num })
        });
        
        if (!response.ok) throw new Error('Failed to auto-assign teams');
        
        // State will be updated via WebSocket
    } catch (error) {
        console.error('Error auto-assigning teams:', error);
        alert('Failed to auto-assign teams');
    }
}

async function addTeam() {
    const teamName = prompt('Team name (optional):');
    
    try {
        const response = await fetch(getApiUrl(`/api/room/${state.roomCode}/teams`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': state.adminToken
            },
            body: JSON.stringify({ name: teamName || undefined })
        });
        
        if (!response.ok) throw new Error('Failed to create team');
        
        // State will be updated via WebSocket
    } catch (error) {
        console.error('Error creating team:', error);
        alert('Failed to create team');
    }
}

async function deleteTeam(teamId) {
    if (!confirm('Delete this team? Players will be unassigned.')) return;
    
    try {
        const response = await fetch(getApiUrl(`/api/room/${state.roomCode}/teams/${teamId}`), {
            method: 'DELETE',
            headers: {
                'X-Admin-Token': state.adminToken
            }
        });
        
        if (!response.ok) throw new Error('Failed to delete team');
        
        // State will be updated via WebSocket
    } catch (error) {
        console.error('Error deleting team:', error);
        alert('Failed to delete team');
    }
}

async function assignPlayerToTeam(playerId, teamId) {
    try {
        const response = await fetch(getApiUrl(`/api/room/${state.roomCode}/teams/assign`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': state.adminToken
            },
            body: JSON.stringify({ player_id: playerId, team_id: teamId })
        });
        
        if (!response.ok) throw new Error('Failed to assign player');
        
        // State will be updated via WebSocket
    } catch (error) {
        console.error('Error assigning player:', error);
        alert('Failed to assign player to team');
    }
}

function updateTeamState(data) {
    // Update local state
    if (data.team_mode !== undefined) {
        state.teamMode = data.team_mode;
    }
    if (data.teams) {
        state.teams = data.teams;
    }
    if (data.players) {
        data.players.forEach(p => {
            if (state.players[p.id]) {
                state.players[p.id].team_id = p.team_id;
            }
        });
    }
    
    updateTeamModeUI();
    renderPlayers();
}

function updatePlayerTeamAssignment(data) {
    if (state.players[data.player_id]) {
        state.players[data.player_id].team_id = data.team_id;
    }
    
    if (data.players) {
        data.players.forEach(p => {
            if (state.players[p.id]) {
                state.players[p.id].team_id = p.team_id;
            }
        });
    }
    
    renderPlayers();
}

// Setup unassigned area as drop zone
function setupUnassignedDropZone() {
    const unassignedGrid = document.getElementById('unassignedGrid');
    
    unassignedGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        unassignedGrid.classList.add('drag-over');
    });
    unassignedGrid.addEventListener('dragleave', () => {
        unassignedGrid.classList.remove('drag-over');
    });
    unassignedGrid.addEventListener('drop', (e) => {
        e.preventDefault();
        unassignedGrid.classList.remove('drag-over');
        if (state.draggedPlayer) {
            assignPlayerToTeam(state.draggedPlayer, null);
        }
    });
}

// ─────────────────────────── Game Mode ─────────────────────────── #

function setGameMode(mode) {
    sendToHost({ type: 'set_game_mode', mode: mode });
}

function updateGameMode(data) {
    state.gameMode = data.game_mode;
    
    // Update UI buttons
    const classicBtn = document.getElementById('classicModeBtn');
    const bowlBtn = document.getElementById('bowlModeBtn');
    const modeDesc = document.getElementById('modeDescription');
    const timeLimitSelect = document.getElementById('timeLimit');
    
    if (state.gameMode === 'classic') {
        classicBtn.classList.add('active');
        bowlBtn.classList.remove('active');
        modeDesc.textContent = 'Everyone answers, fastest correct wins most points';
        timeLimitSelect.parentElement.classList.remove('hidden');
    } else {
        classicBtn.classList.remove('active');
        bowlBtn.classList.add('active');
        modeDesc.textContent = 'Buzz in to answer! Host judges. Teams required.';
        timeLimitSelect.parentElement.classList.add('hidden');
    }
    
    // Bowl mode requires teams
    if (data.team_mode !== undefined) {
        state.teamMode = data.team_mode;
    }
    if (data.teams) {
        state.teams = data.teams;
    }
    
    updateTeamModeUI();
    renderPlayers();
}

function updateGameModeUI() {
    const classicBtn = document.getElementById('classicModeBtn');
    const bowlBtn = document.getElementById('bowlModeBtn');
    const modeDesc = document.getElementById('modeDescription');
    
    if (state.gameMode === 'classic') {
        classicBtn.classList.add('active');
        bowlBtn.classList.remove('active');
        modeDesc.textContent = 'Everyone answers, fastest correct wins most points';
    } else {
        classicBtn.classList.remove('active');
        bowlBtn.classList.add('active');
        modeDesc.textContent = 'Buzz in to answer! Host judges. Teams required.';
    }
}

// ─────────────────────────── Bowl Mode UI ─────────────────────────── #

function showBowlUI() {
    document.getElementById('answersGrid').classList.add('hidden');
    document.getElementById('bowlUI').classList.remove('hidden');
    document.getElementById('bowlWaiting').classList.remove('hidden');
    document.getElementById('bowlAnswer').classList.add('hidden');
    document.getElementById('bowlSteal').classList.add('hidden');
}

function hideBowlUI() {
    document.getElementById('bowlUI').classList.add('hidden');
    document.getElementById('answersGrid').classList.remove('hidden');
}

function showBuzzWinner(data) {
    state.buzzWinner = data.player_id;
    state.buzzTeam = data.team_id;
    state.bowlPhase = 'answering';
    
    document.getElementById('bowlWaiting').classList.add('hidden');
    document.getElementById('bowlAnswer').classList.remove('hidden');
    document.getElementById('bowlSteal').classList.add('hidden');
    
    // Show buzzer info
    const buzzerTeam = document.getElementById('buzzerTeam');
    const buzzerName = document.getElementById('buzzerName');
    const buzzLabel = document.getElementById('buzzLabel');
    
    if (data.team) {
        buzzerTeam.textContent = data.team.name;
        buzzerTeam.style.color = data.team.color;
        buzzerTeam.style.display = 'block';
    } else {
        buzzerTeam.style.display = 'none';
    }
    
    buzzerName.textContent = data.player_name;
    buzzLabel.textContent = 'BUZZED!';
    
    // Reset answer display
    document.getElementById('answerText').textContent = 'Waiting for answer...';
    document.getElementById('judgmentButtons').classList.add('hidden');
}

function showBowlAnswer(data) {
    state.awaitingJudgment = true;
    
    document.getElementById('answerText').textContent = data.answer || '(no answer)';
    document.getElementById('judgmentButtons').classList.remove('hidden');
    
    // Update label if it's a steal
    if (data.is_steal) {
        document.getElementById('buzzLabel').textContent = 'STEALING!';
    }
}

function judgeAnswer(correct) {
    if (!state.awaitingJudgment) return;
    
    sendToHost({ type: 'judge', correct: correct });
    state.awaitingJudgment = false;
    document.getElementById('judgmentButtons').classList.add('hidden');
}

function showBowlCorrect(data) {
    // Show quick feedback then transition to reveal-like state
    const correctAnswer = document.getElementById('correctAnswer');
    correctAnswer.className = 'correct-answer bowl-correct';
    correctAnswer.innerHTML = `
        <span class="bowl-result-icon">✓</span>
        <span class="text">${escapeHtml(data.answer)}</span>
    `;
    
    // Update stats
    const resultStats = document.getElementById('resultStats');
    const stealText = data.is_steal ? ' (STEAL)' : '';
    resultStats.innerHTML = `
        <div class="stat">
            <span class="stat-value">${escapeHtml(data.player_name)}</span>
            <span class="stat-label">got it right${stealText}</span>
        </div>
        <div class="stat">
            <span class="stat-value">+${data.points}</span>
            <span class="stat-label">points</span>
        </div>
    `;
    
    // Show leaderboard
    updateMiniLeaderboard(data.leaderboard, []);
    
    if (data.team_leaderboard) {
        renderTeamStandings(data.team_leaderboard);
    }
    
    showScreen('revealScreen');
}

function showStealPhase(data) {
    state.bowlPhase = 'stealing';
    state.buzzWinner = null;
    state.buzzTeam = null;
    state.awaitingJudgment = false;
    
    document.getElementById('bowlWaiting').classList.add('hidden');
    document.getElementById('bowlAnswer').classList.add('hidden');
    document.getElementById('bowlSteal').classList.remove('hidden');
    
    // Show which teams can steal
    const stealTeams = document.getElementById('stealTeams');
    if (data.steal_eligible && data.steal_eligible.length > 0 && state.teams) {
        const teamNames = data.steal_eligible
            .map(tid => state.teams[tid]?.name || `Team ${tid}`)
            .join(', ');
        stealTeams.textContent = `${teamNames} can steal!`;
    } else {
        stealTeams.textContent = 'Waiting for steal...';
    }
}

function showStealWinner(data) {
    // Someone is attempting to steal
    showBuzzWinner(data);
    document.getElementById('buzzLabel').textContent = 'STEALING!';
}

function skipSteal() {
    sendToHost({ type: 'skip_steal' });
}

function showBowlNoCorrect(data) {
    // No one got it right
    const correctAnswer = document.getElementById('correctAnswer');
    correctAnswer.className = 'correct-answer bowl-incorrect';
    correctAnswer.innerHTML = `
        <span class="bowl-result-icon">✗</span>
        <span class="text">Correct: ${escapeHtml(data.correct_answer)}</span>
    `;
    
    const resultStats = document.getElementById('resultStats');
    resultStats.innerHTML = `
        <div class="stat">
            <span class="stat-value">No one</span>
            <span class="stat-label">got it right</span>
        </div>
    `;
    
    updateMiniLeaderboard(data.leaderboard, []);
    
    if (data.team_leaderboard) {
        renderTeamStandings(data.team_leaderboard);
    }
    
    showScreen('revealScreen');
}

function showBowlStealSkipped(data) {
    showBowlNoCorrect(data);
}

function updateMiniLeaderboard(leaderboard, results) {
    const container = document.getElementById('miniLeaderboard');
    container.innerHTML = '<h3>LEADERBOARD</h3>';
    
    leaderboard.slice(0, 5).forEach((player, idx) => {
        const result = results.find(r => r.id === player.id);
        const pointsEarned = result ? result.points_earned : 0;
        
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        
        let pointsDisplay = '';
        if (pointsEarned > 0) {
            pointsDisplay = `<span class="points-earned gained">+${pointsEarned}</span>`;
        } else if (pointsEarned < 0) {
            pointsDisplay = `<span class="points-earned lost">${pointsEarned}</span>`;
        }
        
        let teamDot = '';
        if (player.team_color) {
            teamDot = `<span class="team-dot" style="background: ${player.team_color}"></span>`;
        }
        
        row.innerHTML = `
            <span class="rank">#${idx + 1}</span>
            ${teamDot}
            <span class="name">${escapeHtml(player.name)}</span>
            ${pointsDisplay}
            <span class="score">${player.score}</span>
        `;
        container.appendChild(row);
    });
}

// ─────────────────────────── Team Leaderboard ─────────────────────────── #

function renderTeamStandings(teamLeaderboard) {
    const container = document.getElementById('teamStandings');
    const grid = document.getElementById('teamStandingsGrid');
    
    if (!teamLeaderboard || teamLeaderboard.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    grid.innerHTML = '';
    
    teamLeaderboard.forEach((team, idx) => {
        const row = document.createElement('div');
        row.className = 'team-standing-row';
        row.innerHTML = `
            <span class="team-rank">#${idx + 1}</span>
            <span class="team-color-dot" style="background: ${team.color}"></span>
            <span class="team-name">${escapeHtml(team.name)}</span>
            <span class="team-score">${team.score}</span>
        `;
        grid.appendChild(row);
    });
}

function renderTeamPodium(teamLeaderboard) {
    const podium = document.getElementById('teamPodium');
    
    if (!teamLeaderboard || teamLeaderboard.length === 0) {
        podium.classList.add('hidden');
        return;
    }
    
    podium.classList.remove('hidden');
    podium.innerHTML = '<h2>🏆 WINNING TEAM</h2>';
    
    // Show top team prominently
    const winner = teamLeaderboard[0];
    if (winner) {
        const winnerDiv = document.createElement('div');
        winnerDiv.className = 'team-winner';
        winnerDiv.style.borderColor = winner.color;
        winnerDiv.innerHTML = `
            <div class="team-winner-medal">🥇</div>
            <div class="team-winner-name" style="color: ${winner.color}">${escapeHtml(winner.name)}</div>
            <div class="team-winner-score">${winner.score} points</div>
            <div class="team-winner-players">${winner.players.map(p => escapeHtml(p.name)).join(', ')}</div>
        `;
        podium.appendChild(winnerDiv);
    }
    
    // Show runner-ups
    if (teamLeaderboard.length > 1) {
        const runnersDiv = document.createElement('div');
        runnersDiv.className = 'team-runners';
        
        teamLeaderboard.slice(1).forEach((team, idx) => {
            runnersDiv.innerHTML += `
                <div class="team-runner">
                    <span class="runner-medal">${idx === 0 ? '🥈' : '🥉'}</span>
                    <span class="runner-name" style="color: ${team.color}">${escapeHtml(team.name)}</span>
                    <span class="runner-score">${team.score}</span>
                </div>
            `;
        });
        
        podium.appendChild(runnersDiv);
    }
}

// ─────────────────────────── Minigame Functions ─────────────────────────── #

function startMinigameFromReveal() {
    const minigameType = document.getElementById('revealMinigameType').value;
    const duration = parseInt(document.getElementById('revealMinigameDuration').value) || 30;
    
    if (duration < 10 || duration > 120) {
        alert('Duration must be between 10 and 120 seconds');
        return;
    }
    
    // Start synchronized minigame break
    sendToHost({
        type: 'start_minigame',
        minigame_type: minigameType,
        duration: duration
    });
}

function showMinigameHost(data) {
    // Minigames are now client-side only
    // This function is kept for potential future synchronized minigames
    const minigameType = data.minigame_type || 'microgame';
    const prompt = data.prompt || '';
    
    // Store current screen to return to
    const currentScreen = document.querySelector('.screen.active');
    if (currentScreen) {
        state.previousScreen = currentScreen.id;
    }
    
    document.getElementById('minigameTitleHost').textContent = '🎮 MINIGAME';
    document.getElementById('minigamePromptHost').textContent = 'Players are playing minigames...';
    
    // Clear submissions
    const submissionsEl = document.getElementById('minigameSubmissions');
    if (submissionsEl) {
        submissionsEl.innerHTML = '<p class="waiting-submissions">Waiting for submissions...</p>';
    }
    
    // Start timer if duration is set
    if (data.duration && data.duration > 0) {
        startMinigameTimerHost(data.duration);
    }
    
    showScreen('minigameScreen');
    
    // Setup end button
    const endBtn = document.getElementById('endMinigameBtn');
    if (endBtn) {
        endBtn.onclick = () => {
            sendToHost({ type: 'end_minigame' });
        };
    }
}

function startMinigameTimerHost(duration) {
    const timerEl = document.getElementById('minigameTimerHost');
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
        }
    }, 1000);
}

function addMinigameSubmission(data) {
    const submissionsEl = document.getElementById('minigameSubmissions');
    if (!submissionsEl) return;
    
    // Remove waiting message if present
    const waitingMsg = submissionsEl.querySelector('.waiting-submissions');
    if (waitingMsg) {
        waitingMsg.remove();
    }
    
    // Check if submission already exists
    let existingCard = submissionsEl.querySelector(`[data-player-id="${data.player_id}"]`);
    
    if (!existingCard) {
        existingCard = document.createElement('div');
        existingCard.className = 'minigame-submission-card';
        existingCard.dataset.playerId = data.player_id;
        existingCard.innerHTML = `
            <div class="submission-header">
                <span class="submission-player">${escapeHtml(data.player_name)}</span>
            </div>
            <div class="submission-image-container">
                <img class="submission-image" src="${data.data}" alt="Drawing by ${escapeHtml(data.player_name)}">
            </div>
        `;
        submissionsEl.appendChild(existingCard);
    } else {
        // Update existing submission
        const img = existingCard.querySelector('.submission-image');
        if (img) {
            img.src = data.data;
        }
    }
}

function showMinigameResults(data) {
    // Show all submissions
    const submissionsEl = document.getElementById('minigameSubmissions');
    if (!submissionsEl) return;
    
    if (data.submissions && data.submissions.length > 0) {
        submissionsEl.innerHTML = '';
        data.submissions.forEach(submission => {
            const card = document.createElement('div');
            card.className = 'minigame-submission-card';
            card.innerHTML = `
                <div class="submission-header">
                    <span class="submission-player">${escapeHtml(submission.player_name)}</span>
                </div>
                <div class="submission-image-container">
                    <img class="submission-image" src="${submission.data}" alt="Drawing by ${escapeHtml(submission.player_name)}">
                </div>
            `;
            submissionsEl.appendChild(card);
        });
    }
    
    // After a delay, return to previous screen
    setTimeout(() => {
        // The server will send room_state to return to previous state
        // We'll handle it in the room_state case
    }, 3000);
}

// ─────────────────────────── Start ─────────────────────────── #

document.addEventListener('DOMContentLoaded', () => {
    init();
    setupUnassignedDropZone();
});

