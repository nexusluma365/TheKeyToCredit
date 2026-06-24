import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const VOLUME_LABEL = 'CREDIT_ANALYZER';

/**
 * Formats the target drive as exFAT with the standard volume label.
 * Requires explicit confirmation text to have already been validated
 * by the route handler before this is ever called.
 *
 * If the platform-specific format command isn't safely automatable
 * (permissions, missing tool, unsupported platform), returns manual
 * instructions instead of attempting anything destructive.
 */
export async function formatDrive({ devicePath, mountPath, confirmationText }) {
  if (confirmationText !== 'FORMAT') {
    throw new Error('Format confirmation text did not match. Aborting.');
  }

  const platform = os.platform();

  if (platform === 'darwin') {
    return formatOnMac(devicePath);
  }

  if (platform === 'win32') {
    return formatOnWindows(mountPath);
  }

  return {
    automated: false,
    manualInstructions: manualInstructionsFor(platform, devicePath || mountPath),
  };
}

async function formatOnMac(devicePath) {
  if (!devicePath || !/^\/dev\/disk\d+$/i.test(devicePath)) {
    throw new Error('A valid removable disk device path is required for formatting.');
  }

  try {
    // diskutil eraseDisk <format> <name> <device>
    const { stdout } = await execFileAsync('diskutil', ['eraseDisk', 'ExFAT', VOLUME_LABEL, devicePath]);
    return { automated: true, output: stdout, label: VOLUME_LABEL };
  } catch (err) {
    return {
      automated: false,
      error: err.message,
      manualInstructions: manualInstructionsFor('darwin', devicePath),
    };
  }
}

async function formatOnWindows(mountPath) {
  try {
    const driveLetter = mountPath?.replace(/\\$/, '').replace(/[^A-Z:]/gi, '');
    if (!driveLetter) throw new Error('Could not resolve a drive letter for formatting.');

    // format <letter>: /FS:exFAT /V:LABEL /Q /Y
    const { stdout } = await execAsync(
      `format ${driveLetter} /FS:exFAT /V:${VOLUME_LABEL} /Q /Y`
    );
    return { automated: true, output: stdout, label: VOLUME_LABEL };
  } catch (err) {
    return {
      automated: false,
      error: err.message,
      manualInstructions: manualInstructionsFor('win32', mountPath),
    };
  }
}

function manualInstructionsFor(platform, target) {
  if (platform === 'darwin') {
    return [
      'Open Disk Utility.',
      `Select the USB drive (${target || 'target device'}) in the sidebar.`,
      'Click Erase.',
      `Set Format to "ExFAT" and Name to "${VOLUME_LABEL}".`,
      'Click Erase to confirm.',
    ];
  }

  if (platform === 'win32') {
    return [
      'Open File Explorer.',
      `Right-click the USB drive (${target || 'target device'}).`,
      'Select Format.',
      `Set File system to "exFAT" and Volume label to "${VOLUME_LABEL}".`,
      'Click Start.',
    ];
  }

  return [
    'Automatic formatting is not supported on this platform.',
    `Manually format the drive as exFAT with volume label "${VOLUME_LABEL}" using your OS disk utility.`,
  ];
}
