import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class User(db.Model, UserMixin):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    full_name = db.Column(db.String(150), nullable=False, default="Dr. Smith")
    role = db.Column(db.String(20), nullable=False, default="User")  # 'Admin' or 'User'
    is_active = db.Column(db.Boolean, nullable=False, default=True)  # True or False
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def initials(self):
        if not self.full_name:
            return "U"
        parts = self.full_name.strip().split()
        if len(parts) >= 2:
            return (parts[0][0] + parts[-1][0]).upper()
        return parts[0][:2].upper()

class Patient(db.Model):
    __tablename__ = 'patients'
    id = db.Column(db.Integer, primary_key=True)
    patient_code = db.Column(db.String(50), unique=True, nullable=False) # e.g. PT-88291
    full_name = db.Column(db.String(150), nullable=False)
    fathers_name = db.Column(db.String(150), nullable=True)
    age = db.Column(db.Integer, nullable=False)
    gender = db.Column(db.String(20), nullable=False) # 'Male', 'Female', 'Other'
    dob = db.Column(db.String(50), nullable=True) # YYYY-MM-DD
    phone = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(100), nullable=True)
    address = db.Column(db.Text, nullable=True)
    referred_by = db.Column(db.String(150), nullable=True)
    clinic_name = db.Column(db.String(150), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    
    # Relationship to reports
    reports = db.relationship('UltrasoundReport', backref='patient', lazy=True, cascade="all, delete-orphan")

class UltrasoundReport(db.Model):
    __tablename__ = 'ultrasound_reports'
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patients.id'), nullable=False)
    exam_type = db.Column(db.String(150), nullable=False) # e.g. Abdominal US, Pelvic US
    study = db.Column(db.String(150), nullable=True)
    key_findings = db.Column(db.Text, nullable=False)
    findings = db.Column(db.Text, nullable=True)
    clinical_history = db.Column(db.Text, nullable=True)
    impression = db.Column(db.Text, nullable=True)
    advice = db.Column(db.Text, nullable=True)
    report_date = db.Column(db.String(50), nullable=True)
    report_time = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(50), nullable=False, default="Draft") # 'Draft', 'Finalized', 'Critical'
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
