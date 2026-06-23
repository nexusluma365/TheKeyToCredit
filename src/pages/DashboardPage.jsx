import React, { useState } from 'react';
import { LogOut, Sparkles } from 'lucide-react';
import CustomerSection from '../components/CustomerSection';
import UsbDetectionSection from '../components/UsbDetectionSection';
import UsbPreparationSection from '../components/UsbPreparationSection';
import VerificationSection from '../components/VerificationSection';
import FulfillmentRecordsSection from '../components/FulfillmentRecordsSection';
import SystemStatusSection from '../components/SystemStatusSection';
import BulkImportSection from '../components/BulkImportSection';

export default function DashboardPage({ adminEmail, onLogout }) {
  const [customer, setCustomer] = useState(null);
  const [license, setLicense] = useState(null);
  const [drive, setDrive] = useState(null);
  const [prepareResult, setPrepareResult] = useState(null);
  const [recordsRefreshKey, setRecordsRefreshKey] = useState(0);
  const [showBulk, setShowBulk] = useState(false);

  function resetWorkflow() {
    setCustomer(null);
    setLicense(null);
    setDrive(null);
    setPrepareResult(null);
  }

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-ink flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink leading-tight">USB Fulfillment</h1>
            <p className="text-xs text-mist">Credit Analyzer — Internal Tool</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowBulk((v) => !v)}
            className="text-sm text-mist hover:text-ink transition-colors"
          >
            {showBulk ? 'Single Fulfillment' : 'Bulk Mode'}
          </button>
          <div className="text-sm text-mist">{adminEmail}</div>
          <button onClick={onLogout} className="text-mist hover:text-ink transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {showBulk ? (
        <div className="max-w-2xl">
          <BulkImportSection onComplete={() => setRecordsRefreshKey((k) => k + 1)} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CustomerSection
            customer={customer}
            license={license}
            onCustomerCreated={setCustomer}
            onLicenseGenerated={setLicense}
          />

          <UsbDetectionSection
            disabled={!customer || !license}
            selectedDrive={drive}
            onSelectDrive={setDrive}
          />

          <UsbPreparationSection
            disabled={!customer || !license || !drive}
            customer={customer}
            license={license}
            drive={drive}
            onPrepared={(result) => {
              setPrepareResult(result);
              setRecordsRefreshKey((k) => k + 1);
            }}
          />

          <VerificationSection
            prepareResult={prepareResult}
            onShipped={() => setRecordsRefreshKey((k) => k + 1)}
          />

          <div className="lg:col-span-2">
            <FulfillmentRecordsSection refreshKey={recordsRefreshKey} />
          </div>

          <SystemStatusSection />

          {prepareResult?.readyToShip && (
            <div className="flex items-center">
              <button onClick={resetWorkflow} className="pill-secondary">
                Start Next Customer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
