/**
 * LÖVE2D Minigame Wrapper
 * Handles loading and communication with LÖVE2D games compiled with Love.js
 */

class Love2DMinigame {
    constructor(containerId, gameType) {
        this.containerId = containerId;
        this.gameType = gameType;
        this.container = document.getElementById(containerId);
        this.canvas = null;
        this.gameInstance = null;
        this.score = 0;
        this.onScoreUpdate = null;
        this.onComplete = null;
        this.isRunning = false;
    }

    async load() {
        // Create canvas for LÖVE2D game
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'love2d-canvas';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        
        // Clear container and add canvas
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);
        
        // Load the appropriate game based on gameType
        const gamePath = this.getGamePath(this.gameType);
        
        try {
            // Load Love.js runtime and game
            await this.loadGame(gamePath);
        } catch (error) {
            console.error('Error loading LÖVE2D game:', error);
            this.container.innerHTML = '<p style="color: red; padding: 2rem; text-align: center;">Error loading game. Please refresh.</p>';
        }
    }

    getGamePath(gameType) {
        const gameMap = {
            'tap_when_red': 'build/tap_when_red',
            'quick_math': 'build/quick_math',
            'count_clicks': 'build/count_clicks'
        };
        return gameMap[gameType] || gameMap['tap_when_red'];
    }

    async loadGame(gamePath) {
        // This will be implemented to load the Love.js compiled game
        // For now, we'll use a placeholder that will work with the actual build
        
        // Listen for messages from the game
        window.addEventListener('message', (event) => {
            this.handleGameMessage(event.data);
        });
        
        // Create iframe or load Love.js module
        // Note: Love.js typically creates a canvas and loads via Module
        // We'll need to adapt based on the actual Love.js build output
        
        // For now, create a script loader
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${gamePath}/love.js`;
            script.onload = () => {
                // Initialize Love.js Module
                if (typeof Module !== 'undefined') {
                    Module.canvas = this.canvas;
                    Module.onRuntimeInitialized = () => {
                        resolve();
                    };
                } else {
                    reject(new Error('Love.js Module not found'));
                }
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    handleGameMessage(data) {
        if (!data || typeof data !== 'object') return;
        
        switch (data.type) {
            case 'score':
                this.score = data.value;
                if (this.onScoreUpdate) {
                    this.onScoreUpdate(this.score);
                }
                break;
            case 'complete':
                this.isRunning = false;
                if (this.onComplete) {
                    this.onComplete(this.score);
                }
                break;
        }
    }

    start() {
        if (!this.gameInstance) {
            console.error('Game not loaded');
            return;
        }
        
        this.isRunning = true;
        this.score = 0;
        
        // Send start message to game
        this.sendToGame({type: 'start', gameType: this.gameType});
    }

    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        this.sendToGame({type: 'stop'});
    }

    sendToGame(message) {
        // Send message to LÖVE2D game
        // This depends on how Love.js exposes the message handler
        if (typeof Module !== 'undefined' && Module.ccall) {
            // Use Module.ccall to call into the game
            const jsonMsg = JSON.stringify(message);
            Module.ccall('love_handlers_message', null, ['string'], [jsonMsg]);
        }
    }

    destroy() {
        this.stop();
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.container.innerHTML = '';
    }
}

// Export for use in player.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Love2DMinigame;
}

