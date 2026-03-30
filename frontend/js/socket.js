/**
 * Socket.IO Client Module
 * Handles all real-time communication with the signaling server.
 */

import { io } from 'socket.io-client';

/**
 * Socket Manager Class
 * Manages Socket.IO connection and event handling.
 */
class SocketManager {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.username = null;
    this.isConnected = false;

    // Callbacks for different events
    this.onConnected = null;
    this.onDisconnected = null;
    this.onError = null;
    this.onRoomUsers = null;
    this.onUserJoined = null;
    this.onUserLeft = null;
    this.onOffer = null;
    this.onAnswer = null;
    this.onIceCandidate = null;
    this.onChatMessage = null;
  }

  /**
   * Connect to the signaling server
   * @param {string} serverUrl - URL of the server (optional, defaults to current origin)
   * @returns {Promise<void>}
   */
  connect(serverUrl = null) {
    return new Promise((resolve, reject) => {
      // Use current origin if no URL provided (works with Vite proxy)
      const url = serverUrl || window.location.origin;
      
      console.log('[Socket] Connecting to:', url);

      this.socket = io(url, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000
      });

      // Connection established
      this.socket.on('connect', () => {
        console.log('[Socket] Connected:', this.socket.id);
        this.isConnected = true;
        
        if (this.onConnected) {
          this.onConnected(this.socket.id);
        }
        
        resolve();
      });

      // Connection error
      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
        
        if (this.onError) {
          this.onError('Failed to connect to server');
        }
        
        reject(error);
      });

      // Disconnected
      this.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        this.isConnected = false;
        
        if (this.onDisconnected) {
          this.onDisconnected(reason);
        }
      });

      // Room users received (after joining)
      this.socket.on('room-users', (data) => {
        console.log('[Socket] Room users:', data);
        
        // Update username if modified by server
        if (data.yourUsername) {
          this.username = data.yourUsername;
        }
        
        if (this.onRoomUsers) {
          this.onRoomUsers(data.users, data.roomId, data.yourUsername);
        }
      });

      // New user joined
      this.socket.on('user-joined', (data) => {
        console.log('[Socket] User joined:', data);
        
        if (this.onUserJoined) {
          this.onUserJoined(data.socketId, data.username);
        }
      });

      // User left
      this.socket.on('user-left', (data) => {
        console.log('[Socket] User left:', data);
        
        if (this.onUserLeft) {
          this.onUserLeft(data.socketId, data.username);
        }
      });

      // WebRTC offer received
      this.socket.on('offer', (data) => {
        console.log('[Socket] Received offer from:', data.senderSocketId);
        
        if (this.onOffer) {
          this.onOffer(data.senderSocketId, data.offer);
        }
      });

      // WebRTC answer received
      this.socket.on('answer', (data) => {
        console.log('[Socket] Received answer from:', data.senderSocketId);
        
        if (this.onAnswer) {
          this.onAnswer(data.senderSocketId, data.answer);
        }
      });

      // ICE candidate received
      this.socket.on('ice-candidate', (data) => {
        if (this.onIceCandidate) {
          this.onIceCandidate(data.senderSocketId, data.candidate);
        }
      });

      // Chat message received
      this.socket.on('chat-message', (data) => {
        console.log('[Socket] Chat message:', data);
        
        if (this.onChatMessage) {
          this.onChatMessage(data);
        }
      });

      // Error from server
      this.socket.on('error', (data) => {
        console.error('[Socket] Server error:', data);
        
        if (this.onError) {
          this.onError(data.message || 'Server error');
        }
      });

      // Set connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 20000);
    });
  }

  /**
   * Join a room
   * @param {string} roomId - Room ID to join
   * @param {string} username - Username to use
   */
  joinRoom(roomId, username) {
    if (!this.socket || !this.isConnected) {
      console.error('[Socket] Not connected');
      return;
    }

    this.roomId = roomId;
    this.username = username;

    console.log(`[Socket] Joining room ${roomId} as ${username}`);
    
    this.socket.emit('join-room', {
      roomId: roomId,
      username: username
    });
  }

  /**
   * Leave the current room
   */
  leaveRoom() {
    if (!this.socket || !this.roomId) {
      return;
    }

    console.log(`[Socket] Leaving room ${this.roomId}`);
    
    this.socket.emit('leave-room', {
      roomId: this.roomId
    });

    this.roomId = null;
  }

  /**
   * Send a chat message
   * @param {string} message - Message content
   */
  sendChatMessage(message) {
    if (!this.socket || !this.roomId) {
      console.error('[Socket] Cannot send message: not in a room');
      return;
    }

    this.socket.emit('chat-message', {
      roomId: this.roomId,
      message: message,
      timestamp: Date.now()
    });
  }

  /**
   * Emit a custom event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  /**
   * Get the socket ID
   * @returns {string|null} - Socket ID or null if not connected
   */
  getSocketId() {
    return this.socket ? this.socket.id : null;
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this.leaveRoom();
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('[Socket] Disconnected');
    }
  }
}

// Create singleton instance
const socketManager = new SocketManager();

// Export for use in other modules
export { socketManager, SocketManager };
