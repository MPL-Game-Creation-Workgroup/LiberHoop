# Building LÖVE2D Minigames for Web

## Prerequisites

1. Install LÖVE2D 11.4 or later: https://love2d.org/
2. Install Love.js: https://github.com/Davidobot/love.js
   ```bash
   git clone https://github.com/Davidobot/love.js.git
   cd love.js
   npm install
   ```

## Building Each Minigame

### Tap When Red
```bash
cd minigames/tap_when_red
love.js . ../build/tap_when_red --title "Tap When Red" --memory 52428800
```

### Quick Math
```bash
cd minigames/quick_math
love.js . ../build/quick_math --title "Quick Math" --memory 52428800
```

### Count Clicks
```bash
cd minigames/count_clicks
love.js . ../build/count_clicks --title "Count Clicks" --memory 52428800
```

## Output Structure

After building, you should have:
```
minigames/
  build/
    tap_when_red/
      love.js
      love.wasm
      love.data
      ...
    quick_math/
      ...
    count_clicks/
      ...
```

## Integration

The built games will be automatically loaded by `love2d-wrapper.js` when the minigames are started in the player interface.

## Note on Communication

The LÖVE2D games use a simplified message passing system. For full Love.js integration, you may need to:

1. Use `Module.ccall` to call into the game
2. Set up proper message handlers in the Love.js Module
3. Handle canvas resizing and input properly

The current implementation provides a foundation that can be enhanced based on the specific Love.js build output.

