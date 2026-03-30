"""
Development server entry point.
Run this file to start the Flask development server with Socket.IO support.

Usage:
    python run.py
    
Or with uv:
    uv run run.py
"""

from app import create_app, socketio

if __name__ == '__main__':
    app = create_app('development')
    
    print('=' * 50)
    print('Video Conferencing Server')
    print('=' * 50)
    print('Starting server on http://localhost:5000')
    print('Socket.IO endpoint: ws://localhost:5000/socket.io')
    print('=' * 50)
    
    # Run with Socket.IO (uses eventlet for async support)
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=True,
        allow_unsafe_werkzeug=True
    )
