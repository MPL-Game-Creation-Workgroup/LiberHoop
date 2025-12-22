/**
 * Library Quiz Game - Admin Panel
 * Manage questions with admin authentication (Supabase or local)
 */

let questionsData = null;
let currentCategory = null;
let deleteQuestionId = null;
let adminToken = null;
let adminName = '';
let authMode = 'local';  // 'supabase' or 'local'
let currentSession = null;  // Track current hosting session
let sessionCheckInterval = null;
let serverBaseUrl = '';  // Base URL for API calls (e.g., Cloudflare tunnel URL)

// Question type labels
const TYPE_LABELS = {
    'choice': '📝 Multiple Choice',
    'truefalse': '✓✗ True/False',
    'text': '✏️ Text Input',
    'number': '🔢 Number',
    'poll': '📊 Poll',
    'open_poll': '💬 Open Poll',
    'wager': '🎲 Wager'
};

// ─────────────────────────── Initialization ─────────────────────────── #

// Helper function to get the API base URL
function getApiUrl(path) {
    // Check if we're opening from file:// protocol (not served by a web server)
    if (window.location.protocol === 'file:') {
        throw new Error('Cannot make API calls from file:// protocol. Please access the admin panel through a web server (http:// or https://).');
    }
    
    // Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    
    // If we have a server URL, use it; otherwise use relative path (same origin)
    if (serverBaseUrl) {
        // Ensure serverBaseUrl doesn't end with a slash
        const base = serverBaseUrl.endsWith('/') ? serverBaseUrl.slice(0, -1) : serverBaseUrl;
        return `${base}/${cleanPath}`;
    }
    return `/${cleanPath}`;
}

// Load server URL from localStorage or detect if we're on the same server
function loadServerUrl() {
    const serverUrlInput = document.getElementById('serverUrl');
    if (!serverUrlInput) {
        // Field might not be visible yet (before login)
        return;
    }
    
    // Check if we're on GitHub Pages or a different origin
    const isGitHubPages = window.location.hostname.includes('github.io') || 
                          window.location.hostname.includes('github.com');
    
    if (isGitHubPages) {
        // On GitHub Pages - load saved server URL
        const savedUrl = localStorage.getItem('liberHoopServerUrl');
        if (savedUrl) {
            serverBaseUrl = savedUrl;
            serverUrlInput.value = savedUrl;
        }
    } else {
        // On the actual server - check if we have a saved URL, otherwise use same origin
        const savedUrl = localStorage.getItem('liberHoopServerUrl');
        if (savedUrl) {
            serverBaseUrl = savedUrl;
            serverUrlInput.value = savedUrl;
        } else {
            // Default to same origin (empty string = relative paths)
            serverBaseUrl = '';
            serverUrlInput.value = window.location.origin;
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check if opened via file:// protocol
    if (window.location.protocol === 'file:') {
        const errorMsg = document.getElementById('loginError') || document.createElement('div');
        errorMsg.textContent = '⚠️ This page must be accessed through a web server (http:// or https://), not by opening the file directly. Please use your LiberHoop server URL or GitHub Pages.';
        errorMsg.style.cssText = 'color: #d63031; font-weight: 600; padding: 1rem; background: rgba(214, 48, 49, 0.1); border-radius: 8px; margin: 1rem 0;';
        if (document.getElementById('loginScreen')) {
            const loginBox = document.querySelector('.login-box');
            if (loginBox && !loginBox.querySelector('.file-protocol-error')) {
                errorMsg.className = 'file-protocol-error';
                loginBox.insertBefore(errorMsg, loginBox.firstChild);
            }
        }
        return;
    }
    
    // Load server URL configuration
    loadServerUrl();
    
    // Check authentication mode (only if we have a server URL or are NOT on GitHub Pages)
    const isGitHubPages = window.location.hostname.includes('github.io') || 
                          window.location.hostname.includes('github.com');
    
    if (serverBaseUrl || !isGitHubPages) {
        await checkAuthMode();
        
        // Check for saved token
        adminToken = localStorage.getItem('adminToken');
        if (adminToken) {
            checkAuth();
        }
    }
    
    setupEventListeners();
});

async function checkAuthMode() {
    try {
        const response = await fetch(getApiUrl('/api/admin/auth-mode'), {
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }
        
        const data = await response.json();
        authMode = data.mode;
        
        const badge = document.getElementById('authModeBadge');
        const signupLink = document.getElementById('signupLink');
        
        // Always show signup link - signup works with both Supabase and local auth
        signupLink.style.display = 'block';
        
        if (authMode === 'supabase') {
            badge.textContent = '🔐 Supabase Database';
            badge.className = 'auth-mode-badge supabase';
        } else {
            badge.textContent = '🔑 Local Auth';
            badge.className = 'auth-mode-badge local';
        }
    } catch (err) {
        console.error('Failed to check auth mode:', err);
        // Don't show error if it's a file:// protocol issue (already handled)
        if (err.message && err.message.includes('file://')) {
            return; // Error already shown in DOMContentLoaded
        }
        // Show error notification if service is unreachable
        if (err.name === 'AbortError' || err.name === 'TimeoutError' || 
            err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            showServerError('The game may be temporarily unavailable due to maintenance.');
        }
    }
}

function showSignupForm() {
    document.querySelector('.login-box').style.display = 'none';
    document.getElementById('signupBox').style.display = 'block';
}

function showLoginForm() {
    document.getElementById('signupBox').style.display = 'none';
    document.querySelector('.login-box').style.display = 'block';
}

function setupEventListeners() {
    // Login form - no server URL required for login
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await login();
    });
    
    // Signup form - no server URL required for signup
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await signup();
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Start Hosting - opens host display in new tab
    document.getElementById('startHostingBtn').addEventListener('click', startHosting);
    
    // Session controls
    document.getElementById('rejoinSessionBtn').addEventListener('click', rejoinSession);
    document.getElementById('restartSessionBtn').addEventListener('click', restartSession);
    document.getElementById('closeSessionBtn').addEventListener('click', closeSession);
    
    // Add category
    document.getElementById('addCategoryBtn').addEventListener('click', () => {
        openModal('categoryModal');
    });
    
    // Add question
    document.getElementById('addQuestionBtn').addEventListener('click', () => {
        openQuestionModal();
    });
    
    // Category form
    document.getElementById('categoryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await createCategory();
    });
    
    // Question form
    document.getElementById('questionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveQuestion();
    });
    
    // True/False buttons
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('trueFalseAnswer').value = btn.dataset.value;
        });
    });
    
    // Delete confirmation
    document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
        if (deleteQuestionId) {
            await deleteQuestion(deleteQuestionId);
            closeModal('deleteModal');
        }
    });
}

// ─────────────────────────── Error Handling ─────────────────────────── #

function showServerError(message) {
    // Create or update error notification
    let notification = document.getElementById('serverErrorNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'serverErrorNotification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #d63031, #c0392b);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(214, 48, 49, 0.5);
            z-index: 10000;
            max-width: 400px;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
    }
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
            <span style="font-size: 1.5rem;">⚠️</span>
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 0.25rem;">Connection Error</div>
                <div style="font-size: 0.9rem; opacity: 0.9;">${message}</div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; line-height: 1;">×</button>
        </div>
    `;
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (notification && notification.parentElement) {
            notification.remove();
        }
    }, 10000);
}

// ─────────────────────────── Authentication ─────────────────────────── #

async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    
    errorEl.textContent = '';
    
    try {
        // Use saved server URL if available, otherwise use same origin
        const savedUrl = localStorage.getItem('liberHoopServerUrl');
        const isGitHubPages = window.location.hostname.includes('github.io') || 
                              window.location.hostname.includes('github.com');
        
        if (savedUrl) {
            serverBaseUrl = savedUrl.endsWith('/') ? savedUrl.slice(0, -1) : savedUrl;
        } else {
            // If on GitHub Pages without a server URL, we can't log in
            if (isGitHubPages) {
                errorEl.textContent = 'Please access the admin panel from your LiberHoop server URL, or set the server URL after logging in.';
                return;
            }
            serverBaseUrl = ''; // Same origin - try to log in to current server
        }
        
        // Check service connectivity first (only if we have a server URL set)
        if (serverBaseUrl) {
            try {
                const checkUrl = getApiUrl('/api/ip');
                console.log('Checking server connectivity:', checkUrl);
                const checkResponse = await fetch(checkUrl, {
                    method: 'GET',
                    signal: AbortSignal.timeout(3000)
                });
                if (!checkResponse.ok) {
                    throw new Error(`Server responded with status ${checkResponse.status}`);
                }
            } catch (checkErr) {
                console.error('Server connectivity check failed:', checkErr);
                errorEl.textContent = `Cannot connect to server at ${serverBaseUrl}. Please check the URL and ensure the server is running.`;
                showServerError(`Cannot connect to server. Please verify the server URL is correct.`);
                return;
            }
        }
        
        const loginUrl = getApiUrl('/api/admin/login');
        console.log('Attempting login to:', loginUrl);
        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
            const data = await response.json();
            adminToken = data.token;
            adminName = data.name;
            localStorage.setItem('adminToken', adminToken);
            console.log('Login successful');
            showAdminPanel();
        } else {
            const err = await response.json().catch(() => ({}));
            console.error('Login failed:', response.status, err);
            if (response.status === 0 || response.status >= 500) {
                errorEl.textContent = 'Service temporarily unavailable or down for maintenance. Please try again later.';
            } else if (response.status === 401) {
                errorEl.textContent = err.detail || 'Invalid username or password. Please check your credentials.';
            } else if (response.status === 404) {
                errorEl.textContent = `Server not found at ${serverBaseUrl}. Please check the URL.`;
            } else {
                errorEl.textContent = err.detail || 'Login failed. Please check your credentials.';
            }
        }
    } catch (err) {
        console.error('Login error:', err);
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
            errorEl.textContent = 'Connection timeout. Please check your internet connection and try again.';
        } else if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('CORS'))) {
            errorEl.textContent = `Cannot connect to ${serverBaseUrl}. This may be a CORS issue or the server may be offline.`;
            showServerError(`Cannot connect to server. Check the server URL and ensure CORS is enabled on the server.`);
        } else {
            errorEl.textContent = `Connection error: ${err.message || 'Unable to connect. Please try again later.'}`;
        }
    }
}

async function signup() {
    const name = document.getElementById('signupName').value.trim();
    const username = document.getElementById('signupUsername').value.trim();
    const password = document.getElementById('signupPassword').value;
    const signupCode = document.getElementById('signupCode')?.value.trim() || '';
    const errorEl = document.getElementById('signupError');
    const successEl = document.getElementById('signupSuccess');
    
    errorEl.textContent = '';
    successEl.style.display = 'none';
    
    try {
        // Check service connectivity first
        try {
            await fetch(getApiUrl('/api/ip'), {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
        } catch (checkErr) {
            errorEl.textContent = 'The game may be temporarily unavailable due to maintenance.';
            showServerError('The game may be temporarily unavailable due to maintenance.');
            return;
        }
        
        const signupData = { name, username, password };
        if (signupCode) {
            signupData.signup_code = signupCode;
        }
        
        const response = await fetch(getApiUrl('/api/admin/signup'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signupData),
            signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
            const data = await response.json();
            successEl.textContent = data.message || 'Account created!';
            successEl.style.display = 'block';
            document.getElementById('signupForm').reset();
            
            // Auto-switch to login after 2 seconds
            setTimeout(() => {
                showLoginForm();
                document.getElementById('loginUsername').value = username;
            }, 2000);
        } else {
            const err = await response.json().catch(() => ({}));
            if (response.status === 0 || response.status >= 500) {
                errorEl.textContent = 'Service temporarily unavailable or down for maintenance. Please try again later.';
            } else {
                errorEl.textContent = err.detail || 'Signup failed. Please check your input and try again.';
            }
        }
    } catch (err) {
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
            errorEl.textContent = 'Connection timeout. Please check your internet connection and try again.';
        } else if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
            errorEl.textContent = 'The game may be temporarily unavailable due to maintenance.';
            showServerError('The game may be temporarily unavailable due to maintenance.');
        } else {
            errorEl.textContent = `Unable to connect. Please try again later.`;
        }
        console.error('Signup error:', err);
    }
}

async function checkAuth() {
    try {
        const response = await fetch(getApiUrl('/api/admin/me'), {
            headers: { 'X-Admin-Token': adminToken },
            signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
            const data = await response.json();
            adminName = data.name;
            showAdminPanel();
        } else {
            logout();
        }
    } catch (err) {
        if (err.name === 'AbortError' || err.name === 'TimeoutError' || 
            err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            showServerError('The game may be temporarily unavailable due to maintenance.');
        }
        logout();
    }
}

function logout() {
    // Clear session polling
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
    }
    
    adminToken = null;
    adminName = '';
    currentSession = null;
    localStorage.removeItem('adminToken');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'flex';
    document.getElementById('adminName').textContent = adminName;
    
    // Load server URL now that the panel is visible
    loadServerUrl();
    
    // Set up server URL save button
    const saveServerBtn = document.getElementById('saveServerBtn');
    const serverUrlInput = document.getElementById('serverUrl');
    if (saveServerBtn && serverUrlInput) {
        saveServerBtn.addEventListener('click', () => {
            const url = serverUrlInput.value.trim();
            if (url) {
                // Remove trailing slash
                serverBaseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
                localStorage.setItem('liberHoopServerUrl', serverBaseUrl);
                alert('Server URL saved! API calls will now use: ' + serverBaseUrl);
                // Reload questions to test connection
                loadQuestions();
            } else {
                // Clear server URL (use same origin)
                serverBaseUrl = '';
                localStorage.removeItem('liberHoopServerUrl');
                alert('Server URL cleared. Using current server.');
                loadQuestions();
            }
        });
        
        // Also save on Enter key
        serverUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveServerBtn.click();
            }
        });
    }
    
    loadQuestions();
    
    // Check for existing session and start polling
    checkSession();
    sessionCheckInterval = setInterval(checkSession, 5000);  // Check every 5 seconds
}

async function checkSession() {
    try {
        const response = await fetch(getApiUrl('/api/admin/session'), {
            headers: authHeaders()
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        const data = await response.json();
        currentSession = data.has_session ? data : null;
        updateSessionUI();
    } catch (err) {
        console.error('Error checking session:', err);
    }
}

function updateSessionUI() {
    const noSession = document.getElementById('noSessionControls');
    const activeSession = document.getElementById('activeSessionControls');
    
    if (currentSession) {
        noSession.style.display = 'none';
        activeSession.style.display = 'flex';
        
        document.getElementById('sessionRoomCode').textContent = currentSession.room_code;
        document.getElementById('sessionPlayerCount').textContent = 
            `${currentSession.player_count} player${currentSession.player_count !== 1 ? 's' : ''}`;
        
        // Update rejoin button based on connection status
        const rejoinBtn = document.getElementById('rejoinSessionBtn');
        if (currentSession.host_connected) {
            rejoinBtn.textContent = '📺 View';
            rejoinBtn.title = 'View active session';
        } else {
            rejoinBtn.textContent = '📺 Rejoin';
            rejoinBtn.title = 'Rejoin session';
        }
    } else {
        noSession.style.display = 'block';
        activeSession.style.display = 'none';
    }
}

function startHosting() {
    if (currentSession) {
        // Already have a session, confirm restart
        if (confirm(`You have an active session (Room: ${currentSession.room_code}).\n\nWould you like to rejoin it instead?`)) {
            rejoinSession();
            return;
        }
    }
    // Use serverBaseUrl for host.html if we're connecting to a remote server
    const hostUrl = serverBaseUrl ? `${serverBaseUrl}/host.html` : '/host.html';
    window.open(hostUrl, '_blank');
}

function rejoinSession() {
    if (!currentSession) {
        alert('No active session to rejoin');
        return;
    }
    // Open host display - it will reconnect to the existing room
    const hostUrl = serverBaseUrl ? `${serverBaseUrl}/host.html` : '/host.html';
    window.open(hostUrl, '_blank');
}

async function restartSession() {
    if (!currentSession) {
        startHosting();
        return;
    }
    
    const confirmRestart = confirm(
        `This will close the current session (Room: ${currentSession.room_code}) and kick all ${currentSession.player_count} player(s).\n\nContinue?`
    );
    
    if (!confirmRestart) return;
    
    try {
        // Close the current session
        await fetch(getApiUrl('/api/admin/session/close'), {
            method: 'POST',
            headers: authHeaders()
        });
        
        // Clear local storage room reference
        localStorage.removeItem('libraryQuiz_hostRoom');
        
        // Update UI
        currentSession = null;
        updateSessionUI();
        
        // Open new session
        const hostUrl = serverBaseUrl ? `${serverBaseUrl}/host.html` : '/host.html';
        window.open(hostUrl, '_blank');
    } catch (err) {
        console.error('Error restarting session:', err);
        alert('Failed to restart session');
    }
}

async function closeSession() {
    if (!currentSession) {
        alert('No active session to close');
        return;
    }
    
    const confirmClose = confirm(
        `Close session ${currentSession.room_code}?\n\nThis will kick all ${currentSession.player_count} player(s).`
    );
    
    if (!confirmClose) return;
    
    try {
        const response = await fetch('/api/admin/session/close', {
            method: 'POST',
            headers: authHeaders()
        });
        
        if (response.ok) {
            // Clear local storage room reference
            localStorage.removeItem('libraryQuiz_hostRoom');
            
            // Update UI
            currentSession = null;
            updateSessionUI();
        } else {
            const err = await response.json();
            alert(err.detail || 'Failed to close session');
        }
    } catch (err) {
        console.error('Error closing session:', err);
        alert('Failed to close session');
    }
}

function authHeaders() {
    return { 'X-Admin-Token': adminToken };
}

// ─────────────────────────── Questions Management ─────────────────────────── #

async function loadQuestions() {
    try {
        const response = await fetch(getApiUrl('/api/admin/questions'), {
            headers: authHeaders()
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        questionsData = await response.json();
        renderCategories();
    } catch (err) {
        console.error('Error loading questions:', err);
    }
}

function renderCategories() {
    const list = document.getElementById('categoriesList');
    list.innerHTML = '';
    
    for (const [catId, category] of Object.entries(questionsData.categories)) {
        const li = document.createElement('li');
        li.className = `category-item ${currentCategory === catId ? 'active' : ''}`;
        li.innerHTML = `
            <span class="category-name">${category.name}</span>
            <span class="question-count">${category.questions.length}</span>
        `;
        li.addEventListener('click', () => selectCategory(catId));
        list.appendChild(li);
    }
}

function selectCategory(catId) {
    currentCategory = catId;
    renderCategories();
    renderQuestions();
}

function renderQuestions() {
    const container = document.getElementById('questionsList');
    const addBtn = document.getElementById('addQuestionBtn');
    const shareBtn = document.getElementById('shareCategoryBtn');
    const title = document.getElementById('categoryTitle');
    
    if (!currentCategory || !questionsData.categories[currentCategory]) {
        container.innerHTML = '<p class="empty-state">Select a category to view questions.</p>';
        addBtn.style.display = 'none';
        if (shareBtn) shareBtn.style.display = 'none';
        title.textContent = 'Select a category';
        return;
    }
    
    const category = questionsData.categories[currentCategory];
    title.textContent = category.name;
    addBtn.style.display = 'block';
    if (shareBtn) {
        shareBtn.style.display = category.questions.length > 0 ? 'block' : 'none';
    }
    
    if (category.questions.length === 0) {
        container.innerHTML = '<p class="empty-state">No questions in this category. Add one!</p>';
        return;
    }
    
    container.innerHTML = '';
    category.questions.forEach((q, index) => {
        const card = document.createElement('div');
        card.className = 'question-card';
        
        const qType = q.type || 'choice';
        const typeLabel = TYPE_LABELS[qType] || qType;
        
        let answerPreview = '';
        if (qType === 'choice' || qType === 'poll' || qType === 'wager') {
            const colors = ['red', 'blue', 'yellow', 'green'];
            const shapes = ['▲', '◆', '●', '■'];
            const answers = q.answers || [];
            answerPreview = `<div class="answers-preview">
                ${answers.map((a, i) => `
                    <div class="answer-preview ${colors[i]} ${qType !== 'poll' && i === q.correct ? 'correct' : ''}">
                        <span class="shape">${shapes[i]}</span>
                        <span>${escapeHtml(a)}</span>
                        ${qType !== 'poll' && i === q.correct ? '<span class="correct-badge">✓</span>' : ''}
                    </div>
                `).join('')}
            </div>`;
        } else if (qType === 'truefalse') {
            answerPreview = `<div class="correct-answer-display">
                Answer: <strong>${q.correct ? 'TRUE' : 'FALSE'}</strong>
            </div>`;
        } else if (qType === 'text') {
            const answers = Array.isArray(q.correct) ? q.correct : [q.correct];
            answerPreview = `<div class="correct-answer-display">
                Answer: <strong>${escapeHtml(answers.join(' / '))}</strong>
            </div>`;
        } else if (qType === 'number') {
            const tolerance = q.tolerance || 0;
            answerPreview = `<div class="correct-answer-display">
                Answer: <strong>${q.correct}</strong>${tolerance > 0 ? ` (±${tolerance})` : ''}
            </div>`;
        } else if (qType === 'open_poll') {
            answerPreview = `<div class="correct-answer-display">
                <strong>Open Poll</strong> - Players enter their own answers
            </div>`;
        }
        
        card.innerHTML = `
            <div class="question-header">
                <span class="question-type-badge">${typeLabel}</span>
                <span class="time-limit">${q.time_limit}s</span>
            </div>
            <p class="question-text">${escapeHtml(q.question)}</p>
            ${answerPreview}
            ${q.created_by ? `<div class="created-by">Created by: ${escapeHtml(q.created_by)}</div>` : ''}
            <div class="question-actions">
                <button class="btn-icon edit" onclick="editQuestion('${q.id}')" title="Edit">✏️</button>
                <button class="btn-icon delete" onclick="confirmDelete('${q.id}')" title="Delete">🗑️</button>
            </div>
        `;
        
        container.appendChild(card);
    });
}

// ─────────────────────────── Question Form ─────────────────────────── #

function updateQuestionForm() {
    const qType = document.getElementById('questionType').value;
    
    // Hide all type-specific groups
    document.getElementById('choiceAnswersGroup').style.display = 'none';
    document.getElementById('trueFalseGroup').style.display = 'none';
    document.getElementById('textAnswerGroup').style.display = 'none';
    document.getElementById('numberAnswerGroup').style.display = 'none';
    
    // Show relevant group and update help text
    const helpText = document.getElementById('correctAnswerHelp');
    const correctRadios = document.querySelectorAll('.correct-radio');
    
    if (qType === 'choice' || qType === 'wager') {
        document.getElementById('choiceAnswersGroup').style.display = 'block';
        correctRadios.forEach(r => r.style.display = 'inline');
        helpText.textContent = 'Select the radio button next to the correct answer';
        helpText.style.display = 'block';
    } else if (qType === 'poll') {
        document.getElementById('choiceAnswersGroup').style.display = 'block';
        correctRadios.forEach(r => r.style.display = 'none');
        helpText.textContent = 'Polls have no correct answer - just fun opinions!';
        helpText.style.display = 'block';
    } else if (qType === 'open_poll') {
        document.getElementById('choiceAnswersGroup').style.display = 'none';
        helpText.textContent = 'Players will enter their own answers - no predefined options needed!';
        helpText.style.display = 'block';
    } else if (qType === 'truefalse') {
        document.getElementById('trueFalseGroup').style.display = 'block';
    } else if (qType === 'text') {
        document.getElementById('textAnswerGroup').style.display = 'block';
    } else if (qType === 'number') {
        document.getElementById('numberAnswerGroup').style.display = 'block';
    }
}

function openQuestionModal(questionId = null) {
    const form = document.getElementById('questionForm');
    const title = document.getElementById('modalTitle');
    
    form.reset();
    document.getElementById('questionId').value = questionId || '';
    document.getElementById('questionCategory').value = currentCategory;
    document.getElementById('questionType').value = 'choice';
    
    // Reset true/false buttons
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector('.tf-btn.true').classList.add('selected');
    document.getElementById('trueFalseAnswer').value = 'true';
    
    if (questionId) {
        title.textContent = 'Edit Question';
        const category = questionsData.categories[currentCategory];
        const question = category.questions.find(q => q.id === questionId);
        
        if (question) {
            const qType = question.type || 'choice';
            document.getElementById('questionType').value = qType;
            document.getElementById('questionText').value = question.question;
            document.getElementById('timeLimit').value = question.time_limit || 15;
            
            if (qType === 'choice' || qType === 'poll' || qType === 'wager') {
                const answers = question.answers || [];
                answers.forEach((a, i) => {
                    const input = document.getElementById(`answer${i}`);
                    if (input) input.value = a;
                });
                if (qType !== 'poll' && qType !== 'open_poll' && question.correct !== undefined) {
                    const radio = document.querySelector(`input[name="correct"][value="${question.correct}"]`);
                    if (radio) radio.checked = true;
                }
            } else if (qType === 'open_poll') {
                // open_poll doesn't have answers or correct - nothing to load
            } else if (qType === 'truefalse') {
                const val = question.correct ? 'true' : 'false';
                document.getElementById('trueFalseAnswer').value = val;
                document.querySelectorAll('.tf-btn').forEach(b => {
                    b.classList.toggle('selected', b.dataset.value === val);
                });
            } else if (qType === 'text') {
                const answers = Array.isArray(question.correct) ? question.correct : [question.correct];
                document.getElementById('textCorrectAnswer').value = answers.join(', ');
            } else if (qType === 'number') {
                document.getElementById('numberCorrectAnswer').value = question.correct;
                document.getElementById('numberTolerance').value = question.tolerance || 0;
            }
        }
    } else {
        title.textContent = 'Add Question';
    }
    
    updateQuestionForm();
    openModal('questionModal');
}

function editQuestion(questionId) {
    openQuestionModal(questionId);
}

async function saveQuestion() {
    const questionId = document.getElementById('questionId').value;
    const category = document.getElementById('questionCategory').value;
    const qType = document.getElementById('questionType').value;
    
    const data = {
        category: category,
        type: qType,
        question: document.getElementById('questionText').value,
        time_limit: parseInt(document.getElementById('timeLimit').value)
    };
    
    // Add type-specific data
    if (qType === 'choice' || qType === 'poll' || qType === 'wager') {
        data.answers = [
            document.getElementById('answer0').value,
            document.getElementById('answer1').value,
            document.getElementById('answer2').value,
            document.getElementById('answer3').value
        ].filter(a => a.trim());  // Remove empty answers
        
        if (qType !== 'poll' && qType !== 'open_poll') {
            const checkedRadio = document.querySelector('input[name="correct"]:checked');
            data.correct = checkedRadio ? parseInt(checkedRadio.value) : 0;
        }
    } else if (qType === 'open_poll') {
        // open_poll doesn't need answers or correct - players enter their own
    } else if (qType === 'truefalse') {
        data.correct = document.getElementById('trueFalseAnswer').value === 'true';
    } else if (qType === 'text') {
        const textAnswer = document.getElementById('textCorrectAnswer').value;
        data.correct = textAnswer.split(',').map(a => a.trim()).filter(a => a);
    } else if (qType === 'number') {
        data.correct = parseFloat(document.getElementById('numberCorrectAnswer').value);
        data.tolerance = parseFloat(document.getElementById('numberTolerance').value) || 0;
    }
    
    try {
        let response;
        if (questionId) {
            response = await fetch(`/api/admin/question/${questionId}`, {
                method: 'PUT',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            response = await fetch(getApiUrl('/api/admin/question'), {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        if (response.ok) {
            closeModal('questionModal');
            await loadQuestions();
            selectCategory(category);
        } else {
            const error = await response.json();
            alert(error.detail || 'Failed to save question');
        }
    } catch (err) {
        alert('Error saving question');
        console.error(err);
    }
}

function confirmDelete(questionId) {
    deleteQuestionId = questionId;
    openModal('deleteModal');
}

async function deleteQuestion(questionId) {
    try {
        const response = await fetch(`/api/admin/question/${questionId}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        if (response.ok) {
            await loadQuestions();
            selectCategory(currentCategory);
        } else {
            alert('Failed to delete question');
        }
    } catch (err) {
        alert('Error deleting question');
        console.error(err);
    }
}

async function createCategory() {
    const name = document.getElementById('categoryName').value.trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    
    try {
        const response = await fetch(getApiUrl('/api/admin/category'), {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name })
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        if (response.ok) {
            closeModal('categoryModal');
            document.getElementById('categoryForm').reset();
            await loadQuestions();
            selectCategory(id);
        } else {
            const error = await response.json();
            alert(error.detail || 'Failed to create category');
        }
    } catch (err) {
        alert('Error creating category');
        console.error(err);
    }
}

// ─────────────────────────── Modal Helpers ─────────────────────────── #

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// ─────────────────────────── Utilities ─────────────────────────── #

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─────────────────────────── Tab Management ─────────────────────────── #

document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
    
    // Marketplace search
    const searchBtn = document.getElementById('marketplaceSearchBtn');
    const searchInput = document.getElementById('marketplaceSearch');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => loadMarketplace());
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') loadMarketplace();
            });
        }
    }
    
    // Marketplace filters
    const difficultyFilter = document.getElementById('marketplaceDifficultyFilter');
    const sortFilter = document.getElementById('marketplaceSortFilter');
    const tagsFilter = document.getElementById('marketplaceTagsFilter');
    
    if (difficultyFilter) difficultyFilter.addEventListener('change', () => loadMarketplace());
    if (sortFilter) sortFilter.addEventListener('change', () => loadMarketplace());
    if (tagsFilter) tagsFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadMarketplace();
    });
    
    // Share category button
    const shareBtn = document.getElementById('shareCategoryBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (currentCategory) {
                openShareCategoryModal(currentCategory);
            }
        });
    }
    
    // Share category form
    const shareForm = document.getElementById('shareCategoryForm');
    if (shareForm) {
        shareForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await shareCategory();
        });
    }
    
    // Import category form
    const importForm = document.getElementById('importCategoryForm');
    if (importForm) {
        importForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await importCategory();
        });
    }
    
    // Preview import button
    const previewImportBtn = document.getElementById('previewImportBtn');
    if (previewImportBtn) {
        previewImportBtn.addEventListener('click', () => {
            const categoryId = previewImportBtn.dataset.categoryId;
            if (categoryId) {
                closeModal('previewCategoryModal');
                openImportCategoryModal(categoryId);
            }
        });
    }
});

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = content.id === `${tabName}TabContent` ? 'block' : 'none';
        content.classList.toggle('active', content.id === `${tabName}TabContent`);
    });
    
    // Load marketplace if switching to it
    if (tabName === 'marketplace') {
        loadMarketplace();
    }
}

// ─────────────────────────── Marketplace Functions ─────────────────────────── #

let marketplaceCategories = [];

async function loadMarketplace() {
    const grid = document.getElementById('marketplaceGrid');
    if (!grid) return;
    
    grid.innerHTML = '<p class="empty-state">Loading marketplace...</p>';
    
    try {
        const search = document.getElementById('marketplaceSearch')?.value || '';
        const difficulty = document.getElementById('marketplaceDifficultyFilter')?.value || '';
        const sort = document.getElementById('marketplaceSortFilter')?.value || 'newest';
        const tags = document.getElementById('marketplaceTagsFilter')?.value || '';
        
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (difficulty) params.append('difficulty', difficulty);
        if (sort) params.append('sort', sort);
        if (tags) params.append('tags', tags);
        
        const response = await fetch(getApiUrl(`/api/marketplace/categories?${params.toString()}`), {
            headers: authHeaders()
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        if (!response.ok) {
            const error = await response.json();
            grid.innerHTML = `<p class="empty-state">Error: ${error.detail || 'Failed to load marketplace'}</p>`;
            return;
        }
        
        const data = await response.json();
        marketplaceCategories = data.categories || [];
        
        if (marketplaceCategories.length === 0) {
            grid.innerHTML = '<p class="empty-state">No categories found. Be the first to share one!</p>';
            return;
        }
        
        renderMarketplaceCategories(marketplaceCategories);
    } catch (err) {
        console.error('Error loading marketplace:', err);
        grid.innerHTML = '<p class="empty-state">Error loading marketplace. Please check your connection.</p>';
    }
}

function renderMarketplaceCategories(categories) {
    const grid = document.getElementById('marketplaceGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'marketplace-card';
        
        const ratingStars = renderStars(cat.rating_average || 0);
        const tagsHtml = (cat.tags || []).map(tag => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('');
        const difficultyBadge = cat.difficulty ? `<span class="difficulty-badge ${cat.difficulty}">${cat.difficulty}</span>` : '';
        
        card.innerHTML = `
            <div class="marketplace-card-header">
                <h3>${escapeHtml(cat.name)}</h3>
                ${difficultyBadge}
            </div>
            ${cat.description ? `<p class="marketplace-description">${escapeHtml(cat.description)}</p>` : ''}
            <div class="marketplace-meta">
                <div class="marketplace-stats">
                    <span>📊 ${cat.question_count} questions</span>
                    <span>⭐ ${ratingStars} (${cat.rating_count || 0})</span>
                    <span>⬇️ ${cat.download_count || 0} downloads</span>
                </div>
                <div class="marketplace-author">
                    by ${escapeHtml(cat.author_name || cat.author_username)}
                </div>
            </div>
            ${tagsHtml ? `<div class="marketplace-tags">${tagsHtml}</div>` : ''}
            <div class="marketplace-actions">
                <button class="btn-secondary btn-sm" onclick="previewCategory('${cat.id}')">Preview</button>
                <button class="btn-primary btn-sm" onclick="openImportCategoryModal('${cat.id}')">Import</button>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function renderStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    let html = '';
    
    for (let i = 0; i < 5; i++) {
        if (i < fullStars) {
            html += '★';
        } else if (i === fullStars && hasHalf) {
            html += '½';
        } else {
            html += '☆';
        }
    }
    
    return html;
}

async function previewCategory(categoryId) {
    try {
        const response = await fetch(getApiUrl(`/api/marketplace/categories/${categoryId}`), {
            headers: authHeaders()
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.detail || 'Failed to load category');
            return;
        }
        
        const category = await response.json();
        const modal = document.getElementById('previewCategoryModal');
        const title = document.getElementById('previewCategoryTitle');
        const content = document.getElementById('previewCategoryContent');
        const importBtn = document.getElementById('previewImportBtn');
        
        title.textContent = category.name;
        importBtn.dataset.categoryId = categoryId;
        
        let questionsHtml = '<div class="preview-questions">';
        const questions = category.questions || [];
        
        questions.slice(0, 10).forEach((q, i) => {
            questionsHtml += `
                <div class="preview-question">
                    <strong>${i + 1}. ${escapeHtml(q.question)}</strong>
                    <span class="question-type-badge">${TYPE_LABELS[q.type] || q.type}</span>
                </div>
            `;
        });
        
        if (questions.length > 10) {
            questionsHtml += `<p class="preview-more">... and ${questions.length - 10} more questions</p>`;
        }
        
        questionsHtml += '</div>';
        
        content.innerHTML = `
            <div class="preview-info">
                <p><strong>Description:</strong> ${category.description || 'No description'}</p>
                <p><strong>Questions:</strong> ${category.question_count}</p>
                <p><strong>Difficulty:</strong> ${category.difficulty || 'Not specified'}</p>
                <p><strong>Rating:</strong> ${renderStars(category.rating_average || 0)} (${category.rating_count || 0} ratings)</p>
                <p><strong>Author:</strong> ${escapeHtml(category.author_name || category.author_username)}</p>
            </div>
            ${questionsHtml}
        `;
        
        openModal('previewCategoryModal');
    } catch (err) {
        console.error('Error previewing category:', err);
        alert('Error loading category preview');
    }
}

function openShareCategoryModal(categoryId) {
    if (!questionsData || !questionsData.categories[categoryId]) {
        alert('Category not found');
        return;
    }
    
    const category = questionsData.categories[categoryId];
    
    if (category.questions.length === 0) {
        alert('Cannot share a category with no questions');
        return;
    }
    
    document.getElementById('shareCategoryId').value = categoryId;
    document.getElementById('shareCategoryName').value = category.name;
    document.getElementById('shareCategoryDescription').value = '';
    document.getElementById('shareCategoryTags').value = '';
    document.getElementById('shareCategoryDifficulty').value = '';
    
    // Preview questions
    const preview = document.getElementById('shareCategoryPreview');
    let previewHtml = '<ul class="preview-questions-list">';
    category.questions.slice(0, 5).forEach((q, i) => {
        previewHtml += `<li>${i + 1}. ${escapeHtml(q.question)} (${TYPE_LABELS[q.type] || q.type})</li>`;
    });
    if (category.questions.length > 5) {
        previewHtml += `<li>... and ${category.questions.length - 5} more questions</li>`;
    }
    previewHtml += '</ul>';
    preview.innerHTML = previewHtml;
    
    openModal('shareCategoryModal');
}

async function shareCategory() {
    const categoryId = document.getElementById('shareCategoryId').value;
    const name = document.getElementById('shareCategoryName').value.trim();
    const description = document.getElementById('shareCategoryDescription').value.trim();
    const tags = document.getElementById('shareCategoryTags').value.split(',').map(t => t.trim()).filter(t => t);
    const difficulty = document.getElementById('shareCategoryDifficulty').value;
    
    if (!name) {
        alert('Category name is required');
        return;
    }
    
    try {
        const response = await fetch(getApiUrl('/api/marketplace/share'), {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category_id: categoryId,
                name: name,
                description: description,
                tags: tags,
                difficulty: difficulty || null
            })
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.detail || 'Failed to share category');
            return;
        }
        
        const result = await response.json();
        alert('Category shared successfully!');
        closeModal('shareCategoryModal');
        
        // If on marketplace tab, reload
        if (document.getElementById('marketplaceTabContent').classList.contains('active')) {
            loadMarketplace();
        }
    } catch (err) {
        console.error('Error sharing category:', err);
        alert('Error sharing category');
    }
}

async function openImportCategoryModal(categoryId) {
    try {
        const response = await fetch(getApiUrl(`/api/marketplace/categories/${categoryId}`), {
            headers: authHeaders()
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.detail || 'Failed to load category');
            return;
        }
        
        const category = await response.json();
        const modal = document.getElementById('importCategoryModal');
        const info = document.getElementById('importCategoryInfo');
        const newNameInput = document.getElementById('importCategoryNewName');
        
        document.getElementById('importCategoryId').value = categoryId;
        newNameInput.value = '';
        
        info.innerHTML = `
            <div class="import-info">
                <h4>${escapeHtml(category.name)}</h4>
                <p><strong>Questions:</strong> ${category.question_count}</p>
                <p><strong>Description:</strong> ${category.description || 'No description'}</p>
                <p><strong>Author:</strong> ${escapeHtml(category.author_name || category.author_username)}</p>
                <p class="import-warning">⚠️ If a category with this name already exists, a number will be added to avoid conflicts.</p>
            </div>
        `;
        
        openModal('importCategoryModal');
    } catch (err) {
        console.error('Error opening import modal:', err);
        alert('Error loading category');
    }
}

async function importCategory() {
    const categoryId = document.getElementById('importCategoryId').value;
    const newName = document.getElementById('importCategoryNewName').value.trim();
    
    try {
        const response = await fetch(getApiUrl(`/api/marketplace/categories/${categoryId}/import`), {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                new_name: newName || null
            })
        });
        
        if (response.status === 401) {
            logout();
            return;
        }
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.detail || 'Failed to import category');
            return;
        }
        
        const result = await response.json();
        alert(`Category imported successfully as "${result.category_name}"!`);
        closeModal('importCategoryModal');
        
        // Reload questions and switch to questions tab
        await loadQuestions();
        switchTab('questions');
        
        // Select the imported category
        if (result.category_id) {
            selectCategory(result.category_id);
        }
    } catch (err) {
        console.error('Error importing category:', err);
        alert('Error importing category');
    }
}
