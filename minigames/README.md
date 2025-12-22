# LÖVE2D Minigames for Library Quiz

This directory contains LÖVE2D minigames that are compiled to WebAssembly using Love.js for browser embedding.

## Building

1. Install LÖVE2D (https://love2d.org/)
2. Install Love.js (https://github.com/Davidobot/love.js)
3. Build each minigame:
   ```bash
   cd tap_when_red
   love.js . ../build/tap_when_red --title "Tap When Red" --memory 52428800
   ```

## Minigames

- **tap_when_red**: Reaction time game - tap when screen turns red
- **quick_math**: Fast arithmetic problems
- **count_clicks**: Count audio clicks

## Communication

Games communicate with the main app via JavaScript postMessage API:
- Send: `{type: 'score', value: number}` - Update score
- Send: `{type: 'complete', score: number}` - Game completed
- Receive: `{type: 'start', gameType: string}` - Start game
- Receive: `{type: 'stop'}` - Stop game

