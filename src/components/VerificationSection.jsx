import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Loader2, PackageCheck } from 'lucide-react';
import SectionCard from './SectionCard';
import StatusPill from './StatusPill';
import { api } from '../services/api';

const CHECK_LABELS = {
  windowsInstallerExists: 'CreditAnalyzer Setup.exe',
  windowsInstallerValid: 'Windows installer header valid',
  windowsInstallerQuarantineCleared: 'Windows installer quarantine cleared',
  macInstallerExists: 'CreditAnalyzer.dmg',
  macInstallerValid: 'Mac disk image opens cleanly',
  macInstallerQuarantineCleared: 'Mac installer quarantine cleared',
  startHereTxtExists: 'START-HERE.txt',
  licenseDatExists: '.credit-key/license.dat present',
  licenseDatValid: '.credit-key/license.dat contains valid key',
  structureCorrect: 'USB structure is correct',
};

export default function VerificationSection({ prepareResult, onShipped }) {
  const [shipping, setShipping] = useState(false);
  const [shipped, setShipped] = useState(false);
  const [error, setError] = useState(null);

  if (!prepareResult) {
    return (
      <SectionCard
        stepNumber={4}
        title="Verification"
        subtitle="Runs automatically after USB preparation"
        icon={ShieldCheck}
        accent="#4F5BFF"
        status={<StatusPill variant="neutral">Pending</StatusPill>}
      >
        <p className="text-sm text-mist">Complete USB preparation to run verification.</p>
      </SectionCard>
    );
  }

  const { verification, readyToShip, recordId } = prepareResult;

  async function handleShip() {
    setError(null);
    setShipping(true);
    try {
      await api.shipUsb(recordId);
      setShipped(true);
      onShipped?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setShipping(false);
    }
  }

  return (
    <SectionCard
      stepNumber={4}
      title="Verification"
      subtitle="Confirms every required file exists before shipping"
      icon={ShieldCheck}
      accent="#4F5BFF"
      status={
        readyToShip ? <StatusPill variant="success">All Checks Passed</StatusPill> : <StatusPill variant="warning">Issues Found</StatusPill>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 mb-5">
        {Object.entries(CHECK_LABELS).map(([key, label]) => {
          const passed = verification?.[key];
          return (
            <div key={key} className="flex items-center gap-2 text-sm">
              {passed ? (
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-danger shrink-0" />
              )}
              <span className={passed ? 'text-ink/80' : 'text-danger'}>{label}</span>
            </div>
          );
        })}
      </div>

      {verification?.unexpectedEntries?.length > 0 && (
        <div className="mb-4 text-sm text-warn">
          Unexpected files found: {verification.unexpectedEntries.join(', ')}
        </div>
      )}

      {readyToShip && !shipped && (
        <div className="rounded-2xl bg-success/5 border border-success/20 p-5 text-center mb-4">
          <PackageCheck className="w-7 h-7 text-success mx-auto mb-2" />
          <div className="font-semibold text-success text-lg tracking-tight">USB Ready To Ship</div>
          <p className="text-sm text-ink/60 mt-1">All required files verified. Safe to package and ship.</p>
        </div>
      )}

      {error && <div className="mb-3 text-sm text-danger">{error}</div>}

      {readyToShip && !shipped && (
        <button onClick={handleShip} disabled={shipping} className="pill-primary">
          {shipping ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {shipping ? 'Marking shipped…' : 'Mark as Shipped'}
        </button>
      )}

      {shipped && (
        <div className="flex items-center gap-1.5 text-success text-sm font-medium">
          <CheckCircle2 className="w-4 h-4" /> Shipped — fulfillment record updated
        </div>
      )}
    </SectionCard>
  );
}
