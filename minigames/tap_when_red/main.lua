-- Tap When Red Minigame
-- LÖVE2D version for browser embedding

local gameState = "waiting"  -- waiting, red, success, failed
local waitTime = 0
local redTime = 0
local score = 0
local round = 0
local maxRounds = 5
local canvas = nil

-- Colors
local blueColor = {0.2, 0.6, 0.9}
local redColor = {0.9, 0.2, 0.2}
local greenColor = {0.2, 0.9, 0.4}
local whiteColor = {1, 1, 1}
local blackColor = {0, 0, 0}

function love.load()
    love.window.setTitle("Tap When Red")
    -- Set up canvas for better rendering
    canvas = love.graphics.newCanvas(love.graphics.getWidth(), love.graphics.getHeight())
    startNewRound()
end

function love.resize(w, h)
    canvas = love.graphics.newCanvas(w, h)
end

function startNewRound()
    if round >= maxRounds then
        sendMessage({type = "complete", score = score})
        return
    end
    
    round = round + 1
    gameState = "waiting"
    waitTime = love.math.random(1, 3)  -- Random wait 1-3 seconds
    redTime = 0
end

function sendMessage(msg)
    -- Send message to parent JavaScript
    -- Love.js exposes Module.postMessage or we can use window.postMessage
    if love.system then
        -- Try using window.postMessage via javascript: protocol
        local jsCode = "window.postMessage(" .. json.encode(msg) .. ", '*');"
        love.system.openURL("javascript:" .. jsCode)
    end
    -- Alternative: Use Module.postMessage if available
    -- This will be set up by the wrapper
end

-- Simple JSON encoder (basic version)
function json.encode(obj)
    if type(obj) == "table" then
        local str = "{"
        local first = true
        for k, v in pairs(obj) do
            if not first then str = str .. "," end
            first = false
            if type(k) == "string" then
                str = str .. '"' .. k .. '":'
            else
                str = str .. k .. ":"
            end
            if type(v) == "string" then
                str = str .. '"' .. v .. '"'
            elseif type(v) == "number" then
                str = str .. v
            elseif type(v) == "table" then
                str = str .. json.encode(v)
            end
        end
        str = str .. "}"
        return str
    end
    return "null"
end

function love.update(dt)
    if gameState == "waiting" then
        waitTime = waitTime - dt
        if waitTime <= 0 then
            gameState = "red"
            redTime = love.timer.getTime()
        end
    elseif gameState == "red" then
        -- Auto-fail after 2 seconds
        if love.timer.getTime() - redTime > 2 then
            gameState = "failed"
            love.timer.sleep(1)
            startNewRound()
        end
    end
end

function love.mousepressed(x, y, button)
    handleInput()
end

function love.touchpressed(id, x, y, dx, dy, pressure)
    handleInput()
end

function handleInput()
    if gameState == "red" then
        -- Success!
        score = score + 1
        gameState = "success"
        sendMessage({type = "score", value = score})
        love.timer.sleep(1)
        startNewRound()
    elseif gameState == "waiting" then
        -- Too early!
        gameState = "failed"
        love.timer.sleep(1)
        startNewRound()
    end
end

function love.draw()
    love.graphics.setCanvas(canvas)
    love.graphics.clear()
    
    local w, h = love.graphics.getWidth(), love.graphics.getHeight()
    
    -- Background color based on state
    if gameState == "waiting" then
        love.graphics.setColor(blueColor)
    elseif gameState == "red" then
        love.graphics.setColor(redColor)
    elseif gameState == "success" then
        love.graphics.setColor(greenColor)
    else
        love.graphics.setColor(redColor)
    end
    
    love.graphics.rectangle("fill", 0, 0, w, h)
    
    -- Text
    love.graphics.setColor(whiteColor)
    love.graphics.setFont(love.graphics.newFont(48))
    
    if gameState == "waiting" then
        love.graphics.printf("WAIT FOR RED...", 0, h/2 - 50, w, "center")
        love.graphics.setFont(love.graphics.newFont(24))
        love.graphics.printf("Round " .. round .. " / " .. maxRounds, 0, h/2 + 50, w, "center")
    elseif gameState == "red" then
        love.graphics.setFont(love.graphics.newFont(72))
        love.graphics.printf("TAP NOW!", 0, h/2 - 50, w, "center")
    elseif gameState == "success" then
        love.graphics.setFont(love.graphics.newFont(64))
        love.graphics.printf("CORRECT!", 0, h/2 - 50, w, "center")
    else
        love.graphics.setFont(love.graphics.newFont(64))
        love.graphics.printf("TOO EARLY!", 0, h/2 - 50, w, "center")
    end
    
    -- Score
    love.graphics.setFont(love.graphics.newFont(32))
    love.graphics.printf("Score: " .. score, 0, 50, w, "center")
    
    love.graphics.setCanvas()
    love.graphics.setColor(whiteColor)
    love.graphics.draw(canvas, 0, 0)
end

-- Handle messages from JavaScript
function love.handlers.message(msg)
    local data = json.decode(msg)
    if data.type == "start" then
        score = 0
        round = 0
        startNewRound()
    elseif data.type == "stop" then
        love.event.quit()
    end
end

