import React, { useState } from 'react';
import { safeUrl } from '../lib/format';

const OFFICIAL_SCHOOL_LOGO = '/fcat-logo.png';
const LEGACY_DRIVE_LOGO_ID = '1AjBH5OjVr9uuo3Wlb7VywM7eAkXD7zlR';

function resolveSchoolLogoSrc(logoUrl?: string): string {
  const safe = safeUrl(logoUrl);
  if (!safe || safe.includes(LEGACY_DRIVE_LOGO_ID)) {
    return OFFICIAL_SCHOOL_LOGO;
  }
  return safe;
}

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
  const src = failed ? OFFICIAL_SCHOOL_LOGO : resolveSchoolLogoSrc(logoUrl);
  const dim =
    size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-16 w-16' : 'h-11 w-11';

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => {
        if (src !== OFFICIAL_SCHOOL_LOGO) setFailed(true);
      }}
      className={`${dim} rounded-full object-contain bg-white p-0.5 shrink-0 border border-[#C9A227]/60 shadow-sm`}
    />
  );
}

export function OfficialCarHeader({
  logoUrl,
  processGroup = 'Review & Improvement',
  pageLabel = 'Page _ of _',
  className = 'mb-5 shadow-sm',
}: {
  companyName?: string;
  standard?: string;
  logoUrl?: string;
  processGroup?: string;
  pageLabel?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = failed ? OFFICIAL_SCHOOL_LOGO : resolveSchoolLogoSrc(logoUrl);

  return (
    <div className={`bg-white text-[#111111] border border-[#111111] overflow-hidden font-serif ${className}`}>
      {/* Top Row: School Seal | CORRECTIVE ACTION REPORT | Document Code & Rev. No. */}
      <div className="grid grid-cols-1 sm:grid-cols-[132px_1fr_220px]">
        <div className="border-b sm:border-b-0 sm:border-r border-[#111111] px-3 py-2.5 flex items-center justify-center bg-white">
          <img
            src={src}
            alt="Fernandez College of Arts & Technology Seal"
            referrerPolicy="no-referrer"
            onError={() => {
              if (src !== OFFICIAL_SCHOOL_LOGO) setFailed(true);
            }}
            className="h-16 w-16 sm:h-[74px] sm:w-[74px] object-contain"
          />
        </div>

        <div className="border-b sm:border-b-0 sm:border-r border-[#111111] px-4 py-4 flex items-center justify-center text-center">
          <h2 className="text-base sm:text-xl font-bold tracking-wide text-black m-0 uppercase">
            CORRECTIVE ACTION REPORT
          </h2>
        </div>

        <div className="grid grid-rows-2">
          <div className="grid grid-cols-2 border-b border-[#111111]">
            <div className="border-r border-dotted border-[#111111] px-2.5 py-1.5 font-bold text-xs sm:text-[13px] leading-tight flex items-center">
              Document Code
            </div>
            <div className="px-2.5 py-1.5 text-xs sm:text-[13px] flex items-center">
              FO-RI-05
            </div>
          </div>
          <div className="grid grid-cols-2">
            <div className="border-r border-dotted border-[#111111] px-2.5 py-1.5 font-bold text-xs sm:text-[13px] flex items-center">
              Rev. No.
            </div>
            <div className="px-2.5 py-1.5 text-xs sm:text-[13px] flex items-center">
              00
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Process Group/Department | Effectivity Date | Page No. */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_220px] border-t border-[#111111]">
        <div className="border-b sm:border-b-0 sm:border-r border-[#111111] px-3 py-1.5 text-xs sm:text-[13px] leading-snug">
          <div>Process Group/Department:</div>
          <div className="font-bold">{processGroup}</div>
        </div>

        <div className="border-b sm:border-b-0 sm:border-r border-[#111111] px-3 py-1.5 text-xs sm:text-[13px] flex items-center">
          <span>
            Effectivity Date: <strong className="font-bold">05/19/2025</strong>
          </span>
        </div>

        <div className="grid grid-cols-2">
          <div className="border-r border-dotted border-[#111111] px-2.5 py-1.5 font-bold text-xs sm:text-[13px] flex items-center">
            Page No.
          </div>
          <div className="px-2.5 py-1.5 text-xs sm:text-[13px] flex items-center">
            {pageLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
