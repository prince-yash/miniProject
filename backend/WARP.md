# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

EduCanvas Live is a lightweight, real-time collaborative teaching platform built with Node.js/Express backend and React/TypeScript frontend. It features a shared whiteboard, chat system, and video conferencing capabilities using Socket.IO for real-time communication.

## Development Commands

### Quick Start
```bash
# Install all dependencies (from root)
npm run install-all

# Start both frontend and backend in development mode (from root)
npm run dev

# Alternative: Start servers individually
cd backend && npm run dev    # Backend on port 5000
cd frontend && npm start     # Frontend on port 3000
```

### Backend Development
```bash
cd backend

# Development mode with auto-restart
npm run dev

# Production mode
npm start

# Manual start
node server.js
```

### Frontend Development
```bash
cd frontend

# Start React development server
npm start

# Build for production
npm run build

# Run tests
npm test
```

### Testing and Health Checks
```bash
# Check server health
curl http://localhost:5000/health

# Get current state
curl http://localhost:5000/state

# Test Socket.IO connection from browser console
const socket = io('http://localhost:5000');
```

## Architecture Overview

### Backend Architecture (`backend/server.js`)
- **Express HTTP Server**: Basic REST endpoints for health checks
- **Socket.IO Server**: Real-time WebSocket communication
- **In-Memory State**: All data stored in `appState` object (no database)
- **Single File Architecture**: Everything contained in `server.js`

### Frontend Architecture
- **React with TypeScript**: Component-based UI using React 19
- **Socket.IO Client**: Real-time communication with backend
- **State Management**: React hooks (no external state library)
- **Styling**: Tailwind CSS for responsive design

### Key Components
- `App.tsx`: Main application logic, socket connection management
- `LandingPage.tsx`: User authentication and room joining
- `Classroom.tsx`: Main classroom interface with whiteboard and chat

### Real-time Communication Flow
1. **Connection**: Client connects to Socket.IO server on backend
2. **Authentication**: User joins with name and optional admin code
3. **Room System**: All users join 'classroom' room for broadcasting
4. **Event Broadcasting**: Drawing, chat, and control events broadcast to all users

### State Management
**Backend State (`appState` object)**:
```javascript
{
  admin: socketId | null,
  users: { socketId: { name, role, streamActive } },
  chat: [{ id, userId, username, message, timestamp, role }],
  drawingEnabled: boolean,
  adminCode: 'teach123'
}
```

**Frontend State**: Managed via React hooks in each component

## Key Features Implementation

### Admin System
- **Admin Code**: Hardcoded as `teach123` in `backend/server.js:25`
- **First-Come-First-Served**: Only first user with correct code becomes admin
- **Admin Powers**: Toggle drawing, clear canvas, delete messages, control session
- **Session End**: When admin disconnects, all users are kicked out

### Real-time Whiteboard
- **Canvas API**: HTML5 Canvas for drawing
- **Real-time Sync**: Mouse events broadcast via Socket.IO
- **Drawing Controls**: Color picker, brush size, drawing permissions
- **Admin Override**: Admin can always draw regardless of permissions

### Chat System
- **Message Types**: Text messages with user identification
- **Moderation**: Admin can delete any message
- **Persistence**: Messages stored in memory during session

### Socket.IO Events
**Connection Events**: `join_room`, `set_admin`
**Chat Events**: `chat_message`, `delete_message`, `new_message`
**Drawing Events**: `draw_data`, `clear_canvas`, `toggle_draw`
**WebRTC Events**: `offer`, `answer`, `ice-candidate`

## Configuration

### Port Configuration
- **Backend**: Port 5000 (configurable via `PORT` environment variable)
- **Frontend**: Port 3000 (React development server default)
- **Socket Connection**: Frontend connects to `http://localhost:5000`

### CORS Configuration
Backend allows connections from `http://localhost:3000` only.

### Admin Code
Default admin code is `teach123`. To change:
```javascript
// backend/server.js:25
adminCode: 'your-new-code'
```

## Important Architecture Notes

### No Database
- All state is in-memory and resets on server restart
- Users, chat messages, and drawing data are temporary
- Suitable for temporary teaching sessions

### Single Room System
- All users join the same 'classroom' room
- No multi-room support in current implementation
- Session ends when admin leaves

### WebRTC Signaling
- Backend provides WebRTC signaling relay
- Actual video/audio streams are peer-to-peer
- No media server implementation

### Security Considerations
- Admin code is hardcoded and visible in source
- No user authentication beyond name entry
- No data persistence or user management
- CORS limited to localhost development

## Development Tips

### Debugging Socket.IO
```javascript
// Enable Socket.IO debug logs
localStorage.debug = 'socket.io-client:socket';

// Check connection status
socket.connected

// Monitor all events
socket.onAny((event, ...args) => {
  console.log('Socket event:', event, args);
});
```

### Common Development Issues
1. **Backend not running**: Frontend will show connection error
2. **Port conflicts**: Check if ports 3000/5000 are available
3. **CORS errors**: Ensure backend CORS matches frontend URL
4. **Socket connection**: Verify Socket.IO client version matches server

### Testing Real-time Features
- Open multiple browser tabs/windows to simulate multiple users
- Use browser dev tools to monitor WebSocket connections
- Test admin functionality by using admin code in one window

## Project Structure Context
```
educanvas-live/
├── backend/
│   ├── server.js          # Single-file Express + Socket.IO server
│   └── package.json       # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # Main app logic and socket management
│   │   └── components/
│   │       ├── LandingPage.tsx  # User authentication
│   │       └── Classroom.tsx    # Main classroom UI
│   └── package.json       # Frontend dependencies
└── package.json           # Root package with dev scripts
```

This is a learning/demo project focused on real-time collaboration using WebSocket technology. The architecture prioritizes simplicity and immediate functionality over scalability or production-ready features.
