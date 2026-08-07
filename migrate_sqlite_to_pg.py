import os
import sqlite3
import datetime
from dotenv import load_dotenv

load_dotenv()

def parse_datetime(val):
    if not val:
        return datetime.datetime.utcnow()
    if isinstance(val, datetime.datetime):
        return val
    try:
        # ISO format or YYYY-MM-DD HH:MM:SS
        return datetime.datetime.fromisoformat(str(val).replace('Z', '+00:00'))
    except Exception:
        try:
            return datetime.datetime.strptime(str(val)[:19], '%Y-%m-%d %H:%M:%S')
        except Exception:
            return datetime.datetime.utcnow()

def migrate():
    from app import app, db
    from models import User, Patient, UltrasoundReport
    from sqlalchemy import text

    with app.app_context():
        # 1. Create all PostgreSQL tables
        db.create_all()
        print("✓ Database schema verified/created via db.create_all().")

        # 2. Check for SQLite database file
        sqlite_db_path = "mj_ultrasound_reporting_system.db"
        if not os.path.exists(sqlite_db_path):
            print(f"Notice: SQLite database '{sqlite_db_path}' not found. Ensuring default admin seed...")
            seed_defaults(db, User)
            print("✓ Database ready with default users.")
            return

        print(f"Found SQLite database at '{sqlite_db_path}'. Reading SQLite data...")
        conn = sqlite3.connect(sqlite_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 3. Migrate Users
        try:
            cursor.execute("SELECT * FROM users")
            sqlite_users = cursor.fetchall()
            user_count = 0
            for u in sqlite_users:
                keys = u.keys()
                u_id = u['id']
                existing = User.query.get(u_id)
                if not existing:
                    created_val = parse_datetime(u['created_at']) if 'created_at' in keys else datetime.datetime.utcnow()
                    status_val = u['status'] if 'status' in keys and u['status'] else 'Active'
                    is_act = True if status_val == 'Active' else (bool(u['is_active']) if 'is_active' in keys and u['is_active'] is not None else True)
                    
                    user_obj = User(
                        id=u_id,
                        username=u['username'],
                        password_hash=u['password_hash'],
                        full_name=u['full_name'] if 'full_name' in keys and u['full_name'] else "Dr. Smith",
                        role=u['role'] if 'role' in keys and u['role'] else "Admin",
                        is_active=is_act,
                        created_at=created_val
                    )
                    db.session.add(user_obj)
                    user_count += 1
            db.session.commit()
            print(f"✓ Migrated {user_count} user record(s).")
        except Exception as e:
            print("User migration note:", e)
            db.session.rollback()

        # 4. Migrate Patients
        try:
            cursor.execute("SELECT * FROM patients")
            sqlite_patients = cursor.fetchall()
            patient_count = 0
            for p in sqlite_patients:
                keys = p.keys()
                p_id = p['id']
                existing = Patient.query.get(p_id)
                if not existing:
                    created_val = parse_datetime(p['created_at']) if 'created_at' in keys else datetime.datetime.utcnow()
                    patient_obj = Patient(
                        id=p_id,
                        patient_code=p['patient_code'],
                        full_name=p['full_name'],
                        fathers_name=p['fathers_name'] if 'fathers_name' in keys else None,
                        age=p['age'],
                        gender=p['gender'],
                        dob=p['dob'] if 'dob' in keys else None,
                        phone=p['phone'],
                        email=p['email'] if 'email' in keys else None,
                        address=p['address'] if 'address' in keys else None,
                        referred_by=p['referred_by'] if 'referred_by' in keys else None,
                        clinic_name=p['clinic_name'] if 'clinic_name' in keys else None,
                        created_at=created_val
                    )
                    db.session.add(patient_obj)
                    patient_count += 1
            db.session.commit()
            print(f"✓ Migrated {patient_count} patient record(s).")
        except Exception as e:
            print("Patient migration note:", e)
            db.session.rollback()

        # 5. Migrate Ultrasound Reports
        try:
            cursor.execute("SELECT * FROM ultrasound_reports")
            sqlite_reports = cursor.fetchall()
            report_count = 0
            for r in sqlite_reports:
                keys = r.keys()
                r_id = r['id']
                existing = UltrasoundReport.query.get(r_id)
                if not existing:
                    created_val = parse_datetime(r['created_at']) if 'created_at' in keys else datetime.datetime.utcnow()
                    report_obj = UltrasoundReport(
                        id=r_id,
                        patient_id=r['patient_id'],
                        exam_type=r['exam_type'],
                        study=r['study'] if 'study' in keys else None,
                        key_findings=r['key_findings'] if 'key_findings' in keys and r['key_findings'] else '',
                        findings=r['findings'] if 'findings' in keys else None,
                        clinical_history=r['clinical_history'] if 'clinical_history' in keys else None,
                        impression=r['impression'] if 'impression' in keys else None,
                        advice=r['advice'] if 'advice' in keys else None,
                        report_date=r['report_date'] if 'report_date' in keys else None,
                        report_time=r['report_time'] if 'report_time' in keys else None,
                        status=r['status'] if 'status' in keys and r['status'] else 'Draft',
                        created_at=created_val
                    )
                    db.session.add(report_obj)
                    report_count += 1
            db.session.commit()
            print(f"✓ Migrated {report_count} ultrasound report record(s).")
        except Exception as e:
            print("Ultrasound report migration note:", e)
            db.session.rollback()

        conn.close()

        # 6. Reset PostgreSQL sequences if using PostgreSQL
        db_driver = db.engine.dialect.name
        if 'postgres' in db_driver:
            try:
                for table in ['users', 'patients', 'ultrasound_reports']:
                    db.session.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(max(id), 1)) FROM {table};"))
                db.session.commit()
                print("✓ PostgreSQL ID sequences updated successfully.")
            except Exception as e:
                print("Sequence reset notice:", e)

        # 7. Ensure default admin / doctor users exist
        seed_defaults(db, User)
        print("✓ Migration completed successfully!")

def seed_defaults(db, User):
    admin_user = User.query.filter_by(username='admin').first()
    if admin_user is None:
        admin_user = User(username='admin', full_name='System Admin', role='Admin', is_active=True)
        admin_user.set_password('admin123')
        db.session.add(admin_user)
        db.session.commit()
        print("✓ Seeded admin user 'admin' (password: admin123).")

    doctor_user = User.query.filter_by(username='doctor').first()
    if doctor_user is None:
        doctor_user = User(username='doctor', full_name='Dr. Smith', role='Admin', is_active=True)
        doctor_user.set_password('password123')
        db.session.add(doctor_user)
        db.session.commit()
        print("✓ Seeded doctor user 'doctor' (password: password123).")

if __name__ == '__main__':
    migrate()
