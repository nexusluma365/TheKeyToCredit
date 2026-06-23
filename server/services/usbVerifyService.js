import fs from 'fs/promises';
import path from 'path';
import { PRODUCT_NAME, USB_FILES } from './usbWriteService.js';

export async function verifyUsbContents(usbMountPath) {
  const checks = {
    windowsInstallerExists: false,
    macInstallerExists: false,
    startHerePdfExists: false,
    licenseJsonExists: false,
    licenseJsonValid: false,
    structureCorrect: false,
  };

  const fileChecks = [
    { key: 'windowsInstallerExists', file: USB_FILES.windowsInstaller },
    { key: 'macInstallerExists', file: USB_FILES.macInstaller },
    { key: 'startHerePdfExists', file: USB_FILES.startHere },
  ];

  for (const { key, file } of fileChecks) {
    try {
      await fs.access(path.join(usbMountPath, file));
      checks[key] = true;
    } catch {
      checks[key] = false;
    }
  }

  const licensePath = path.join(usbMountPath, USB_FILES.license);
  try {
    const licenseJson = JSON.parse(await fs.readFile(licensePath, 'utf-8'));
    checks.licenseJsonExists = true;
    checks.licenseJsonValid =
      typeof licenseJson.licenseKey === 'string' &&
      licenseJson.licenseKey.length > 0 &&
      typeof licenseJson.customerName === 'string' &&
      licenseJson.customerName.length > 0 &&
      typeof licenseJson.customerEmail === 'string' &&
      licenseJson.customerEmail.length > 0 &&
      licenseJson.product === PRODUCT_NAME;
  } catch {
    checks.licenseJsonExists = false;
    checks.licenseJsonValid = false;
  }

  // Confirm no unexpected top-level entries beyond what's allowed.
  const allowed = new Set([
    USB_FILES.windowsInstaller,
    USB_FILES.macInstaller,
    USB_FILES.license,
    USB_FILES.startHere,
    'System Volume Information', // OS-created, ignorable
    '.Trashes', '.fseventsd', '.Spotlight-V100', // macOS-created, ignorable
  ]);

  let unexpectedEntries = [];
  try {
    const entries = await fs.readdir(usbMountPath);
    unexpectedEntries = entries.filter((e) => !allowed.has(e));
  } catch {
    unexpectedEntries = ['<could not read drive>'];
  }

  checks.structureCorrect =
    checks.windowsInstallerExists &&
    checks.macInstallerExists &&
    checks.startHerePdfExists &&
    checks.licenseJsonExists &&
    checks.licenseJsonValid &&
    unexpectedEntries.length === 0;

  const allPassed = Object.values(checks).every(Boolean);

  return { ...checks, unexpectedEntries, allPassed };
}
