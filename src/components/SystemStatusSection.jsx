import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import SectionCard from './SectionCard';
import StatusPill from './StatusPill';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4001';

export default function SystemStatusSection() {
  const [serverOk, setServerOk] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => setServerOk(r.ok))
      .catch(() => setServerOk(false));
  }, []);

  return (
    <SectionCard
      stepNumber={6}
      title="System Status"
      subtitle="Connection health for this session"
      icon={Activity}
      accent="#4F5BFF"
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink/70">Backend Server</span>
          {serverOk === null ? (
            <StatusPill variant="neutral">Checking…</StatusPill>
          ) : serverOk ? (
            <StatusPill variant="success">Online</StatusPill>
          ) : (
            <StatusPill variant="danger">Offline</StatusPill>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink/70">App Version</span>
          <span className="font-mono text-xs text-ink/60">{import.meta.env.VITE_APP_VERSION || '1.0.0'}</span>
        </div>
      </div>
    </SectionCard>
  );
}
