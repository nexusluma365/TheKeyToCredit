import React, { useEffect, useState, useCallback } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import SectionCard from './SectionCard';
import StatusPill from './StatusPill';
import { api } from '../services/api';

const STATUS_VARIANT = {
  pending: 'neutral',
  prepared: 'warning',
  ready_to_ship: 'success',
  shipped: 'success',
};

const STATUS_LABEL = {
  pending: 'Pending',
  prepared: 'Prepared',
  ready_to_ship: 'Ready To Ship',
  shipped: 'Shipped',
};

export default function FulfillmentRecordsSection({ refreshKey }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { records: r } = await api.getFulfillmentRecords();
      setRecords(r);
    } catch {
      // silent — non-critical section
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <SectionCard
      stepNumber={5}
      title="Fulfillment Records"
      subtitle="Recent customer USB fulfillments"
      icon={ClipboardList}
      accent="#4F5BFF"
      status={
        <button onClick={load} className="text-mist hover:text-ink transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      {records.length === 0 ? (
        <p className="text-sm text-mist">No fulfillment records yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-mist border-b border-black/[0.06]">
                <th className="px-1 py-2 font-medium">Customer</th>
                <th className="px-1 py-2 font-medium">Order ID</th>
                <th className="px-1 py-2 font-medium">License</th>
                <th className="px-1 py-2 font-medium">Status</th>
                <th className="px-1 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 8).map((r) => (
                <tr key={r.id} className="border-b border-black/[0.04] last:border-0">
                  <td className="px-1 py-2.5">
                    <div className="font-medium text-ink">{r.customerName}</div>
                    <div className="text-xs text-mist">{r.customerEmail}</div>
                  </td>
                  <td className="px-1 py-2.5 text-ink/70">{r.orderId || '—'}</td>
                  <td className="px-1 py-2.5 font-mono text-xs text-ink/70">{r.maskedLicense}</td>
                  <td className="px-1 py-2.5">
                    <StatusPill variant={STATUS_VARIANT[r.status] || 'neutral'}>
                      {STATUS_LABEL[r.status] || r.status}
                    </StatusPill>
                  </td>
                  <td className="px-1 py-2.5 text-ink/50 text-xs">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
