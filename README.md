# Maan Jee Ultrasound Reporting System

A comprehensive, production-grade clinical reporting and patient management web application custom-built for **MAAN JEE Memorial Clinic** (Islamabad, Pakistan). The platform streamlines radiological workflows, digitizes ultrasound report generation across 6 core study modules, automates organ-wise findings, provides pixel-perfect pre-printed and digital A4 PDF printing, enables digital QR code report authenticity verification, and manages patient billing and administrative audits.

---

## 🏥 About MAAN JEE Memorial Clinic

**MAAN JEE Memorial Clinic** is an outpatient healthcare and diagnostic facility delivering primary clinical consultations, maternal-fetal wellness, and specialized diagnostic ultrasound imaging. The clinic operates high-volume diagnostic ultrasound examination units providing comprehensive abdominal, pelvic, renal/KUB, and obstetric scans.

The **Maan Jee Ultrasound Reporting System** was engineered to replace manual paper logs and static Word templates with a secure, automated, full-stack digital clinical portal.

---

## 🚀 Key Features & Capabilities

### 1. Patient Management
- **Centralized Patient Registry**: Rapid patient onboarding with automated Medical Record Number (MRN / Patient Code) generation.
- **Demographic & Clinical Records**: Tracks patient age, gender, contact number, referring physician, and clinical history.
- **Search & Filter Directory**: Instant search across patient name, code, phone number, and examination date.
- **Historical Diagnostic Timeline**: Direct access to past ultrasound reports and clinical progression for every patient.

### 2. Ultrasound Reporting Modules
Standardized, structured clinical templates covering 6 core ultrasound study categories:
- **Whole Abdomen Ultrasound**: Comprehensive assessment of liver, gallbladder, biliary tree, pancreas, spleen, kidneys, urinary bladder, and peritoneal cavity.
- **Upper Abdomen Ultrasound**: Targeted examination of hepatobiliary, pancreatic, and splenic structures.
- **KUB (Kidneys, Ureters & Urinary Bladder)**: Renal biometry, parenchymal evaluation, calculus detection, hydronephrosis staging, and post-void residual urine volume calculation.
- **Pelvic Ultrasound**: GYN assessment of uterus, endometrial stripe thickness, bilateral ovaries, adnexa, and Pouch of Douglas (POD).
- **Obstetric Ultrasound**: Fetal biometry (BPD, HC, AC, FL), gestational age calculation, estimated fetal weight (EFW), liquor/amniotic fluid index (AFI), placental localization, and fetal cardiac activity.
- **Obstetric TVS (Transvaginal Sonography)**: Early pregnancy evaluation, gestational sac (GS) size, yolk sac identification, crown-rump length (CRL), and subchorionic hematoma screening.
- **Organ-Wise Findings Engine**: Dynamic organ keyword recognition and one-click *"Set All Normal"* presets to accelerate sonologist reporting time.

### 3. PDF & Print Generation Engine
- **Dual Printing Modalities**:
  - **Pre-Printed Letterhead Mode**: Dynamically positions patient headers, organ findings, impression, and signature blocks to align precisely with physical clinic stationary.
  - **Digital Letterhead Mode**: Embeds high-resolution clinic branding, contact banners, and diagnostic certification.
- **High-Precision PDF Rendering**: Coordinate-based vector layout rendering via `pdf-lib` ensuring exact typography, margin control, and multi-page break handling.
- **Clinical Impression & Advice**: Formatted summary bullets and actionable clinical guidance for referring physicians.

### 4. Digital QR Code Verification
- **Anti-Fraud QR Security**: Embeds an encrypted 2D QR verification code directly on every generated ultrasound PDF report.
- **Public Verification Endpoint**: Patients and medical practitioners can scan the QR code using any smartphone camera to view the authentic verification record at `/verify/:id`.
- **Tamper-Evident Verification**: Confirms patient name, study type, reporting date, examining sonologist, and clinical conclusion directly against database records.

### 5. Authentication & Role-Based Access Control (RBAC)
- **Role Hierarchy**:
  - **Admin**: Full clinic management, user account provisioning, fee schedule configuration, audit log inspection, and payment analytics.
  - **Doctor / Radiologist**: Patient registration, report creation, finding editing, and PDF generation.
  - **Reception / Staff**: Patient intake, scheduling, and payment status recording.
- **Security Hardening**: Session-based authentication with secure HTTP-only cookies, password hashing via `bcryptjs`, brute-force mitigations, and optional Google reCAPTCHA v2 bot protection.

### 6. Billing & Administrative Management
- **Fee & Payment Tracking**: Monitors clinical fees per ultrasound study with payment statuses (`Paid`, `Partial`, `Unpaid`).
- **Revenue Analytics**: Real-time financial summary counters on the administrative dashboard.
- **System Audit Trails**: Tracks report creation, edits, user access, and administrative actions for medical accountability.

---

## 🏗️ System Architecture & Tech Stack

Originally prototyped as a **Python / Flask** application utilizing Jinja2 templating and REST routing, the production reporting system operates as a high-performance full-stack web application:

- **Frontend / Presentation**:
  - Semantic HTML5, Bootstrap 5 UI framework, Google Material Symbols, and JetBrains Mono typography.
  - Interactive clinical calculators (gestational age, EFW, renal volume) and instant findings synchronization.
  - Jinja2 / Nunjucks templating architecture preserving clean server-side clinical rendering.
- **Backend & APIs**:
  - **Node.js & Express / TypeScript** runtime providing high-throughput clinical routing.
  - Clean modular architecture: `server.ts` (API & view controller), `src/db.ts` (relational query layer), and `src/pdfGenerator.ts` (vector PDF engine).
  - Programmatic QR code rasterization via `qrcode`.
- **Database & Persistence**:
  - **PostgreSQL** relational database schema with foreign key integrity, indexed patient search, and structured audit logs.
  - Connection pooling via `pg` with SSL encryption.
- **Production Build & Bundling**:
  - Optimized packaging via `esbuild` and `vite` for fast container cold-starts and production reliability.

---

## 📂 Project Structure

```text
├── server.ts                 # Core Express application, API routes, and view controllers
├── src/
│   ├── db.ts                 # PostgreSQL connection pool and data access layer
│   └── pdfGenerator.ts       # Coordinate-based PDF generation and QR embedding engine
├── templates/                # Clinical Jinja2 / Nunjucks view templates
│   ├── base.html             # Master layout with responsive drawer and design system
│   ├── dashboard.html        # Clinical metrics, recent patient list, and quick actions
│   ├── patient_form.html     # Patient registration and demographic editing
│   ├── patient_detail.html   # Patient clinical profile and examination history
│   ├── patient_list.html     # Searchable patient directory
│   ├── report_form.html      # Comprehensive ultrasound examination report editor
│   ├── report_pdf.html       # Print-preview template with letterhead alignment
│   ├── payments.html         # Billing and fee collection dashboard
│   ├── users.html            # User account management (Admin only)
│   ├── audit_logs.html       # Clinic system activity logs
│   ├── verify.html           # Public QR code scan verification portal
│   └── login.html            # Secure authentication portal with reCAPTCHA
├── static/
│   ├── css/                  # Styling assets
│   ├── images/               # Clinic logos and letterhead vector graphics
│   └── letterhead.pdf        # Official MAAN JEE Memorial Clinic letterhead baseline
└── package.json              # Application dependencies and build scripts
```

---

## ⚙️ Environment Configuration

Define the following environment variables in your deployment environment or `.env` file (refer to `.env.example`):

```env
# Database Connection
DATABASE_URL=postgresql://username:password@host:5432/database?sslmode=require

# Application Secret Key
SECRET_KEY=your_secure_session_secret_key

# Optional Bot Protection (Google reCAPTCHA v2)
RECAPTCHA_SITE_KEY=your_recaptcha_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key

# Optional Initial Seed Passwords
INITIAL_ADMIN_PASSWORD=your_initial_admin_password
INITIAL_DOCTOR_PASSWORD=your_initial_doctor_password
```

*(Note: Never commit actual database passwords, private keys, or credentials to version control.)*

---

## 💻 Local Development & Deployment

### Prerequisites
- **Node.js** (v18 or higher)
- **PostgreSQL** database instance

### Quick Start
1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your PostgreSQL database credentials
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The application will bind to `http://localhost:3000`.

4. **Build and start for production:**
   ```bash
   npm run build
   npm start
   ```

---

## 🌐 Deployed Application & Links

- **Host Organization**: MAAN JEE Memorial Clinic, Islamabad, Pakistan
- **System Name**: Maan Jee Ultrasound Reporting System
- **Live Clinical Portal**: Production deployed instance on Cloud Run

---

## 🔒 Security & Medical Compliance Note

This application is designed for clinical operational use. It adheres to data security best practices:
- All sensitive credentials and database connection strings are managed strictly via environment variables.
- Passwords are salted and hashed with standard industry algorithms (`bcrypt`).
- Public verification routes expose only non-sensitive authenticity confirmation fields.
- Access to patient records and billing details is strictly governed by role-based session authorization.

