function love.conf(t)
    t.title = "Tap When Red"
    t.author = "Library Quiz"
    t.version = "11.4"
    
    t.window.width = 800
    t.window.height = 600
    t.window.resizable = true
    t.window.fullscreen = false
    
    -- Disable unused modules for smaller build
    t.modules.audio = false
    t.modules.joystick = false
    t.modules.physics = false
    t.modules.video = false
end

