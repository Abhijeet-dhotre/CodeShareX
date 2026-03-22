/**
 * CodeShareX - Client Application
 * Handles WebSocket connection, WebRTC setup, document sync, and P2P file transfer
 */

(function() {
  'use strict';

  // Configuration
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  const CHUNK_SIZE = 16 * 1024; // 16KB chunks for file transfer

  // State
  let ws = null;
  let peerConnection = null;
  let dataChannel = null;
  let sessionCode = null;
  let userId = null;
  let isHost = false;
  let isConnected = false;
  let pendingFile = null;
  let incomingFile = null;
  let fileReader = null;
  let lastDocumentContent = '';
  let isRemoteUpdate = false;

  // DOM Elements
  const createBtn = document.getElementById('create-btn');
  const joinBtn = document.getElementById('join-btn');
  const sessionCodeInput = document.getElementById('session-code-input');
  const sessionDisplay = document.getElementById('session-display');
  const sessionCodeEl = document.getElementById('session-code');
  const copyCodeBtn = document.getElementById('copy-code-btn');
  const connectionPanel = document.getElementById('connection-panel');
  const statusPanel = document.getElementById('status-panel');
  const editorPanel = document.getElementById('editor-panel');
  const filePanel = document.getElementById('file-panel');
  const connectionStatus = document.getElementById('connection-status');
  const statusText = document.getElementById('status-text');
  const peerStatus = document.getElementById('peer-status');
  const documentEditor = document.getElementById('document-editor');
  const syncStatus = document.getElementById('sync-status');
  const charCount = document.getElementById('char-count');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileList = document.getElementById('file-list');
  const transferProgress = document.getElementById('transfer-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressFilename = document.getElementById('progress-filename');
  const progressPercent = document.getElementById('progress-percent');
  const progressSpeed = document.getElementById('progress-speed');
  const progressSize = document.getElementById('progress-size');
  const cancelTransferBtn = document.getElementById('cancel-transfer');
  const notification = document.getElementById('notification');
  const notificationText = document.getElementById('notification-text');
  const saveDocBtn = document.getElementById('save-doc-btn');

  // Initialize WebSocket connection
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host || 'localhost:3000'}`;
    
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      updateConnectionStatus('connecting');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      updateConnectionStatus('disconnected');
      isConnected = false;
      showNotification('Connection lost. Refresh to reconnect.', 'error');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      updateConnectionStatus('disconnected');
    };
  }

  // Handle incoming WebSocket messages
  function handleServerMessage(message) {
    switch (message.type) {
      case 'session-created':
        handleSessionCreated(message);
        break;
      case 'session-joined':
        handleSessionJoined(message);
        break;
      case 'error':
        showNotification(message.message, 'error');
        break;
      case 'user-joined':
        handleUserJoined(message);
        break;
      case 'user-left':
        handleUserLeft(message);
        break;
      case 'document-update':
        handleDocumentUpdate(message);
        break;
      case 'webrtc-offer':
        handleWebRTCOffer(message);
        break;
      case 'webrtc-answer':
        handleWebRTCAnswer(message);
        break;
      case 'ice-candidate':
        handleICECandidate(message);
        break;
      case 'file-request':
        handleFileRequest(message);
        break;
      case 'file-accept':
        handleFileAccept(message);
        break;
      case 'file-reject':
        handleFileReject(message);
        break;
      case 'file-chunk':
        handleFileChunk(message);
        break;
    }
  }

  // Session handling
  function handleSessionCreated(message) {
    sessionCode = message.code;
    userId = message.userId;
    isHost = true;
    isConnected = true;
    
    sessionCodeEl.textContent = sessionCode;
    sessionDisplay.classList.remove('hidden');
    updateConnectionStatus('connected');
    showPanels();
    showNotification('Session created! Share the code.', 'success');
  }

  function handleSessionJoined(message) {
    sessionCode = message.code;
    userId = message.userId;
    isHost = false;
    isConnected = true;
    
    documentEditor.value = message.document || '';
    lastDocumentContent = message.document || '';
    updateCharCount();
    
    updateConnectionStatus('connected');
    peerStatus.textContent = 'Peer connected';
    showPanels();
    showNotification('Joined session successfully!', 'success');
    
    // Initiate WebRTC connection as non-host
    createPeerConnection();
    if (isHost) {
      createDataChannel();
    }
  }

  function handleUserJoined(message) {
    peerStatus.textContent = 'Peer connected';
    showNotification('Peer joined the session', 'success');
    
    // Create WebRTC connection when peer joins
    if (isHost) {
      createPeerConnection();
      createDataChannel();
    }
  }

  function handleUserLeft(message) {
    peerStatus.textContent = 'Waiting for peer...';
    showNotification('Peer left the session', 'error');
    
    // Clean up WebRTC
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    dataChannel = null;
  }

  function showPanels() {
    statusPanel.classList.remove('hidden');
    editorPanel.classList.remove('hidden');
    filePanel.classList.remove('hidden');
  }

  // Document sync
  function handleDocumentUpdate(message) {
    if (message.userId === userId) return;
    
    isRemoteUpdate = true;
    documentEditor.value = message.content;
    lastDocumentContent = message.content;
    isRemoteUpdate = false;
    
    syncStatus.textContent = 'Synced';
    updateCharCount();
    
    setTimeout(() => {
      syncStatus.textContent = 'Synced';
    }, 1000);
  }

  function sendDocumentUpdate() {
    if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;
    
    const content = documentEditor.value;
    if (content === lastDocumentContent) return;
    
    lastDocumentContent = content;
    
    ws.send(JSON.stringify({
      type: 'document-update',
      content: content
    }));
    
    syncStatus.textContent = 'Sending...';
  }

  // WebRTC setup
  function createPeerConnection() {
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'connected') {
        peerStatus.textContent = 'P2P Connected';
        showNotification('P2P connection established', 'success');
      } else if (peerConnection.connectionState === 'disconnected' || 
                 peerConnection.connectionState === 'failed') {
        peerStatus.textContent = 'P2P Disconnected';
      }
    };

    peerConnection.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };
  }

  function createDataChannel() {
    if (!peerConnection) return;
    
    dataChannel = peerConnection.createDataChannel('fileTransfer', {
      ordered: false
    });
    
    setupDataChannel(dataChannel);
    
    // Create and send offer
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        sendSignalingMessage({
          type: 'webrtc-offer',
          sdp: peerConnection.localDescription
        });
      })
      .catch(err => console.error('Error creating offer:', err));
  }

  function setupDataChannel(channel) {
    channel.onopen = () => {
      console.log('Data channel open');
    };

    channel.onmessage = (event) => {
      handleDataChannelMessage(event.data);
    };

    channel.onerror = (error) => {
      console.error('Data channel error:', error);
    };

    channel.onclose = () => {
      console.log('Data channel closed');
    };

    dataChannel = channel;
  }

  function handleWebRTCOffer(message) {
    if (!peerConnection) {
      createPeerConnection();
    }

    peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
      .then(() => peerConnection.createAnswer())
      .then(answer => peerConnection.setLocalDescription(answer))
      .then(() => {
        sendSignalingMessage({
          type: 'webrtc-answer',
          sdp: peerConnection.localDescription
        });
      })
      .catch(err => console.error('Error handling offer:', err));
  }

  function handleWebRTCAnswer(message) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
      .catch(err => console.error('Error handling answer:', err));
  }

  function handleICECandidate(message) {
    if (peerConnection && message.candidate) {
      peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
        .catch(err => console.error('Error adding ICE candidate:', err));
    }
  }

  function sendSignalingMessage(message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
  }

  // File transfer
  function handleFileRequest(message) {
    pendingFile = {
      name: message.fileName,
      size: message.fileSize,
      senderId: message.senderId
    };

    addPendingFileToList(message.fileName, message.fileSize);
  }

  function handleFileAccept(message) {
    if (!pendingFileData) return;
    
    startFileTransfer();
    pendingFileData = null;
    clearFileList();
  }

  function handleFileReject(message) {
    showNotification('File transfer rejected by peer', 'error');
    pendingFile = null;
    pendingFileData = null;
    clearFileList();
  }

  function addPendingFileToList(name, size) {
    fileList.innerHTML = `
      <div class="file-item">
        <div class="file-info">
          <span class="file-icon">📄</span>
          <div class="file-details">
            <span class="file-name">${escapeHtml(name)}</span>
            <span class="file-size">${formatFileSize(size)}</span>
          </div>
        </div>
        <div class="file-actions">
          <button class="btn-file btn-accept" onclick="window.acceptFile()">Accept</button>
          <button class="btn-file btn-reject" onclick="window.rejectFile()">Reject</button>
        </div>
      </div>
    `;
  }

  function startFileTransfer() {
    const file = pendingFileData;
    if (!file) {
      showNotification('No file selected', 'error');
      return;
    }

    transferProgress.classList.remove('hidden');
    progressFilename.textContent = `Sending: ${file.name}`;
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    progressSize.textContent = `0 / ${formatFileSize(file.size)}`;
    progressSpeed.textContent = 'Sending...';

    sendFileData(file);
  }

  function sendFileData(file) {
    if (!file || !ws || ws.readyState !== WebSocket.OPEN) {
      showNotification('Connection not ready', 'error');
      return;
    }

    let offset = 0;
    const totalSize = file.size;
    const startTime = Date.now();
    let lastUpdate = startTime;
    let lastBytes = 0;
    let isTransferring = true;

    const chunkReader = new ChunkedFileReader(file, CHUNK_SIZE, (chunk, chunkIndex, totalChunks) => {
      if (!isTransferring) return;
      
      // Send chunk via WebSocket
      ws.send(JSON.stringify({
        type: 'file-chunk',
        chunk: Array.from(new Uint8Array(chunk)),
        offset: offset,
        totalSize: totalSize,
        fileName: file.name
      }));
      
      offset += chunk.byteLength;
      const progress = (offset / totalSize) * 100;
      
      progressBar.style.width = `${progress}%`;
      progressPercent.textContent = `${Math.round(progress)}%`;
      progressSize.textContent = `${formatFileSize(offset)} / ${formatFileSize(totalSize)}`;
      
      // Calculate speed
      const now = Date.now();
      const elapsed = (now - lastUpdate) / 1000;
      if (elapsed >= 1) {
        const bytesPerSecond = (offset - lastBytes) / elapsed;
        progressSpeed.textContent = formatSpeed(bytesPerSecond);
        lastUpdate = now;
        lastBytes = offset;
      }

      // Complete
      if (offset >= totalSize) {
        isTransferring = false;
        showNotification('File sent successfully!', 'success');
        pendingFileData = null;
        setTimeout(() => {
          transferProgress.classList.add('hidden');
          clearFileList();
        }, 2000);
      }
    });

    chunkReader.read();

    // Cancel button
    window.cancelTransfer = function() {
      isTransferring = false;
      showNotification('Transfer cancelled', 'error');
      transferProgress.classList.add('hidden');
    };
  }

  // Chunked file reader for large files
  class ChunkedFileReader {
    constructor(file, chunkSize, onChunk) {
      this.file = file;
      this.chunkSize = chunkSize;
      this.onChunk = onChunk;
      this.offset = 0;
    }

    read() {
      this.readNextChunk();
    }

    readNextChunk() {
      const slice = this.file.slice(this.offset, this.offset + this.chunkSize);
      const reader = new FileReader();
      
      reader.onload = (e) => {
        this.offset += this.chunkSize;
        const totalChunks = Math.ceil(this.file.size / this.chunkSize);
        const currentChunk = Math.floor(this.offset / this.chunkSize);
        
        this.onChunk(e.target.result, currentChunk, totalChunks);
        
        if (this.offset < this.file.size) {
          this.readNextChunk();
        }
      };
      
      reader.readAsArrayBuffer(slice);
    }
  }

  // Handle incoming file chunk
  function handleFileChunk(message) {
    if (!incomingFile) {
      incomingFile = {
        name: message.fileName,
        size: message.totalSize,
        chunks: [],
        totalReceived: 0
      };
      
      transferProgress.classList.remove('hidden');
      progressFilename.textContent = `Receiving: ${message.fileName}`;
      progressBar.style.width = '0%';
      progressPercent.textContent = '0%';
      progressSize.textContent = `0 / ${formatFileSize(message.totalSize)}`;
      progressSpeed.textContent = 'Receiving...';
    }
    
    // Store chunk
    const chunkData = new Uint8Array(message.chunk).buffer;
    incomingFile.chunks.push(chunkData);
    incomingFile.totalReceived += chunkData.byteLength;
    
    // Update progress
    const progress = (incomingFile.totalReceived / incomingFile.size) * 100;
    progressBar.style.width = `${progress}%`;
    progressPercent.textContent = `${Math.round(progress)}%`;
    progressSize.textContent = `${formatFileSize(incomingFile.totalReceived)} / ${formatFileSize(incomingFile.size)}`;
    
    // Complete
    if (incomingFile.totalReceived >= incomingFile.size) {
      // Combine chunks and download
      const blob = new Blob(incomingFile.chunks);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = incomingFile.name;
      a.click();
      URL.revokeObjectURL(url);
      
      showNotification('File received!', 'success');
      setTimeout(() => {
        transferProgress.classList.add('hidden');
      }, 2000);
      
      incomingFile = null;
    }
  }

  // Handle incoming file data (legacy)
  function handleDataChannelMessage(data) {
    // Legacy - not used anymore
  }

  // Send file request to peer
  let pendingFileData = null;

  function initiateFileTransfer(file) {
    // Store file data for later
    pendingFileData = file;
    
    ws.send(JSON.stringify({
      type: 'file-request',
      fileName: file.name,
      fileSize: file.size
    }));

    // Show waiting UI
    transferProgress.classList.remove('hidden');
    progressFilename.textContent = file.name;
    progressBar.style.width = '0%';
    progressPercent.textContent = 'Waiting...';
    progressSize.textContent = `0 / ${formatFileSize(file.size)}`;
    progressSpeed.textContent = 'Waiting for peer to accept...';
    
    showNotification(`Request sent: ${file.name}`, 'success');
  }

  // Accept/reject file functions (called from global scope)
  window.acceptFile = function() {
    if (!pendingFile) return;
    
    ws.send(JSON.stringify({
      type: 'file-accept',
      fileName: pendingFile.name
    }));

    // Show progress for receiving
    transferProgress.classList.remove('hidden');
    progressFilename.textContent = `Receiving: ${pendingFile.name}`;
    progressBar.style.width = '0%';
    progressPercent.textContent = 'Waiting...';
    progressSize.textContent = `0 / ${formatFileSize(pendingFile.size)}`;
    progressSpeed.textContent = 'Receiving...';
    
    // Clear the pending file UI
    pendingFile = null;
    clearFileList();
  };

  window.rejectFile = function() {
    if (!pendingFile) return;
    
    ws.send(JSON.stringify({
      type: 'file-reject',
      fileName: pendingFile.name
    }));

    pendingFile = null;
    clearFileList();
  };

  // Cancel transfer
  cancelTransferBtn.addEventListener('click', () => {
    if (fileReader) {
      // Cancel would require more complex implementation
    }
    
    transferProgress.classList.add('hidden');
    showNotification('Transfer cancelled', 'error');
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      initiateFileTransfer(files[0]);
    }
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      initiateFileTransfer(fileInput.files[0]);
    }
  });

  // Document editor events
  documentEditor.addEventListener('input', () => {
    if (!isRemoteUpdate) {
      sendDocumentUpdate();
    }
    updateCharCount();
  });

  // Save document to file
  saveDocBtn.addEventListener('click', () => {
    const content = documentEditor.value;
    if (!content) {
      showNotification('Nothing to save', 'error');
      return;
    }
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Document saved!', 'success');
  });

  // Update character count
  function updateCharCount() {
    const count = documentEditor.value.length;
    charCount.textContent = `${count} character${count !== 1 ? 's' : ''}`;
  }

  // Connection panel events
  createBtn.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'create-session' }));
      }, 500);
    } else {
      ws.send(JSON.stringify({ type: 'create-session' }));
    }
  });

  joinBtn.addEventListener('click', () => {
    const code = sessionCodeInput.value.trim();
    
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
      showNotification('Please enter a valid 6-digit code', 'error');
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'join-session', code: code }));
      }, 500);
    } else {
      ws.send(JSON.stringify({ type: 'join-session', code: code }));
    }
  });

  sessionCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinBtn.click();
    }
  });

  // Input validation - only allow numbers
  sessionCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  // Copy code
  copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(sessionCode).then(() => {
      showNotification('Code copied to clipboard!', 'success');
    }).catch(() => {
      showNotification('Failed to copy', 'error');
    });
  });

  // Update connection status
  function updateConnectionStatus(status) {
    connectionStatus.className = `status-dot status-${status}`;
    
    switch (status) {
      case 'connected':
        statusText.textContent = 'Connected';
        break;
      case 'connecting':
        statusText.textContent = 'Connecting...';
        break;
      case 'disconnected':
        statusText.textContent = 'Disconnected';
        break;
    }
  }

  // Clear file list
  function clearFileList() {
    fileList.innerHTML = '';
  }

  // Show notification
  function showNotification(text, type = 'info') {
    notificationText.textContent = text;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');
    
    setTimeout(() => {
      notification.classList.add('hidden');
    }, 3000);
  }

  // Format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Format speed
  function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond < 1024) {
      return Math.round(bytesPerSecond) + ' B/s';
    } else if (bytesPerSecond < 1024 * 1024) {
      return Math.round(bytesPerSecond / 1024) + ' KB/s';
    } else {
      return (bytesPerSecond / (1024 * 1024)).toFixed(2) + ' MB/s';
    }
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  connectWebSocket();

})();