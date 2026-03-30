"""
Socket.IO event handlers for WebRTC signaling and chat.
Handles all real-time communication between peers.
"""

from flask_socketio import emit, join_room, leave_room


def register_socket_events(socketio, rooms):
    """
    Register all Socket.IO event handlers.
    
    Args:
        socketio: The Flask-SocketIO instance
        rooms: Dictionary storing room-user mappings
    """
    
    @socketio.on('connect')
    def handle_connect():
        """Handle new socket connection."""
        from flask import request
        sid = request.sid
        print(f'[Socket] Client connected: {sid}')
        emit('connected', {'message': 'Connected to signaling server'})
    
    @socketio.on('disconnect')
    def handle_disconnect():
        """
        Handle socket disconnection.
        Removes user from all rooms and notifies other participants.
        """
        from flask import request
        sid = request.sid
        print(f'[Socket] Client disconnected: {sid}')
        
        # Find and remove user from any room they were in
        rooms_to_cleanup = []
        for room_id, users in rooms.items():
            if sid in users:
                username = users[sid]
                del users[sid]
                
                # Notify other users in the room
                emit('user-left', {
                    'socketId': sid,
                    'username': username,
                    'message': f'{username} left the room'
                }, room=room_id)
                
                # Mark empty rooms for cleanup
                if len(users) == 0:
                    rooms_to_cleanup.append(room_id)
        
        # Clean up empty rooms
        for room_id in rooms_to_cleanup:
            del rooms[room_id]
            print(f'[Socket] Room {room_id} cleaned up (empty)')
    
    @socketio.on('join-room')
    def handle_join_room(data):
        """
        Handle user joining a room.
        Creates room if it doesn't exist, notifies existing users.
        
        Expected data:
            - roomId: string - The room to join
            - username: string - The user's display name
        """
        from flask import request
        sid = request.sid
        room_id = data.get('roomId')
        username = data.get('username', 'Anonymous')
        
        if not room_id:
            emit('error', {'message': 'Room ID is required'})
            return
        
        print(f'[Socket] {username} ({sid}) joining room: {room_id}')
        
        # Create room if it doesn't exist
        if room_id not in rooms:
            rooms[room_id] = {}
            print(f'[Socket] Created new room: {room_id}')
        
        # Handle duplicate usernames
        existing_usernames = list(rooms[room_id].values())
        original_username = username
        counter = 1
        while username in existing_usernames:
            username = f"{original_username}_{counter}"
            counter += 1
        
        # Get list of existing users before adding new user
        existing_users = [
            {'socketId': user_sid, 'username': user_name}
            for user_sid, user_name in rooms[room_id].items()
        ]
        
        # Add user to room
        rooms[room_id][sid] = username
        join_room(room_id)
        
        # Send existing users to the new user
        emit('room-users', {
            'users': existing_users,
            'roomId': room_id,
            'yourUsername': username
        })
        
        # Notify existing users about the new user
        emit('user-joined', {
            'socketId': sid,
            'username': username,
            'message': f'{username} joined the room'
        }, room=room_id, include_self=False)
        
        print(f'[Socket] Room {room_id} now has {len(rooms[room_id])} users')
    
    @socketio.on('leave-room')
    def handle_leave_room(data):
        """
        Handle user voluntarily leaving a room.
        
        Expected data:
            - roomId: string - The room to leave
        """
        from flask import request
        sid = request.sid
        room_id = data.get('roomId')
        
        if not room_id or room_id not in rooms:
            return
        
        if sid in rooms[room_id]:
            username = rooms[room_id][sid]
            del rooms[room_id][sid]
            leave_room(room_id)
            
            # Notify others
            emit('user-left', {
                'socketId': sid,
                'username': username,
                'message': f'{username} left the room'
            }, room=room_id)
            
            print(f'[Socket] {username} left room {room_id}')
            
            # Cleanup empty room
            if len(rooms[room_id]) == 0:
                del rooms[room_id]
                print(f'[Socket] Room {room_id} cleaned up (empty)')
    
    @socketio.on('offer')
    def handle_offer(data):
        """
        Relay WebRTC offer to target peer.
        
        Expected data:
            - targetSocketId: string - The recipient's socket ID
            - offer: RTCSessionDescription - The WebRTC offer
        """
        from flask import request
        sid = request.sid
        target_sid = data.get('targetSocketId')
        offer = data.get('offer')
        
        if not target_sid or not offer:
            emit('error', {'message': 'Invalid offer data'})
            return
        
        print(f'[Socket] Relaying offer from {sid} to {target_sid}')
        
        emit('offer', {
            'senderSocketId': sid,
            'offer': offer
        }, room=target_sid)
    
    @socketio.on('answer')
    def handle_answer(data):
        """
        Relay WebRTC answer to target peer.
        
        Expected data:
            - targetSocketId: string - The recipient's socket ID
            - answer: RTCSessionDescription - The WebRTC answer
        """
        from flask import request
        sid = request.sid
        target_sid = data.get('targetSocketId')
        answer = data.get('answer')
        
        if not target_sid or not answer:
            emit('error', {'message': 'Invalid answer data'})
            return
        
        print(f'[Socket] Relaying answer from {sid} to {target_sid}')
        
        emit('answer', {
            'senderSocketId': sid,
            'answer': answer
        }, room=target_sid)
    
    @socketio.on('ice-candidate')
    def handle_ice_candidate(data):
        """
        Relay ICE candidate to target peer.
        
        Expected data:
            - targetSocketId: string - The recipient's socket ID
            - candidate: RTCIceCandidate - The ICE candidate
        """
        from flask import request
        sid = request.sid
        target_sid = data.get('targetSocketId')
        candidate = data.get('candidate')
        
        if not target_sid:
            return
        
        emit('ice-candidate', {
            'senderSocketId': sid,
            'candidate': candidate
        }, room=target_sid)
    
    @socketio.on('chat-message')
    def handle_chat_message(data):
        """
        Broadcast chat message to room.
        
        Expected data:
            - roomId: string - The room to broadcast to
            - message: string - The chat message
        """
        from flask import request
        sid = request.sid
        room_id = data.get('roomId')
        message = data.get('message', '')
        
        if not room_id or not message:
            return
        
        # Get username from room data
        username = 'Anonymous'
        if room_id in rooms and sid in rooms[room_id]:
            username = rooms[room_id][sid]
        
        # Broadcast message to room
        emit('chat-message', {
            'senderSocketId': sid,
            'username': username,
            'message': message,
            'timestamp': data.get('timestamp')
        }, room=room_id)
        
        print(f'[Socket] Chat in {room_id}: {username}: {message[:50]}...')
