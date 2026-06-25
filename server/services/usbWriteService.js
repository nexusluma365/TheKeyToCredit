import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

export const USB_FILES = {
  windowsInstaller: 'CreditAnalyzer Setup.exe',
  macInstaller: 'CreditAnalyzer.dmg',
  licenseDir: '.credit-key',
  license: '.credit-key/license.dat',
  startHere: 'START-HERE.txt',
};

export const PRODUCT_NAME = 'Credit Report Analyzer Pro';

const INSTALLER_SOURCES = [
  {
    destination: USB_FILES.windowsInstaller,
    candidates: [
      USB_FILES.windowsInstaller,
      'CreditAnalyzer-Windows.exe',
      'Credit Report Analyzer Pro Setup 0.1.0.exe',
    ],
  },
  {
    destination: USB_FILES.macInstaller,
    candidates: [
      USB_FILES.macInstaller,
      'CreditAnalyzer-Mac.dmg',
      'Credit Report Analyzer Pro-0.1.0.dmg',
    ],
  },
];

/**
 * Files that must NEVER be written to a customer USB, even by accident.
 * Used as a defensive check before any copy operation.
 */
const FORBIDDEN_NAMES = [
  'src', 'server', 'node_modules', '.env', '.env.local',
  'package.json', 'package-lock.json', '.git', 'logs',
];

function assertNotForbidden(filename) {
  const base = path.basename(filename).toLowerCase();
  if (FORBIDDEN_NAMES.some((f) => base === f.toLowerCase())) {
    throw new Error(`Refusing to write forbidden file/folder to USB: ${filename}`);
  }
}

async function findInstallerSource(installersDir, candidates) {
  for (const filename of candidates) {
    const sourcePath = path.join(installersDir, filename);
    try {
      await fs.access(sourcePath);
      return { filename, sourcePath };
    } catch {
      // Try the next supported build output name.
    }
  }

  return null;
}

export async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifyMacDiskImage(filePath) {
  if (os.platform() !== 'darwin') return;
  await execFileAsync('hdiutil', ['verify', filePath]);
}

async function validateInstallerSource(installer, sourcePath) {
  const stat = await fs.stat(sourcePath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`Installer source is empty or invalid: ${sourcePath}`);
  }

  if (installer.destination === USB_FILES.macInstaller) {
    try {
      await verifyMacDiskImage(sourcePath);
    } catch (err) {
      throw new Error(`Mac installer source is not a valid disk image: ${sourcePath}. ${err.message}`);
    }
  }

  return stat;
}

async function copyAndVerifyFile(sourcePath, destPath, installer) {
  const sourceStat = await validateInstallerSource(installer, sourcePath);
  const sourceHash = await sha256File(sourcePath);

  await fs.copyFile(sourcePath, destPath);

  const destStat = await fs.stat(destPath);
  const destHash = await sha256File(destPath);

  if (sourceStat.size !== destStat.size || sourceHash !== destHash) {
    throw new Error(
      `Installer copy verification failed for ${installer.destination}. ` +
      `Source ${sourceStat.size} bytes/${sourceHash}; destination ${destStat.size} bytes/${destHash}.`
    );
  }

  if (installer.destination === USB_FILES.macInstaller) {
    try {
      await verifyMacDiskImage(destPath);
    } catch (err) {
      throw new Error(`Copied Mac installer is not a valid disk image on the USB: ${destPath}. ${err.message}`);
    }
  }

  return {
    bytes: destStat.size,
    sha256: destHash,
  };
}

export async function assertUsbWritable(usbMountPath) {
  if (!usbMountPath) {
    const err = new Error('USB License Key Not Detected. Please plug in your Credit Analyzer USB to continue.');
    err.code = 'USB_DISCONNECTED';
    throw err;
  }

  try {
    const stat = await fs.stat(usbMountPath);
    if (!stat.isDirectory()) throw new Error('USB mount path is not a directory.');
    await fs.access(usbMountPath);
  } catch {
    const err = new Error('USB has been disconnected. Reconnect the USB and try again.');
    err.code = 'USB_DISCONNECTED';
    err.mountPath = usbMountPath;
    throw err;
  }
}

/**
 * Copies the two production installers onto the USB.
 */
export async function copyInstallers(installersDir, usbMountPath) {
  const copied = [];
  await assertUsbWritable(usbMountPath);

  for (const installer of INSTALLER_SOURCES) {
    await assertUsbWritable(usbMountPath);
    assertNotForbidden(installer.destination);

    const source = await findInstallerSource(installersDir, installer.candidates);
    if (!source) {
      throw new Error(
        `Missing required installer in ${installersDir}: ${installer.destination}. ` +
        `Also checked: ${installer.candidates.join(', ')}`
      );
    }

    const dest = path.join(usbMountPath, installer.destination);
    const verification = await copyAndVerifyFile(source.sourcePath, dest, installer);
    await assertUsbWritable(usbMountPath);
    copied.push({
      source: source.filename,
      sourcePath: source.sourcePath,
      destination: installer.destination,
      ...verification,
    });
  }

  return copied;
}

/**
 * Writes the customer license key into .credit-key/license.dat on the USB.
 * The folder is hidden on macOS so it doesn't clutter the customer's view.
 * The customer-facing app reads this file first when scanning the USB.
 */
export async function writeLicenseJson(usbMountPath, _customer, fullLicenseKey) {
  await assertUsbWritable(usbMountPath);
  assertNotForbidden(USB_FILES.licenseDir);
  assertNotForbidden(USB_FILES.license);

  const dirPath = path.join(usbMountPath, USB_FILES.licenseDir);
  await fs.mkdir(dirPath, { recursive: true });

  const filePath = path.join(usbMountPath, USB_FILES.license);
  await fs.writeFile(filePath, fullLicenseKey, 'utf-8');

  if (os.platform() === 'darwin') {
    await execFileAsync('chflags', ['hidden', dirPath]).catch(() => null);
  }

  await assertUsbWritable(usbMountPath);
  return filePath;
}

/**
 * Writes a plain-text START-HERE.txt for the customer.
 */
export async function writeStartHereTxt(usbMountPath) {
  await assertUsbWritable(usbMountPath);
  assertNotForbidden(USB_FILES.startHere);

  const lines = [
    'Welcome to Credit Report Analyzer Pro',
    '',
    '1. Keep this USB plugged in while using the app.',
    `2. Windows installer: ${USB_FILES.windowsInstaller}`,
    `3. Mac installer: ${USB_FILES.macInstaller}`,
    '4. The license key is stored in .credit-key/license.dat.',
    '5. The app validates this USB license through the secure backend.',
    '6. Keygen controls active, expired, suspended, and machine access.',
    '7. If the USB is removed, plug it back in to continue.',
    '8. Do not delete, rename, or edit files in the .credit-key folder.',
    '',
    'Need help? Contact support with your order information.',
  ];

  const filePath = path.join(usbMountPath, USB_FILES.startHere);
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  await assertUsbWritable(usbMountPath);
  return filePath;
}
