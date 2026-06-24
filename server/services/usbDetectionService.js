import drivelist from 'drivelist';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Lists removable drives connected to the machine.
 * Filters to drives that are removable and not the system drive,
 * since those are the only valid USB fulfillment targets.
 */
export async function listRemovableDrives() {
  const drives = await drivelist.list();

  const detectedDrives = drives
    .filter((d) => d.isRemovable && !d.isSystem && !d.isReadOnly)
    .map((d) => {
      const mountpoint = d.mountpoints?.[0]?.path || null;

      return {
        devicePath: d.device,
        mountPath: mountpoint,
        driveName: d.description || 'Unknown Drive',
        capacityBytes: d.size,
        capacityLabel: formatBytes(d.size),
        protocol: d.busType || 'USB',
        isRemovable: d.isRemovable,
        isReady: Boolean(mountpoint),
        raw: {
          device: d.device,
          partitions: d.mountpoints?.length || 0,
        },
      };
    });

  if (os.platform() !== 'darwin') return detectedDrives;

  const detectedDevices = new Set(detectedDrives.map((drive) => drive.devicePath));
  const rawExternalDisks = await listMacExternalPhysicalDisks();
  const missingRawDisks = rawExternalDisks.filter((disk) => !detectedDevices.has(disk.devicePath));

  return [...detectedDrives, ...missingRawDisks];
}

async function listMacExternalPhysicalDisks() {
  try {
    const { stdout } = await execFileAsync('diskutil', ['list', 'external', 'physical']);
    return parseMacExternalDisks(stdout);
  } catch {
    return [];
  }
}

function parseMacExternalDisks(output) {
  const disks = [];
  const lines = output.split('\n');
  let current = null;

  for (const line of lines) {
    const header = line.match(/^\/dev\/(disk\d+)\s+\(external,\s+physical\):/);
    if (header) {
      current = {
        devicePath: `/dev/${header[1]}`,
        mountPath: null,
        driveName: 'External USB Disk',
        capacityBytes: null,
        capacityLabel: 'Unknown size',
        protocol: 'USB',
        isRemovable: true,
        isReady: false,
        needsFormat: true,
        raw: {
          device: `/dev/${header[1]}`,
          source: 'diskutil',
          partitions: 0,
        },
      };
      disks.push(current);
      continue;
    }

    if (!current) continue;

    const wholeDisk = line.match(/^\s*0:\s+.+\*?\s+([0-9.]+\s+[A-Z]+)\s+(disk\d+)\s*$/);
    if (wholeDisk && `/dev/${wholeDisk[2]}` === current.devicePath) {
      current.capacityLabel = wholeDisk[1];
    }

    if (/^\s*\d+:\s+/.test(line)) {
      current.raw.partitions += 1;
    }
  }

  return disks;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
