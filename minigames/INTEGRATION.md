# LÖVE2D Minigames Integration Guide

## Overview

The minigames have been replaced with LÖVE2D games that compile to WebAssembly using Love.js. This provides:
- **Platform independence**: Works on PC, mobile, and tablets
- **Better graphics**: Full LÖVE2D rendering capabilities
- **Consistent experience**: Same games across all platforms

## What Was Created

### 1. LÖVE2D Game Files
- `tap_when_red/` - Reaction time game
- `quick_math/` - Fast arithmetic problems  
- `count_clicks/` - Audio counting challenge

### 2. JavaScript Integration
- `love2d-wrapper.js` - Wrapper class to load and communicate with games
- Updated `player.js` - Integration with existing minigame system
- Updated `player.html` - Added LÖVE2D game container

## Building the Games

Before the games can be used, they must be compiled with Love.js:

1. **Install Love.js** (see `build-instructions.md`)
2. **Build each game**:
   ```bash
   cd minigames/tap_when_red
   love.js . ../build/tap_when_red --title "Tap When Red" --memory 52428800
   ```
3. **Repeat for other games**

## Communication System

The games communicate via:
- **JavaScript → LÖVE2D**: Using `Module.ccall()` or direct Module access
- **LÖVE2D → JavaScript**: Using `love.system.openURL()` with `javascript:` protocol (simplified) or proper Module.postMessage

### Current Implementation Notes

The current Lua code uses a simplified message passing system. For production, you may need to:

1. **Update message passing** in Lua files to use proper Love.js Module API
2. **Enhance wrapper.js** to properly initialize Love.js Module
3. **Handle canvas resizing** properly
4. **Test input handling** (mouse, touch, keyboard)

## File Structure

```
minigames/
├── tap_when_red/
│   ├── main.lua
│   └── conf.lua
├── quick_math/
│   ├── main.lua
│   └── conf.lua
├── count_clicks/
│   ├── main.lua
│   └── conf.lua
├── build/              # Generated after building
│   ├── tap_when_red/
│   ├── quick_math/
│   └── count_clicks/
├── love2d-wrapper.js   # JavaScript wrapper
├── README.md
├── build-instructions.md
└── INTEGRATION.md      # This file
```

## Next Steps

1. **Build the games** using Love.js
2. **Test each game** in the browser
3. **Refine communication** if needed based on Love.js version
4. **Add error handling** for game loading failures
5. **Optimize** game sizes if needed

## Fallback Behavior

If LÖVE2D games fail to load, the system automatically falls back to the legacy JavaScript minigames, ensuring the app continues to work.

## Troubleshooting

- **Games don't load**: Check browser console for errors, verify Love.js build output
- **Input not working**: May need to adjust touch/mouse handling in Lua
- **Communication issues**: Check Module API usage matches your Love.js version

