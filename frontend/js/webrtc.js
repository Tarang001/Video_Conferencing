/**
 * WebRTC Module
 * Handles all WebRTC peer connections, media streams, and signaling.
 */

/**
 * Log available media devices and ensure that both camera and microphone exist
 * before attempting to access them.
 *
 * This is intentionally kept close to the core WebRTC logic so it always runs
 * before any getUserMedia calls.
 */

// STUN server configuration for NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

/**
 * WebRTC Manager Class
 * Manages peer connections and media streams for video conferencing.
 */
class WebRTCManager {
  constructor() {
    // Map of peer connections: socketId -> RTCPeerConnection
    this.peerConnections = new Map();
    
    // Map of remote streams: socketId -> MediaStream
    this.remoteStreams = new Map();
    
    // Local media stream
    this.localStream = null;
    
    // Audio and video state
    this.isAudioEnabled = true;
    this.isVideoEnabled = true;
    
    // Callbacks for UI updates
    this.onRemoteStreamAdded = null;
    this.onRemoteStreamRemoved = null;
    this.onConnectionStateChange = null;
    
    // Socket reference (set later)
    this.socket = null;
  }

  /**
   * Check for available audio/video devices using enumerateDevices.
   * Logs devices to the console and throws a descriptive error if
   * required devices are missing.
   *
   * @returns {Promise<void>}
   */
  async checkDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      const error = new Error('Media devices API not supported in this browser.');
      error.name = 'MediaDevicesNotSupportedError';
      throw error;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log('[WebRTC] Available media devices:', devices);

    const hasVideoInput = devices.some(d => d.kind === 'videoinput');
    const hasAudioInput = devices.some(d => d.kind === 'audioinput');

    if (!hasVideoInput && !hasAudioInput) {
      const error = new Error('No camera or microphone found.');
      error.name = 'NoDevicesError';
      throw error;
    }

    if (!hasVideoInput) {
      const error = new Error('No camera found.');
      error.name = 'NoVideoInputError';
      throw error;
    }

    if (!hasAudioInput) {
      const error = new Error('No microphone found.');
      error.name = 'NoAudioInputError';
      throw error;
    }
  }

  /**
   * Set socket reference for signaling
   * @param {Object} socket - Socket.IO socket instance
   */
  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Get user media (camera and microphone)
   * @returns {Promise<MediaStream>} - Local media stream
   */
  async getLocalStream() {
    try {
      // Request both audio and video
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.localStream = stream;
      console.log('[WebRTC] Got local stream');
      return stream;

    } catch (error) {
      console.error('[WebRTC] Failed to get local stream:', error);
      
      // Try to get at least audio if video fails
      if (error.name === 'NotAllowedError' || error.name === 'NotFoundError') {
        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
          });
          this.localStream = audioOnlyStream;
          this.isVideoEnabled = false;
          console.log('[WebRTC] Got audio-only stream');
          return audioOnlyStream;
        } catch (audioError) {
          console.error('[WebRTC] Failed to get audio stream:', audioError);
          throw audioError;
        }
      }
      
      throw error;
    }
  }

  /**
   * Create a new peer connection for a remote user
   * @param {string} remoteSocketId - Socket ID of the remote peer
   * @param {string} remoteUsername - Username of the remote peer
   * @returns {RTCPeerConnection} - The created peer connection
   */
  createPeerConnection(remoteSocketId, remoteUsername) {
    // Don't create duplicate connections
    if (this.peerConnections.has(remoteSocketId)) {
      console.log(`[WebRTC] Peer connection already exists for ${remoteSocketId}`);
      return this.peerConnections.get(remoteSocketId);
    }

    console.log(`[WebRTC] Creating peer connection for ${remoteUsername} (${remoteSocketId})`);

    const peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to the connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        console.log(`[WebRTC] Sending ICE candidate to ${remoteSocketId}`);
        this.socket.emit('ice-candidate', {
          targetSocketId: remoteSocketId,
          candidate: event.candidate
        });
      }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log(`[WebRTC] ICE connection state for ${remoteSocketId}: ${state}`);
      
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(remoteSocketId, state);
      }

      // Clean up on failed or disconnected
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        console.log(`[WebRTC] Connection ${state} for ${remoteSocketId}`);
      }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track from ${remoteSocketId}`);
      
      const remoteStream = event.streams[0];
      this.remoteStreams.set(remoteSocketId, remoteStream);
      
      if (this.onRemoteStreamAdded) {
        this.onRemoteStreamAdded(remoteSocketId, remoteStream, remoteUsername);
      }
    };

    // Store the connection
    this.peerConnections.set(remoteSocketId, peerConnection);

    return peerConnection;
  }

  /**
   * Create and send an offer to a remote peer
   * @param {string} remoteSocketId - Socket ID of the remote peer
   * @param {string} remoteUsername - Username of the remote peer
   */
  async createOffer(remoteSocketId, remoteUsername) {
    try {
      const peerConnection = this.createPeerConnection(remoteSocketId, remoteUsername);

      console.log(`[WebRTC] Creating offer for ${remoteSocketId}`);
      const offer = await peerConnection.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true
      });

      await peerConnection.setLocalDescription(offer);

      if (this.socket) {
        this.socket.emit('offer', {
          targetSocketId: remoteSocketId,
          offer: peerConnection.localDescription
        });
        console.log(`[WebRTC] Sent offer to ${remoteSocketId}`);
      }

    } catch (error) {
      console.error(`[WebRTC] Error creating offer for ${remoteSocketId}:`, error);
    }
  }

  /**
   * Handle incoming offer and send answer
   * @param {string} senderSocketId - Socket ID of the sender
   * @param {RTCSessionDescription} offer - The received offer
   * @param {string} senderUsername - Username of the sender
   */
  async handleOffer(senderSocketId, offer, senderUsername) {
    try {
      console.log(`[WebRTC] Handling offer from ${senderSocketId}`);
      
      const peerConnection = this.createPeerConnection(senderSocketId, senderUsername);

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (this.socket) {
        this.socket.emit('answer', {
          targetSocketId: senderSocketId,
          answer: peerConnection.localDescription
        });
        console.log(`[WebRTC] Sent answer to ${senderSocketId}`);
      }

    } catch (error) {
      console.error(`[WebRTC] Error handling offer from ${senderSocketId}:`, error);
    }
  }

  /**
   * Handle incoming answer
   * @param {string} senderSocketId - Socket ID of the sender
   * @param {RTCSessionDescription} answer - The received answer
   */
  async handleAnswer(senderSocketId, answer) {
    try {
      console.log(`[WebRTC] Handling answer from ${senderSocketId}`);
      
      const peerConnection = this.peerConnections.get(senderSocketId);
      if (!peerConnection) {
        console.error(`[WebRTC] No peer connection found for ${senderSocketId}`);
        return;
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`[WebRTC] Set remote description for ${senderSocketId}`);

    } catch (error) {
      console.error(`[WebRTC] Error handling answer from ${senderSocketId}:`, error);
    }
  }

  /**
   * Handle incoming ICE candidate
   * @param {string} senderSocketId - Socket ID of the sender
   * @param {RTCIceCandidate} candidate - The received ICE candidate
   */
  async handleIceCandidate(senderSocketId, candidate) {
    try {
      const peerConnection = this.peerConnections.get(senderSocketId);
      if (!peerConnection) {
        console.warn(`[WebRTC] No peer connection found for ${senderSocketId}`);
        return;
      }

      if (candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`[WebRTC] Added ICE candidate from ${senderSocketId}`);
      }

    } catch (error) {
      console.error(`[WebRTC] Error handling ICE candidate from ${senderSocketId}:`, error);
    }
  }

  /**
   * Close a specific peer connection
   * @param {string} socketId - Socket ID of the peer to disconnect
   */
  closePeerConnection(socketId) {
    const peerConnection = this.peerConnections.get(socketId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(socketId);
      console.log(`[WebRTC] Closed peer connection for ${socketId}`);
    }

    if (this.remoteStreams.has(socketId)) {
      this.remoteStreams.delete(socketId);
      
      if (this.onRemoteStreamRemoved) {
        this.onRemoteStreamRemoved(socketId);
      }
    }
  }

  /**
   * Close all peer connections
   */
  closeAllConnections() {
    console.log('[WebRTC] Closing all peer connections');
    
    this.peerConnections.forEach((pc, socketId) => {
      pc.close();
      if (this.onRemoteStreamRemoved) {
        this.onRemoteStreamRemoved(socketId);
      }
    });
    
    this.peerConnections.clear();
    this.remoteStreams.clear();
  }

  /**
   * Toggle local audio
   * @returns {boolean} - New audio state
   */
  toggleAudio() {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      this.isAudioEnabled = audioTracks.length > 0 ? audioTracks[0].enabled : false;
      console.log(`[WebRTC] Audio ${this.isAudioEnabled ? 'enabled' : 'disabled'}`);
    }
    return this.isAudioEnabled;
  }

  /**
   * Toggle local video
   * @returns {boolean} - New video state
   */
  toggleVideo() {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      this.isVideoEnabled = videoTracks.length > 0 ? videoTracks[0].enabled : false;
      console.log(`[WebRTC] Video ${this.isVideoEnabled ? 'enabled' : 'disabled'}`);
    }
    return this.isVideoEnabled;
  }

  /**
   * Stop local media stream
   */
  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
      console.log('[WebRTC] Stopped local stream');
    }
  }

  /**
   * Clean up all resources
   */
  cleanup() {
    this.closeAllConnections();
    this.stopLocalStream();
  }
}

// Create singleton instance
const webRTCManager = new WebRTCManager();

// Export for use in other modules
export { webRTCManager, WebRTCManager };
