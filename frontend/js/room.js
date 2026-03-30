/**
 * Room Page Controller
 * Orchestrates WebRTC, Socket.IO, and UI components for the video room.
 */

import { socketManager } from './socket.js';
import { webRTCManager } from './webrtc.js';

// ===== DOM Elements =====
const connectingOverlay = document.getElementById('connecting-overlay');
const connectingStatus = document.getElementById('connecting-status');
const roomIdDisplay = document.getElementById('room-id-display');
const participantNumber = document.getElementById('participant-number');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const videoGrid = document.getElementById('video-grid');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const closeChatBtn = document.getElementById('close-chat');
const toggleAudioBtn = document.getElementById('toggle-audio');
const toggleVideoBtn = document.getElementById('toggle-video');
const toggleChatBtn = document.getElementById('toggle-chat');
const leaveRoomBtn = document.getElementById('leave-room');

// Icons
const micOnIcon = document.getElementById('mic-on-icon');
const micOffIcon = document.getElementById('mic-off-icon');
const videoOnIcon = document.getElementById('video-on-icon');
const videoOffIcon = document.getElementById('video-off-icon');

// ===== State =====
let roomId = null;
let username = null;
let mySocketId = null;
let participants = new Map(); // socketId -> { username, hasVideo, hasAudio }

// ===== Initialization =====

/**
 * Initialize the room page
 */
async function init() {
  // Get room ID and username from session storage or URL
  const urlParams = new URLSearchParams(window.location.search);
  roomId = urlParams.get('room') || sessionStorage.getItem('roomId');
  username = sessionStorage.getItem('username') || 'Anonymous';

  if (!roomId) {
    showError('No room ID provided');
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
    return;
  }

  // Update UI
  roomIdDisplay.textContent = `Room: ${roomId}`;
  document.title = `Video Conference - ${roomId}`;

  try {
    // Step 1: Detect devices before requesting permissions
    updateConnectingStatus('Checking camera and microphone...');
    await webRTCManager.checkDevices();

    // Step 2: Get local media stream
    updateConnectingStatus('Accessing camera and microphone...');
    await webRTCManager.getLocalStream();

    // Step 3: Connect to signaling server
    updateConnectingStatus('Connecting to server...');
    await socketManager.connect();

    // Step 4: Set up event handlers
    setupSocketHandlers();
    setupWebRTCHandlers();
    setupUIHandlers();

    // Step 5: Add local video tile
    addLocalVideoTile();

    // Step 6: Join the room
    updateConnectingStatus('Joining room...');
    socketManager.joinRoom(roomId, username);

    // Hide overlay after short delay
    setTimeout(() => {
      hideConnectingOverlay();
    }, 500);

  } catch (error) {
    console.error('[Room] Initialization error:', error);
    showError(getErrorMessage(error));
  }
}

/**
 * Get user-friendly error message
 * @param {Error} error - The error object
 * @returns {string} - User-friendly message
 */
function getErrorMessage(error) {
  if (error.name === 'NotAllowedError') {
    return 'Camera / microphone permission denied. Please allow access in your browser and refresh.';
  }
  if (error.name === 'NotFoundError') {
    return 'No camera or microphone found.';
  }
  if (error.name === 'NotReadableError') {
    return 'Camera or microphone is already in use by another application.';
  }
  if (error.name === 'NoDevicesError') {
    return 'No camera or microphone found on this device.';
  }
  if (error.name === 'NoVideoInputError') {
    return 'No camera found. Please connect a camera and try again.';
  }
  if (error.name === 'NoAudioInputError') {
    return 'No microphone found. Please connect a microphone and try again.';
  }
  if (error.name === 'MediaDevicesNotSupportedError') {
    return 'Your browser does not support camera / microphone access.';
  }
  if (error.message === 'Connection timeout') {
    return 'Could not connect to server. Please try again.';
  }
  return error.message || 'An error occurred';
}

// ===== Socket Event Handlers =====

function setupSocketHandlers() {
  // Store socket reference in WebRTC manager
  webRTCManager.setSocket(socketManager.socket);

  socketManager.onConnected = (socketId) => {
    mySocketId = socketId;
    updateConnectionStatus('connected');
  };

  socketManager.onDisconnected = (reason) => {
    updateConnectionStatus('disconnected');
    if (reason === 'io server disconnect') {
      showError('Disconnected by server');
    }
  };

  socketManager.onError = (message) => {
    console.error('[Room] Socket error:', message);
  };

  // Received list of existing users in room
  socketManager.onRoomUsers = (users, roomIdFromServer, yourUsername) => {
    console.log('[Room] Existing users:', users);
    
    // Update username if modified
    if (yourUsername) {
      username = yourUsername;
    }

    // Create peer connections for existing users
    users.forEach(user => {
      participants.set(user.socketId, {
        username: user.username,
        hasVideo: true,
        hasAudio: true
      });

      // Send offer to each existing user
      webRTCManager.createOffer(user.socketId, user.username);
    });

    updateParticipantCount();
  };

  // New user joined
  socketManager.onUserJoined = (socketId, joinedUsername) => {
    console.log('[Room] User joined:', joinedUsername);
    
    participants.set(socketId, {
      username: joinedUsername,
      hasVideo: true,
      hasAudio: true
    });

    // Add notification to chat
    addChatNotification(`${joinedUsername} joined the room`);
    
    updateParticipantCount();
  };

  // User left
  socketManager.onUserLeft = (socketId, leftUsername) => {
    console.log('[Room] User left:', leftUsername);
    
    participants.delete(socketId);
    webRTCManager.closePeerConnection(socketId);
    removeVideoTile(socketId);
    
    // Add notification to chat
    addChatNotification(`${leftUsername} left the room`);
    
    updateParticipantCount();
  };

  // Handle incoming WebRTC offer
  socketManager.onOffer = (senderSocketId, offer) => {
    const senderInfo = participants.get(senderSocketId);
    const senderUsername = senderInfo ? senderInfo.username : 'Unknown';
    webRTCManager.handleOffer(senderSocketId, offer, senderUsername);
  };

  // Handle incoming WebRTC answer
  socketManager.onAnswer = (senderSocketId, answer) => {
    webRTCManager.handleAnswer(senderSocketId, answer);
  };

  // Handle incoming ICE candidate
  socketManager.onIceCandidate = (senderSocketId, candidate) => {
    webRTCManager.handleIceCandidate(senderSocketId, candidate);
  };

  // Handle chat message
  socketManager.onChatMessage = (data) => {
    const isOwnMessage = data.senderSocketId === mySocketId;
    addChatMessage(data.username, data.message, data.timestamp, isOwnMessage);
  };
}

// ===== WebRTC Event Handlers =====

function setupWebRTCHandlers() {
  // Remote stream added
  webRTCManager.onRemoteStreamAdded = (socketId, stream, remoteUsername) => {
    console.log('[Room] Remote stream added:', socketId);
    addRemoteVideoTile(socketId, stream, remoteUsername);
  };

  // Remote stream removed
  webRTCManager.onRemoteStreamRemoved = (socketId) => {
    console.log('[Room] Remote stream removed:', socketId);
    removeVideoTile(socketId);
  };

  // Connection state changed
  webRTCManager.onConnectionStateChange = (socketId, state) => {
    if (state === 'failed') {
      const participant = participants.get(socketId);
      if (participant) {
        console.log(`[Room] Connection failed with ${participant.username}`);
      }
    }
  };
}

// ===== UI Event Handlers =====

function setupUIHandlers() {
  // Toggle audio
  toggleAudioBtn.addEventListener('click', () => {
    const isEnabled = webRTCManager.toggleAudio();
    updateAudioUI(isEnabled);
  });

  // Toggle video
  toggleVideoBtn.addEventListener('click', () => {
    const isEnabled = webRTCManager.toggleVideo();
    updateVideoUI(isEnabled);
    updateLocalVideoVisibility(isEnabled);
  });

  // Toggle chat
  toggleChatBtn.addEventListener('click', () => {
    chatPanel.classList.toggle('hidden');
    if (!chatPanel.classList.contains('hidden')) {
      chatInput.focus();
    }
    updateVideoGridLayout();
  });

  // Close chat
  closeChatBtn.addEventListener('click', () => {
    chatPanel.classList.add('hidden');
    updateVideoGridLayout();
  });

  // Send chat message
  sendMessageBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });

  // Leave room
  leaveRoomBtn.addEventListener('click', leaveRoom);

  // Handle page unload
  window.addEventListener('beforeunload', cleanup);
}

// ===== Video Tile Management =====

/**
 * Add local video tile
 */
function addLocalVideoTile() {
  const tile = createVideoTile('local', username, true);
  const video = tile.querySelector('video');
  
  if (webRTCManager.localStream) {
    video.srcObject = webRTCManager.localStream;
    video.muted = true; // Mute local video to prevent echo
    video.play().catch(console.error);
  }
  
  videoGrid.insertBefore(tile, videoGrid.firstChild);
  updateVideoGridLayout();
}

/**
 * Add remote video tile
 * @param {string} socketId - Socket ID of remote peer
 * @param {MediaStream} stream - Remote media stream
 * @param {string} remoteUsername - Username of remote peer
 */
function addRemoteVideoTile(socketId, stream, remoteUsername) {
  // Check if tile already exists
  if (document.getElementById(`video-tile-${socketId}`)) {
    // Update existing tile
    const video = document.querySelector(`#video-tile-${socketId} video`);
    if (video) {
      video.srcObject = stream;
    }
    return;
  }

  const tile = createVideoTile(socketId, remoteUsername || 'Unknown', false);
  const video = tile.querySelector('video');
  
  video.srcObject = stream;
  video.play().catch(console.error);
  
  videoGrid.appendChild(tile);
  updateVideoGridLayout();
}

/**
 * Create a video tile element
 * @param {string} id - Tile ID (socket ID or 'local')
 * @param {string} displayName - Name to display
 * @param {boolean} isLocal - Whether this is the local user
 * @returns {HTMLElement} - Video tile element
 */
function createVideoTile(id, displayName, isLocal) {
  const tile = document.createElement('div');
  tile.id = `video-tile-${id}`;
  tile.className = `video-tile ${isLocal ? 'local' : ''}`;
  
  tile.innerHTML = `
    <video autoplay playsinline ${isLocal ? 'muted' : ''}></video>
    <div class="no-video-placeholder" style="display: none;">
      <div class="avatar">${displayName.charAt(0).toUpperCase()}</div>
      <span>${displayName}</span>
    </div>
    <div class="video-tile-info">
      <span class="video-tile-name">
        ${displayName}
        ${isLocal ? '<span class="you-badge">You</span>' : ''}
      </span>
      <div class="video-tile-status">
        <svg class="mic-status" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
    </div>
  `;
  
  return tile;
}

/**
 * Remove a video tile
 * @param {string} socketId - Socket ID of the tile to remove
 */
function removeVideoTile(socketId) {
  const tile = document.getElementById(`video-tile-${socketId}`);
  if (tile) {
    tile.remove();
    updateVideoGridLayout();
  }
}

/**
 * Update local video visibility based on video enabled state
 * @param {boolean} isEnabled - Whether video is enabled
 */
function updateLocalVideoVisibility(isEnabled) {
  const tile = document.getElementById('video-tile-local');
  if (tile) {
    const video = tile.querySelector('video');
    const placeholder = tile.querySelector('.no-video-placeholder');
    
    if (isEnabled) {
      video.style.display = 'block';
      placeholder.style.display = 'none';
      tile.classList.remove('no-video');
    } else {
      video.style.display = 'none';
      placeholder.style.display = 'flex';
      tile.classList.add('no-video');
    }
  }
}

/**
 * Update video grid layout based on participant count
 */
function updateVideoGridLayout() {
  const tileCount = videoGrid.children.length;
  
  // Remove all grid classes
  videoGrid.classList.remove('grid-1', 'grid-2', 'grid-3', 'grid-4', 'grid-5', 'grid-6', 'grid-many');
  
  // Add appropriate class
  if (tileCount <= 1) {
    videoGrid.classList.add('grid-1');
  } else if (tileCount === 2) {
    videoGrid.classList.add('grid-2');
  } else if (tileCount <= 4) {
    videoGrid.classList.add('grid-4');
  } else if (tileCount <= 6) {
    videoGrid.classList.add('grid-6');
  } else {
    videoGrid.classList.add('grid-many');
  }
}

// ===== Chat Functions =====

/**
 * Send a chat message
 */
function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  
  socketManager.sendChatMessage(message);
  chatInput.value = '';
  chatInput.focus();
}

/**
 * Add a chat message to the chat panel
 * @param {string} sender - Sender's name
 * @param {string} message - Message content
 * @param {number} timestamp - Message timestamp
 * @param {boolean} isOwn - Whether this is the user's own message
 */
function addChatMessage(sender, message, timestamp, isOwn) {
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${isOwn ? 'own' : ''}`;
  
  const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  
  messageEl.innerHTML = `
    <div class="chat-message-header">
      <span class="chat-message-sender">${isOwn ? 'You' : sender}</span>
      <span class="chat-message-time">${time}</span>
    </div>
    <div class="chat-message-content">${escapeHtml(message)}</div>
  `;
  
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Add a notification to the chat
 * @param {string} message - Notification message
 */
function addChatNotification(message) {
  const notificationEl = document.createElement('div');
  notificationEl.className = 'chat-notification';
  notificationEl.textContent = message;
  
  chatMessages.appendChild(notificationEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== UI Update Functions =====

/**
 * Update audio button UI
 * @param {boolean} isEnabled - Whether audio is enabled
 */
function updateAudioUI(isEnabled) {
  if (isEnabled) {
    micOnIcon.style.display = 'block';
    micOffIcon.style.display = 'none';
    toggleAudioBtn.classList.remove('active');
  } else {
    micOnIcon.style.display = 'none';
    micOffIcon.style.display = 'block';
    toggleAudioBtn.classList.add('active');
  }
}

/**
 * Update video button UI
 * @param {boolean} isEnabled - Whether video is enabled
 */
function updateVideoUI(isEnabled) {
  if (isEnabled) {
    videoOnIcon.style.display = 'block';
    videoOffIcon.style.display = 'none';
    toggleVideoBtn.classList.remove('active');
  } else {
    videoOnIcon.style.display = 'none';
    videoOffIcon.style.display = 'block';
    toggleVideoBtn.classList.add('active');
  }
}

/**
 * Update connection status indicator
 * @param {string} status - Status: 'connecting', 'connected', 'disconnected', 'error'
 */
function updateConnectionStatus(status) {
  statusDot.classList.remove('connected', 'error');
  
  switch (status) {
    case 'connected':
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected';
      break;
    case 'disconnected':
      statusText.textContent = 'Disconnected';
      break;
    case 'error':
      statusDot.classList.add('error');
      statusText.textContent = 'Error';
      break;
    default:
      statusText.textContent = 'Connecting';
  }
}

/**
 * Update participant count
 */
function updateParticipantCount() {
  // +1 for self
  const count = participants.size + 1;
  participantNumber.textContent = count;
}

/**
 * Update connecting overlay status
 * @param {string} message - Status message
 */
function updateConnectingStatus(message) {
  connectingStatus.textContent = message;
}

/**
 * Hide connecting overlay
 */
function hideConnectingOverlay() {
  connectingOverlay.classList.add('hidden');
}

/**
 * Show error in connecting overlay
 * @param {string} message - Error message
 */
function showError(message) {
  connectingStatus.textContent = message;
  connectingStatus.style.color = '#ef4444';
}

// ===== Cleanup =====

/**
 * Leave the room
 */
function leaveRoom() {
  cleanup();
  window.location.href = '/';
}

/**
 * Clean up all resources
 */
function cleanup() {
  socketManager.disconnect();
  webRTCManager.cleanup();
}

// ===== Start =====

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
