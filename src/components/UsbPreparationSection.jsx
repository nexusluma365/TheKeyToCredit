import React, { useState } from 'react';
import { HardDriveDownload, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import SectionCard from './SectionCard';
import StatusPill from './StatusPill';
import { api } from '../services/api';

export default function UsbPreparationSection({ disabled, customer, license, drive, onPrepared }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [formatting, setFormatting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [formatResult, setFormatResult] = useState(null);
  const [prepareResult, setPrepareResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleFormat() {
    setError(null);
    setFormatting(true);
    try {
      const result = await api.formatUsb(drive.devicePath, drive.mountPath, confirmText);
      setFormatResult(result);
      setShowConfirm(false);
      setConfirmText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setFormatting(false);
    }
  }

  async function handlePrepare() {
    setError(null);
    setPreparing(true);
    try {
      const result = await api.prepareUsbRecord({
        customerId: customer.customerId,
        licenseId: license.licenseId,
        mountPath: drive.mountPath,
      });
      setPrepareResult(result);
      onPrepared(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setPreparing(false);
    }
  }

  const canFormat = !disabled && drive;
  const canPrepare = !disabled && drive && (formatResult?.automated || formatResult?.manualInstructions);

  return (
    <SectionCard
      stepNumber={3}
      title="USB Preparation"
      subtitle="Format the drive, then write installers and license"
      icon={HardDriveDownload}
      accent="#4F5BFF"
      status={
        prepareResult?.readyToShip ? (
          <StatusPill variant="success">Prepared</StatusPill>
        ) : (
          <StatusPill variant="neutral">Pending</StatusPill>
        )
      }
    >
      {/* Format step */}
      {!formatResult && (
        <div className="mb-4">
          {!showConfirm ? (
            <button onClick={() => setShowConfirm(true)} disabled={!canFormat} className="pill-secondary">
              Format USB Drive
            </button>
          ) : (
            <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4">
              <div className="flex items-start gap-2.5 mb-3">
                <AlertTriangle className="w-4.5 h-4.5 text-danger shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-sm text-danger">This will erase the selected USB drive</div>
                  <p className="text-sm text-ink/70 mt-0.5">
                    All existing data on <span className="font-medium">{drive?.driveName}</span> will be permanently deleted.
                  </p>
                </div>
              </div>
              <label className="field-label">Type FORMAT to confirm</label>
              <input
                className="field-input mb-3"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="FORMAT"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleFormat}
                  disabled={confirmText !== 'FORMAT' || formatting}
                  className="pill-danger"
                >
                  {formatting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {formatting ? 'Formatting…' : 'Confirm Format'}
                </button>
                <button onClick={() => { setShowConfirm(false); setConfirmText(''); }} className="pill-secondary">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {formatResult?.automated && (
        <div className="mb-4 text-sm text-success flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Drive formatted as exFAT — labeled {formatResult.label}
        </div>
      )}

      {formatResult?.manualInstructions && (
        <div className="mb-4 rounded-2xl border border-warn/20 bg-warn/5 p-4">
          <div className="font-medium text-sm text-warn mb-2">Manual formatting required</div>
          <ol className="text-sm text-ink/80 space-y-1 list-decimal list-inside">
            {formatResult.manualInstructions.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
          <p className="text-xs text-mist mt-2">Once formatted manually, continue below.</p>
        </div>
      )}

      {/* Prepare step */}
      {formatResult && !prepareResult && (
        <button onClick={handlePrepare} disabled={!canPrepare || preparing} className="pill-primary">
          {preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {preparing ? 'Writing to USB…' : 'Write Installers & License'}
        </button>
      )}

      {error && <div className="mt-3 text-sm text-danger">{error}</div>}

      {prepareResult && (
        <div className="mt-2 text-sm space-y-1.5">
          <div className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="w-4 h-4" /> Installers copied ({prepareResult.copiedInstallers?.length || 0} files)
          </div>
          <div className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="w-4 h-4" /> License written to .credit-key/license.dat
          </div>
        </div>
      )}
    </SectionCard>
  );
}
