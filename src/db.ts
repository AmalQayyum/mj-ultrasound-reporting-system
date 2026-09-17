import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Store any pre-existing DATABASE_URL from system environment before loading dotenv files
const systemDbUrl = process.env.DATABASE_URL;

const envMode = (process.env.NODE_ENV || process.env.FLASK_ENV || 'development').toLowerCase();
if (envMode === 'production' && fs.existsSync('.env.production')) {
  dotenv.config({ path: '.env.production' });
} else if (fs.existsSync('.env.development')) {
  dotenv.config({ path: '.env.development' });
}
dotenv.config();

// Ensure system-provided DATABASE_URL takes precedence
if (systemDbUrl) {
  process.env.DATABASE_URL = systemDbUrl;
}

const { Pool } = pg;

export interface User {
  id: number;
  full_name: string;
  username: string;
  password_hash: string;
  phone?: string;
  email?: string;
  designation?: string;
  role: 'Admin' | 'Doctor' | 'Receptionist' | 'Radiologist' | 'Technician';
  status: 'Active' | 'Inactive';
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  username: string;
  action: string;
  details?: string;
  created_at: string;
}

export interface Patient {
  id: number;
  patient_code: string;
  full_name: string;
  fathers_name: string;
  age: number;
  gender: string;
  dob?: string;
  phone: string;
  email: string;
  address: string;
  referred_by: string;
  clinic_name: string;
  created_at: string;
}

export interface UltrasoundReport {
  id: number;
  patient_id: number;
  exam_type: string;
  study?: string;
  procedure?: string;
  clinical_history?: string;
  findings?: string;
  impression?: string;
  advice?: string;
  report_date?: string;
  report_time?: string;
  key_findings: string;
  status: string;
  payment_status?: string;
  payment_date?: string;
  payment_time?: string;
  payment_received_by?: string;
  payment_amount?: number;
  report_fee?: number;
  receipt_number?: string;
  structured_data?: string;
  created_at: string;
}

const dbUrl = process.env.DATABASE_URL || (process.env.SQL_HOST ? `postgresql://${process.env.SQL_USER}:${process.env.SQL_PASSWORD}@${process.env.SQL_HOST}/${process.env.SQL_DB_NAME}` : '');

export const isPostgresConfigured = !!dbUrl;

if (!isPostgresConfigured) {
  console.warn('[DB WARNING] DATABASE_URL environment variable is missing. Falling back to local JSON database persistence.');
}

// Fallback JSON Persistence setup
const fallbackFilePath = path.join(process.cwd(), 'static', 'db_fallback.json');

interface FallbackData {
  users: User[];
  audit_logs: AuditLog[];
  patients: Patient[];
  ultrasound_reports: UltrasoundReport[];
}

function loadFallbackData(): FallbackData {
  if (!fs.existsSync(path.dirname(fallbackFilePath))) {
    fs.mkdirSync(path.dirname(fallbackFilePath), { recursive: true });
  }

  if (fs.existsSync(fallbackFilePath)) {
    try {
      const content = fs.readFileSync(fallbackFilePath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse fallback DB file, resetting database:', e);
    }
  }

  // Initial Seed Data (only created when fallback DB file does not exist)
  const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
  const initialDoctorPassword = process.env.INITIAL_DOCTOR_PASSWORD || crypto.randomBytes(16).toString('hex');
  const adminHash = bcrypt.hashSync(initialAdminPassword, 10);
  const doctorHash = bcrypt.hashSync(initialDoctorPassword, 10);
  const defaultData: FallbackData = {
    users: [
      {
        id: 1,
        full_name: 'System Admin',
        username: 'admin',
        password_hash: adminHash,
        phone: '03001234567',
        email: 'admin@mjultrasound.com',
        designation: 'System Administrator',
        role: 'Admin',
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 2,
        full_name: 'Dr. Smith',
        username: 'doctor',
        password_hash: doctorHash,
        phone: '03009876543',
        email: 'doctor@mjultrasound.com',
        designation: 'Consultant Sonologist',
        role: 'Doctor',
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 3,
        full_name: 'Dr. Asma',
        username: 'drasma',
        password_hash: doctorHash,
        phone: '03001112233',
        email: 'drasma@mjultrasound.com',
        designation: 'Consultant Radiologist',
        role: 'Doctor',
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    audit_logs: [],
    patients: [],
    ultrasound_reports: []
  };

  saveFallbackData(defaultData);
  return defaultData;
}

function saveFallbackData(data: FallbackData) {
  try {
    if (!fs.existsSync(path.dirname(fallbackFilePath))) {
      fs.mkdirSync(path.dirname(fallbackFilePath), { recursive: true });
    }
    fs.writeFileSync(fallbackFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save fallback DB:', e);
  }
}

export const pgPool = isPostgresConfigured
  ? new Pool({
      connectionString: dbUrl,
      ssl: dbUrl && (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1'))
        ? { rejectUnauthorized: false }
        : false
    })
  : null;

if (pgPool) {
  pgPool.on('error', (err) => {
    console.error('Unexpected error on idle SQL pool client:', err);
  });
}

let initPromise: Promise<void> | null = null;

export async function initDb(): Promise<void> {
  if (!isPostgresConfigured) {
    return;
  }
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const client = await pgPool!.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            full_name VARCHAR(150) NOT NULL,
            username VARCHAR(80) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(120),
            designation VARCHAR(100),
            role VARCHAR(20) NOT NULL DEFAULT 'Doctor',
            status VARCHAR(20) NOT NULL DEFAULT 'Active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            username VARCHAR(80) NOT NULL,
            action VARCHAR(100) NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS patients (
            id SERIAL PRIMARY KEY,
            patient_code VARCHAR(50) UNIQUE NOT NULL,
            full_name VARCHAR(150) NOT NULL,
            fathers_name VARCHAR(150),
            age INTEGER NOT NULL,
            gender VARCHAR(20) NOT NULL,
            dob VARCHAR(50),
            phone VARCHAR(50) NOT NULL,
            email VARCHAR(120),
            address TEXT,
            referred_by VARCHAR(150),
            clinic_name VARCHAR(150),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS ultrasound_reports (
            id SERIAL PRIMARY KEY,
            patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            exam_type VARCHAR(100) NOT NULL,
            study VARCHAR(150),
            clinical_history TEXT,
            findings TEXT,
            impression TEXT,
            advice TEXT,
            report_date VARCHAR(50),
            report_time VARCHAR(50),
            key_findings TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'Draft',
            payment_status VARCHAR(20) DEFAULT 'Unpaid',
            payment_date VARCHAR(50),
            payment_time VARCHAR(50),
            payment_received_by VARCHAR(100),
            payment_amount NUMERIC(10, 2) DEFAULT 0.00,
            report_fee NUMERIC(10, 2) DEFAULT 0.00,
            receipt_number VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Migration for existing tables
        try {
          await client.query(`
            ALTER TABLE ultrasound_reports ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10, 2) DEFAULT 0.00;
            ALTER TABLE ultrasound_reports ADD COLUMN IF NOT EXISTS report_fee NUMERIC(10, 2) DEFAULT 0.00;
            ALTER TABLE ultrasound_reports ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(50);
            ALTER TABLE ultrasound_reports ADD COLUMN IF NOT EXISTS procedure TEXT;
            ALTER TABLE ultrasound_reports ADD COLUMN IF NOT EXISTS structured_data TEXT;
          `);
        } catch (e) {
          // Ignore column exists error
        }

        // Sync serial sequences in case existing rows have explicit IDs
        try {
          await client.query("SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1), true)");
          await client.query("SELECT setval('patients_id_seq', COALESCE((SELECT MAX(id) FROM patients), 1), true)");
          await client.query("SELECT setval('ultrasound_reports_id_seq', COALESCE((SELECT MAX(id) FROM ultrasound_reports), 1), true)");
          await client.query("SELECT setval('audit_logs_id_seq', COALESCE((SELECT MAX(id) FROM audit_logs), 1), true)");
        } catch (e) {
          // Sequence reset notice
        }

        // Seed default admin user only if genuinely missing
        const adminCheck = await client.query("SELECT id FROM users WHERE LOWER(username) = 'admin'");
        if (adminCheck.rows.length === 0) {
          const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
          const adminHash = bcrypt.hashSync(initialAdminPassword, 10);
          await client.query(`
            INSERT INTO users (full_name, username, password_hash, phone, email, designation, role, status)
            VALUES ('System Admin', 'admin', $1, '03001234567', 'admin@mjultrasound.com', 'System Administrator', 'Admin', 'Active')
          `, [adminHash]);
        }

        // Seed default doctor user only if genuinely missing
        const doctorCheck = await client.query("SELECT id FROM users WHERE LOWER(username) = 'doctor'");
        if (doctorCheck.rows.length === 0) {
          const initialDoctorPassword = process.env.INITIAL_DOCTOR_PASSWORD || crypto.randomBytes(16).toString('hex');
          const doctorHash = bcrypt.hashSync(initialDoctorPassword, 10);
          await client.query(`
            INSERT INTO users (full_name, username, password_hash, phone, email, designation, role, status)
            VALUES ('Dr. Smith', 'doctor', $1, '03009876543', 'doctor@mjultrasound.com', 'Consultant Sonologist', 'Doctor', 'Active')
          `, [doctorHash]);
        }

        // Seed Dr. Asma doctor user only if genuinely missing
        const drAsmaCheck = await client.query("SELECT id FROM users WHERE LOWER(full_name) LIKE '%asma%' OR LOWER(username) = 'drasma'");
        if (drAsmaCheck.rows.length === 0) {
          const initialDoctorPassword = process.env.INITIAL_DOCTOR_PASSWORD || crypto.randomBytes(16).toString('hex');
          const drAsmaHash = bcrypt.hashSync(initialDoctorPassword, 10);
          await client.query(`
            INSERT INTO users (full_name, username, password_hash, phone, email, designation, role, status)
            VALUES ('Dr. Asma', 'drasma', $1, '03001112233', 'drasma@mjultrasound.com', 'Consultant Radiologist', 'Doctor', 'Active')
          `, [drAsmaHash]);
        }

        // Seed default initial patient if patients table is empty to prevent foreign key violation
        const patientCountRes = await client.query("SELECT COUNT(*) FROM patients");
        if (parseInt(patientCountRes.rows[0].count, 10) === 0) {
          await client.query(`
            INSERT INTO patients (patient_code, full_name, fathers_name, age, gender, phone, email, address, referred_by, clinic_name)
            VALUES ('PT-10001', 'Walk-In Patient', '', 30, 'Female', '03000000000', 'patient@mjultrasound.com', 'Rawalpindi', 'Self', 'MAAN JEE Memorial Clinic')
          `);
        }

      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[DB INIT ERROR] Failed to connect or initialize PostgreSQL database:', err);
    }
  })();
  return initPromise;
}

function mapUser(row: any): User {
  return {
    id: Number(row.id),
    full_name: String(row.full_name || ''),
    username: String(row.username || ''),
    password_hash: String(row.password_hash || ''),
    phone: row.phone ? String(row.phone) : '',
    email: row.email ? String(row.email) : '',
    designation: row.designation ? String(row.designation) : '',
    role: row.role as any,
    status: row.status as any,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '')
  };
}

function mapAuditLog(row: any): AuditLog {
  return {
    id: Number(row.id),
    user_id: row.user_id ? Number(row.user_id) : undefined,
    username: String(row.username || ''),
    action: String(row.action || ''),
    details: row.details ? String(row.details) : '',
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || '')
  };
}

function mapPatient(row: any): Patient {
  return {
    id: Number(row.id),
    patient_code: String(row.patient_code || ''),
    full_name: String(row.full_name || ''),
    fathers_name: String(row.fathers_name || ''),
    age: Number(row.age || 0),
    gender: String(row.gender || ''),
    dob: row.dob ? String(row.dob) : '',
    phone: String(row.phone || ''),
    email: row.email ? String(row.email) : '',
    address: row.address ? String(row.address) : '',
    referred_by: row.referred_by ? String(row.referred_by) : '',
    clinic_name: row.clinic_name ? String(row.clinic_name) : '',
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || '')
  };
}

function formatReceiptNumber(id: number, dateStr?: string, dbReceiptNo?: string): string {
  if (dbReceiptNo && dbReceiptNo.trim()) return dbReceiptNo.trim();
  let dateClean = '20260806';
  if (dateStr) {
    const cleaned = dateStr.replace(/[^0-9]/g, '');
    if (cleaned.length >= 8) {
      dateClean = cleaned.substring(0, 8);
    }
  }
  const paddedId = String(id).padStart(3, '0');
  return `RCPT-${dateClean}-${paddedId}`;
}

function mapReport(row: any): UltrasoundReport {
  const idNum = Number(row.id);
  const pAmt = row.payment_amount !== null && row.payment_amount !== undefined ? Number(row.payment_amount) : (row.report_fee !== null && row.report_fee !== undefined ? Number(row.report_fee) : 0);
  const rcptNo = formatReceiptNumber(idNum, row.report_date || row.created_at, row.receipt_number);
  return {
    id: idNum,
    patient_id: Number(row.patient_id),
    exam_type: String(row.exam_type || ''),
    study: row.study ? String(row.study) : '',
    procedure: row.procedure ? String(row.procedure) : '',
    clinical_history: row.clinical_history ? String(row.clinical_history) : '',
    findings: row.findings ? String(row.findings) : '',
    impression: row.impression ? String(row.impression) : '',
    advice: row.advice ? String(row.advice) : '',
    report_date: row.report_date ? String(row.report_date) : '',
    report_time: row.report_time ? String(row.report_time) : '',
    key_findings: String(row.key_findings || ''),
    status: String(row.status || 'Draft'),
    payment_status: String(row.payment_status || 'Unpaid'),
    payment_date: row.payment_date ? String(row.payment_date) : '',
    payment_time: row.payment_time ? String(row.payment_time) : '',
    payment_received_by: row.payment_received_by ? String(row.payment_received_by) : '',
    payment_amount: pAmt,
    report_fee: pAmt,
    receipt_number: rcptNo,
    structured_data: row.structured_data ? String(row.structured_data) : '',
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || '')
  };
}

class PostgresDatabase {
  // Users
  async getUsers(): Promise<User[]> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      return data.users;
    }
    await initDb();
    const res = await pgPool!.query('SELECT * FROM users ORDER BY id ASC');
    return res.rows.map(mapUser);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      return data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    }
    await initDb();
    const res = await pgPool!.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    return res.rows.length > 0 ? mapUser(res.rows[0]) : undefined;
  }

  async getUserById(id: number): Promise<User | undefined> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return undefined;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      return data.users.find(u => u.id === id);
    }
    await initDb();
    const res = await pgPool!.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows.length > 0 ? mapUser(res.rows[0]) : undefined;
  }

  async createUser(userData: {
    full_name: string;
    username: string;
    password_hash: string;
    phone?: string;
    email?: string;
    designation?: string;
    role: 'Admin' | 'Doctor' | 'Receptionist' | 'Radiologist' | 'Technician';
    status: 'Active' | 'Inactive';
  }): Promise<User> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const newId = data.users.reduce((max, u) => Math.max(max, u.id), 0) + 1;
      const newUser: User = {
        id: newId,
        full_name: userData.full_name,
        username: userData.username,
        password_hash: userData.password_hash,
        phone: userData.phone || '',
        email: userData.email || '',
        designation: userData.designation || '',
        role: userData.role,
        status: userData.status || 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      data.users.push(newUser);
      saveFallbackData(data);
      return newUser;
    }
    await initDb();
    const res = await pgPool!.query(`
      INSERT INTO users (full_name, username, password_hash, phone, email, designation, role, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      userData.full_name,
      userData.username,
      userData.password_hash,
      userData.phone || '',
      userData.email || '',
      userData.designation || '',
      userData.role,
      userData.status || 'Active'
    ]);
    return mapUser(res.rows[0]);
  }

  async updateUser(id: number, userData: Partial<Omit<User, 'id' | 'created_at'>>): Promise<User | undefined> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return undefined;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const idx = data.users.findIndex(u => u.id === id);
      if (idx === -1) return undefined;
      const u = data.users[idx];
      const updated: User = {
        ...u,
        full_name: userData.full_name !== undefined ? userData.full_name : u.full_name,
        username: userData.username !== undefined ? userData.username : u.username,
        phone: userData.phone !== undefined ? userData.phone : u.phone,
        email: userData.email !== undefined ? userData.email : u.email,
        designation: userData.designation !== undefined ? userData.designation : u.designation,
        role: userData.role !== undefined ? userData.role : u.role,
        status: userData.status !== undefined ? userData.status : u.status,
        password_hash: userData.password_hash !== undefined ? userData.password_hash : u.password_hash,
        updated_at: new Date().toISOString()
      };
      data.users[idx] = updated;
      saveFallbackData(data);
      return updated;
    }
    await initDb();
    const u = await this.getUserById(id);
    if (!u) return undefined;

    const full_name = userData.full_name !== undefined ? userData.full_name : u.full_name;
    const username = userData.username !== undefined ? userData.username : u.username;
    const phone = userData.phone !== undefined ? userData.phone : (u.phone || '');
    const email = userData.email !== undefined ? userData.email : (u.email || '');
    const designation = userData.designation !== undefined ? userData.designation : (u.designation || '');
    const role = userData.role !== undefined ? userData.role : u.role;
    const status = userData.status !== undefined ? userData.status : u.status;
    const password_hash = userData.password_hash !== undefined ? userData.password_hash : u.password_hash;

    const res = await pgPool!.query(`
      UPDATE users 
      SET full_name = $1, username = $2, phone = $3, email = $4, designation = $5, role = $6, status = $7, password_hash = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `, [full_name, username, phone, email, designation, role, status, password_hash, id]);
    return res.rows.length > 0 ? mapUser(res.rows[0]) : undefined;
  }

  async updateUserPassword(id: number, passwordHash: string): Promise<boolean> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return false;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const idx = data.users.findIndex(u => u.id === id);
      if (idx === -1) return false;
      data.users[idx].password_hash = passwordHash;
      data.users[idx].updated_at = new Date().toISOString();
      saveFallbackData(data);
      return true;
    }
    await initDb();
    const res = await pgPool!.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [passwordHash, id]);
    return (res.rowCount ?? 0) > 0;
  }

  async deleteUser(id: number): Promise<boolean> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return false;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const initialLen = data.users.length;
      data.users = data.users.filter(u => u.id !== id);
      saveFallbackData(data);
      return data.users.length < initialLen;
    }
    await initDb();
    const res = await pgPool!.query('DELETE FROM users WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // Audit Logs
  async addAuditLog(userId: number | null, username: string, action: string, details?: string): Promise<AuditLog> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const newId = data.audit_logs.reduce((max, l) => Math.max(max, l.id), 0) + 1;
      const newLog: AuditLog = {
        id: newId,
        user_id: userId || undefined,
        username: username || 'System',
        action,
        details: details || '',
        created_at: new Date().toISOString()
      };
      data.audit_logs.push(newLog);
      saveFallbackData(data);
      return newLog;
    }
    await initDb();
    const res = await pgPool!.query(`
      INSERT INTO audit_logs (user_id, username, action, details)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [userId || null, username || 'System', action, details || '']);
    return mapAuditLog(res.rows[0]);
  }

  async getAuditLogs(limit = 200): Promise<AuditLog[]> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      return [...data.audit_logs].sort((a, b) => b.id - a.id).slice(0, limit);
    }
    await initDb();
    const res = await pgPool!.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [limit]);
    return res.rows.map(mapAuditLog);
  }

  // Patients
  async getPatients(query?: string): Promise<Patient[]> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      let list = data.patients;
      if (query && query.trim() !== '') {
        const q = query.trim().toLowerCase();
        const cleanQ = q.replace(/[- +()]/g, '');
        const numericId = !isNaN(Number(q)) ? Number(q) : -1;
        list = list.filter(p => 
          p.full_name.toLowerCase().includes(q) ||
          p.patient_code.toLowerCase().includes(q) ||
          p.phone.replace(/[- +()]/g, '').includes(cleanQ) ||
          p.fathers_name.toLowerCase().includes(q) ||
          p.referred_by.toLowerCase().includes(q) ||
          p.id === numericId
        );
      }
      return [...list].sort((a, b) => b.id - a.id);
    }
    await initDb();
    if (query && query.trim() !== '') {
      const q = `%${query.trim()}%`;
      const cleanQ = `%${query.trim().replace(/[- +()]/g, '')}%`;
      const numericId = !isNaN(Number(query.trim())) ? Number(query.trim()) : -1;
      const res = await pgPool!.query(`
        SELECT * FROM patients 
        WHERE full_name ILIKE $1 
           OR patient_code ILIKE $1 
           OR REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '(', ''), ')', '') ILIKE $2 
           OR fathers_name ILIKE $1 
           OR referred_by ILIKE $1
           OR id = $3
        ORDER BY created_at DESC
      `, [q, cleanQ, numericId]);
      return res.rows.map(mapPatient);
    } else {
      const res = await pgPool!.query('SELECT * FROM patients ORDER BY created_at DESC');
      return res.rows.map(mapPatient);
    }
  }

  async getPatientById(id: number): Promise<Patient | undefined> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return undefined;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      return data.patients.find(p => p.id === id);
    }
    await initDb();
    const res = await pgPool!.query('SELECT * FROM patients WHERE id = $1', [id]);
    return res.rows.length > 0 ? mapPatient(res.rows[0]) : undefined;
  }

  async getPatientByCode(code: string): Promise<Patient | undefined> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      return data.patients.find(p => p.patient_code.toLowerCase() === code.toLowerCase());
    }
    await initDb();
    const res = await pgPool!.query('SELECT * FROM patients WHERE patient_code = $1', [code]);
    return res.rows.length > 0 ? mapPatient(res.rows[0]) : undefined;
  }

  async addPatient(patientData: Omit<Patient, 'id' | 'created_at'>): Promise<Patient> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const newId = data.patients.reduce((max, p) => Math.max(max, p.id), 0) + 1;
      const newPatient: Patient = {
        id: newId,
        patient_code: patientData.patient_code,
        full_name: patientData.full_name,
        fathers_name: patientData.fathers_name || '',
        age: patientData.age,
        gender: patientData.gender,
        dob: patientData.dob || '',
        phone: patientData.phone,
        email: patientData.email || '',
        address: patientData.address || '',
        referred_by: patientData.referred_by || '',
        clinic_name: patientData.clinic_name || '',
        created_at: new Date().toISOString()
      };
      data.patients.push(newPatient);
      saveFallbackData(data);
      return newPatient;
    }
    await initDb();
    const res = await pgPool!.query(`
      INSERT INTO patients (patient_code, full_name, fathers_name, age, gender, dob, phone, email, address, referred_by, clinic_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      patientData.patient_code,
      patientData.full_name,
      patientData.fathers_name || '',
      patientData.age,
      patientData.gender,
      patientData.dob || '',
      patientData.phone,
      patientData.email || '',
      patientData.address || '',
      patientData.referred_by || '',
      patientData.clinic_name || ''
    ]);
    return mapPatient(res.rows[0]);
  }

  async updatePatient(id: number, patientData: Partial<Omit<Patient, 'id' | 'created_at' | 'patient_code'>>): Promise<Patient | undefined> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return undefined;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const idx = data.patients.findIndex(p => p.id === id);
      if (idx === -1) return undefined;
      const p = data.patients[idx];
      const updated: Patient = {
        ...p,
        full_name: patientData.full_name !== undefined ? patientData.full_name : p.full_name,
        fathers_name: patientData.fathers_name !== undefined ? patientData.fathers_name : p.fathers_name,
        age: patientData.age !== undefined ? patientData.age : p.age,
        gender: patientData.gender !== undefined ? patientData.gender : p.gender,
        dob: patientData.dob !== undefined ? patientData.dob : p.dob,
        phone: patientData.phone !== undefined ? patientData.phone : p.phone,
        email: patientData.email !== undefined ? patientData.email : p.email,
        address: patientData.address !== undefined ? patientData.address : p.address,
        referred_by: patientData.referred_by !== undefined ? patientData.referred_by : p.referred_by,
        clinic_name: patientData.clinic_name !== undefined ? patientData.clinic_name : p.clinic_name
      };
      data.patients[idx] = updated;
      saveFallbackData(data);
      return updated;
    }
    await initDb();
    const p = await this.getPatientById(id);
    if (!p) return undefined;

    const full_name = patientData.full_name !== undefined ? patientData.full_name : p.full_name;
    const fathers_name = patientData.fathers_name !== undefined ? patientData.fathers_name : p.fathers_name;
    const age = patientData.age !== undefined ? patientData.age : p.age;
    const gender = patientData.gender !== undefined ? patientData.gender : p.gender;
    const dob = patientData.dob !== undefined ? patientData.dob : p.dob;
    const phone = patientData.phone !== undefined ? patientData.phone : p.phone;
    const email = patientData.email !== undefined ? patientData.email : p.email;
    const address = patientData.address !== undefined ? patientData.address : p.address;
    const referred_by = patientData.referred_by !== undefined ? patientData.referred_by : p.referred_by;
    const clinic_name = patientData.clinic_name !== undefined ? patientData.clinic_name : p.clinic_name;

    const res = await pgPool!.query(`
      UPDATE patients 
      SET full_name = $1, fathers_name = $2, age = $3, gender = $4, dob = $5, phone = $6, email = $7, address = $8, referred_by = $9, clinic_name = $10
      WHERE id = $11
      RETURNING *
    `, [full_name, fathers_name, age, gender, dob, phone, email, address, referred_by, clinic_name, id]);

    return res.rows.length > 0 ? mapPatient(res.rows[0]) : undefined;
  }

  async deletePatient(id: number): Promise<boolean> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return false;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const initialLen = data.patients.length;
      data.patients = data.patients.filter(p => p.id !== id);
      data.ultrasound_reports = data.ultrasound_reports.filter(r => r.patient_id !== id);
      saveFallbackData(data);
      return data.patients.length < initialLen;
    }
    await initDb();
    await pgPool!.query('DELETE FROM ultrasound_reports WHERE patient_id = $1', [id]);
    const res = await pgPool!.query('DELETE FROM patients WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // Reports
  async getReports(): Promise<UltrasoundReport[]> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      return [...data.ultrasound_reports].sort((a, b) => b.id - a.id);
    }
    await initDb();
    const res = await pgPool!.query('SELECT * FROM ultrasound_reports ORDER BY created_at DESC');
    return res.rows.map(mapReport);
  }

  async getReportsByPatientId(patientId: number): Promise<UltrasoundReport[]> {
    if (typeof patientId !== 'number' || isNaN(patientId) || patientId <= 0) return [];
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      return data.ultrasound_reports.filter(r => r.patient_id === patientId).sort((a, b) => b.id - a.id);
    }
    await initDb();
    const res = await pgPool!.query('SELECT * FROM ultrasound_reports WHERE patient_id = $1 ORDER BY created_at DESC', [patientId]);
    return res.rows.map(mapReport);
  }

  async getReportById(id: number): Promise<UltrasoundReport | undefined> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return undefined;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      return data.ultrasound_reports.find(r => r.id === id);
    }
    await initDb();
    const res = await pgPool!.query('SELECT * FROM ultrasound_reports WHERE id = $1', [id]);
    return res.rows.length > 0 ? mapReport(res.rows[0]) : undefined;
  }

  async addReport(reportData: Omit<UltrasoundReport, 'id' | 'created_at'>): Promise<UltrasoundReport> {
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const newId = data.ultrasound_reports.reduce((max, r) => Math.max(max, r.id), 0) + 1;
      const pFee = reportData.payment_amount !== undefined ? reportData.payment_amount : (reportData.report_fee !== undefined ? reportData.report_fee : 2500.0);
      const rcptNo = reportData.receipt_number || formatReceiptNumber(newId, reportData.report_date || new Date().toISOString(), '');
      const newReport: UltrasoundReport = {
        id: newId,
        patient_id: reportData.patient_id,
        exam_type: reportData.exam_type,
        study: reportData.study || '',
        procedure: reportData.procedure || '',
        clinical_history: reportData.clinical_history || '',
        findings: reportData.findings || '',
        impression: reportData.impression || '',
        advice: reportData.advice || '',
        report_date: reportData.report_date || '',
        report_time: reportData.report_time || '',
        key_findings: reportData.key_findings || '',
        status: reportData.status || 'Draft',
        payment_status: reportData.payment_status || 'Unpaid',
        payment_date: reportData.payment_date || '',
        payment_time: reportData.payment_time || '',
        payment_received_by: reportData.payment_received_by || '',
        payment_amount: pFee,
        report_fee: pFee,
        receipt_number: rcptNo,
        structured_data: reportData.structured_data || '',
        created_at: new Date().toISOString()
      };
      data.ultrasound_reports.push(newReport);
      saveFallbackData(data);
      return newReport;
    }
    await initDb();
    let patientId = Number(reportData.patient_id);
    let patient = (!isNaN(patientId) && patientId > 0) ? await this.getPatientById(patientId) : undefined;
    if (!patient) {
      const allPatients = await this.getPatients();
      if (allPatients.length > 0) {
        patient = allPatients[0];
      } else {
        patient = await this.addPatient({
          patient_code: `PT-${Math.floor(10000 + Math.random() * 90000)}`,
          full_name: 'Walk-In Patient',
          fathers_name: '',
          age: 30,
          gender: 'Female',
          phone: '',
          email: '',
          address: '',
          referred_by: 'Self',
          clinic_name: 'MAAN JEE Memorial Clinic'
        });
      }
      reportData.patient_id = patient.id;
    }

    const pFee = reportData.payment_amount !== undefined ? reportData.payment_amount : (reportData.report_fee !== undefined ? reportData.report_fee : 2500.0);
    const res = await pgPool!.query(`
      INSERT INTO ultrasound_reports (patient_id, exam_type, study, procedure, clinical_history, findings, impression, advice, report_date, report_time, key_findings, status, payment_status, payment_date, payment_time, payment_received_by, payment_amount, report_fee, receipt_number, structured_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `, [
      reportData.patient_id,
      reportData.exam_type,
      reportData.study || '',
      reportData.procedure || '',
      reportData.clinical_history || '',
      reportData.findings || '',
      reportData.impression || '',
      reportData.advice || '',
      reportData.report_date || '',
      reportData.report_time || '',
      reportData.key_findings || '',
      reportData.status || 'Draft',
      reportData.payment_status || 'Unpaid',
      reportData.payment_date || '',
      reportData.payment_time || '',
      reportData.payment_received_by || '',
      pFee,
      pFee,
      reportData.receipt_number || '',
      reportData.structured_data || ''
    ]);
    const saved = res.rows[0];
    if (!saved.receipt_number) {
      const autoRcpt = formatReceiptNumber(saved.id, saved.report_date, '');
      await pgPool!.query('UPDATE ultrasound_reports SET receipt_number = $1 WHERE id = $2', [autoRcpt, saved.id]);
      saved.receipt_number = autoRcpt;
    }
    return mapReport(saved);
  }

  async updateReport(id: number, reportData: Partial<Omit<UltrasoundReport, 'id' | 'created_at' | 'patient_id'>>): Promise<UltrasoundReport | undefined> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return undefined;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const idx = data.ultrasound_reports.findIndex(r => r.id === id);
      if (idx === -1) return undefined;
      const r = data.ultrasound_reports[idx];
      const exam_type = reportData.exam_type !== undefined ? reportData.exam_type : r.exam_type;
      const study = reportData.study !== undefined ? reportData.study : r.study;
      const procedure = reportData.procedure !== undefined ? reportData.procedure : (r.procedure || '');
      const clinical_history = reportData.clinical_history !== undefined ? reportData.clinical_history : r.clinical_history;
      const findings = reportData.findings !== undefined ? reportData.findings : r.findings;
      const impression = reportData.impression !== undefined ? reportData.impression : r.impression;
      const advice = reportData.advice !== undefined ? reportData.advice : r.advice;
      const report_date = reportData.report_date !== undefined ? reportData.report_date : r.report_date;
      const report_time = reportData.report_time !== undefined ? reportData.report_time : r.report_time;
      const key_findings = reportData.key_findings !== undefined ? reportData.key_findings : r.key_findings;
      const status = reportData.status !== undefined ? reportData.status : r.status;
      const payment_status = reportData.payment_status !== undefined ? reportData.payment_status : (r.payment_status || 'Unpaid');
      const payment_date = reportData.payment_date !== undefined ? reportData.payment_date : (r.payment_date || '');
      const payment_time = reportData.payment_time !== undefined ? reportData.payment_time : (r.payment_time || '');
      const payment_received_by = reportData.payment_received_by !== undefined ? reportData.payment_received_by : (r.payment_received_by || '');
      const payment_amount = reportData.payment_amount !== undefined ? reportData.payment_amount : (reportData.report_fee !== undefined ? reportData.report_fee : (r.payment_amount || r.report_fee || 2500.0));
      const receipt_number = reportData.receipt_number !== undefined ? reportData.receipt_number : (r.receipt_number || formatReceiptNumber(id, report_date, ''));
      const structured_data = reportData.structured_data !== undefined ? reportData.structured_data : (r.structured_data || '');

      const updated: UltrasoundReport = {
        ...r,
        exam_type,
        study,
        procedure,
        clinical_history,
        findings,
        impression,
        advice,
        report_date,
        report_time,
        key_findings,
        status,
        payment_status,
        payment_date,
        payment_time,
        payment_received_by,
        payment_amount,
        report_fee: payment_amount,
        receipt_number,
        structured_data
      };
      data.ultrasound_reports[idx] = updated;
      saveFallbackData(data);
      return updated;
    }
    await initDb();
    const r = await this.getReportById(id);
    if (!r) return undefined;

    const exam_type = reportData.exam_type !== undefined ? reportData.exam_type : r.exam_type;
    const study = reportData.study !== undefined ? reportData.study : r.study;
    const procedure = reportData.procedure !== undefined ? reportData.procedure : (r.procedure || '');
    const clinical_history = reportData.clinical_history !== undefined ? reportData.clinical_history : r.clinical_history;
    const findings = reportData.findings !== undefined ? reportData.findings : r.findings;
    const impression = reportData.impression !== undefined ? reportData.impression : r.impression;
    const advice = reportData.advice !== undefined ? reportData.advice : r.advice;
    const report_date = reportData.report_date !== undefined ? reportData.report_date : r.report_date;
    const report_time = reportData.report_time !== undefined ? reportData.report_time : r.report_time;
    const key_findings = reportData.key_findings !== undefined ? reportData.key_findings : r.key_findings;
    const status = reportData.status !== undefined ? reportData.status : r.status;
    const payment_status = reportData.payment_status !== undefined ? reportData.payment_status : (r.payment_status || 'Unpaid');
    const payment_date = reportData.payment_date !== undefined ? reportData.payment_date : (r.payment_date || '');
    const payment_time = reportData.payment_time !== undefined ? reportData.payment_time : (r.payment_time || '');
    const payment_received_by = reportData.payment_received_by !== undefined ? reportData.payment_received_by : (r.payment_received_by || '');
    const payment_amount = reportData.payment_amount !== undefined ? reportData.payment_amount : (reportData.report_fee !== undefined ? reportData.report_fee : (r.payment_amount || r.report_fee || 2500.0));
    const receipt_number = reportData.receipt_number !== undefined ? reportData.receipt_number : (r.receipt_number || formatReceiptNumber(id, report_date, ''));
    const structured_data = reportData.structured_data !== undefined ? reportData.structured_data : (r.structured_data || '');

    const res = await pgPool!.query(`
      UPDATE ultrasound_reports 
      SET exam_type = $1, study = $2, procedure = $3, clinical_history = $4, findings = $5, impression = $6, advice = $7, report_date = $8, report_time = $9, key_findings = $10, status = $11, payment_status = $12, payment_date = $13, payment_time = $14, payment_received_by = $15, payment_amount = $16, report_fee = $17, receipt_number = $18, structured_data = $19
      WHERE id = $20
      RETURNING *
    `, [exam_type, study, procedure, clinical_history, findings, impression, advice, report_date, report_time, key_findings, status, payment_status, payment_date, payment_time, payment_received_by, payment_amount, payment_amount, receipt_number, structured_data, id]);

    return res.rows.length > 0 ? mapReport(res.rows[0]) : undefined;
  }

  async deleteReport(id: number): Promise<boolean> {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) return false;
    if (!isPostgresConfigured) {
      const data = loadFallbackData();
      const initialLen = data.ultrasound_reports.length;
      data.ultrasound_reports = data.ultrasound_reports.filter(r => r.id !== id);
      saveFallbackData(data);
      return data.ultrasound_reports.length < initialLen;
    }
    await initDb();
    const res = await pgPool!.query('DELETE FROM ultrasound_reports WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}

export const db = new PostgresDatabase();
