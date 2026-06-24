import express from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { createLicenseForCustomer } from '../services/keygenService.js';

const router = express.Router();
router.use(requireAdminAuth);

// GET /admin/customers
router.get('/customers', (req, res) => {
  const customers = db
    .prepare(
      `SELECT
        c.*,
        l.id as license_id,
        l.masked_license,
        l.status as license_status,
        l.created_at as license_created_at
       FROM customers c
       LEFT JOIN licenses l ON l.id = (
        SELECT id FROM licenses WHERE customer_id = c.id ORDER BY created_at DESC LIMIT 1
       )
       ORDER BY c.created_at DESC
       LIMIT 500`
    )
    .all();

  res.json({
    customers: customers.map((customer) => ({
      customerId: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      orderId: customer.order_id,
      notes: customer.notes,
      createdAt: customer.created_at,
      licenseId: customer.license_id,
      maskedLicense: customer.masked_license,
      licenseStatus: customer.license_status || 'none',
      licenseCreatedAt: customer.license_created_at,
    })),
  });
});

// POST /admin/create-customer
router.post('/create-customer', (req, res) => {
  const { firstName, lastName, email, phone, orderId, notes } = req.body || {};

  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO customers (id, first_name, last_name, email, phone, order_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, firstName, lastName, email, phone || null, orderId || null, notes || null);

  res.status(201).json({
    customerId: id,
    firstName,
    lastName,
    email,
    orderId: orderId || null,
    licenseStatus: 'none',
  });
});

// GET /admin/customers/:id
router.get('/customers/:id', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });

  const license = db
    .prepare('SELECT * FROM licenses WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(customer.id);

  res.json({
    customerId: customer.id,
    firstName: customer.first_name,
    lastName: customer.last_name,
    email: customer.email,
    orderId: customer.order_id,
    licenseStatus: license ? license.status : 'none',
    maskedLicense: license ? license.masked_license : null,
  });
});

// DELETE /admin/customers/:id
router.delete('/customers/:id', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });

  const deleteCustomer = db.transaction((customerId) => {
    db.prepare('DELETE FROM fulfillment_records WHERE customer_id = ?').run(customerId);
    db.prepare('DELETE FROM licenses WHERE customer_id = ?').run(customerId);
    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
  });

  deleteCustomer(customer.id);
  res.json({ deleted: true, customerId: customer.id });
});

// POST /admin/create-customer-license
// Creates a Keygen license for an existing customer.
// The full license key NEVER leaves this function's local scope as a
// response field — only the masked version goes back to the frontend.
router.post('/create-customer-license', async (req, res) => {
  const { customerId } = req.body || {};
  if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });

  try {
    const { fullKey, keygenLicenseId, masked } = await createLicenseForCustomer({
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      orderId: customer.order_id,
    });

    const fingerprint = crypto.createHash('sha256').update(fullKey).digest('hex');
    const licenseId = crypto.randomUUID();

    db.prepare(
      `INSERT INTO licenses (id, customer_id, keygen_license_id, masked_license, license_fingerprint, status)
       VALUES (?, ?, ?, ?, ?, 'active')`
    ).run(licenseId, customer.id, keygenLicenseId, masked, fingerprint);

    // fullKey is intentionally not stored and not returned here.
    // It will be re-fetched from Keygen only at USB-write time via
    // a dedicated internal call, keeping it out of logs and DB at rest.
    // For this implementation, we cache it in a short-lived in-memory
    // map keyed by licenseId so the prepare-usb step can use it once.
    pendingFullKeys.set(licenseId, fullKey);
    setTimeout(() => pendingFullKeys.delete(licenseId), 15 * 60 * 1000); // expire after 15 min

    res.status(201).json({
      customerId: customer.id,
      licenseId,
      maskedLicense: masked,
      status: 'active',
    });
  } catch (err) {
    console.error('[create-customer-license]', err.message);
    res.status(502).json({ error: 'Failed to create license. Check Keygen configuration and try again.' });
  }
});

// In-memory holding area for full license keys between generation and
// USB writing. Never persisted to disk in plaintext, never logged,
// never sent to the frontend. Expires automatically.
export const pendingFullKeys = new Map();

export default router;
