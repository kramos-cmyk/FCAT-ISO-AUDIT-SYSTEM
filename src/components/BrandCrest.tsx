import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { safeUrl } from '../lib/format';

export function FCATLogo({
  logoUrl,
  alt = 'FCAT Crest',
  size = 'md',
}: {
  logoUrl?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const src = safeUrl(logoUrl);
  const dim =
    size === 'sm' ? 'h-8 w-8 rounded-md' : size === 'lg' ? 'h-14 w-14 rounded-xl' : 'h-10 w-10 rounded-lg';

  if (!src || failed) {
    return (
      <div
        className={`${dim} bg-[#C9A227] text-[#4A1219] flex items-center justify-center shrink-0 shadow-sm border border-[#A9861E]/40`}
        aria-label={alt}
      >
        <ShieldCheck className={size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dim} object-cover bg-white shrink-0 border border-[#EAD9D4]`}
    />
  );
}

export function OfficialCarHeader({
  companyName,
  standard,
  logoUrl,
}: {
  companyName?: string;
  standard?: string;
  logoUrl?: string;
}) {
  return (
    <div className="bg-white border border-[#EAD9D4] rounded-xl overflow-hidden mb-5">
      <div className="h-1 bg-gradient-to-r from-[#C9A227] via-[#6B1A25] to-[#4A1219]" />
      <div className="p-4 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <FCATLogo logoUrl={logoUrl} size="md" alt="FCAT Official Seal" />
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wide text-[#7A6F6F] truncate">
              {companyName || 'Fernandez College of Arts And Technology, Inc. (FCAT)'}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#4A1219] tracking-tight leading-tight">
              CORRECTIVE ACTION REPORT
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-1 text-xs border-t sm:border-t-0 sm:border-l border-[#EAD9D4] pt-3 sm:pt-0 sm:pl-5 shrink-0 font-mono-tabular">
          <div>
            <div className="text-[#7A6F6F] text-[10px] uppercase">Doc Code</div>
            <div className="font-semibold text-[#2B2323]">FO-RI-05</div>
          </div>
          <div>
            <div className="text-[#7A6F6F] text-[10px] uppercase">Rev. No.</div>
            <div className="font-semibold text-[#2B2323]">00</div>
          </div>
          <div>
            <div className="text-[#7A6F6F] text-[10px] uppercase">Standard</div>
            <div className="font-semibold text-[#2B2323]">{standard || 'ISO 9001:2015'}</div>
          </div>
          <div>
            <div className="text-[#7A6F6F] text-[10px] uppercase">Effectivity</div>
            <div className="font-semibold text-[#2B2323]">05/19/2025</div>
          </div>
        </div>
      </div>
    </div>
  );
}
