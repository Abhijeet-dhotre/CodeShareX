# CodeShareX

Real-time collaborative document editing and P2P file sharing application built with Node.js, WebSockets, and WebRTC.

## Features

- **Real-time Document Collaboration**: Two users can simultaneously edit a shared document with instant synchronization
- **P2P File Transfer**: Send files directly device-to-device using WebRTC Data Channels - no server storage
- **6-digit Session Code**: Simple session management without authentication
- **Modern UI**: Clean, responsive design with drag & drop file upload
- **Progress Tracking**: Real-time transfer speed and progress indicators

## Tech Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js + WebSocket (ws)
- **Communication**: WebRTC for P2P data transfer, WebSocket for signaling
- **STUN Server**: Google STUN (stun:stun.l.google.com:19302)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser A                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   UI Layer   │◄──►│  WebSocket   │◄──►│   WebRTC     │  │
│  │ (HTML/CSS/JS)│    │   Client     │    │  DataChannel │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘  │
│                                                  │           │
└──────────────────────────────────────────────────┼───────────┘
                                                 │
                              ┌───────────────────┴───────────┐
                              │      Signaling Server          │
                              │        (Node.js + ws)          │
                              │                                │
                              │  • Session Management          │
                              │  • Code Generation             │
                              │  • WebRTC Signaling            │
                              │  • Document Sync Relay         │
                              └────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Abhijeet-dhotre/Fast-Share-.git
cd Fast-Share-

# Install dependencies
npm install

# Start the server
npm start
```

### Running the Application

1. Start the server: `npm start`
2. Open browser: `http://localhost:3000`
3. For two users:
   - User 1: Click "Create Session" → Get the 6-digit code
   - User 2: Enter the code → Click "Join"

## Usage Guide

### Creating a Session
1. Click "Create Session"
2. Share the 6-digit code with your peer
3. Wait for them to join

### Joining a Session
1. Enter the 6-digit code from your peer
2. Click "Join"
3. You'll be connected immediately

### Document Collaboration
- Both users can type in the editor
- Changes sync in real-time
- Click "Save" to download the document as a text file

### File Transfer
1. Drag & drop a file onto the drop zone, or click to browse
2. The other user sees a request to accept/reject
3. On acceptance, file transfers directly P2P
4. Progress bar shows transfer status

## API Reference

### WebSocket Messages

| Type | Direction | Description |
|------|-----------|-------------|
| `create-session` | Client → Server | Create new session |
| `join-session` | Client → Server | Join existing session |
| `document-update` | Both | Sync document content |
| `webrtc-offer` | Client → Server → Client | WebRTC connection offer |
| `webrtc-answer` | Client → Server → Client | WebRTC connection answer |
| `ice-candidate` | Client → Server → Client | ICE candidate exchange |
| `file-request` | Client → Server → Client | Request file transfer |
| `file-accept` | Client → Server → Client | Accept file transfer |
| `file-reject` | Client → Server → Client | Reject file transfer |
| `file-chunk` | Client → Server → Client | File data chunk |

### Session Management
- Session codes are 6-digit numbers (100000-999999)
- Sessions auto-expire after 30 minutes of inactivity
- Maximum 2 users per session

## Security Features
- Session codes expire after 30 minutes of inactivity
- Sessions auto-delete when empty
- No file data stored on server
- Direct P2P transfer (encrypted by WebRTC)

## Project Structure

```
/project-root
├── package.json           # Node.js dependencies
├── README.md              # This file
├── client/
│   ├── index.html        # Main HTML page
│   ├── style.css         # Styling
│   └── app.js            # Frontend logic
└── server/
    └── server.js         # WebSocket signaling server
```

## Limitations & Future Improvements

### Current Limitations
- Maximum 2 users per session
- Session timeout after 30 minutes
- No file resume on disconnect

### Suggested Improvements
1. **Chunked Transfer with Resume**: Support large files with pause/resume
2. **Reconnection Handling**: Auto-reconnect on network issues
3. **Operational Transform**: Better conflict resolution for documents
4. **Multiple File Queue**: Queue multiple files for transfer
5. **Room Passwords**: Optional password protection
6. **Mobile Support**: Touch-optimized mobile UI
7. **TURN Servers**: Add TURN for better NAT traversal

## License

MIT License

## Acknowledgments

- [ws](https://github.com/websockets/ws) - WebSocket library for Node.js
- [WebRTC](https://webrtc.org/) - Real-time communication
