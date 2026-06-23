import React, { useState, useRef } from 'react';
import { Upload, Loader2, CheckCircle2 } from 'lucide-react';
import SectionCard from './SectionCard';
import StatusPill from './StatusPill';
import { api } from '../services/api';

export default function BulkImportSection({ onComplete }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const res = await api.bulkImport(file);
      setResult(res);
      onComplete?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <SectionCard
      title="Bulk Fulfillment"
      subtitle="Import a CSV to queue multiple customers at once"
      icon={Upload}
      accent="#4F5BFF"
      status={result ? <StatusPill variant="success">{result.succeeded} Queued</StatusPill> : null}
    >
      <p className="text-xs text-mist mb-3">
        Expected columns: <span className="font-mono">First Name, Last Name, Email, Phone, Order ID</span>
      </p>
      <div className="flex items-center gap-3 mb-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm text-mist file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-black/[0.05] file:text-ink file:text-sm file:font-medium hover:file:bg-black/[0.08] file:cursor-pointer cursor-pointer"
        />
      </div>

      {error && <div className="mb-3 text-sm text-danger">{error}</div>}

      <button onClick={handleUpload} disabled={!file || uploading} className="pill-primary">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {uploading ? 'Processing…' : 'Import & Generate Licenses'}
      </button>

      {result && (
        <div className="mt-4 text-sm space-y-1">
          <div className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="w-4 h-4" /> {result.succeeded} of {result.totalRows} queued successfully
          </div>
          {result.failed > 0 && (
            <div className="text-danger">{result.failed} row(s) failed — check CSV formatting.</div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
