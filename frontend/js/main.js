/**
 * Main Entry Point JavaScript
 * Handles the join form and navigation to the room page.
 */

// DOM Elements
const joinForm = document.getElementById('join-form');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const errorMessage = document.getElementById('error-message');

/**
 * Show error message to user
 * @param {string} message - Error message to display
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('show');
}

/**
 * Hide error message
 */
function hideError() {
  errorMessage.classList.remove('show');
}

/**
 * Validate room ID format
 * @param {string} roomId - Room ID to validate
 * @returns {boolean} - True if valid
 */
function isValidRoomId(roomId) {
  // Only allow alphanumeric, hyphens, and underscores
  const pattern = /^[a-zA-Z0-9_-]+$/;
  return pattern.test(roomId) && roomId.length >= 3 && roomId.length <= 50;
}

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {boolean} - True if valid
 */
function isValidUsername(username) {
  return username.trim().length >= 2 && username.trim().length <= 30;
}

/**
 * Handle form submission
 * @param {Event} event - Submit event
 */
async function handleJoinSubmit(event) {
  event.preventDefault();
  hideError();

  const username = usernameInput.value.trim();
  const roomId = roomIdInput.value.trim();

  // Client-side validation
  if (!isValidUsername(username)) {
    showError('Username must be between 2 and 30 characters.');
    usernameInput.focus();
    return;
  }

  if (!isValidRoomId(roomId)) {
    showError('Room ID must be 3-50 characters and contain only letters, numbers, hyphens, or underscores.');
    roomIdInput.focus();
    return;
  }

  try {
    // Validate with server (optional - handles duplicate usernames)
    const response = await fetch(`/api/rooms/${roomId}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username })
    });

    if (!response.ok) {
      throw new Error('Server validation failed');
    }

    const data = await response.json();
    const finalUsername = data.username || username;

    // Store user data in sessionStorage for the room page
    sessionStorage.setItem('username', finalUsername);
    sessionStorage.setItem('roomId', roomId);

    // Navigate to room page
    window.location.href = `/room.html?room=${encodeURIComponent(roomId)}`;
    
  } catch (error) {
    console.error('Join error:', error);
    // If server validation fails, proceed anyway (server might be starting up)
    sessionStorage.setItem('username', username);
    sessionStorage.setItem('roomId', roomId);
    window.location.href = `/room.html?room=${encodeURIComponent(roomId)}`;
  }
}

/**
 * Generate a random room ID
 * @returns {string} - Random room ID
 */
function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Initialize the page
 */
function init() {
  // Focus on username input
  usernameInput.focus();

  // Check if we have a room ID in URL params
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room');
  
  if (roomFromUrl && isValidRoomId(roomFromUrl)) {
    roomIdInput.value = roomFromUrl;
    usernameInput.focus();
  }

  // Restore username if available
  const savedUsername = sessionStorage.getItem('username');
  if (savedUsername) {
    usernameInput.value = savedUsername;
    if (!roomFromUrl) {
      roomIdInput.focus();
    }
  }

  // Add form submit handler
  joinForm.addEventListener('submit', handleJoinSubmit);

  // Clear error on input
  usernameInput.addEventListener('input', hideError);
  roomIdInput.addEventListener('input', hideError);

  // Generate room ID hint on double-click
  roomIdInput.addEventListener('dblclick', () => {
    if (!roomIdInput.value) {
      roomIdInput.value = generateRoomId();
    }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
