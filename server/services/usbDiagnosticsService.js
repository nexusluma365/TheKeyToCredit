import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { listRemovableDrives } from './usbDetectionService.js';

const execFileAsync = promisify(execFile);

export async function diagnoseUsbState() {
  const [drivesResult, volumesResult, diskutilResult] = await Promise.allSettled([
    listRemovableDrives(),
    listMacVolumes(),
    listMacExternalDisks(),
  ]);

  const appDrives = drivesResult.status === 'fulfilled' ? drivesResult.value : [];
  const systemVolumes = volumesResult.status === 'fulfilled' ? volumesResult.value : [];
  const externalDisks = diskutilResult.status === 'fulfilled' ? diskutilResult.value : null;
  const mountedAppDrives = appDrives.filter((drive) => drive.isReady && drive.mountPath);
  const volumeCandidates = systemVolumes.filter((volume) => (
    !volume.name.startsWith('.') &&
    !['Macintosh HD', 'Home', 'Recovery'].includes(volume.name)
  ));
  const fallbackDrives = volumeCandidates
    .filter((volume) => volume.readable)
    .map((volume) => ({
      devicePath: null,
      mountPath: volume.mountPath,
      driveName: volume.name,
      capacityBytes: null,
      capacityLabel: 'Unknown',
      protocol: 'USB',
      isRemovable: true,
      isReady: true,
      diagnosticFallback: true,
    }));

  let diagnosis = 'no_usb_detected';
  let repaired = false;
  let message = 'No mounted USB drive is visible to macOS or the app.';

  if (mountedAppDrives.length > 0) {
    diagnosis = 'app_can_read_usb';
    message = 'The app can read the mounted USB drive.';
  } else if (volumeCandidates.length > 0) {
    diagnosis = 'system_can_read_usb_app_cannot';
    repaired = true;
    message = 'macOS can see a mounted volume, but the app detector did not return it. Drive detection was refreshed.';
  } else if (externalDisks) {
    diagnosis = 'external_disk_visible_not_mounted';
    message = 'macOS sees an external disk, but it is not mounted as a readable USB volume.';
  }

  return {
    diagnosis,
    repaired,
    message,
    appDrives,
    mountedAppDrives,
    fallbackDrives,
    systemVolumes: volumeCandidates,
    externalDisks,
  };
}

async function listMacVolumes() {
  if (os.platform() !== 'darwin') return [];

  const entries = await fs.readdir('/Volumes', { withFileTypes: true });
  return Promise.all(entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map(async (entry) => {
      const mountPath = `/Volumes/${entry.name}`;
      let readable = false;
      try {
        await fs.access(mountPath);
        readable = true;
      } catch {
        readable = false;
      }

      return { name: entry.name, mountPath, readable };
    }));
}

async function listMacExternalDisks() {
  if (os.platform() !== 'darwin') return null;

  try {
    const { stdout } = await execFileAsync('diskutil', ['list', 'external', 'physical']);
    return stdout;
  } catch (err) {
    return `diskutil unavailable: ${err.message}`;
  }
}
