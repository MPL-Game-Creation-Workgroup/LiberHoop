#!/bin/bash
#
# Library Quiz Game - Startup Script
# Starts the quiz server and creates a public tunnel with short URL
#

cd "$(dirname "$0")"

# Colors for output
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════╗"
echo "║       📚 LIBRARY QUIZ GAME 📚             ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill $SERVER_PID 2>/dev/null
    kill $TUNNEL_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Kill any existing processes
pkill -f "python server.py" 2>/dev/null
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1

# Start the quiz server
echo -e "${GREEN}Starting quiz server...${NC}"
source venv/bin/activate
python server.py > /tmp/quizserver.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 2

if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "❌ Server failed to start. Check /tmp/quizserver.log"
    cat /tmp/quizserver.log
    exit 1
fi

echo -e "${GREEN}✓ Quiz server running on port 8000${NC}"

# Start cloudflare tunnel
echo -e "${GREEN}Creating public tunnel...${NC}"
cloudflared tunnel --url http://localhost:8000 > /tmp/tunnel.log 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL
echo "Waiting for tunnel..."
for i in {1..15}; do
    TUNNEL_URL=$(grep -o 'https://[^ ]*\.trycloudflare\.com' /tmp/tunnel.log 2>/dev/null | head -1)
    if [ -n "$TUNNEL_URL" ]; then
        break
    fi
    sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
    echo -e "${YELLOW}⚠ Could not get tunnel URL. Check /tmp/tunnel.log${NC}"
    echo "Server is still running locally at http://localhost:8000"
    wait $TUNNEL_PID
    exit 1
fi

# Create short URL with TinyURL
echo -e "${GREEN}Creating short URL...${NC}"
SHORT_URL=$(curl -s "https://tinyurl.com/api-create.php?url=$TUNNEL_URL")

# Also create short URLs for host and admin
SHORT_HOST=$(curl -s "https://tinyurl.com/api-create.php?url=$TUNNEL_URL/host.html")
SHORT_ADMIN=$(curl -s "https://tinyurl.com/api-create.php?url=$TUNNEL_URL/admin.html")

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}✓ QUIZ GAME IS LIVE!${NC}"
echo ""
echo -e "  ${YELLOW}${BOLD}PLAYERS JOIN HERE:${NC}"
echo -e "  ${CYAN}${BOLD}$SHORT_URL${NC}"
echo ""
echo -e "  ${YELLOW}HOST DISPLAY (for big screen):${NC}"
echo -e "  $SHORT_HOST"
echo ""
echo -e "  ${YELLOW}ADMIN PANEL (manage questions):${NC}"
echo -e "  $SHORT_ADMIN"
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Full URL: $TUNNEL_URL"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""

# Save URLs to file for reference
echo "Player URL: $SHORT_URL" > /tmp/quiz_urls.txt
echo "Host URL: $SHORT_HOST" >> /tmp/quiz_urls.txt
echo "Admin URL: $SHORT_ADMIN" >> /tmp/quiz_urls.txt
echo "Full URL: $TUNNEL_URL" >> /tmp/quiz_urls.txt

# Keep running until interrupted
wait $TUNNEL_PID
