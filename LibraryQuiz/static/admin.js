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

// Question type labels
const TYPE_LABELS = {
    'choice': '📝 Multiple Choice',
    'truefalse': '✓✗ True/False',
    'text': '✏️ Text Input',
    'number': '🔢 Number',
    'poll': '📊 Poll',
    'wager': '🎲 Wager'
};

// ─────────────────────────── Initialization ─────────────────────────── #

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication mode
    await checkAuthMode();
    
    // Check for saved token
    adminToken = localStorage.getItem('adminToken');
    if (adminToken) {
        checkAuth();
    }
    
    setupEventListeners();
});

async function checkAuthMode() {
    try {
        const response = await fetch('/api/admin/auth-mode');
        const data = await response.json();
        authMode = data.mode;
        
        const badge = document.getElementById('authModeBadge');
        const signupLink = document.getElementById('signupLink');
        
        if (authMode === 'supabase') {
            badge.textContent = '🔐 Supabase Database';
            badge.className = 'auth-mode-badge supabase';
            signupLink.style.display = 'block';
        } else {
            badge.textContent = '🔑 Local Auth';
            badge.className = 'auth-mode-badge local';
            signupLink.style.display = 'none';
        }
    } catch (err) {
        console.error('Failed to check auth mode:', err);
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
    // Login form
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await login();
    });
    
    // Signup form
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

// ─────────────────────────── Authentication ─────────────────────────── #

async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    
    errorEl.textContent = '';
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            const data = await response.json();
            adminToken = data.token;
            adminName = data.name;
            localStorage.setItem('adminToken', adminToken);
            showAdminPanel();
        } else {
            const err = await response.json();
            errorEl.textContent = err.detail || 'Login failed';
        }
    } catch (err) {
        errorEl.textContent = 'Connection error';
        console.error(err);
    }
}

async function signup() {
    const name = document.getElementById('signupName').value.trim();
    const username = document.getElementById('signupUsername').value.trim();
    const password = document.getElementById('signupPassword').value;
    const errorEl = document.getElementById('signupError');
    const successEl = document.getElementById('signupSuccess');
    
    errorEl.textContent = '';
    successEl.style.display = 'none';
    
    try {
        const response = await fetch('/api/admin/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, username, password })
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
            const err = await response.json();
            errorEl.textContent = err.detail || 'Signup failed';
        }
    } catch (err) {
        errorEl.textContent = 'Connection error';
        console.error(err);
    }
}

async function checkAuth() {
    try {
        const response = await fetch('/api/admin/me', {
            headers: { 'X-Admin-Token': adminToken }
        });
        
        if (response.ok) {
            const data = await response.json();
            adminName = data.name;
            showAdminPanel();
        } else {
            logout();
        }
    } catch (err) {
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
    loadQuestions();
    
    // Check for existing session and start polling
    checkSession();
    sessionCheckInterval = setInterval(checkSession, 5000);  // Check every 5 seconds
}

async function checkSession() {
    try {
        const response = await fetch('/api/admin/session', {
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
    // Open host display in new window/tab
    window.open('/host.html', '_blank');
}

function rejoinSession() {
    if (!currentSession) {
        alert('No active session to rejoin');
        return;
    }
    // Open host display - it will reconnect to the existing room
    window.open('/host.html', '_blank');
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
        await fetch('/api/admin/session/close', {
            method: 'POST',
            headers: authHeaders()
        });
        
        // Clear local storage room reference
        localStorage.removeItem('libraryQuiz_hostRoom');
        
        // Update UI
        currentSession = null;
        updateSessionUI();
        
        // Open new session
        window.open('/host.html', '_blank');
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
        const response = await fetch('/api/admin/questions', {
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
    const title = document.getElementById('categoryTitle');
    
    if (!currentCategory || !questionsData.categories[currentCategory]) {
        container.innerHTML = '<p class="empty-state">Select a category to view questions.</p>';
        addBtn.style.display = 'none';
        title.textContent = 'Select a category';
        return;
    }
    
    const category = questionsData.categories[currentCategory];
    title.textContent = category.name;
    addBtn.style.display = 'block';
    
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
                if (qType !== 'poll' && question.correct !== undefined) {
                    const radio = document.querySelector(`input[name="correct"][value="${question.correct}"]`);
                    if (radio) radio.checked = true;
                }
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
        
        if (qType !== 'poll') {
            const checkedRadio = document.querySelector('input[name="correct"]:checked');
            data.correct = checkedRadio ? parseInt(checkedRadio.value) : 0;
        }
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
            response = await fetch('/api/admin/question', {
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
        const response = await fetch('/api/admin/category', {
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
