import os
import json
import urllib.request
import urllib.parse
from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_user, logout_user, login_required, current_user
from models import db, User

auth_bp = Blueprint('auth', __name__)

RECAPTCHA_SITE_KEY = (os.environ.get('RECAPTCHA_SITE_KEY') or '').strip() or '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'
RECAPTCHA_SECRET_KEY = (os.environ.get('RECAPTCHA_SECRET_KEY') or '').strip() or '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe'

@auth_bp.context_processor
def inject_recaptcha_site_key():
    return dict(recaptcha_site_key=RECAPTCHA_SITE_KEY)

def verify_recaptcha(response_token, remote_ip=None):
    if not response_token:
        return False, "Please verify that you are not a robot."
        
    url = "https://www.google.com/recaptcha/api/siteverify"
    data = urllib.parse.urlencode({
        'secret': RECAPTCHA_SECRET_KEY,
        'response': response_token,
        'remoteip': remote_ip or ''
    }).encode('utf-8')
    
    try:
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            if result.get('success'):
                return True, None
            else:
                return False, "Captcha verification failed. Please try again."
    except Exception as e:
        print(f"reCAPTCHA verification exception: {e}")
        return False, "Captcha verification failed. Please try again."

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
        
    if request.method == 'POST':
        username = (request.form.get('username') or '').strip()
        password = request.form.get('password') or ''
        captcha_response = request.form.get('g-recaptcha-response') or ''
        
        # Verify reCAPTCHA token first
        recaptcha_valid, recaptcha_err = verify_recaptcha(captcha_response, request.remote_addr)
        if not recaptcha_valid:
            flash(recaptcha_err, 'danger')
            return render_template('login.html')

        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            if not user.is_active:
                flash('Your account has been deactivated. Please contact an administrator.', 'danger')
                return render_template('login.html')
            login_user(user)
            flash('Logged in successfully!', 'success')
            return redirect(url_for('main.dashboard'))
        else:
            flash('Invalid username or password.', 'danger')
            
    return render_template('login.html')

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
        
    if request.method == 'POST':
        username = request.form.get('username')
        full_name = request.form.get('full_name')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        
        if password != confirm_password:
            flash('Passwords do not match.', 'danger')
            return render_template('register.html')
            
        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            flash('Username already exists.', 'danger')
            return render_template('register.html')
            
        new_user = User(username=username, full_name=full_name)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        
        flash('Registration successful! Please login with your new credentials.', 'success')
        return redirect(url_for('auth.login'))
        
    return render_template('register.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Logged out successfully.', 'info')
    return redirect(url_for('auth.login'))
