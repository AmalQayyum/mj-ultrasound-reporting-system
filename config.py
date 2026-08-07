import os
from dotenv import load_dotenv

# Store any pre-existing DATABASE_URL from system environment before loading dotenv files
system_db_url = os.getenv('DATABASE_URL')

# Determine current environment (default to 'development')
FLASK_ENV = os.getenv('FLASK_ENV', os.getenv('NODE_ENV', 'development')).lower()

# Load environment-specific file if present (.env.production or .env.development)
if FLASK_ENV == 'production':
    if os.path.exists('.env.production'):
        load_dotenv('.env.production')
elif os.path.exists('.env.development'):
    load_dotenv('.env.development')

# Fallback to standard .env file if present
load_dotenv()

if system_db_url:
    os.environ['DATABASE_URL'] = system_db_url

class Config:
    """Base Configuration class containing shared app settings."""
    SECRET_KEY = os.getenv('SECRET_KEY', 'mj-ultrasound-reporting-system-secret-key-1951')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Configure session cookies for iframe/cross-origin preview compatibility
    SESSION_COOKIE_SAMESITE = 'None'
    SESSION_COOKIE_SECURE = True

    # Database connection string from environment
    DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///mj_ultrasound_reporting_system_dev.db')
    if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URI = DATABASE_URL

class DevelopmentConfig(Config):
    """Development Environment Configuration."""
    DEBUG = True
    TESTING = False
    FLASK_ENV = 'development'
    
    # Development Database fallback if DATABASE_URL is not provided
    DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///mj_ultrasound_reporting_system_dev.db')
    if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URI = DATABASE_URL

class ProductionConfig(Config):
    """Production Environment Configuration."""
    DEBUG = False
    TESTING = False
    FLASK_ENV = 'production'
    
    # Production Database from environment (defaulting to PostgreSQL or production SQLite instance)
    DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///mj_ultrasound_reporting_system_prod.db')
    if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URI = DATABASE_URL

# Mapping of environment names to config classes
config_by_name = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

def get_config():
    """Retrieve the active configuration class based on FLASK_ENV environment variable."""
    env_name = os.getenv('FLASK_ENV', 'development').lower()
    return config_by_name.get(env_name, DevelopmentConfig)
