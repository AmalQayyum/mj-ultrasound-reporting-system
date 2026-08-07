import random
import datetime
from flask import Blueprint, render_template, redirect, url_for, request, flash, jsonify, Response
from flask_login import login_required, current_user
from sqlalchemy import or_, func
from models import db, Patient, UltrasoundReport

main_bp = Blueprint('main', __name__)

@main_bp.route('/dashboard')
@login_required
def dashboard():
    # Calculate statistics from actual database records
    reports_today = UltrasoundReport.query.filter(
        UltrasoundReport.created_at >= datetime.datetime.utcnow() - datetime.timedelta(days=1)
    ).count()
    
    new_patients_month = Patient.query.filter(
        Patient.created_at >= datetime.datetime.utcnow() - datetime.timedelta(days=30)
    ).count()
    
    pending_signatures = UltrasoundReport.query.filter_by(status='Draft').count()
    
    # Recent Patients Table - get the reports
    recent_reports = UltrasoundReport.query.order_by(UltrasoundReport.created_at.desc()).limit(5).all()
    
    return render_template(
        'dashboard.html',
        reports_today=reports_today,
        new_patients_month=new_patients_month,
        pending_signatures=pending_signatures,
        recent_reports=recent_reports
    )

@main_bp.route('/patients')
@login_required
def patients():
    query_text = request.args.get('q', '').strip()
    gender_filter = request.args.get('gender', 'All').strip()
    referred_filter = request.args.get('referred_by', '').strip()
    date_range = request.args.get('date_range', 'All Time').strip()
    is_json_request = (
        request.headers.get('X-Requested-With') == 'XMLHttpRequest' or
        request.args.get('format') == 'json' or
        request.is_json or
        'application/json' in request.headers.get('Accept', '')
    )
    
    try:
        # Base query outer-joining UltrasoundReport to search across exam types and report dates
        patient_query = Patient.query.outerjoin(Patient.reports)
        
        # Filter by text search across Name, MR No/ID, Phone, Father Name, Exam Type, Report Date
        if query_text:
            search_pattern = f"%{query_text}%"
            stripped_text = query_text.replace('-', '').replace(' ', '').replace('/', '').replace('(', '').replace(')', '').replace('+', '')
            stripped_pattern = f"%{stripped_text}%" if len(stripped_text) > 0 else search_pattern

            clean_phone_col = func.replace(
                func.replace(
                    func.replace(
                        func.replace(
                            func.replace(Patient.phone, '(', ''),
                        ')', ''),
                    '-', ''),
                ' ', ''),
            '+', '')

            clean_code_col = func.replace(
                func.replace(Patient.patient_code, '-', ''),
            ' ', '')

            conditions = [
                Patient.full_name.ilike(search_pattern),
                Patient.patient_code.ilike(search_pattern),
                clean_code_col.ilike(stripped_pattern),
                Patient.phone.ilike(search_pattern),
                clean_phone_col.ilike(stripped_pattern),
                Patient.fathers_name.ilike(search_pattern),
                UltrasoundReport.exam_type.ilike(search_pattern),
                UltrasoundReport.study.ilike(search_pattern),
                UltrasoundReport.report_date.ilike(search_pattern)
            ]
            if query_text.isdigit():
                conditions.append(Patient.id == int(query_text))
            elif stripped_text.isdigit():
                conditions.append(Patient.id == int(stripped_text))
            patient_query = patient_query.filter(or_(*conditions))
            
        # Filter by gender
        if gender_filter and gender_filter != 'All':
            patient_query = patient_query.filter(Patient.gender == gender_filter)
            
        # Filter by referral
        if referred_filter:
            patient_query = patient_query.filter(Patient.referred_by.ilike(f"%{referred_filter}%"))
            
        # Filter by date range
        if date_range == 'Last 7 Days':
            seven_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=7)
            patient_query = patient_query.filter(or_(Patient.created_at >= seven_days_ago, UltrasoundReport.created_at >= seven_days_ago))
        elif date_range == 'Last 30 Days':
            thirty_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=30)
            patient_query = patient_query.filter(or_(Patient.created_at >= thirty_days_ago, UltrasoundReport.created_at >= thirty_days_ago))
            
        patient_list = patient_query.distinct().order_by(Patient.id.desc()).all()
        
        if is_json_request:
            patients_data = []
            for p in patient_list:
                if isinstance(p.created_at, datetime.datetime):
                    created_at_str = p.created_at.strftime('%Y-%m-%d %I:%M %p')
                elif isinstance(p.created_at, datetime.date):
                    created_at_str = p.created_at.strftime('%Y-%m-%d')
                elif p.created_at:
                    created_at_str = str(p.created_at)
                else:
                    created_at_str = ''

                # Sort reports by creation date to get latest report
                reports_sorted = sorted(p.reports, key=lambda r: r.created_at or datetime.datetime.min, reverse=True)
                latest_report = reports_sorted[0] if reports_sorted else None

                patients_data.append({
                    'id': p.id,
                    'patient_code': p.patient_code,
                    'full_name': p.full_name,
                    'fathers_name': p.fathers_name or '',
                    'age': p.age,
                    'gender': p.gender,
                    'phone': p.phone or '',
                    'referred_by': p.referred_by or '',
                    'created_at': created_at_str,
                    'reports_count': len(p.reports),
                    'latest_report': {
                        'id': latest_report.id,
                        'exam_type': latest_report.exam_type,
                        'report_date': latest_report.report_date or '',
                        'findings': latest_report.findings or latest_report.key_findings or '',
                        'impression': latest_report.impression or '',
                        'advice': latest_report.advice or ''
                    } if latest_report else None
                })
            return jsonify({
                'success': True,
                'patients': patients_data,
                'count': len(patients_data)
            })
    except Exception as e:
        print("Error in patients route:", e)
        if is_json_request:
            return jsonify({'success': False, 'patients': [], 'count': 0, 'error': str(e)}), 500
        patient_list = []

    return render_template(
        'patient_list.html',
        patients=patient_list,
        q=query_text,
        gender=gender_filter,
        referred_by=referred_filter,
        date_range=date_range
    )

@main_bp.route('/patient/<int:id>')
@login_required
def patient_detail(id):
    patient = Patient.query.get_or_404(id)
    return render_template('patient_detail.html', patient=patient)

@main_bp.route('/patient/add', methods=['GET', 'POST'])
@login_required
def patient_add():
    if request.method == 'POST':
        full_name = request.form.get('full_name')
        fathers_name = request.form.get('fathers_name')
        age = request.form.get('age')
        gender = request.form.get('gender')
        dob = request.form.get('dob')
        phone = request.form.get('phone')
        email = request.form.get('email')
        address = request.form.get('address')
        referred_by = request.form.get('referred_by')
        clinic_name = request.form.get('clinic_name')
        
        # Generate dynamic unique PT-XXXXX code
        rand_id = random.randint(10000, 99999)
        patient_code = f"PT-{rand_id}"
        while Patient.query.filter_by(patient_code=patient_code).first() is not None:
            rand_id = random.randint(10000, 99999)
            patient_code = f"PT-{rand_id}"
            
        new_patient = Patient(
            patient_code=patient_code,
            full_name=full_name,
            fathers_name=fathers_name,
            age=int(age),
            gender=gender,
            dob=dob,
            phone=phone,
            email=email,
            address=address,
            referred_by=referred_by,
            clinic_name=clinic_name
        )
        
        db.session.add(new_patient)
        db.session.commit()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('format') == 'json' or request.is_json:
            return jsonify({
                'success': True,
                'message': f'Patient {full_name} ({patient_code}) registered successfully!',
                'patient': {
                    'id': new_patient.id,
                    'patient_code': new_patient.patient_code,
                    'full_name': new_patient.full_name,
                    'phone': new_patient.phone,
                    'age': new_patient.age,
                    'gender': new_patient.gender
                },
                'redirect': url_for('main.patient_detail', id=new_patient.id)
            })

        flash(f'Patient {full_name} ({patient_code}) registered successfully!', 'success')
        return redirect(url_for('main.patient_detail', id=new_patient.id))
        
    initial_name = request.args.get('name', '').strip() or request.args.get('q', '').strip()
    initial_phone = request.args.get('phone', '').strip()

    if initial_name and not initial_phone:
        clean_q = initial_name.replace('-', '').replace(' ', '').replace('+', '')
        if clean_q.isdigit() and len(clean_q) >= 6:
            initial_phone = initial_name
            initial_name = ''

    return render_template(
        'patient_form.html',
        action="Register New",
        patient=None,
        initial_name=initial_name,
        initial_phone=initial_phone
    )

@main_bp.route('/patient/<int:id>/edit', methods=['GET', 'POST'])
@login_required
def patient_edit(id):
    patient = Patient.query.get_or_404(id)
    if request.method == 'POST':
        patient.full_name = request.form.get('full_name')
        patient.fathers_name = request.form.get('fathers_name')
        patient.age = int(request.form.get('age'))
        patient.gender = request.form.get('gender')
        patient.dob = request.form.get('dob')
        patient.phone = request.form.get('phone')
        patient.email = request.form.get('email')
        patient.address = request.form.get('address')
        patient.referred_by = request.form.get('referred_by')
        patient.clinic_name = request.form.get('clinic_name')
        
        db.session.commit()
        flash(f'Patient {patient.full_name} details updated successfully!', 'success')
        return redirect(url_for('main.patient_detail', id=patient.id))
        
    return render_template('patient_form.html', action="Edit Details for", patient=patient)

@main_bp.route('/patient/<int:id>/delete', methods=['POST', 'DELETE'])
@main_bp.route('/api/patients/<int:id>', methods=['DELETE', 'POST'])
@login_required
def patient_delete(id):
    is_api = request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json or 'application/json' in request.headers.get('Accept', '') or request.method == 'DELETE' or request.path.startswith('/api/')
    try:
        patient = Patient.query.get(id)
        if not patient:
            if is_api:
                return jsonify({'success': False, 'message': 'Patient not found or already deleted.'}), 404
            flash('Patient not found.', 'warning')
            return redirect(url_for('main.patients'))

        name = patient.full_name
        # Delete reports first to be completely safe
        UltrasoundReport.query.filter_by(patient_id=patient.id).delete()
        db.session.delete(patient)
        db.session.commit()

        if is_api:
            return jsonify({'success': True, 'message': f'Patient {name} has been deleted.'})
        flash(f'Patient {name} has been deleted.', 'info')
        return redirect(url_for('main.patients'))
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting patient {id}:", e)
        if is_api:
            return jsonify({'success': False, 'message': str(e)}), 500
        flash(f'Error deleting patient: {str(e)}', 'danger')
        return redirect(url_for('main.patients'))

@main_bp.route('/report/new', methods=['GET', 'POST'])
@login_required
def report_new():
    patient_id = request.args.get('patient_id') or request.args.get('patient')
    patient = None
    if patient_id and str(patient_id).isdigit():
        patient = Patient.query.get(int(patient_id))
    patients_list = Patient.query.order_by(Patient.full_name.asc()).all()
    return render_template('report_form.html', action="Add", patient=patient, patients=patients_list, report=None)

@main_bp.route('/patient/<int:patient_id>/report/add', methods=['GET', 'POST'])
@login_required
def report_add(patient_id):
    patient = Patient.query.get_or_404(patient_id)
    patients_list = Patient.query.order_by(Patient.full_name.asc()).all()
    if request.method == 'POST':
        exam_type = request.form.get('exam_type')
        key_findings = request.form.get('key_findings')
        status = request.form.get('status', 'Draft')
        
        new_report = UltrasoundReport(
            patient_id=patient.id,
            exam_type=exam_type,
            key_findings=key_findings,
            status=status
        )
        
        db.session.add(new_report)
        db.session.commit()
        
        flash('Ultrasound report recorded successfully!', 'success')
        return redirect(url_for('main.patient_detail', id=patient.id))
        
    return render_template('report_form.html', action="Add", patient=patient, patients=patients_list, report=None)

@main_bp.route('/report/<int:id>/edit', methods=['GET', 'POST'])
@login_required
def report_edit(id):
    report = UltrasoundReport.query.get_or_404(id)
    patient = report.patient
    patients_list = Patient.query.order_by(Patient.full_name.asc()).all()
    if request.method == 'POST':
        report.exam_type = request.form.get('exam_type')
        report.key_findings = request.form.get('key_findings')
        report.status = request.form.get('status')
        
        db.session.commit()
        flash('Ultrasound report updated successfully!', 'success')
        return redirect(url_for('main.patient_detail', id=patient.id))
        
    return render_template('report_form.html', action="Edit", patient=patient, patients=patients_list, report=report)

@main_bp.route('/report/<int:id>/delete', methods=['POST'])
@login_required
def report_delete(id):
    report = UltrasoundReport.query.get_or_404(id)
    patient_id = report.patient_id
    db.session.delete(report)
    db.session.commit()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
        return jsonify({'success': True, 'message': 'Report deleted successfully.'})
    flash('Report deleted.', 'info')
    return redirect(url_for('main.patient_detail', id=patient_id))

def parse_findings_to_organs(findings_text):
    if not findings_text:
        return []
    import re
    lines = findings_text.split('\n')
    results = []
    current_organ = ""
    current_bullets = []

    def clean_text(s):
        s = re.sub(r'^[\s•\-\*\d+\.]+\s*', '', s).strip()
        if not s:
            return []
        parts = [p.strip() for p in re.split(r'(?<=\.)\s+(?=[A-Z])', s) if p.strip()]
        return parts if parts else [s]

    for line in lines:
        trimmed = line.strip()
        if not trimmed:
            continue
        m = re.match(r'^([A-Z0-9\s\/\(\)\-]{2,35}):\s*(.*)$', trimmed, re.IGNORECASE)
        if m:
            if current_organ and current_bullets:
                results.append({"organ": current_organ, "bullets": current_bullets})
            current_organ = m.group(1).strip().upper()
            current_bullets = []
            if m.group(2) and m.group(2).strip():
                current_bullets.extend(clean_text(m.group(2)))
        elif current_organ:
            current_bullets.extend(clean_text(trimmed))
        else:
            current_organ = "FINDINGS"
            current_bullets.extend(clean_text(trimmed))

    if current_organ and current_bullets:
        results.append({"organ": current_organ, "bullets": current_bullets})

    return [r for r in results if r["bullets"]]

def get_impression_lines(impression_text, organ_findings):
    import re
    bullets = []
    
    if impression_text and impression_text.strip():
        lines = impression_text.split('\n')
        for line in lines:
            trimmed = line.strip()
            if not trimmed:
                continue
            cleaned = re.sub(r'^[\s•\-\*\d+\.]+\s*', '', trimmed).strip()
            if cleaned:
                parts = [p.strip() for p in re.split(r'(?<=\.)\s+(?=[A-Z])', cleaned) if p.strip()]
                bullets.extend(parts if parts else [cleaned])
        if bullets:
            return bullets

    if not organ_findings:
        return []

    # Auto-generate impression from abnormal findings
    normal_keywords = [
        'normal', 'unremarkable', 'intact', 'no focal lesion', 'no calculus', 
        'well distended', 'no abnormality', 'within normal limits', 'no free fluid', 
        'no lymphadenopathy', 'no dilatation', 'no mass', 'not enlarged'
    ]
    abnormal_terms = [
        'fatty', 'calculus', 'calculi', 'stone', 'enlarged', 'hepatomegaly', 
        'splenomegaly', 'thickened', 'dilated', 'free fluid', 'cyst', 'mass', 
        'nodule', 'lesion', 'debris', 'hydronephrosis', 'ascites', 'pleural', 
        'inflammation', 'hernia', 'coarse', 'heterogeneous'
    ]

    abnormal_bullets = []
    for item in organ_findings:
        organ = item.get('organ', '')
        for bullet in item.get('bullets', []):
            b_lower = bullet.lower()
            has_abnormal_term = any(at in b_lower for at in abnormal_terms)
            is_normal_phrase = any(nk in b_lower for nk in normal_keywords) and not has_abnormal_term
            
            if has_abnormal_term or not is_normal_phrase:
                if organ and organ not in ['GENERAL', 'FINDINGS']:
                    abnormal_bullets.append(f"{organ.title()}: {bullet}")
                else:
                    abnormal_bullets.append(bullet)

    if abnormal_bullets:
        return abnormal_bullets

    return ["Normal ultrasound examination."]

def get_advice_lines(advice_text, has_findings=True):
    import re
    if advice_text and advice_text.strip():
        lines = advice_text.split('\n')
        bullets = []
        for line in lines:
            trimmed = line.strip()
            if not trimmed:
                continue
            cleaned = re.sub(r'^[\s•\-\*\d+\.]+\s*', '', trimmed).strip()
            if cleaned:
                parts = [p.strip() for p in re.split(r'(?<=\.)\s+(?=[A-Z])', cleaned) if p.strip()]
                bullets.extend(parts if parts else [cleaned])
        if bullets:
            return bullets

    if has_findings:
        return [
            "Clinical correlation is advised.",
            "Follow-up ultrasound if clinically indicated."
        ]
    return []

@main_bp.route('/verify/<int:id>')
def verify_report(id):
    report = UltrasoundReport.query.get_or_404(id)
    patient = report.patient
    return render_template('verify.html', patient=patient, report=report)

@main_bp.route('/report/<int:id>/print')
@login_required
def report_print(id):
    report = UltrasoundReport.query.get_or_404(id)
    patient = report.patient
    findings_text = getattr(report, 'findings', '') or getattr(report, 'key_findings', '') or ''
    impression_text = getattr(report, 'impression', '') or ''
    advice_text = getattr(report, 'advice', '') or ''

    organ_findings = parse_findings_to_organs(findings_text)
    impression_lines = get_impression_lines(impression_text, organ_findings)
    advice_lines = get_advice_lines(advice_text, has_findings=bool(findings_text.strip()))

    return render_template(
        'report_print.html', 
        patient=patient, 
        report=report, 
        findings=findings_text,
        impression=impression_text,
        advice=advice_text,
        organ_findings=organ_findings, 
        impression_lines=impression_lines, 
        advice_lines=advice_lines
    )

@main_bp.route('/report/<int:id>/pdf')
@login_required
def report_pdf(id):
    report = UltrasoundReport.query.get_or_404(id)
    patient = report.patient
    findings_text = getattr(report, 'findings', '') or getattr(report, 'key_findings', '') or ''
    impression_text = getattr(report, 'impression', '') or ''
    advice_text = getattr(report, 'advice', '') or ''

    organ_findings = parse_findings_to_organs(findings_text)
    impression_lines = get_impression_lines(impression_text, organ_findings)
    advice_lines = get_advice_lines(advice_text, has_findings=bool(findings_text.strip()))

    return render_template(
        'report_pdf.html', 
        patient=patient, 
        report=report, 
        findings=findings_text,
        impression=impression_text,
        advice=advice_text,
        organ_findings=organ_findings, 
        impression_lines=impression_lines, 
        advice_lines=advice_lines
    )

@main_bp.route('/template/<name>')
@login_required
def get_template(name):
    allowed_templates = ['whole_abdomen', 'upper_abdomen', 'pelvis', 'kub', 'renal']
    clean_name = (name or '').lower().strip()
    if clean_name in allowed_templates:
        try:
            return render_template(f'{clean_name}.html')
        except Exception as e:
            return f"Error loading template {clean_name}: {str(e)}", 500
    return "Template not found", 404

@main_bp.route('/report/save', methods=['POST'])
@login_required
def report_save():
    is_json_req = (
        request.headers.get('X-Requested-With') == 'XMLHttpRequest' or
        request.is_json or
        request.args.get('format') == 'json' or
        'application/json' in request.headers.get('Accept', '')
    )
    try:
        report_id = request.form.get('report_id')
        patient_id = request.form.get('patient_id')
        patient_code = request.form.get('patient_code')
        patient_name = request.form.get('patient_name')
        phone = request.form.get('phone')
        age = request.form.get('age')
        gender = request.form.get('gender', 'Male')
        referred_by = request.form.get('referred_by')
        
        study = request.form.get('study') or 'Whole Abdomen'
        clinical_history = request.form.get('clinical_history') or ''
        findings = request.form.get('findings') or ''
        impression = request.form.get('impression') or ''
        advice = request.form.get('advice') or ''
        status = request.form.get('status') or 'Finalized'
        action_after_save = request.form.get('action_after_save') or 'save'

        if not patient_name or not patient_name.strip():
            if is_json_req:
                return jsonify({'success': False, 'error': 'Patient Name is required.'}), 400
            flash('Patient Name is required.', 'danger')
            return redirect(request.referrer or url_for('main.dashboard'))

        if not findings or not findings.strip():
            if is_json_req:
                return jsonify({'success': False, 'error': 'Report Findings are required.'}), 400
            flash('Report Findings are required.', 'danger')
            return redirect(request.referrer or url_for('main.dashboard'))

        # Find or create patient
        patient = None
        if patient_id and patient_id.strip() and patient_id != 'None':
            try:
                patient = Patient.query.get(int(patient_id))
            except ValueError:
                pass
        
        if not patient and patient_code and patient_code.strip():
            patient = Patient.query.filter_by(patient_code=patient_code.strip()).first()

        if not patient:
            if not patient_code or not patient_code.strip():
                rand_id = random.randint(10000, 99999)
                patient_code = f"PT-{rand_id}"
                while Patient.query.filter_by(patient_code=patient_code).first() is not None:
                    rand_id = random.randint(10000, 99999)
                    patient_code = f"PT-{rand_id}"

            patient = Patient(
                patient_code=patient_code.strip(),
                full_name=patient_name.strip(),
                age=int(age) if (age and str(age).isdigit()) else 30,
                gender=gender or 'Male',
                phone=phone.strip() if phone else '',
                referred_by=referred_by.strip() if referred_by else 'Self'
            )
            db.session.add(patient)
            db.session.flush()
        else:
            patient.full_name = patient_name.strip()
            if age and str(age).isdigit():
                patient.age = int(age)
            if gender:
                patient.gender = gender
            if phone:
                patient.phone = phone.strip()
            if referred_by:
                patient.referred_by = referred_by.strip()

        # Find or create report
        report = None
        if report_id and report_id.strip() and report_id != 'None':
            try:
                report = UltrasoundReport.query.get(int(report_id))
            except ValueError:
                pass

        report_date = request.form.get('report_date') or datetime.datetime.now().strftime('%Y-%m-%d')
        report_time = request.form.get('report_time') or datetime.datetime.now().strftime('%H:%M')

        if not report:
            report = UltrasoundReport(
                patient_id=patient.id,
                exam_type=study,
                study=study,
                key_findings=findings,
                findings=findings,
                clinical_history=clinical_history,
                impression=impression,
                advice=advice,
                report_date=report_date,
                report_time=report_time,
                status=status
            )
            db.session.add(report)
        else:
            report.patient_id = patient.id
            report.exam_type = study
            report.study = study
            report.key_findings = findings
            report.findings = findings
            report.clinical_history = clinical_history
            report.impression = impression
            report.advice = advice
            report.report_date = report_date
            report.report_time = report_time
            report.status = status

        db.session.commit()

        if is_json_req:
            return jsonify({
                'success': True,
                'report_id': report.id,
                'patient_id': patient.id,
                'message': f'Report #{report.id} saved successfully!'
            })

        flash(f'Report #{report.id} saved successfully!', 'success')
        if action_after_save == 'print':
            return redirect(url_for('main.report_print', id=report.id, autoprint='true'))
        elif action_after_save == 'pdf':
            return redirect(url_for('main.report_print', id=report.id, autopdf='true'))
        else:
            return redirect(url_for('main.report_edit', id=report.id))

    except Exception as e:
        db.session.rollback()
        if is_json_req:
            return jsonify({'success': False, 'error': str(e)}), 500
        flash(f'Error saving report: {str(e)}', 'danger')
        return redirect(request.referrer or url_for('main.dashboard'))

@main_bp.route('/report/<int:id>/qrcode')
def report_qrcode(id):
    import io
    try:
        import qrcode
        verify_url = url_for('main.verify_report', id=id, _external=True)
        img = qrcode.make(verify_url)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return Response(buf.getvalue(), mimetype='image/png')
    except Exception:
        try:
            import qrcode
            import qrcode.image.svg
            verify_url = url_for('main.verify_report', id=id, _external=True)
            img = qrcode.make(verify_url, image_factory=qrcode.image.svg.SvgImage)
            buf = io.BytesIO()
            img.save(buf)
            buf.seek(0)
            return Response(buf.getvalue(), mimetype='image/svg+xml')
        except Exception:
            # High quality fallback SVG QR Code
            svg_code = f'''<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
                <rect width="80" height="80" fill="#ffffff"/>
                <!-- Position Detection Patterns -->
                <rect x="4" y="4" width="24" height="24" fill="#000000"/>
                <rect x="7" y="7" width="18" height="18" fill="#ffffff"/>
                <rect x="10" y="10" width="12" height="12" fill="#000000"/>
                
                <rect x="52" y="4" width="24" height="24" fill="#000000"/>
                <rect x="55" y="7" width="18" height="18" fill="#ffffff"/>
                <rect x="58" y="10" width="12" height="12" fill="#000000"/>
                
                <rect x="4" y="52" width="24" height="24" fill="#000000"/>
                <rect x="7" y="55" width="18" height="18" fill="#ffffff"/>
                <rect x="10" y="58" width="12" height="12" fill="#000000"/>
                
                <!-- Matrix Data Patterns -->
                <rect x="32" y="8" width="6" height="6" fill="#000000"/>
                <rect x="42" y="8" width="6" height="6" fill="#000000"/>
                <rect x="32" y="20" width="6" height="6" fill="#000000"/>
                <rect x="38" y="26" width="6" height="6" fill="#000000"/>
                <rect x="44" y="20" width="6" height="6" fill="#000000"/>
                <rect x="32" y="32" width="16" height="16" fill="#000000"/>
                <rect x="36" y="36" width="8" height="8" fill="#ffffff"/>
                <rect x="52" y="32" width="8" height="8" fill="#000000"/>
                <rect x="64" y="32" width="8" height="8" fill="#000000"/>
                <rect x="8" y="32" width="8" height="8" fill="#000000"/>
                <rect x="20" y="32" width="8" height="8" fill="#000000"/>
                <rect x="32" y="52" width="10" height="10" fill="#000000"/>
                <rect x="46" y="52" width="10" height="10" fill="#000000"/>
                <rect x="60" y="52" width="12" height="12" fill="#000000"/>
                <rect x="32" y="66" width="12" height="10" fill="#000000"/>
                <rect x="48" y="66" width="10" height="10" fill="#000000"/>
                <rect x="62" y="66" width="10" height="10" fill="#000000"/>
            </svg>'''
            return Response(svg_code, mimetype='image/svg+xml')

# ==================== USER MANAGEMENT (ADMIN ONLY) ====================

@main_bp.route('/users')
@login_required
def manage_users():
    if current_user.role != 'Admin':
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.dashboard'))
    
    users_list = User.query.order_by(User.id.asc()).all()
    return render_template('users.html', users=users_list)

@main_bp.route('/users/add', methods=['GET', 'POST'])
@login_required
def user_add():
    if current_user.role != 'Admin':
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.dashboard'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        full_name = request.form.get('full_name', '').strip()
        password = request.form.get('password', '').strip()
        role = request.form.get('role', 'User').strip()
        is_active = True if request.form.get('is_active') == '1' or request.form.get('is_active') == 'true' or request.form.get('is_active') == 'on' else False

        if not username or not password or not full_name:
            flash('Username, Full Name and Password are required.', 'danger')
            return render_template('user_form.html', user=None)

        if User.query.filter_by(username=username).first():
            flash('Username already exists. Please choose a different username.', 'danger')
            return render_template('user_form.html', user=None)

        new_user = User(
            username=username,
            full_name=full_name,
            role=role if role in ['Admin', 'User'] else 'User',
            is_active=is_active
        )
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()

        flash(f'User "{username}" created successfully with role {new_user.role}.', 'success')
        return redirect(url_for('main.manage_users'))

    return render_template('user_form.html', user=None)

@main_bp.route('/users/<int:id>/edit', methods=['GET', 'POST'])
@login_required
def user_edit(id):
    if current_user.role != 'Admin':
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.dashboard'))

    target_user = User.query.get_or_404(id)

    if request.method == 'POST':
        full_name = request.form.get('full_name', '').strip()
        password = request.form.get('password', '').strip()
        role = request.form.get('role', target_user.role).strip()
        is_active_input = request.form.get('is_active')
        is_active = True if is_active_input in ['1', 'true', 'on'] else False

        if not full_name:
            flash('Full Name is required.', 'danger')
            return render_template('user_form.html', user=target_user)

        # Prevent deactivating yourself
        if target_user.id == current_user.id and not is_active:
            flash('You cannot deactivate your own admin account.', 'danger')
            is_active = True

        target_user.full_name = full_name
        target_user.role = role if role in ['Admin', 'User'] else target_user.role
        target_user.is_active = is_active

        if password:
            target_user.set_password(password)

        db.session.commit()
        flash(f'User "{target_user.username}" updated successfully.', 'success')
        return redirect(url_for('main.manage_users'))

    return render_template('user_form.html', user=target_user)

@main_bp.route('/users/<int:id>/toggle-status', methods=['POST'])
@login_required
def user_toggle_status(id):
    if current_user.role != 'Admin':
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
            return jsonify({'success': False, 'message': 'Admin privileges required'}), 403
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.dashboard'))

    target_user = User.query.get_or_404(id)
    if target_user.id == current_user.id:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
            return jsonify({'success': False, 'message': 'Cannot deactivate your own account'}), 400
        flash('You cannot deactivate your own account.', 'danger')
        return redirect(url_for('main.manage_users'))

    target_user.is_active = not target_user.is_active
    db.session.commit()

    status_str = "activated" if target_user.is_active else "deactivated"
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
        return jsonify({'success': True, 'is_active': target_user.is_active, 'message': f'User {target_user.username} {status_str}.'})

    flash(f'User "{target_user.username}" has been {status_str}.', 'success')
    return redirect(url_for('main.manage_users'))



