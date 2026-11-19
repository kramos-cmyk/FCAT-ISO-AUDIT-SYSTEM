import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Lock, Shield, ShieldCheck } from 'lucide-react';

export function StatusLabel({ status }: { status: string }) {
  const val = status || 'Open';
  if (val === 'Closed' || val === 'Active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F6D39] bg-[#E6F1E7] border border-[#CFE3D2] px-2.5 py-0.5 rounded-md whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {val}
      </span>
    );
  }
  if (val === 'Needs Attention') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8A6D00] bg-[#FBF0D6] border border-[#EFE0B0] px-2.5 py-0.5 rounded-md whitespace-nowrap">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Needs Attention
      </span>
    );
  }
  if (val === 'Locked') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9A2A1E] bg-[#FBE7E1] border border-[#F3CFC5] px-2.5 py-0.5 rounded-md whitespace-nowrap">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Locked
      </span>
    );
  }
  if (val === 'System Administrator') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4A1219] bg-[#FBF0D6] border border-[#E5C97B] px-2.5 py-0.5 rounded-md whitespace-nowrap">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#6B1A25]" />
        System Administrator
      </span>
    );
  }
  if (val === 'Auditor Account' || val === 'Auditor') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4A1219] bg-[#F3E8DE] border border-[#E5D3C4] px-2.5 py-0.5 rounded-md whitespace-nowrap">
        <Shield className="h-3.5 w-3.5 shrink-0" />
        {val}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9A2A1E] bg-[#FBE7E1] border border-[#F3CFC5] px-2.5 py-0.5 rounded-md whitespace-nowrap">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      {val}
    </span>
  );
}
