import React, { useState } from 'react';
import { UserPlus, Loader2 } from 'lucide-react';
import SectionCard from './SectionCard';
import StatusPill from './StatusPill';
import { api } from '../services/api';

export default function CustomerSection({ customer, license, onCustomerCreated, onLicenseGenerated }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', orderId: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreateCustomer(e) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const result = await api.createCustomer(form);
      onCustomerCreated(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleGenerateLicense() {
    setError(null);
    setGenerating(true);
    try {
      const result = await api.generateLicense(customer.customerId);
      onLicenseGenerated(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <SectionCard
      stepNumber={1}
      title="Customer Information"
      subtitle="Enter the customer this USB is being prepared for"
      icon={UserPlus}
      accent="#4F5BFF"
      status={
        customer ? (
          <StatusPill variant="success">Customer Added</StatusPill>
        ) : (
          <StatusPill variant="neutral">Awaiting Entry</StatusPill>
        )
      }
    >
      {!customer ? (
        <form onSubmit={handleCreateCustomer} className="grid grid-cols-2 gap-3.5">
          <div>
            <label className="field-label">First Name</label>
            <input required className="field-input" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Last Name</label>
            <input required className="field-input" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="field-label">Email</label>
            <input type="email" required className="field-input" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Phone <span className="text-black/30">(optional)</span></label>
            <input className="field-input" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Order ID <span className="text-black/30">(optional)</span></label>
            <input className="field-input" value={form.orderId} onChange={(e) => update('orderId', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="field-label">Notes <span className="text-black/30">(optional)</span></label>
            <textarea rows={2} className="field-input resize-none" value={form.notes} onChange={(e) => update('notes', e.target.value)} />
          </div>

          {error && <div className="col-span-2 text-sm text-danger">{error}</div>}

          <div className="col-span-2 mt-1">
            <button type="submit" disabled={creating} className="pill-primary">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {creating ? 'Creating…' : 'Create Customer'}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm mb-5">
            <div>
              <div className="text-xs text-mist mb-0.5">Customer Name</div>
              <div className="font-medium text-ink">{customer.firstName} {customer.lastName}</div>
            </div>
            <div>
              <div className="text-xs text-mist mb-0.5">Customer Email</div>
              <div className="font-medium text-ink">{customer.email}</div>
            </div>
            <div>
              <div className="text-xs text-mist mb-0.5">Customer ID</div>
              <div className="font-mono text-xs text-ink/70">{customer.customerId}</div>
            </div>
            <div>
              <div className="text-xs text-mist mb-0.5">License Status</div>
              <div className="font-medium text-ink">
                {license ? (
                  <span className="font-mono text-xs">{license.maskedLicense}</span>
                ) : (
                  'Not generated'
                )}
              </div>
            </div>
          </div>

          {error && <div className="mb-3 text-sm text-danger">{error}</div>}

          {!license && (
            <button onClick={handleGenerateLicense} disabled={generating} className="pill-primary">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {generating ? 'Generating…' : 'Generate License'}
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
