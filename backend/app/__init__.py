"""
Flask application factory and initialization.
Sets up the Flask app with Socket.IO for real-time communication.
"""

import os
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS

from .config import config
from .routes import api
from .sockets import register_socket_events

# In-memory storage for rooms
# Structure: { room_id: { socket_id: username, ... }, ... }
rooms = {}

# Initialize Socket.IO with CORS support
socketio = SocketIO(cors_allowed_origins='*', async_mode='eventlet')


def create_app(config_name=None):
    """
    Application factory function.
    Creates and configures the Flask application.
    
    Args:
        config_name: Configuration to use ('development', 'production', or 'default')
    
    Returns:
        Configured Flask application instance
    """
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Initialize CORS
    CORS(app, origins='*', supports_credentials=True)
    
    # Register blueprints
    app.register_blueprint(api)
    
    # Initialize Socket.IO with the app
    socketio.init_app(app)
    
    # Register socket event handlers
    register_socket_events(socketio, rooms)
    
    @app.route('/')
    def index():
        """Root endpoint for API."""
        return {
            'name': 'Video Conferencing API',
            'version': '1.0.0',
            'endpoints': {
                'health': '/health',
                'rooms': '/rooms',
                'room': '/rooms/<room_id>',
                'socket': 'wss://your-domain/socket.io'
            }
        }
    
    return app


# Create the application instance for Vercel
app = create_app()

# Export for Vercel serverless functions
# Note: Socket.IO may have limited functionality in serverless environment
# For full WebSocket support, consider deploying on a traditional server
