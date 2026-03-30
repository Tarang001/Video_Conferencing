"""
HTTP routes for the video conferencing application.
Provides REST endpoints for room management and health checks.
"""

from flask import Blueprint, jsonify, request

# Create blueprint for API routes
api = Blueprint('api', __name__)

# In-memory storage for rooms and users (shared with sockets module)
# This will be imported from the main app module
rooms = {}


def get_rooms():
    """Get the rooms dictionary from the main app module."""
    from . import rooms as app_rooms
    return app_rooms


@api.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint.
    Returns the status of the server and active room count.
    """
    rooms = get_rooms()
    return jsonify({
        'status': 'healthy',
        'message': 'Video conferencing server is running',
        'active_rooms': len(rooms)
    })


@api.route('/rooms', methods=['GET'])
def list_rooms():
    """
    List all active rooms with participant counts.
    Useful for debugging and monitoring.
    """
    rooms = get_rooms()
    room_list = []
    for room_id, users in rooms.items():
        room_list.append({
            'room_id': room_id,
            'participant_count': len(users),
            'participants': list(users.keys())
        })
    return jsonify({'rooms': room_list})


@api.route('/rooms/<room_id>', methods=['GET'])
def get_room(room_id):
    """
    Get details of a specific room.
    Returns participant list or 404 if room doesn't exist.
    """
    rooms = get_rooms()
    if room_id not in rooms:
        return jsonify({
            'error': 'Room not found',
            'room_id': room_id
        }), 404
    
    users = rooms[room_id]
    return jsonify({
        'room_id': room_id,
        'participant_count': len(users),
        'participants': [
            {'socket_id': sid, 'username': username}
            for sid, username in users.items()
        ]
    })


@api.route('/rooms/<room_id>/validate', methods=['POST'])
def validate_join(room_id):
    """
    Validate if a user can join a room.
    Checks for duplicate usernames and adds suffix if needed.
    """
    rooms = get_rooms()
    data = request.get_json() or {}
    username = data.get('username', 'Anonymous')
    
    # Check if room exists
    if room_id not in rooms:
        return jsonify({
            'valid': True,
            'username': username,
            'message': 'Room will be created'
        })
    
    # Check for duplicate usernames and add suffix if needed
    existing_usernames = list(rooms[room_id].values())
    original_username = username
    counter = 1
    
    while username in existing_usernames:
        username = f"{original_username}_{counter}"
        counter += 1
    
    return jsonify({
        'valid': True,
        'username': username,
        'modified': username != original_username,
        'message': f'Username modified to {username}' if username != original_username else 'Username available'
    })
