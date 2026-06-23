import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'fulfillment.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    order_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

    -- Full license key is NEVER stored here in plaintext.
    -- It lives only transiently in memory during license.json writing.
  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    keygen_license_id TEXT NOT NULL,
    masked_license TEXT NOT NULL,
    license_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fulfillment_records (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    license_id TEXT NOT NULL REFERENCES licenses(id),
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    order_id TEXT,
    masked_license TEXT NOT NULL,
    app_version TEXT NOT NULL,
    prepared_by TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    drive_path TEXT,
    prepared_at TEXT,
    shipped_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_fulfillment_status ON fulfillment_records(status);
  CREATE INDEX IF NOT EXISTS idx_licenses_customer ON licenses(customer_id);
`);

// Seed an initial admin user if none exists and seed credentials are provided.
const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get();
if (adminCount.count === 0 && process.env.ADMIN_SEED_EMAIL && process.env.ADMIN_SEED_PASSWORD) {
  const hash = bcrypt.hashSync(process.env.ADMIN_SEED_PASSWORD, 12);
  db.prepare('INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)').run(
    crypto.randomUUID(),
    process.env.ADMIN_SEED_EMAIL,
    hash
  );
  console.log(`[db] Seeded admin user: ${process.env.ADMIN_SEED_EMAIL}`);
}
