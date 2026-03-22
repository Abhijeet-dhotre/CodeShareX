/**
 * CodeShareX - WebSocket Signaling Server
 * Handles session management, WebRTC signaling, and document sync relay
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Serve static files
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, '..', 'client', req.url === '/' ? 'index.html' : req.url);
  
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript'
  };
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
    res.end(content);
  });
});

const wss = new WebSocket.Server({ server });

// Session storage: { code: { users: Set, lastActivity: timestamp, document: string } }
const sessions = new Map();

// Generate unique 6-digit code
function generateCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (sessions.has(code));
  return code;
}

// Clean up expired sessions
function cleanupSessions() {
  const now = Date.now();
  for (const [code, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      sessions.delete(code);
      console.log(`Session ${code} expired and removed`);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

// Broadcast to all users in a session except sender
function broadcastToSession(code, message, excludeWs) {
  const session = sessions.get(code);
  if (!session) return;
  
  session.users.forEach(user => {
    if (user !== excludeWs && user.readyState === WebSocket.OPEN) {
      user.send(JSON.stringify(message));
    }
  });
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  let currentSession = null;
  let userId = null;

  console.log('New client connected');

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'create-session':
          // Create new session
          const code = generateCode();
          const session = {
            users: new Set([ws]),
            lastActivity: Date.now(),
            document: '',
            host: ws
          };
          sessions.set(code, session);
          currentSession = code;
          userId = Date.now().toString(36);
          
          ws.send(JSON.stringify({
            type: 'session-created',
            code: code,
            userId: userId,
            isHost: true
          }));
          
          console.log(`Session ${code} created`);
          break;

        case 'join-session':
          // Join existing session
          const joinCode = message.code;
          const targetSession = sessions.get(joinCode);
          
          if (!targetSession) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Session not found or expired'
            }));
            return;
          }
          
          if (targetSession.users.size >= 2) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Session is full (max 2 users)'
            }));
            return;
          }
          
          targetSession.users.add(ws);
          targetSession.lastActivity = Date.now();
          currentSession = joinCode;
          userId = Date.now().toString(36);
          
          // Notify other user
          broadcastToSession(joinCode, {
            type: 'user-joined',
            userId: userId
          }, ws);
          
          // Send current document state to new user
          ws.send(JSON.stringify({
            type: 'session-joined',
            code: joinCode,
            userId: userId,
            isHost: false,
            document: targetSession.document
          }));
          
          console.log(`User joined session ${joinCode}`);
          break;

        case 'document-update':
          // Relay document changes
          if (!currentSession || !sessions.has(currentSession)) return;
          
          const docSession = sessions.get(currentSession);
          docSession.lastActivity = Date.now();
          docSession.document = message.content;
          
          broadcastToSession(currentSession, {
            type: 'document-update',
            content: message.content,
            userId: userId,
            timestamp: Date.now()
          }, ws);
          break;

        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'ice-candidate':
          // Relay WebRTC signaling messages
          if (!currentSession) return;
          
          const sigSession = sessions.get(currentSession);
          if (sigSession) {
            sigSession.lastActivity = Date.now();
          }
          
          broadcastToSession(currentSession, message, ws);
          break;

        case 'file-request':
          // Handle file transfer request
          if (!currentSession) return;
          
          broadcastToSession(currentSession, {
            type: 'file-request',
            fileName: message.fileName,
            fileSize: message.fileSize,
            senderId: userId
          }, ws);
          break;

        case 'file-accept':
        case 'file-reject':
          // Relay file transfer decision
          if (!currentSession) return;
          
          broadcastToSession(currentSession, message, ws);
          break;

        case 'file-chunk':
          // Relay file chunk
          if (!currentSession) return;
          
          broadcastToSession(currentSession, message, ws);
          break;
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    console.log('Client disconnected');
    
    if (currentSession && sessions.has(currentSession)) {
      const session = sessions.get(currentSession);
      session.users.delete(ws);
      
      // Notify other user
      broadcastToSession(currentSession, {
        type: 'user-left',
        userId: userId
      }, ws);
      
      // Clean up empty sessions
      if (session.users.size === 0) {
        sessions.delete(currentSession);
        console.log(`Session ${currentSession} cleaned up (empty)`);
      }
    }
  });

  // Handle errors
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

server.listen(PORT, () => {
  console.log(`CodeShareX Server running at http://localhost:${PORT}`);
  console.log(`WebSocket server ready for connections`);
});