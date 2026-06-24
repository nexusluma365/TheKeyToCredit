import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleDashed,
  HardDrive,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Usb,
} from 'lucide-react';
import { api } from '../services/api';

function fullName(customer) {
  return `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
}

export default function MacFulfillmentApp() {
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [drives, setDrives] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', orderId: '' });
  const [formatFirst, setFormatFirst] = useState(true);
  const [formatConfirm, setFormatConfirm] = useState('');
  const [lastUsbCheck, setLastUsbCheck] = useState(null);
  const [progress, setProgress] = useState([]);
  const [configWarning, setConfigWarning] = useState(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.customerId === selectedId) || null,
    [customers, selectedId]
  );

  const filteredCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;

    return customers.filter((customer) =>
      [fullName(customer), customer.email, customer.orderId]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle))
    );
  }, [customers, query]);

  const readyDrives = drives.filter((drive) => drive.isReady && drive.mountPath);
  const targetDrive = readyDrives.length === 1 ? readyDrives[0] : null;

  const loadDrives = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const driveData = await api.detectUsb();
      setDrives(driveData.drives || []);
      setLastUsbCheck(new Date());
      if (!quiet) setStatus('Ready');
    } catch (err) {
      if (!quiet) {
        setError(err.message);
        setStatus('Needs attention');
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [customerData, configData] = await Promise.all([
        api.getCustomers(),
        api.configStatus().catch(() => null),
      ]);
      const nextCustomers = customerData.customers || [];
      setCustomers(nextCustomers);
      await loadDrives({ quiet: true });
      setStatus('Ready');
      if (!selectedId && nextCustomers[0]) setSelectedId(nextCustomers[0].customerId);
      if (configData && !configData.configured) {
        setConfigWarning({ missing: configData.missing, configPath: configData.configPath });
      } else {
        setConfigWarning(null);
      }
    } catch (err) {
      setError(err.message);
      setStatus('Needs attention');
    } finally {
      setLoading(false);
    }
  }, [loadDrives, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!busy) loadDrives({ quiet: true });
    }, 2000);
    return () => clearInterval(id);
  }, [busy, loadDrives]);

  async function handleCreateCustomer(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    setStatus('Saving customer');

    try {
      const created = await api.createCustomer(form);
      setForm({ firstName: '', lastName: '', email: '', orderId: '' });
      await load();
      setSelectedId(created.customerId);
      setStatus('Customer selected');
    } catch (err) {
      setError(err.message);
      setStatus('Needs attention');
    } finally {
      setBusy(false);
    }
  }

  async function handleFulfill() {
    if (!selectedCustomer) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setProgress([
      formatFirst ? 'Formatting USB as CREDITKEY' : 'Using existing USB format',
      'Generating Keygen license',
      'Copying installers',
      'Writing license.json and START-HERE.pdf',
      'Verifying USB contents',
    ]);
    setStatus(formatFirst ? 'Formatting USB' : 'Preparing USB');

    try {
      const fulfilled = await api.fulfillCustomer({
        customerId: selectedCustomer.customerId,
        mountPath: targetDrive?.mountPath,
        formatFirst,
        confirmationText: formatFirst ? formatConfirm : undefined,
      });
      setResult(fulfilled);
      setStatus(fulfilled.readyToShip ? 'USB key ready' : 'USB written, verify warnings');
      setFormatConfirm('');
      await load();
    } catch (err) {
      setError(err.message);
      setStatus('Needs attention');
      if (err.drives) setDrives(err.drives);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCustomer(customer) {
    if (!customer || busy) return;
    const confirmed = window.confirm(`Remove ${fullName(customer)} and local fulfillment records?`);
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setStatus('Removing customer');
    try {
      await api.deleteCustomer(customer.customerId);
      setCustomers((current) => current.filter((item) => item.customerId !== customer.customerId));
      if (selectedId === customer.customerId) setSelectedId(null);
      setStatus('Customer removed');
      await load();
    } catch (err) {
      setError(err.message);
      setStatus('Needs attention');
    } finally {
      setBusy(false);
    }
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const actionDisabled = !selectedCustomer || !targetDrive || busy || (formatFirst && formatConfirm !== 'FORMAT');
  const usbStatusText = targetDrive
    ? `USB connected: ${targetDrive.driveName}`
    : readyDrives.length > 1
      ? 'Multiple USB drives detected'
      : 'USB not connected';

  return (
    <main className="min-h-screen overflow-hidden bg-[#EAF7FA] text-[#101723]">
      <div className="min-h-screen rounded-[34px] border border-white/80 bg-[radial-gradient(circle_at_12%_24%,rgba(202,218,255,0.9),transparent_36%),radial-gradient(circle_at_82%_38%,rgba(195,251,252,0.95),transparent_38%),linear-gradient(135deg,#EEF4FF_0%,#F7FBFF_46%,#D5FAFD_100%)] px-5 py-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]">
        <section className="mx-auto flex max-w-6xl flex-col">
          <header className="flex items-center justify-between px-7 py-4">
            <div className="flex items-center gap-3">
              <CircleDashed className="h-8 w-8 text-[#111827]" strokeWidth={2.4} />
              <div className="text-xl font-semibold tracking-tight">Credit Analyzer</div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`rounded-full px-4 py-2 text-sm font-semibold shadow-[0_8px_24px_rgba(15,23,42,0.08)] ${
                targetDrive ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-[#FFF7ED] text-[#B45309]'
              }`}>
                {usbStatusText}
              </div>
              <div className="rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-[#4B5563] shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                {status}
              </div>
              <button
                onClick={load}
                disabled={loading || busy}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#111827] shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition hover:bg-white disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </header>

          {configWarning && (
            <div className="mx-7 mb-2 rounded-2xl border border-[#F59E0B]/30 bg-[#FFFBEB] px-5 py-4 text-sm text-[#92400E]">
              <div className="font-semibold">Keygen not configured — license creation will fail.</div>
              <div className="mt-1 text-xs leading-5">
                Missing: <span className="font-mono">{configWarning.missing.join(', ')}</span>
                {configWarning.configPath && (
                  <> · Edit <span className="font-mono break-all">{configWarning.configPath}</span> then restart the app.</>
                )}
              </div>
            </div>
          )}

          <section className="flex min-h-[330px] flex-col items-center justify-center px-6 pb-12 pt-9 text-center">
            <h1 className="max-w-3xl text-[58px] font-medium leading-[0.98] tracking-normal text-[#080E18]">
              Ready to Create
              <br />
              Your USB Key?
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-[#56616F]">
              Select a customer below, plug in one USB drive, then create the license key in one clean step.
            </p>

            <button
              onClick={handleFulfill}
              disabled={actionDisabled}
              className="mt-9 inline-flex h-14 min-w-[270px] items-center justify-center gap-3 rounded-full bg-[#2563EB] px-8 text-base font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.32),inset_0_-2px_0_rgba(0,0,0,0.16)] transition hover:bg-[#1D4ED8] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#9BA7BA] disabled:shadow-none"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
              {busy ? 'Preparing USB Key' : formatFirst ? 'Format, Generate And Write USB' : 'Generate License And Write USB'}
            </button>
          </section>

          <section className="rounded-[30px] border border-white/90 bg-white/78 p-8 shadow-[0_24px_70px_rgba(31,45,80,0.12)] backdrop-blur-xl">
            <div className="grid grid-cols-[1fr_1.25fr_1fr] gap-8">
              <div className="flex flex-col">
                <div className="mb-8 flex items-center gap-3">
                  <CircleDashed className="h-9 w-9 text-[#111827]" strokeWidth={2.5} />
                  <div className="text-2xl font-semibold tracking-tight">Key Studio</div>
                </div>

                <form onSubmit={handleCreateCustomer} className="space-y-3">
                  <div className="text-sm font-semibold text-[#1F2937]">Add customer</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      required
                      value={form.firstName}
                      onChange={(event) => update('firstName', event.target.value)}
                      className="h-11 rounded-full border border-black/10 bg-white/80 px-4 text-sm outline-none transition focus:ring-2 focus:ring-[#2563EB]/20"
                      placeholder="First name"
                    />
                    <input
                      required
                      value={form.lastName}
                      onChange={(event) => update('lastName', event.target.value)}
                      className="h-11 rounded-full border border-black/10 bg-white/80 px-4 text-sm outline-none transition focus:ring-2 focus:ring-[#2563EB]/20"
                      placeholder="Last name"
                    />
                  </div>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(event) => update('email', event.target.value)}
                    className="h-11 w-full rounded-full border border-black/10 bg-white/80 px-4 text-sm outline-none transition focus:ring-2 focus:ring-[#2563EB]/20"
                    placeholder="Email"
                  />
                  <div className="flex gap-2">
                    <input
                      value={form.orderId}
                      onChange={(event) => update('orderId', event.target.value)}
                      className="h-11 min-w-0 flex-1 rounded-full border border-black/10 bg-white/80 px-4 text-sm outline-none transition focus:ring-2 focus:ring-[#2563EB]/20"
                      placeholder="Order ID"
                    />
                    <button
                      disabled={busy}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#111827] text-white transition hover:bg-black disabled:opacity-40"
                      title="Add customer"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </form>

                <div className="mt-auto border-t border-black/10 pt-6 text-xs leading-5 text-[#6B7280]">
                  The USB stores the customer license in <span className="font-mono text-[#111827]">license.json</span>.
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#1F2937]">Customers</div>
                    <div className="text-xs text-[#6B7280]">Click a user to highlight and prepare.</div>
                  </div>
                  <div className="relative w-56">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C95A3]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-11 w-full rounded-full border border-black/10 bg-white/80 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-[#2563EB]/20"
                      placeholder="Search"
                    />
                  </div>
                </div>

                <div className="h-[250px] overflow-y-auto rounded-[22px] border border-black/10 bg-white/58 p-2">
                  {filteredCustomers.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-[#6B7280]">No customers yet.</div>
                  ) : (
                    filteredCustomers.map((customer) => {
                      const selected = customer.customerId === selectedId;
                      return (
                        <div
                          key={customer.customerId}
                          className={`mb-2 grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[18px] px-4 py-3 transition ${
                            selected
                              ? 'bg-[#111827] text-white shadow-[0_12px_24px_rgba(15,23,42,0.22)]'
                              : 'bg-white/72 text-[#111827] hover:bg-white'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(customer.customerId);
                              setResult(null);
                              setError(null);
                            }}
                            className="min-w-0 text-left"
                          >
                            <div className="truncate text-sm font-semibold">{fullName(customer)}</div>
                            <div className={`truncate text-xs ${selected ? 'text-white/65' : 'text-[#6B7280]'}`}>
                              {customer.email}
                            </div>
                          </button>
                          <div className={`text-xs font-medium ${selected ? 'text-white/70' : 'text-[#8C95A3]'}`}>
                            {customer.maskedLicense ? 'Licensed' : 'New'}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomer(customer)}
                            disabled={busy}
                            className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                              selected ? 'text-white/65 hover:bg-white/10 hover:text-white' : 'text-[#9CA3AF] hover:bg-[#FEE2E2] hover:text-[#B91C1C]'
                            }`}
                            title="Remove customer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid content-start gap-5">
                <div>
                  <div className="mb-3 text-sm font-semibold text-[#1F2937]">Selected user</div>
                  <div className="rounded-[22px] border border-black/10 bg-white/64 p-5">
                    {selectedCustomer ? (
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs font-medium uppercase text-[#8C95A3]">Name</div>
                          <div className="mt-1 truncate text-lg font-semibold">{fullName(selectedCustomer)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase text-[#8C95A3]">Email</div>
                          <div className="mt-1 truncate text-sm font-medium">{selectedCustomer.email}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase text-[#8C95A3]">License</div>
                          <div className="mt-1 truncate font-mono text-xs">{selectedCustomer.maskedLicense || 'Not generated'}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-[#6B7280]">Select a customer.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-[22px] border border-black/10 bg-white/64 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Usb className="h-4 w-4" />
                    USB status
                  </div>
                  <div className="flex items-start gap-3 text-sm text-[#4B5563]">
                    <HardDrive className="mt-0.5 h-4 w-4 shrink-0" />
                    {targetDrive ? (
                      <div>
                        <div className="font-semibold text-[#111827]">{targetDrive.driveName}</div>
                        <div className="truncate text-xs">{targetDrive.mountPath}</div>
                      </div>
                    ) : readyDrives.length > 1 ? (
                      <div className="text-[#9A5B00]">Multiple USB drives detected.</div>
                    ) : (
                      <div className="text-[#9A5B00]">No mounted USB drive detected.</div>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-[#6B7280]">
                    Live check {lastUsbCheck ? lastUsbCheck.toLocaleTimeString() : 'pending'}.
                  </div>
                </div>

                <div className="rounded-[22px] border border-black/10 bg-white/64 p-5">
                  <label className="flex items-start gap-3 text-sm font-semibold text-[#111827]">
                    <input
                      type="checkbox"
                      checked={formatFirst}
                      onChange={(event) => setFormatFirst(event.target.checked)}
                      disabled={busy}
                      className="mt-1"
                    />
                    <span>
                      Format USB before writing
                      <span className="mt-1 block text-xs font-normal leading-5 text-[#6B7280]">
                        Recommended. This erases the selected USB, labels it CREDITKEY, then writes only the required files.
                      </span>
                    </span>
                  </label>
                  {formatFirst && (
                    <input
                      value={formatConfirm}
                      onChange={(event) => setFormatConfirm(event.target.value)}
                      disabled={busy}
                      className="mt-3 h-10 w-full rounded-full border border-black/10 bg-white/80 px-4 text-sm outline-none transition focus:ring-2 focus:ring-[#2563EB]/20"
                      placeholder="Type FORMAT to enable writing"
                    />
                  )}
                </div>

                {busy && progress.length > 0 && (
                  <div className="rounded-[18px] border border-[#2563EB]/15 bg-[#EFF6FF] px-4 py-3 text-sm text-[#1D4ED8]">
                    <div className="mb-2 font-semibold">Working...</div>
                    <ol className="list-decimal space-y-1 pl-4">
                      {progress.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {error && (
                  <div className="rounded-[18px] border border-[#D94D4D]/20 bg-[#FFF3F3] px-4 py-3 text-sm text-[#B73838]">
                    {error}
                  </div>
                )}

                {result && (
                  <div className="rounded-[18px] border border-[#1C8F53]/20 bg-[#F0FFF6] px-4 py-3 text-sm text-[#11683A]">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-4 w-4" />
                      USB key written
                    </div>
                    <div className="mt-1 font-mono text-xs">{result.maskedLicense}</div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
