-- Quick Math Minigame
-- LÖVE2D version for browser embedding

local gameState = "playing"  -- playing, correct, wrong
local num1 = 0
local num2 = 0
local correctAnswer = 0
local wrongAnswers = {}
local selectedAnswer = nil
local score = 0
local round = 0
local maxRounds = 5
local canvas = nil

-- Colors
local purpleColor = {0.4, 0.5, 0.9}
local greenColor = {0.2, 0.9, 0.4}
local redColor = {0.9, 0.2, 0.2}
local whiteColor = {1, 1, 1}
local blackColor = {0, 0, 0}

function love.load()
    love.window.setTitle("Quick Math")
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
    gameState = "playing"
    num1 = love.math.random(1, 20)
    num2 = love.math.random(1, 20)
    correctAnswer = num1 + num2
    
    -- Generate wrong answers
    wrongAnswers = {}
    local wrong1 = correctAnswer + love.math.random(1, 10)
    local wrong2 = math.max(1, correctAnswer - love.math.random(1, 10))
    wrongAnswers[1] = wrong1
    wrongAnswers[2] = wrong2
    
    -- Shuffle answers
    local answers = {correctAnswer, wrong1, wrong2}
    for i = #answers, 2, -1 do
        local j = love.math.random(i)
        answers[i], answers[j] = answers[j], answers[i]
    end
    wrongAnswers = answers
    selectedAnswer = nil
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

function love.mousepressed(x, y, button)
    handleClick(x, y)
end

function love.touchpressed(id, x, y, dx, dy, pressure)
    handleClick(x, y)
end

function handleClick(x, y)
    if gameState ~= "playing" then return end
    
    local w, h = love.graphics.getWidth(), love.graphics.getHeight()
    local buttonHeight = 100
    local buttonY = h/2 + 100
    
    -- Check which button was clicked
    for i, answer in ipairs(wrongAnswers) do
        local buttonX = (w / 3) * (i - 1) + w / 6
        if x >= buttonX - 100 and x <= buttonX + 100 and
           y >= buttonY - buttonHeight/2 and y <= buttonY + buttonHeight/2 then
            selectedAnswer = answer
            checkAnswer(answer)
            break
        end
    end
end

function checkAnswer(answer)
    if answer == correctAnswer then
        score = score + 1
        gameState = "correct"
        sendMessage({type = "score", value = score})
        love.timer.sleep(1.5)
        startNewRound()
    else
        gameState = "wrong"
        love.timer.sleep(1.5)
        startNewRound()
    end
end

function love.draw()
    love.graphics.setCanvas(canvas)
    love.graphics.clear()
    
    local w, h = love.graphics.getWidth(), love.graphics.getHeight()
    
    -- Background
    love.graphics.setColor(0.1, 0.1, 0.15)
    love.graphics.rectangle("fill", 0, 0, w, h)
    
    -- Question
    love.graphics.setColor(whiteColor)
    love.graphics.setFont(love.graphics.newFont(64))
    local question = num1 .. " + " .. num2 .. " = ?"
    love.graphics.printf(question, 0, h/2 - 150, w, "center")
    
    -- Answer buttons
    local buttonHeight = 100
    local buttonY = h/2 + 100
    
    for i, answer in ipairs(wrongAnswers) do
        local buttonX = (w / 3) * (i - 1) + w / 6
        
        -- Button color
        if gameState == "correct" and answer == correctAnswer then
            love.graphics.setColor(greenColor)
        elseif gameState == "wrong" and answer == correctAnswer then
            love.graphics.setColor(greenColor)
        elseif gameState == "wrong" and answer == selectedAnswer then
            love.graphics.setColor(redColor)
        else
            love.graphics.setColor(purpleColor)
        end
        
        love.graphics.rectangle("fill", buttonX - 100, buttonY - buttonHeight/2, 200, buttonHeight, 10)
        
        -- Button text
        love.graphics.setColor(whiteColor)
        love.graphics.setFont(love.graphics.newFont(48))
        love.graphics.printf(tostring(answer), buttonX - 100, buttonY - 30, 200, "center")
    end
    
    -- Score
    love.graphics.setFont(love.graphics.newFont(32))
    love.graphics.printf("Score: " .. score, 0, 50, w, "center")
    love.graphics.printf("Round " .. round .. " / " .. maxRounds, 0, 100, w, "center")
    
    love.graphics.setCanvas()
    love.graphics.setColor(whiteColor)
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

