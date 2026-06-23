import drivelist from 'drivelist';

/**
 * Lists removable drives connected to the machine.
 * Filters to drives that are removable and not the system drive,
 * since those are the only valid USB fulfillment targets.
 */
export async function listRemovableDrives() {
  const drives = await drivelist.list();

  return drives
    .filter((d) => d.isRemovable && !d.isSystem && !d.isReadOnly)
    .map((d) => {
      const mountpoint = d.mountpoints?.[0]?.path || null;
      const fileSystem = d.mountpoints?.[0]?.label ? d.description : d.description;

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
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
