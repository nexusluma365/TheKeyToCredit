import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { USB_FILES } from './usbWriteService.js';

const execFileAsync = promisify(execFile);

async function hasMinimumSize(filePath, minimumBytes) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size >= minimumBytes;
  } catch {
    return false;
  }
}

async function isWindowsInstaller(filePath) {
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(2);
      await handle.read(buffer, 0, 2, 0);
      return buffer.toString('ascii') === 'MZ';
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

async function isValidMacDiskImage(filePath) {
  if (os.platform() !== 'darwin') {
    return hasMinimumSize(filePath, 1024 * 1024);
  }

  try {
    await execFileAsync('hdiutil', ['verify', filePath]);
    return true;
  } catch {
    return false;
  }
}

async function hasAppleQuarantine(filePath) {
  if (os.platform() !== 'darwin') return false;

  try {
    const { stdout } = await execFileAsync('xattr', [filePath]);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .some((name) => name === 'com.apple.quarantine');
  } catch {
    return false;
  }
}

export async function verifyUsbContents(usbMountPath) {
  const checks = {
    windowsInstallerExists: false,
    windowsInstallerValid: false,
    windowsInstallerQuarantineCleared: false,
    macInstallerExists: false,
    macInstallerValid: false,
    macInstallerQuarantineCleared: false,
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

  const windowsPath = path.join(usbMountPath, USB_FILES.windowsInstaller);
  checks.windowsInstallerValid =
    checks.windowsInstallerExists &&
    await hasMinimumSize(windowsPath, 1024 * 1024) &&
    await isWindowsInstaller(windowsPath);
  checks.windowsInstallerQuarantineCleared =
    checks.windowsInstallerExists &&
    !await hasAppleQuarantine(windowsPath);

  const macPath = path.join(usbMountPath, USB_FILES.macInstaller);
  checks.macInstallerValid =
    checks.macInstallerExists &&
    await isValidMacDiskImage(macPath);
  checks.macInstallerQuarantineCleared =
    checks.macInstallerExists &&
    !await hasAppleQuarantine(macPath);

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
    checks.windowsInstallerValid &&
    checks.windowsInstallerQuarantineCleared &&
    checks.macInstallerExists &&
    checks.macInstallerValid &&
    checks.macInstallerQuarantineCleared &&
    checks.startHereTxtExists &&
    checks.licenseDatExists &&
    checks.licenseDatValid &&
    unexpectedEntries.length === 0;

  const allPassed = Object.values(checks).every(Boolean);

  return { ...checks, unexpectedEntries, allPassed };
}
