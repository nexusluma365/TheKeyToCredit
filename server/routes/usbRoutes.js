import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { db } from '../db.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { listRemovableDrives } from '../services/usbDetectionService.js';
import { formatDrive } from '../services/usbFormatService.js';
import {
  copyInstallers,
  writeLicenseJson,
  writeStartHerePdf,
} from '../services/usbWriteService.js';
import { verifyUsbContents } from '../services/usbVerifyService.js';
import { createLicenseForCustomer } from '../services/keygenService.js';
import { pendingFullKeys } from './customerRoutes.js';

const router = express.Router();
router.use(requireAdminAuth);

const INSTALLERS_DIR = process.env.INSTALLERS_DIR || path.join(process.cwd(), 'installers');
const APP_VERSION = process.env.APP_VERSION || '1.0.0';

// GET /admin/usb/detect
router.get('/usb/detect', async (req, res) => {
  try {
    const drives = await listRemovableDrives();
    res.json({ drives });
  } catch (err) {
    console.error('[usb/detect]', err.message);
    res.status(500).json({ error: 'Could not enumerate removable drives.' });
  }
});

// POST /admin/local/fulfill-customer
// Local Mac app one-button flow:
// selected customer -> single mounted USB -> Keygen license -> write USB -> record.
router.post('/local/fulfill-customer', async (req, res) => {
  const { customerId, mountPath, preparedBy } = req.body || {};
  if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });

  try {
    const drives = await listRemovableDrives();
    const readyDrives = drives.filter((drive) => drive.isReady && drive.mountPath);
    const selectedDrive = mountPath
      ? readyDrives.find((drive) => drive.mountPath === mountPath)
      : readyDrives.length === 1
        ? readyDrives[0]
        : null;

    if (!selectedDrive) {
      return res.status(409).json({
        error:
          readyDrives.length === 0
            ? 'No mounted USB drive detected.'
            : 'Multiple USB drives detected. Leave only the target USB connected and try again.',
        drives: readyDrives,
      });
    }

    const { fullKey, keygenLicenseId, masked } = await createLicenseForCustomer({
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      orderId: customer.order_id,
    });

    const licenseId = crypto.randomUUID();
    const fingerprint = crypto.createHash('sha256').update(fullKey).digest('hex');
    db.prepare(
      `INSERT INTO licenses (id, customer_id, keygen_license_id, masked_license, license_fingerprint, status)
       VALUES (?, ?, ?, ?, ?, 'active')`
    ).run(licenseId, customer.id, keygenLicenseId, masked, fingerprint);

    const copiedInstallers = await copyInstallers(INSTALLERS_DIR, selectedDrive.mountPath);
    await writeLicenseJson(selectedDrive.mountPath, customer, fullKey);
    await writeStartHerePdf(selectedDrive.mountPath);

    const verification = await verifyUsbContents(selectedDrive.mountPath);
    const recordId = crypto.randomUUID();
    const status = verification.allPassed ? 'ready_to_ship' : 'prepared';

    db.prepare(
      `INSERT INTO fulfillment_records
        (id, customer_id, license_id, customer_name, customer_email, order_id,
         masked_license, app_version, prepared_by, status, drive_path, prepared_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      recordId,
      customer.id,
      licenseId,
      `${customer.first_name} ${customer.last_name}`,
      customer.email,
      customer.order_id,
      masked,
      APP_VERSION,
      preparedBy || req.admin?.email || 'Local Mac App',
      status,
      selectedDrive.mountPath
    );

    res.json({
      recordId,
      licenseId,
      maskedLicense: masked,
      licenseFile: 'license.json',
      drive: selectedDrive,
      copiedInstallers,
      verification,
      status,
      readyToShip: verification.allPassed,
    });
  } catch (err) {
    console.error('[local/fulfill-customer]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/usb/format
router.post('/usb/format', async (req, res) => {
  const { devicePath, mountPath, confirmationText } = req.body || {};

  if (confirmationText !== 'FORMAT') {
    return res.status(400).json({ error: 'You must type FORMAT to confirm this destructive action.' });
  }
  if (!devicePath && !mountPath) {
    return res.status(400).json({ error: 'devicePath or mountPath is required.' });
  }

  try {
    const result = await formatDrive({ devicePath, mountPath, confirmationText });
    res.json(result);
  } catch (err) {
    console.error('[usb/format]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/prepare-usb-record
// Runs: copy installers -> write license.json -> write START-HERE.pdf -> verify
router.post('/prepare-usb-record', async (req, res) => {
  const { customerId, licenseId, mountPath, preparedBy } = req.body || {};

  if (!customerId || !licenseId || !mountPath) {
    return res.status(400).json({ error: 'customerId, licenseId, and mountPath are required.' });
  }

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(licenseId);

  if (!customer || !license) {
    return res.status(404).json({ error: 'Customer or license not found.' });
  }

  const fullKey = pendingFullKeys.get(licenseId);
  if (!fullKey) {
    return res.status(409).json({
      error: 'Full license key is no longer available in memory. Generate a new license to proceed.',
    });
  }

  try {
    const copiedInstallers = await copyInstallers(INSTALLERS_DIR, mountPath);
    await writeLicenseJson(mountPath, customer, fullKey);
    await writeStartHerePdf(mountPath);

    // Discard the full key from memory immediately after writing.
    pendingFullKeys.delete(licenseId);

    const verification = await verifyUsbContents(mountPath);

    const recordId = crypto.randomUUID();
    const status = verification.allPassed ? 'ready_to_ship' : 'prepared';

    db.prepare(
      `INSERT INTO fulfillment_records
        (id, customer_id, license_id, customer_name, customer_email, order_id,
         masked_license, app_version, prepared_by, status, drive_path, prepared_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      recordId,
      customer.id,
      license.id,
      `${customer.first_name} ${customer.last_name}`,
      customer.email,
      customer.order_id,
      license.masked_license,
      APP_VERSION,
      preparedBy || req.admin?.email || 'unknown',
      status,
      mountPath
    );

    res.json({
      recordId,
      copiedInstallers,
      verification,
      status,
      readyToShip: verification.allPassed,
    });
  } catch (err) {
    console.error('[prepare-usb-record]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/ship-usb
router.post('/ship-usb', (req, res) => {
  const { recordId } = req.body || {};
  if (!recordId) return res.status(400).json({ error: 'recordId is required.' });

  const record = db.prepare('SELECT * FROM fulfillment_records WHERE id = ?').get(recordId);
  if (!record) return res.status(404).json({ error: 'Fulfillment record not found.' });

  if (record.status !== 'ready_to_ship') {
    return res.status(409).json({ error: `Cannot ship a record with status "${record.status}".` });
  }

  db.prepare(`UPDATE fulfillment_records SET status = 'shipped', shipped_at = datetime('now') WHERE id = ?`).run(
    recordId
  );

  res.json({ recordId, status: 'shipped' });
});

// GET /admin/fulfillment-records
router.get('/fulfillment-records', (req, res) => {
  const records = db
    .prepare('SELECT * FROM fulfillment_records ORDER BY created_at DESC LIMIT 200')
    .all();

  res.json({
    records: records.map((r) => ({
      id: r.id,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      orderId: r.order_id,
      maskedLicense: r.masked_license,
      appVersion: r.app_version,
      preparedBy: r.prepared_by,
      status: r.status,
      preparedAt: r.prepared_at,
      shippedAt: r.shipped_at,
      createdAt: r.created_at,
    })),
  });
});

export default router;
