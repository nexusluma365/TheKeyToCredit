import React, { useState } from 'react';
import { Usb, RefreshCw, Loader2 } from 'lucide-react';
import SectionCard from './SectionCard';
import StatusPill from './StatusPill';
import { api } from '../services/api';

export default function UsbDetectionSection({ disabled, selectedDrive, onSelectDrive }) {
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scanned, setScanned] = useState(false);

  async function handleScan() {
    setLoading(true);
    setError(null);
    try {
      const { drives: found } = await api.detectUsb();
      setDrives(found);
      setScanned(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      stepNumber={2}
      title="USB Detection"
      subtitle="Plug in a blank USB drive, then scan to detect it"
      icon={Usb}
      accent="#4F5BFF"
      status={
        selectedDrive ? (
          <StatusPill variant="success">Connected</StatusPill>
        ) : scanned ? (
          <StatusPill variant="warning">Not Ready</StatusPill>
        ) : (
          <StatusPill variant="neutral">Not Scanned</StatusPill>
        )
      }
    >
      <button onClick={handleScan} disabled={disabled || loading} className="pill-secondary mb-4">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {loading ? 'Scanning…' : 'Scan for USB Drives'}
      </button>

      {error && <div className="mb-3 text-sm text-danger">{error}</div>}

      {scanned && drives.length === 0 && !error && (
        <p className="text-sm text-mist">No removable drives detected. Plug in a USB and scan again.</p>
      )}

      {drives.length > 0 && (
        <div className="space-y-2">
          {drives.map((d) => {
            const isSelected = selectedDrive?.devicePath === d.devicePath;
            return (
              <button
                key={d.devicePath}
                onClick={() => onSelectDrive(d)}
                className={`w-full text-left rounded-2xl border p-3.5 transition-all ${
                  isSelected ? 'border-accent bg-accent/5' : 'border-black/[0.08] hover:border-black/15'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-ink">{d.driveName}</div>
                    <div className="text-xs text-mist mt-0.5">
                      {d.capacityLabel} · {d.protocol} · {d.mountPath || 'No mount path'}
                    </div>
                  </div>
                  <StatusPill variant={d.isReady ? 'success' : 'warning'}>
                    {d.isReady ? 'Ready' : 'Not Ready'}
                  </StatusPill>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
