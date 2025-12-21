# LiberHoop 📚🎮

**Kahoot + Jackbox for library quizzes** - A real-time, interactive quiz game platform designed for library events, teen programs, and educational gatherings.

## Overview

LiberHoop is a web-based quiz game platform that combines the competitive fun of Kahoot with the social, interactive elements of Jackbox Games. Players join using their mobile devices or browsers, while the host displays the game on a large screen (projector/TV). 

**Designed for**: Libraries, community events, schools, and educational gatherings. Maximum recommended group size: ~30 players per session (tested up to 100+).

**Philosophy**: Free, open source, privacy-focused, and community-driven. No subscriptions, no student data tracking, just fun educational gameplay.

## Key Features

### 🎯 Game Modes

- **Classic Mode**: Traditional quiz format where all players answer simultaneously. Fastest correct answers earn the most points.
- **Bowl Mode**: Quiz bowl-style gameplay with buzzing, answering, and stealing mechanics. More strategic and competitive.

### 📝 Question Types

- **Multiple Choice**: Standard 4-option questions
- **True/False**: Quick binary questions
- **Text Input**: Free-form text answers
- **Number Input**: Numeric answers with optional tolerance
- **Poll**: Opinion-based questions with no correct answer (shows results)
- **Open Poll**: Free-text poll where players submit their own answers (grouped and displayed)
- **Wager**: Risk/reward questions where players bet points on their confidence

### 👥 Team Support

- Optional team mode where players can be organized into teams
- Team-based scoring and leaderboards
- Drag-and-drop team assignment in host interface

### 🎨 Minigames

- **Lobby Minigames** (Player-controlled, client-side):
  - ⚡ **Microgames**: Warioware-style quick reaction games with enhanced graphics
    - Tap When Red: Reaction time challenge with visual feedback
    - Quick Math: Fast arithmetic problems with gradient buttons
    - Count Clicks: Audio counting challenge with animations
  - 🔍 **Word Search**: Find hidden words in a letter grid
  - 🧩 **Pattern Match**: Identify the next item in a visual pattern
  - 🔢 **Sequence Puzzle**: Solve number sequence problems

### 🔐 Authentication & Hosting

- **Dual Authentication System**:
  - Supabase integration (cloud-based user management)
  - Local authentication fallback (JSON file-based)
- **Host Panel** for question management and game hosting
- **Flexible Server Configuration**:
  - Enter server URL on login (for connecting to remote servers)
  - Automatic validation of server URLs
  - Support for GitHub Pages frontend with separate backend server
- Session management for hosts
- Secure password hashing with bcrypt
- Single login required - authentication persists across admin panel and host display

### 🛒 Question Marketplace

- **Share Categories**: Share your question categories with the community
- **Browse & Search**: Search shared categories by name, tags, or difficulty
- **Import Categories**: Import shared categories into your local question bank
- **Ratings & Reviews**: Rate and review shared categories
- **Metadata**: Extended metadata including difficulty levels, question counts, ratings, and download statistics
- **Free & Open**: Completely free sharing platform for educators
- **Requires Supabase**: Marketplace features require Supabase configuration

### 📊 Real-time Features

- WebSocket-based real-time communication
- Live score updates
- Dynamic leaderboards
- Real-time player join/leave notifications
- Host controls for game flow

## Architecture

### Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time**: WebSockets
- **Database**: Supabase (optional) or local JSON files
- **Deployment**: Cloudflare Tunnel for public access

### Project Structure

```
LibraryQuiz/
├── server.py              # Main FastAPI server and WebSocket handlers
├── main.py               # Entry point
├── requirements.txt      # Python dependencies
├── start.sh             # Startup script with tunnel creation
├── data/
│   ├── questions.json   # Question database
│   ├── admins.json     # Local admin accounts
│   └── participation.csv # Participation tracking
├── static/
│   ├── index.html       # Player interface
│   ├── player.js        # Player-side logic
│   ├── player.css       # Player styles
│   ├── host.html        # Host display interface
│   ├── host.js          # Host-side logic
│   ├── host.css         # Host styles
│   ├── admin.html       # Admin panel
│   ├── admin.js         # Admin logic
│   └── admin.css        # Admin styles
└── .env                 # Environment variables (Supabase credentials)
```

## Getting Started

### Prerequisites

- Python 3.8+
- pip
- (Optional) Cloudflare Tunnel for public access
- (Optional) Supabase account for cloud authentication

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd LiberHoop/LibraryQuiz
   ```

2. **Create virtual environment** (recommended, especially on Raspberry Pi)
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment** (optional, for Supabase)
   ```bash
   cp .env.example .env
   # Edit .env and add your Supabase credentials
   ```

5. **Run the server**
   ```bash
   python server.py
   # Or use the startup script (Linux/Mac):
   chmod +x start.sh
   ./start.sh
   ```

### Access Points

- **Players**: `http://localhost:8000` (or public URL from tunnel)
- **Host Display**: `http://localhost:8000/host.html`
- **Host Panel**: `http://localhost:8000/admin.html` (login to manage questions and host games)

## Usage

### For Players

1. Open the player URL on your mobile device or browser
2. Enter the room code displayed on the host screen
3. Enter your name and choose an avatar
4. Wait in lobby (play minigames while waiting!)
5. Answer questions as they appear
6. View your score and position on the leaderboard
7. **Note**: No account needed - just join and play!

### For Hosts

1. **Log in to the Host Panel** (`/admin.html`)
   - Enter your server URL if connecting to a remote server (optional - leave blank to use current server)
   - Enter your username and password
   - Create an account if you don't have one (works with both Supabase and local authentication)
2. **Manage Questions** (optional - can be done before or during hosting)
   - Add, edit, and delete questions
   - Organize questions by categories
   - Set question types, answers, and time limits
   - Export/import questions for backup and sharing
3. **Start Hosting**
   - Click "Start Hosting" to open the host display
   - Create a new room or rejoin an existing session
   - Select game mode (Classic or Bowl)
   - Choose question categories
   - Set number of questions and time limits
   - Start the game!
4. **Control Game Flow**
   - Control game flow (next question, reveal answers, etc.)
   - Start minigames during breaks (after reveals)
   - Manage teams (if team mode is enabled)
   - View live leaderboards

**Note**: You only need to log in once. After logging in, you can start hosting immediately without logging in again. The host display will automatically use your authentication.

## Game Flow

1. **Lobby**: Players join, host configures game
2. **Question**: Question displayed, players answer
3. **Reveal**: Correct answer shown, scores updated
4. **Leaderboard**: Current standings displayed
5. **Repeat**: Next question or end game
6. **Final Leaderboard**: Overall winners

## Configuration

### Question Management

Questions are stored in `data/questions.json` with the following structure:

```json
{
  "categories": {
    "category_id": {
      "name": "Category Name",
      "questions": [
        {
          "id": "unique_id",
          "type": "choice|truefalse|text|number|poll|open_poll|wager",
          "question": "Question text",
          "answers": ["Option 1", "Option 2", ...],
          "correct": 0,  // Index or value
          "time_limit": 20,
          "tolerance": 0  // For number questions
        }
      ]
    }
  }
}
```

### Environment Variables

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase anon/public key

### Supabase Setup for Marketplace

The marketplace feature requires Supabase to be configured. After setting up your Supabase project, create the following tables:

#### `shared_categories` table
```sql
CREATE TABLE shared_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    tags TEXT[] DEFAULT '{}',
    difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
    question_count INTEGER NOT NULL,
    author_username TEXT NOT NULL,
    author_name TEXT NOT NULL,
    questions JSONB NOT NULL,
    rating_average NUMERIC(3,2) DEFAULT 0.0,
    rating_count INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_shared_categories_active ON shared_categories(is_active);
CREATE INDEX idx_shared_categories_tags ON shared_categories USING GIN(tags);
```

#### `shared_category_ratings` table
```sql
CREATE TABLE shared_category_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_category_id UUID REFERENCES shared_categories(id) ON DELETE CASCADE,
    rater_username TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(shared_category_id, rater_username)
);

CREATE INDEX idx_ratings_category ON shared_category_ratings(shared_category_id);
```

## Deployment

### Local Network

Run `python server.py` and access via local IP:
- Players: `http://YOUR_IP:8000`
- Host: `http://YOUR_IP:8000/host.html`

### Public Access (Cloudflare Tunnel)

Use the included `start.sh` script which:
1. Starts the FastAPI server
2. Creates a Cloudflare tunnel
3. Generates short URLs for easy sharing

### Raspberry Pi

The project is optimized for Raspberry Pi deployment:
- Use virtual environments to avoid system package conflicts
- Run as a service for automatic startup
- Use Cloudflare Tunnel for public access without port forwarding

## Development

### Adding New Question Types

1. Update `server.py` to handle the new type in:
   - `start_question()` - Question display logic
   - `check_answer()` - Answer validation
   - `reveal_answer()` - Answer reveal logic

2. Update frontend (`player.js`) to display the new question type
3. Update admin panel (`admin.js`) to allow creating the new type

### Adding New Minigames

1. Add minigame logic to `player.js`
2. Update minigame UI in `index.html`
3. Add styles to `player.css`
4. (For synchronized minigames) Update `server.py` handlers

## Known Limitations

- In-memory game state (rooms lost on server restart)
- No persistent player accounts or profiles
- Single server instance (no horizontal scaling)
- Cloudflare Tunnel URLs expire when server restarts (new URL generated each time)
- No HTTPS/SSL by default (should be added for production)
- Maximum recommended players: ~30 per session (tested up to 100+)
- Server URL must be manually entered when connecting to remote servers (saved for convenience)

## Security Considerations

- Admin passwords are hashed with bcrypt
- WebSocket connections are not encrypted by default (HTTPS/SSL should be implemented)
- Room codes are randomly generated but not cryptographically secure
- No rate limiting on API endpoints
- **Privacy-focused**: No student data capture or persistent tracking
- Host accounts and questions should be backed up regularly


## License

**License Options** (Choose one):

### Option 1: Creative Commons Attribution-NonCommercial (CC BY-NC)
- **Allows**: Remix, adapt, build upon the work
- **Requires**: Attribution to original creator
- **Restricts**: Commercial use
- **Best for**: Projects where you want to allow modifications but prevent commercial exploitation
- **Link**: https://creativecommons.org/licenses/by-nc/4.0/

### Option 2: Creative Commons Attribution-NonCommercial-ShareAlike (CC BY-NC-SA)
- **Allows**: Remix, adapt, build upon the work
- **Requires**: Attribution and ShareAlike (derivatives must use same license)
- **Restricts**: Commercial use
- **Best for**: Ensuring all derivatives remain non-commercial and open
- **Link**: https://creativecommons.org/licenses/by-nc-sa/4.0/

### Option 3: Creative Commons Attribution-NonCommercial-NoDerivatives (CC BY-NC-ND)
- **Allows**: Download and share
- **Requires**: Attribution
- **Restricts**: Commercial use and modifications
- **Best for**: Maximum protection while still allowing sharing
- **Link**: https://creativecommons.org/licenses/by-nc-nd/4.0/

**Note**: Creative Commons licenses are typically used for creative works. For software, you may want to consider a custom license or consult legal advice. However, CC BY-NC is commonly used for educational/open source projects that want to prevent commercial use.

**Recommended**: **CC BY-NC-SA** - Allows contributions and modifications while ensuring the project stays non-commercial and open.

## TODO / Planned Features

### High Priority

#### Question Management & Sharing
- ✅ **Question Sharing System**: Create a platform for hosts to share questions and answer sheets
  - No subscription required - free sharing for educators
  - Easy import/export functionality
  - Question templates and bulk operations
  - Community-driven question library

#### New Game Modes
- 🎯 **Focus Area**: Rolling out new game modes regularly
  - Each mode must be:
    - Fair and balanced
    - Knowledge or communication-based
    - Objectively scoreable
  - Examples to consider: speed rounds, elimination, tournament brackets

#### Testing & Quality Assurance
- 🔄 **Currently in progress**: Unit tests, integration tests, and user testing
- 🧪 **Beta testing**: Already testing with real users
- 📊 **User feedback**: Collecting engagement, usage, and feedback metrics

### Medium Priority

#### Minigames
- 🎮 **More minigames**: Expand minigame library
  - May require artwork assets (planned for later rollout)
  - Keep minigames as entertainment-only (no scoring)
  - Allow hosts to create custom minigame prompts/challenges

#### Team Features
- 👥 **Team enhancements**: 
  - Team challenges
  - Dynamic team swapping during gameplay
  - Focus on in-person play experience

#### Security & Infrastructure
- 🔒 **HTTPS/SSL**: Add proper SSL/HTTPS support (currently missing but should be implemented)
- 💾 **Backup system**: 
  - Important: Questions and admin accounts
  - Not needed: Game history/session data

### Lower Priority / Future Considerations

#### Customization
- 🎨 **Theming**: Custom themes, colors, avatars (far down the road)
- ⚙️ **Game rules**: Per-session rule customization (future consideration)

#### Analytics
- 📈 **Analytics**: Not a current priority
  - If users request it, will consider adding
  - Focus remains on fun, engaging gameplay

#### Accessibility & Internationalization
- 🌍 **Multi-language support**: 
  - Will be provided as needed and if resources allow
  - **Open to contributions!** Contributors welcome to add language support
- ♿ **Accessibility features**: 
  - Screen readers, high contrast, keyboard navigation
  - **Open to contributions!** Accessibility improvements welcome

### Technical Roadmap

#### Data & Privacy
- 🚫 **No student data capture**: Privacy-focused approach
  - May allow inner classroom student data traffic in future
  - No persistent player profiles or history tracking

#### Deployment
- 🍓 **Primary**: Raspberry Pi deployment (current focus)
- 🌐 **Open source**: Can be adapted to any server/hosting environment
- 🔗 **Domain**: No custom domain planned (free project), but open source allows custom deployments

#### Performance
- ⚡ **Scalability**: Should handle 100+ simultaneous players
  - Monitor and address performance issues as they arise

### Community & Contribution Goals

#### Long-term Vision (5-year plan)
1. **Wider Local Use**: Adoption in libraries and community events
2. **More Games**: Contributors creating their own minigames to add to the project
3. **Community Formation**: 
   - Sharing questions and answer sheets
   - No subscription fees for educators
   - Community-driven content library

#### Contribution Opportunities
- 🌍 **Language translations**: Help translate the interface
- ♿ **Accessibility improvements**: Make the game more accessible
- 🎮 **New minigames**: Create and contribute minigame ideas
- 🎯 **New game modes**: Design and implement new game modes
- 📝 **Documentation**: Improve guides and tutorials
- 🐛 **Bug fixes**: Help improve stability
- 🎨 **UI/UX improvements**: Enhance the user experience

### Documentation Needs

- ✅ **User guides**: Written guides for hosts and players (included in README)
- 📹 **Video tutorials**: Not planned unless really needed
- 📚 **API documentation**: Will be provided for integrations

### Success Metrics

Success will be measured by:
- **Engagement**: How much players enjoy the experience
- **Usage**: Adoption in libraries and community events
- **Feedback**: Community input and suggestions

---

## Contributing

This is a completely open source project designed for public use. We welcome contributions!

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes**
4. **Test thoroughly**
5. **Submit a pull request**

### Areas Needing Help

- 🌍 **Language translations**: Add support for your language
- ♿ **Accessibility**: Improve screen reader support, keyboard navigation, etc.
- 🎮 **Minigames**: Create new minigame types
- 🎯 **Game modes**: Design and implement new game modes
- 📝 **Documentation**: Improve guides and examples
- 🐛 **Bug fixes**: Help squash bugs
- 🎨 **UI/UX**: Enhance the visual design and user experience

### Code of Conduct

- Be respectful and inclusive
- Focus on making the game fun and accessible
- No commercial use or monetization
- Keep it open source and free for educators
