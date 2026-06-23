import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { db } from '../db.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { createLicenseForCustomer } from '../services/keygenService.js';
import { pendingFullKeys } from './customerRoutes.js';

const router = express.Router();
router.use(requireAdminAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// POST /admin/bulk/import
// Expects CSV columns: First Name, Last Name, Email, Phone, Order ID
router.post('/bulk/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });

  let rows;
  try {
    rows = parse(req.file.buffer.toString('utf-8'), {
      columns: (header) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    return res.status(400).json({ error: `Could not parse CSV: ${err.message}` });
  }

  const results = [];

  for (const row of rows) {
    const firstName = row['First Name'];
    const lastName = row['Last Name'];
    const email = row['Email'];
    const phone = row['Phone'] || null;
    const orderId = row['Order ID'] || null;

    if (!firstName || !lastName || !email) {
      results.push({ row, status: 'skipped', reason: 'Missing required field(s).' });
      continue;
    }

    try {
      const customerId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO customers (id, first_name, last_name, email, phone, order_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(customerId, firstName, lastName, email, phone, orderId);

      const { fullKey, keygenLicenseId, masked } = await createLicenseForCustomer({
        id: customerId,
        firstName,
        lastName,
        email,
        orderId,
      });

      const fingerprint = crypto.createHash('sha256').update(fullKey).digest('hex');
      const licenseId = crypto.randomUUID();

      db.prepare(
        `INSERT INTO licenses (id, customer_id, keygen_license_id, masked_license, license_fingerprint, status)
         VALUES (?, ?, ?, ?, ?, 'active')`
      ).run(licenseId, customerId, keygenLicenseId, masked, fingerprint);

      pendingFullKeys.set(licenseId, fullKey);
      setTimeout(() => pendingFullKeys.delete(licenseId), 60 * 60 * 1000); // 1hr for bulk batches

      db.prepare(
        `INSERT INTO fulfillment_records
          (id, customer_id, license_id, customer_name, customer_email, order_id,
           masked_license, app_version, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      ).run(
        crypto.randomUUID(),
        customerId,
        licenseId,
        `${firstName} ${lastName}`,
        email,
        orderId,
        masked,
        process.env.APP_VERSION || '1.0.0'
      );

      results.push({
        customerId,
        licenseId,
        email,
        maskedLicense: masked,
        status: 'queued',
      });
    } catch (err) {
      results.push({ row, status: 'failed', reason: err.message });
    }
  }

  res.json({
    totalRows: rows.length,
    succeeded: results.filter((r) => r.status === 'queued').length,
    failed: results.filter((r) => r.status !== 'queued').length,
    results,
  });
});

export default router;
