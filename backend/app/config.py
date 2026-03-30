"""
Configuration settings for the Flask application.
Contains all configurable parameters for the video conferencing backend.
"""

import os


class Config:
    """Base configuration class."""
    
    # Flask settings
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    # CORS settings - allow all origins for development
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*')
    
    # Socket.IO settings
    SOCKETIO_CORS_ALLOWED_ORIGINS = '*'
    SOCKETIO_ASYNC_MODE = 'eventlet'


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False


# Configuration dictionary for easy access
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
