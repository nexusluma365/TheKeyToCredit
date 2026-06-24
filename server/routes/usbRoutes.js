import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { listRemovableDrives } from '../services/usbDetectionService.js';
import { formatDrive, VOLUME_LABEL } from '../services/usbFormatService.js';
import {
  assertUsbWritable,
  copyInstallers,
  writeLicenseJson,
  writeStartHerePdf,
} from '../services/usbWriteService.js';
import { verifyUsbContents } from '../services/usbVerifyService.js';
import { createLicenseForCustomer } from '../services/keygenService.js';
import { diagnoseUsbState } from '../services/usbDiagnosticsService.js';
import { pendingFullKeys } from './customerRoutes.js';

const router = express.Router();
router.use(requireAdminAuth);

const INSTALLERS_DIR = process.env.INSTALLERS_DIR || path.join(process.cwd(), 'installers');
const APP_VERSION = process.env.APP_VERSION || '1.0.0';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findReadyDrive({ mountPath, devicePath }) {
  const drives = await listRemovableDrives();
  const readyDrives = drives.filter((drive) => drive.isReady && drive.mountPath);
  const selectedDrive = mountPath
    ? readyDrives.find((drive) => drive.mountPath === mountPath)
    : readyDrives.length === 1
      ? readyDrives[0]
      : null;

  if (selectedDrive) return { selectedDrive, readyDrives };
  if (devicePath) {
    const byDevice = readyDrives.find((drive) => drive.devicePath === devicePath);
    if (byDevice) return { selectedDrive: byDevice, readyDrives };
  }

  if (mountPath && await canReadMountPath(mountPath)) {
    const fallbackDrive = {
      devicePath: devicePath || null,
      mountPath,
      driveName: path.basename(mountPath),
      isReady: true,
      isRemovable: true,
      diagnosticFallback: true,
    };
    return { selectedDrive: fallbackDrive, readyDrives: [fallbackDrive] };
  }

  return { selectedDrive: null, readyDrives };
}

async function canReadMountPath(mountPath) {
  try {
    const stat = await fs.stat(mountPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function waitForFormattedDrive(previousDrive) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(1000);
    const drives = await listRemovableDrives();
    const readyDrives = drives.filter((drive) => drive.isReady && drive.mountPath);
    const formatted = readyDrives.find((drive) => drive.devicePath && drive.devicePath === previousDrive.devicePath)
      || readyDrives.find((drive) => drive.mountPath?.includes(VOLUME_LABEL))
      || (readyDrives.length === 1 ? readyDrives[0] : null);

    if (formatted) return formatted;

    const fallbackMount = `/Volumes/${VOLUME_LABEL}`;
    if (await canReadMountPath(fallbackMount)) {
      return {
        devicePath: previousDrive.devicePath || null,
        mountPath: fallbackMount,
        driveName: VOLUME_LABEL,
        isReady: true,
        isRemovable: true,
        diagnosticFallback: true,
      };
    }
  }

  throw new Error('USB was formatted, but the formatted drive did not remount in time.');
}

function usbErrorPayload(err) {
  if (err?.code !== 'USB_DISCONNECTED') return null;

  return {
    error: 'USB has been disconnected. Reconnect the USB and try again.',
    usbDisconnected: true,
    mountPath: err.mountPath,
  };
}

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

// GET /admin/usb/diagnose
// Compares app-level USB detection with macOS-visible mounted volumes.
router.get('/usb/diagnose', async (req, res) => {
  try {
    const diagnosis = await diagnoseUsbState();
    res.json(diagnosis);
  } catch (err) {
    console.error('[usb/diagnose]', err.message);
    res.status(500).json({ error: 'Could not diagnose USB state.' });
  }
});

// POST /admin/local/fulfill-customer
// Local Mac app one-button flow:
// selected customer -> single mounted USB -> Keygen license -> write USB -> record.
router.post('/local/fulfill-customer', async (req, res) => {
  const { customerId, mountPath, formatFirst = true, confirmationText, preparedBy } = req.body || {};
  if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });

  try {
    const { selectedDrive, readyDrives } = await findReadyDrive({ mountPath });

    if (!selectedDrive) {
      return res.status(409).json({
        error:
          readyDrives.length === 0
            ? 'No mounted USB drive detected.'
            : 'Multiple USB drives detected. Leave only the target USB connected and try again.',
        drives: readyDrives,
      });
    }

    if (formatFirst && confirmationText !== 'FORMAT') {
      return res.status(400).json({ error: 'Type FORMAT to confirm erasing and preparing the selected USB.' });
    }

    let preparedDrive = selectedDrive;
    let formatResult = null;
    if (formatFirst) {
      formatResult = await formatDrive({
        devicePath: selectedDrive.devicePath,
        mountPath: selectedDrive.mountPath,
        confirmationText,
      });

      if (!formatResult.automated) {
        return res.status(409).json({
          error: formatResult.error || 'Automatic USB formatting did not complete.',
          formatResult,
        });
      }

      preparedDrive = await waitForFormattedDrive(selectedDrive);
    }

    await assertUsbWritable(preparedDrive.mountPath);

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

    const copiedInstallers = await copyInstallers(INSTALLERS_DIR, preparedDrive.mountPath);
    await assertUsbWritable(preparedDrive.mountPath);
    await writeLicenseJson(preparedDrive.mountPath, customer, fullKey);
    await assertUsbWritable(preparedDrive.mountPath);
    await writeStartHerePdf(preparedDrive.mountPath);
    await assertUsbWritable(preparedDrive.mountPath);

    const verification = await verifyUsbContents(preparedDrive.mountPath);
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
      preparedDrive.mountPath
    );

    res.json({
      recordId,
      licenseId,
      maskedLicense: masked,
      licenseFile: 'license.json',
      drive: preparedDrive,
      formatResult,
      copiedInstallers,
      verification,
      status,
      readyToShip: verification.allPassed,
    });
  } catch (err) {
    console.error('[local/fulfill-customer]', err.message);
    const payload = usbErrorPayload(err);
    if (payload) return res.status(409).json(payload);
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
    await assertUsbWritable(mountPath);
    const copiedInstallers = await copyInstallers(INSTALLERS_DIR, mountPath);
    await writeLicenseJson(mountPath, customer, fullKey);
    await writeStartHerePdf(mountPath);
    await assertUsbWritable(mountPath);

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
    const payload = usbErrorPayload(err);
    if (payload) return res.status(409).json(payload);
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
