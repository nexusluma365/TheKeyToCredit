import fs from 'fs/promises';
import path from 'path';
import { USB_FILES } from './usbWriteService.js';

export async function verifyUsbContents(usbMountPath) {
  const checks = {
    windowsInstallerExists: false,
    macInstallerExists: false,
    startHereTxtExists: false,
    licenseDatExists: false,
    licenseDatValid: false,
    structureCorrect: false,
  };

  const fileChecks = [
    { key: 'windowsInstallerExists', file: USB_FILES.windowsInstaller },
    { key: 'macInstallerExists', file: USB_FILES.macInstaller },
    { key: 'startHereTxtExists', file: USB_FILES.startHere },
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
    const content = await fs.readFile(licensePath, 'utf-8');
    checks.licenseDatExists = true;
    checks.licenseDatValid = typeof content === 'string' && content.trim().length > 0;
  } catch {
    checks.licenseDatExists = false;
    checks.licenseDatValid = false;
  }

  // Confirm no unexpected top-level entries beyond what's allowed.
  const allowed = new Set([
    USB_FILES.windowsInstaller,
    USB_FILES.macInstaller,
    USB_FILES.licenseDir,         // '.credit-key'
    USB_FILES.startHere,
    'System Volume Information',  // OS-created, ignorable
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
    checks.startHereTxtExists &&
    checks.licenseDatExists &&
    checks.licenseDatValid &&
    unexpectedEntries.length === 0;

  const allPassed = Object.values(checks).every(Boolean);

  return { ...checks, unexpectedEntries, allPassed };
}
