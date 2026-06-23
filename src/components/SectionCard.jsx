import React from 'react';

export default function SectionCard({ stepNumber, title, subtitle, icon: Icon, status, children, accent }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: accent ? `${accent}14` : '#15151A0D' }}
          >
            {Icon ? <Icon className="w-4.5 h-4.5" style={{ color: accent || '#15151A' }} strokeWidth={2} /> : null}
          </div>
          <div>
            <div className="flex items-center gap-2">
              {stepNumber ? (
                <span className="text-[11px] font-medium text-mist tracking-wide">STEP {stepNumber}</span>
              ) : null}
            </div>
            <h2 className="text-base font-semibold text-ink tracking-tight">{title}</h2>
            {subtitle ? <p className="text-sm text-mist mt-0.5">{subtitle}</p> : null}
          </div>
        </div>
        {status}
      </div>
      {children}
    </div>
  );
}
