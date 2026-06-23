import React from 'react';
import { CheckCircle2, AlertCircle, Circle } from 'lucide-react';

const VARIANTS = {
  success: { bg: '#1FA46314', text: '#1FA463', Icon: CheckCircle2 },
  warning: { bg: '#C2780C14', text: '#C2780C', Icon: AlertCircle },
  danger: { bg: '#D1434314', text: '#D14343', Icon: AlertCircle },
  neutral: { bg: '#6B72801A', text: '#6B7280', Icon: Circle },
};

export default function StatusPill({ variant = 'neutral', children }) {
  const { bg, text, Icon } = VARIANTS[variant] || VARIANTS.neutral;
  return (
    <span className="status-pill" style={{ background: bg, color: text }}>
      <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
      {children}
    </span>
  );
}
