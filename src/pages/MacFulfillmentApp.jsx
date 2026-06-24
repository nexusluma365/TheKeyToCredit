import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleDashed,
  HardDrive,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Usb,
} from 'lucide-react';
import { api } from '../services/api';

function fullName(customer) {
  return `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
}

function buildFulfillmentStages(formatFirst) {
  const stages = [
    {
      at: 0,
      title: 'Working',
      detail: 'Locking in the selected customer and USB drive.',
    },
  ];

  if (formatFirst) {
    stages.push(
      {
        at: 1200,
        title: 'Formatting drive now',
        detail: 'This may take a few minutes while macOS erases and remounts the USB.',
      },
      {
        at: 8500,
        title: 'Format finishing',
        detail: 'Waiting for the USB to come back online cleanly.',
      }
    );
  } else {
    stages.push({
      at: 1200,
      title: 'Checking USB',
      detail: 'Using the current format and preparing the drive contents.',
    });
  }

  stages.push(
    {
      at: formatFirst ? 12500 : 3200,
      title: 'Creating license',
      detail: 'Generating the customer key and attaching it to this order.',
    },
    {
      at: formatFirst ? 16000 : 6500,
      title: 'Writing to USB',
      detail: 'Copying installers and writing the license key.',
    },
    {
      at: formatFirst ? 23000 : 12000,
      title: 'Few more seconds',
      detail: 'Verifying every required file before marking the USB ready.',
    },
    {
      at: formatFirst ? 30000 : 18000,
      title: 'Almost done',
      detail: 'Large installer files can take a little longer on slower flash drives.',
    }
  );

  return stages;
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
  const [workStartedAt, setWorkStartedAt] = useState(null);
  const [workView, setWorkView] = useState(null);
  const [configWarning, setConfigWarning] = useState(null);
  const [usbSafetyAlert, setUsbSafetyAlert] = useState(null);
  const [alertLeaving, setAlertLeaving] = useState(false);
  const [midWriteDisconnect, setMidWriteDisconnect] = useState(false);

  const alertDismissTimerRef = useRef(null);
  const usbSafetyAlertRef = useRef(null);

  useEffect(() => {
    usbSafetyAlertRef.current = usbSafetyAlert;
  }, [usbSafetyAlert]);

  const dismissUsbAlert = useCallback(() => {
    if (alertDismissTimerRef.current) clearTimeout(alertDismissTimerRef.current);
    setAlertLeaving(true);
    alertDismissTimerRef.current = setTimeout(() => {
      setAlertLeaving(false);
      setUsbSafetyAlert(null);
    }, 260);
  }, []);

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
  const connectedDrives = drives.filter((drive) => drive.isRemovable !== false);
  const targetDrive = readyDrives.length === 1
    ? readyDrives[0]
    : formatFirst && readyDrives.length === 0 && connectedDrives.length === 1
      ? connectedDrives[0]
      : null;

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

  // Auto-dismiss alert when USB is detected again (works while busy or idle).
  useEffect(() => {
    if (!usbSafetyAlert || alertLeaving) return;
    const hasReadyDrive = drives.some((d) => d.isReady && d.mountPath);
    if (!hasReadyDrive) return;
    dismissUsbAlert();
    if (!busy) setError(null);
  }, [drives, usbSafetyAlert, alertLeaving, busy, dismissUsbAlert]);

  useEffect(() => {
    if (!busy || !workStartedAt || progress.length === 0) return undefined;

    const tick = () => {
      const elapsed = Date.now() - workStartedAt;
      const activeIndex = progress.reduce((currentIndex, stage, index) => (
        elapsed >= stage.at ? index : currentIndex
      ), 0);
      setWorkView({ ...progress[activeIndex], activeIndex, elapsed });
    };

    tick();
    const id = setInterval(tick, 900);
    return () => clearInterval(id);
  }, [busy, progress, workStartedAt]);

  useEffect(() => {
    if (!busy || !targetDrive?.mountPath || !workStartedAt) return undefined;

    const monitorMountPath = targetDrive.mountPath;
    const canCheckForDisconnect = () => !formatFirst || Date.now() - workStartedAt > 15000;

    const id = setInterval(async () => {
      if (!canCheckForDisconnect()) return;

      try {
        const driveData = await api.detectUsb();
        const nextDrives = driveData.drives || [];
        setDrives(nextDrives);
        const stillVisible = nextDrives.some((drive) => (
          drive.isReady && drive.mountPath === monitorMountPath
        ));

        if (stillVisible) {
          if (usbSafetyAlertRef.current?.type === 'diagnosing') dismissUsbAlert();
          return;
        }

        setStatus('Checking USB');
        setUsbSafetyAlert({
          type: 'diagnosing',
          message: 'The app lost sight of the USB. Self-diagnosing with macOS now.',
        });

        const diagnosis = await api.diagnoseUsb();
        if (diagnosis.diagnosis === 'system_can_read_usb_app_cannot') {
          setDrives(
            diagnosis.mountedAppDrives?.length
              ? diagnosis.mountedAppDrives
              : diagnosis.fallbackDrives || []
          );
          setUsbSafetyAlert({
            type: 'diagnosing',
            message: 'macOS can still read the USB. Drive detection was refreshed; continuing to watch it.',
          });
          return;
        }

        setStatus('USB disconnected');
        setMidWriteDisconnect(true);
        setUsbSafetyAlert({
          type: 'disconnected',
          message: 'USB disconnected mid-write. Reconnect the USB to retry.',
        });
      } catch {
        setStatus('USB disconnected');
        setMidWriteDisconnect(true);
        setUsbSafetyAlert({
          type: 'disconnected',
          message: 'USB disconnected mid-write. Reconnect the USB to retry.',
        });
      }
    }, 1500);

    return () => clearInterval(id);
  }, [busy, dismissUsbAlert, formatFirst, targetDrive?.mountPath, workStartedAt]);

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
    setMidWriteDisconnect(false);

    // Clear any lingering alert cleanly before starting.
    if (alertDismissTimerRef.current) clearTimeout(alertDismissTimerRef.current);
    setAlertLeaving(false);
    setUsbSafetyAlert(null);

    const fulfillmentStages = buildFulfillmentStages(formatFirst);
    const startedAt = Date.now();
    setProgress(fulfillmentStages);
    setWorkStartedAt(startedAt);
    setWorkView({ ...fulfillmentStages[0], activeIndex: 0, elapsed: 0 });
    setStatus(formatFirst ? 'Formatting USB' : 'Preparing USB');

    try {
      const fulfilled = await api.fulfillCustomer({
        customerId: selectedCustomer.customerId,
        mountPath: targetDrive?.mountPath,
        devicePath: targetDrive?.devicePath,
        formatFirst,
        confirmationText: formatFirst ? formatConfirm : undefined,
      });
      setResult(fulfilled);
      setMidWriteDisconnect(false);
      setStatus(fulfilled.readyToShip ? 'USB key ready' : 'USB written, verify warnings');
      setWorkView({
        title: 'USB is ready',
        detail: 'All files written and verified successfully.',
        activeIndex: fulfillmentStages.length,
        elapsed: Date.now() - startedAt,
      });
      setFormatConfirm('');
      await load();
    } catch (err) {
      if (err.usbDisconnected) {
        setMidWriteDisconnect(true);
        setUsbSafetyAlert({
          type: 'disconnected',
          message: 'USB disconnected mid-write. Reconnect the USB to retry.',
        });
        setStatus('USB disconnected');
      } else {
        setError(err.message);
        setStatus('Needs attention');
      }
      if (err.drives) setDrives(err.drives);
    } finally {
      setBusy(false);
      setWorkStartedAt(null);
    }
  }

  function handleRetry() {
    setMidWriteDisconnect(false);
    setError(null);
    handleFulfill();
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

  const actionDisabled = !selectedCustomer || !targetDrive || busy || (formatFirst && formatConfirm !== 'FORMAT') || (!formatFirst && !targetDrive.mountPath);
  const usbStatusText = targetDrive
    ? targetDrive.isReady
      ? `USB connected: ${targetDrive.driveName}`
      : `USB connected: ${targetDrive.driveName} needs format`
    : connectedDrives.length > 1
      ? 'Multiple USB drives detected'
      : 'USB not connected';

  const showRetryBanner = midWriteDisconnect && !busy && !usbSafetyAlert && !alertLeaving;

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
              {busy ? <span className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_6px_rgba(255,255,255,0.18)]" /> : <KeyRound className="h-5 w-5" />}
              {busy ? 'Preparing USB Key…' : formatFirst ? 'Format, Generate And Write USB' : 'Generate License And Write USB'}
            </button>

            {busy && workView && (
              <div className="mt-8 w-full max-w-xl rounded-[28px] border border-white/70 bg-[#101827]/92 p-5 text-left text-white shadow-[0_24px_70px_rgba(15,23,42,0.28)] backdrop-blur-xl">
                <div className="flex items-center gap-5">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB] shadow-[inset_0_-2px_0_rgba(0,0,0,0.18),0_12px_24px_rgba(37,99,235,0.34)]">
                    <div className="loader" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl font-bold leading-tight tracking-normal">
                      {workView.title}
                    </div>
                    <div className="mt-1 text-sm font-medium leading-6 text-white/90">
                      {workView.detail}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex gap-2">
                  {progress.map((stage, index) => (
                    <div
                      key={stage.title}
                      className={`h-1.5 flex-1 rounded-full transition ${
                        index <= (workView.activeIndex || 0) ? 'bg-[#60A5FA]' : 'bg-white/16'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {usbSafetyAlert && (
              <div className={`mt-5 w-full max-w-xl rounded-[22px] border px-5 py-4 text-left text-sm shadow-[0_12px_34px_rgba(15,23,42,0.1)] ${
                alertLeaving ? 'usb-alert-leave' : 'usb-alert-enter'
              } ${
                usbSafetyAlert.type === 'disconnected'
                  ? 'border-[#FCA5A5] bg-[#FEF2F2]'
                  : 'border-[#BFDBFE] bg-[#EFF6FF]'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`font-semibold ${usbSafetyAlert.type === 'disconnected' ? 'text-[#B91C1C]' : 'text-[#1D4ED8]'}`}>
                    {usbSafetyAlert.message}
                  </span>
                  <button
                    onClick={dismissUsbAlert}
                    className={`shrink-0 text-lg leading-none transition-opacity hover:opacity-100 ${
                      usbSafetyAlert.type === 'disconnected' ? 'text-[#B91C1C]/50' : 'text-[#1D4ED8]/50'
                    }`}
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {showRetryBanner && (
              <div className="mt-5 w-full max-w-xl rounded-[22px] border border-[#F59E0B]/30 bg-[#FFFBEB] px-5 py-4 text-left shadow-[0_12px_34px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#92400E]">
                    Write interrupted by USB disconnect.
                  </div>
                  <button
                    onClick={handleRetry}
                    disabled={!targetDrive || !selectedCustomer || (formatFirst && formatConfirm !== 'FORMAT')}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#F59E0B] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#D97706] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                </div>
                {(!targetDrive || (formatFirst && formatConfirm !== 'FORMAT')) && (
                  <div className="mt-2 text-xs text-[#B45309]">
                    {!targetDrive ? 'Reconnect the USB drive to retry.' : 'Re-enter FORMAT below to retry.'}
                  </div>
                )}
              </div>
            )}
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
                  The USB stores the customer license in <span className="font-mono text-[#111827]">.credit-key/license.dat</span>.
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
                        <div className="truncate text-xs">
                          {targetDrive.mountPath || `${targetDrive.devicePath} · not mounted, ready to format`}
                        </div>
                        {!targetDrive.isReady && (
                          <div className="mt-1 text-xs font-semibold leading-5 text-[#9A5B00]">
                            macOS cannot read this USB yet. Click Ignore on the macOS popup, keep FORMAT enabled, then prepare it here.
                          </div>
                        )}
                      </div>
                    ) : connectedDrives.length > 1 ? (
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

                {busy && workView && (
                  <div className="rounded-[22px] border border-[#2563EB]/15 bg-[#EFF6FF] p-5 text-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB]">
                        <div className="loader scale-75" />
                      </div>
                      <div className="min-w-0">
                        <div className="working-copy text-base font-bold text-[#1E3A8A]">{workView.title}</div>
                        <div className="mt-1 text-xs font-medium leading-5 text-[#1E3A8A]/70">{workView.detail}</div>
                      </div>
                    </div>
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
