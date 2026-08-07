import os
import datetime
from flask import Flask, redirect, url_for
from flask_login import LoginManager
from models import db, User
from dotenv import load_dotenv

from config import get_config

app = Flask(__name__)

# Load configuration from config.py based on environment (Development vs Production)
active_config = get_config()
app.config.from_object(active_config)

db.init_app(app)

login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.init_app(app)

@login_manager.unauthorized_handler
def unauthorized():
    from flask import request, jsonify, url_for, redirect
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('format') == 'json' or request.is_json or 'application/json' in request.headers.get('Accept', ''):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.', 'redirect': url_for('auth.login')}), 401
    return redirect(url_for('auth.login'))

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.template_filter('strftime')
def strftime_filter(value, format='%Y-%m-%d'):
    if not value:
        return ''
    if isinstance(value, str):
        try:
            dt = datetime.datetime.fromisoformat(value)
            return dt.strftime(format)
        except Exception:
            return value[:10] if len(value) >= 10 else value
    if hasattr(value, 'strftime'):
        return value.strftime(format)
    return str(value)

# Import blueprints (routes)
from routes.auth import auth_bp
from routes.main import main_bp

app.register_blueprint(auth_bp)
app.register_blueprint(main_bp)

@app.route('/')
def index():
    return redirect(url_for('main.dashboard'))

if __name__ == '__main__':
    with app.app_context():
        db.create_all()

        # Seed default users if missing
        admin_user = User.query.filter_by(username='admin').first()
        if admin_user is None:
            admin_user = User(username='admin', full_name='System Admin', role='Admin', is_active=True)
            admin_user.set_password('admin123')
            db.session.add(admin_user)
            db.session.commit()
            print("Successfully seeded database with admin user 'admin' (password: admin123)")

        doctor_user = User.query.filter_by(username='doctor').first()
        if doctor_user is None:
            doctor_user = User(username='doctor', full_name='Dr. Smith', role='Admin', is_active=True)
            doctor_user.set_password('password123')
            db.session.add(doctor_user)
            db.session.commit()
            print("Successfully seeded database with user 'doctor' (password: password123)")
        else:
            # Ensure existing doctor user has Admin role
            if not doctor_user.role or doctor_user.role == 'User':
                doctor_user.role = 'Admin'
                doctor_user.is_active = True
                db.session.commit()
            
    # Always run on port 3000, accessible to host 0.0.0.0 for external routing
    app.run(host='0.0.0.0', port=3000, debug=True)
