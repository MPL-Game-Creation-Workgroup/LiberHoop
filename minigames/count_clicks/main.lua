-- Count Clicks Minigame
-- LÖVE2D version for browser embedding

local gameState = "playing"  -- playing, showing, input, result
local targetClicks = 0
local clickCount = 0
local userGuess = 0
local score = 0
local round = 0
local maxRounds = 5
local canvas = nil
local clickSound = nil

function love.load()
    love.window.setTitle("Count Clicks")
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
    gameState = "showing"
    targetClicks = love.math.random(3, 8)
    clickCount = 0
    userGuess = 0
    
    -- Play clicks
    playClicks()
end

function playClicks()
    for i = 1, targetClicks do
        love.timer.sleep(i * 0.5)
        clickCount = i
        -- Visual feedback happens in draw
    end
    gameState = "input"
end

function sendMessage(msg)
    -- Send message to parent JavaScript
    if love.system then
        local jsCode = "window.postMessage(" .. json.encode(msg) .. ", '*');"
        love.system.openURL("javascript:" .. jsCode)
    end
end

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
    -- Game logic
end

function love.keypressed(key)
    if gameState == "input" then
        if key == "return" or key == "kpenter" then
            checkAnswer()
        elseif key == "backspace" then
            userGuess = math.floor(userGuess / 10)
        elseif tonumber(key) then
            userGuess = userGuess * 10 + tonumber(key)
            if userGuess > 10 then userGuess = tonumber(key) end
        end
    end
end

function love.mousepressed(x, y, button)
    if gameState == "input" then
        local w, h = love.graphics.getWidth(), love.graphics.getHeight()
        local buttonY = h/2 + 150
        if y >= buttonY - 30 and y <= buttonY + 30 then
            checkAnswer()
        end
    end
end

function checkAnswer()
    if userGuess == targetClicks then
        score = score + 1
        gameState = "result"
        sendMessage({type = "score", value = score})
    else
        gameState = "result"
    end
    love.timer.sleep(2)
    startNewRound()
end

function love.draw()
    love.graphics.setCanvas(canvas)
    love.graphics.clear()
    
    local w, h = love.graphics.getWidth(), love.graphics.getHeight()
    
    -- Background
    love.graphics.setColor(0.1, 0.1, 0.15)
    love.graphics.rectangle("fill", 0, 0, w, h)
    
    love.graphics.setColor(1, 1, 1)
    
    if gameState == "showing" or gameState == "input" then
        love.graphics.setFont(love.graphics.newFont(48))
        love.graphics.printf("Count the clicks!", 0, 100, w, "center")
        
        -- Visual click indicator
        if gameState == "showing" then
            love.graphics.setFont(love.graphics.newFont(120))
            love.graphics.printf("🔊", 0, h/2 - 60, w, "center")
        end
        
        if gameState == "input" then
            love.graphics.setFont(love.graphics.newFont(64))
            love.graphics.printf("How many?", 0, h/2 - 50, w, "center")
            
            -- Input display
            love.graphics.setFont(love.graphics.newFont(72))
            love.graphics.printf(tostring(userGuess), 0, h/2 + 50, w, "center")
            
            -- Submit button
            love.graphics.setColor(0.4, 0.5, 0.9)
            love.graphics.rectangle("fill", w/2 - 100, h/2 + 120, 200, 60, 10)
            love.graphics.setColor(1, 1, 1)
            love.graphics.setFont(love.graphics.newFont(32))
            love.graphics.printf("Submit", w/2 - 100, h/2 + 140, 200, "center")
        end
    elseif gameState == "result" then
        love.graphics.setFont(love.graphics.newFont(64))
        if userGuess == targetClicks then
            love.graphics.setColor(0.2, 0.9, 0.4)
            love.graphics.printf("CORRECT!", 0, h/2 - 50, w, "center")
        else
            love.graphics.setColor(0.9, 0.2, 0.2)
            love.graphics.printf("It was " .. targetClicks, 0, h/2 - 50, w, "center")
        end
    end
    
    -- Score
    love.graphics.setColor(1, 1, 1)
    love.graphics.setFont(love.graphics.newFont(32))
    love.graphics.printf("Score: " .. score, 0, 50, w, "center")
    love.graphics.printf("Round " .. round .. " / " .. maxRounds, 0, 100, w, "center")
    
    love.graphics.setCanvas()
    love.graphics.setColor(1, 1, 1)
    love.graphics.draw(canvas, 0, 0)
end

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

