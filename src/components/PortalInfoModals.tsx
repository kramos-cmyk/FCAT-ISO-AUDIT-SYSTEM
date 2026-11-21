import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe,
  GraduationCap,
  History,
  Info,
  MapPin,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  APP_VERSION_HISTORY,
  CHED_BACHELOR_PROGRAMS,
  COLLEGE_NEW_REQUIREMENTS,
  COLLEGE_TRANSFEREE_REQUIREMENTS,
  CORE_VALUES,
  ELEMENTARY_REQUIREMENTS,
  ESC_DISQUALIFICATIONS,
  ESC_PROCEDURE,
  INSTITUTIONAL_OUTCOMES,
  INSTITUTIONAL_SCHOLARSHIPS,
  JHS_NEW_REQUIREMENTS,
  JHS_TRANSFEREE_REQUIREMENTS,
  OFFICIAL_WEBSITE_URL,
  PRE_ELEMENTARY_REQUIREMENTS,
  QUALITY_POLICY_POINTS,
  SHS_CURRICULUM_TRACKS,
  SHS_REQUIREMENTS,
  SHSVP_DISQUALIFICATIONS,
  SHSVP_PROCEDURE,
  TESDA_ASSESSMENT_CENTER,
  TESDA_DIPLOMA_PROGRAMS,
  TESDA_DIPLOMA_REQUIREMENTS,
  TESDA_SHORT_PROGRAMS,
  TESDA_SHORT_REQUIREMENTS,
} from '../data/fcatPortalInfo';

export type PortalModalKind = 'programs' | 'scholarship' | 'about' | 'history';

export function PortalInfoModal({
  kind,
  onClose,
  onOpenLogin,
}: {
  kind: PortalModalKind | null;
  onClose: () => void;
  onOpenLogin: () => void;
}) {
  const [programsTab, setProgramsTab] = useState<'all' | 'ched' | 'tesda' | 'basiced'>('all');
  const [scholarTab, setScholarTab] = useState<'all' | 'institutional' | 'gov' | 'esc'>('all');
  const [aboutTab, setAboutTab] = useState<'all' | 'history' | 'policy' | 'outcomes'>('all');

  useEffect(() => {
    setProgramsTab('all');
    setScholarTab('all');
    setAboutTab('all');
  }, [kind]);

  useEffect(() => {
    if (!kind) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [kind, onClose]);

  if (!kind) return null;

  const meta = {
    programs: {
      eyebrow: 'Academics & Admissions',
      title: 'Programs & Enrollment',
      subtitle: 'CHED Bachelor Degrees, TESDA Diploma & Short Courses, Senior High, Junior High, Elementary & Pre-Elementary.',
      icon: GraduationCap,
    },
    scholarship: {
      eyebrow: 'Financial Aid & Grants',
      title: 'Scholarship Programs',
      subtitle: 'Institutional scholarships, CHED/TESDA/DSWD/LGU grants, ESC & Senior High School Voucher Program.',
      icon: Award,
    },
    about: {
      eyebrow: 'Fernandez College of Arts and Technology',
      title: 'About FCAT',
      subtitle: 'History, Management Philosophy, Mission & Vision, Quality Policy, Institutional Outcomes & Core Values.',
      icon: Info,
    },
    history: {
      eyebrow: 'System Transparency & Changelog',
      title: 'Application Version History',
      subtitle: 'Public release notes documenting system updates, security controls, and compliance improvements.',
      icon: History,
    },
  }[kind];

  const Icon = meta.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#23060E]/75 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-info-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FAF6F3] border border-[#EAD9D4] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-[#2B2323]">
        <div className="h-1.5 bg-gradient-to-r from-[#F3B700] via-[#C9A227] to-[#6B1A25] shrink-0" />

        {/* Modal Header */}
        <div className="bg-white border-b border-[#EAD9D4] px-5 sm:px-7 py-4 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-[#7A0E2A] text-[#F3B700] flex items-center justify-center shrink-0 shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B1A25]">
                {meta.eyebrow}
              </div>
              <h2
                id="portal-info-modal-title"
                className="font-display text-xl sm:text-2xl font-bold text-[#4A1219] m-0"
              >
                {meta.title}
              </h2>
              <p className="text-xs sm:text-sm text-[#6F6464] mt-0.5 mb-0">{meta.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 rounded-lg text-[#7A6F6F] hover:text-[#2B2323] hover:bg-[#F4ECE9] cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Section Filter Bar */}
        {kind === 'programs' && (
          <div className="bg-white border-b border-[#EAD9D4] px-5 sm:px-7 py-2.5 flex flex-wrap gap-2 shrink-0">
            {(
              [
                { id: 'all', label: 'All Levels' },
                { id: 'ched', label: 'CHED Bachelor Programs' },
                { id: 'tesda', label: 'TESDA Diploma & Short' },
                { id: 'basiced', label: 'SHS, JHS & Elementary' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setProgramsTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  programsTab === t.id
                    ? 'bg-[#6B1A25] text-white'
                    : 'bg-[#F8F4F0] text-[#4A1219] hover:bg-[#EFE6E1]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {kind === 'scholarship' && (
          <div className="bg-white border-b border-[#EAD9D4] px-5 sm:px-7 py-2.5 flex flex-wrap gap-2 shrink-0">
            {(
              [
                { id: 'all', label: 'All Scholarships' },
                { id: 'institutional', label: 'FCAT Institutional Grants' },
                { id: 'gov', label: 'CHED, TESDA & DepEd' },
                { id: 'esc', label: 'ESC & SHS Voucher' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setScholarTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  scholarTab === t.id
                    ? 'bg-[#6B1A25] text-white'
                    : 'bg-[#F8F4F0] text-[#4A1219] hover:bg-[#EFE6E1]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {kind === 'about' && (
          <div className="bg-white border-b border-[#EAD9D4] px-5 sm:px-7 py-2.5 flex flex-wrap gap-2 shrink-0">
            {(
              [
                { id: 'all', label: 'All Sections' },
                { id: 'history', label: 'History & Philosophy' },
                { id: 'policy', label: 'Mission, Vision & Quality Policy' },
                { id: 'outcomes', label: 'Outcomes & Core Values' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAboutTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  aboutTab === t.id
                    ? 'bg-[#6B1A25] text-white'
                    : 'bg-[#F8F4F0] text-[#4A1219] hover:bg-[#EFE6E1]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-5 sm:p-7 space-y-5 flex-1">
          {kind === 'programs' && (
            <>
              {(programsTab === 'all' || programsTab === 'ched') && (
                <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0E4DF] pb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-[#6B1A25]" />
                      <h3 className="text-lg sm:text-xl font-bold text-[#4A1219] m-0">
                        CHED Bachelor Programs
                      </h3>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded bg-[#F9EAEA] text-[#6B1A25]">
                      4-Year Degree Programs
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {CHED_BACHELOR_PROGRAMS.map((prog) => (
                      <div
                        key={prog}
                        className="flex items-start gap-2 rounded-lg border border-[#F0E4DF] bg-[#FCF9F7] px-3.5 py-2.5 text-sm font-medium text-[#2B2323]"
                      >
                        <CheckCircle2 className="h-4 w-4 text-[#2F6D39] shrink-0 mt-0.5" />
                        <span>{prog}</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <RequirementCard
                      title="College Admission Requirements (New Student)"
                      items={COLLEGE_NEW_REQUIREMENTS}
                    />
                    <RequirementCard
                      title="College Admission Requirements (Transferee)"
                      items={COLLEGE_TRANSFEREE_REQUIREMENTS}
                    />
                  </div>

                  <InquiryBanner
                    office="Admission Office"
                    details="Room 102, 1st Floor FCAT Main Building, Gil Carlos St., Baliuag City, Bulacan"
                    contact="0946 3077 262 · Facebook: facebook.com/admission.fcat"
                  />
                </div>
              )}

              {(programsTab === 'all' || programsTab === 'tesda') && (
                <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0E4DF] pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-[#6B1A25]" />
                      <h3 className="text-lg sm:text-xl font-bold text-[#4A1219] m-0">
                        TESDA Diploma &amp; Short Programs
                      </h3>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded bg-[#E9F4EC] text-[#255A2D]">
                      Technical &amp; Assessment Center
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-[#6B1A25] mb-2.5 mt-0">
                      TESDA Diploma Programs (3-Year Programs)
                    </h4>
                    <div className="space-y-2">
                      {TESDA_DIPLOMA_PROGRAMS.map((item) => (
                        <div
                          key={item}
                          className="flex items-start gap-2 rounded-lg border border-[#EAD9D4] bg-[#FCF9F3] px-3.5 py-2.5 text-sm font-medium text-[#2B2323]"
                        >
                          <CheckCircle2 className="h-4 w-4 text-[#6B1A25] shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-[#6B1A25] mb-2.5 mt-0">
                        TESDA Short Programs
                      </h4>
                      <ul className="space-y-1.5 m-0 pl-0 list-none text-sm">
                        {TESDA_SHORT_PROGRAMS.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#6B1A25] mt-2 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-[#6B1A25] mb-2.5 mt-0">
                        Assessment Center Qualifications
                      </h4>
                      <ul className="space-y-1.5 m-0 pl-0 list-none text-sm">
                        {TESDA_ASSESSMENT_CENTER.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#C9A227] mt-2 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <RequirementCard
                      title="Admission Requirements: TESDA Diploma Programs"
                      items={TESDA_DIPLOMA_REQUIREMENTS}
                    />
                    <RequirementCard
                      title="Admission Requirements: TESDA Short Programs"
                      items={TESDA_SHORT_REQUIREMENTS}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <InquiryBanner
                      office="TESDA Diploma Inquiries — Scholarship Office"
                      details="2nd Floor FCAT Main Building, Gil Carlos St., Baliuag City, Bulacan"
                      contact="0950 847 2432 · Contact: Ms. Rochelle C. Fernandez (Scholarship Focal Person)"
                    />
                    <InquiryBanner
                      office="TESDA Short Programs Inquiries — TESDA Office"
                      details="FCAT Pinagbarilan Campus, Pinagbarilan, Baliuag City, Bulacan"
                      contact="Contact: Mr. Jerome Corpuz (TESDA Registrar)"
                    />
                  </div>
                </div>
              )}

              {(programsTab === 'all' || programsTab === 'basiced') && (
                <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0E4DF] pb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-[#6B1A25]" />
                      <h3 className="text-lg sm:text-xl font-bold text-[#4A1219] m-0">
                        Basic Education (SHS, Junior High, Elementary &amp; Pre-Elementary)
                      </h3>
                    </div>
                  </div>

                  {/* Senior High School */}
                  <div className="rounded-xl border border-[#EAD9D4] bg-[#FCF9F7] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-base font-bold text-[#4A1219] m-0">
                        Senior High School Strengthened Curriculum
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {SHS_CURRICULUM_TRACKS.map((track) => (
                          <span
                            key={track}
                            className="text-xs font-semibold px-2.5 py-0.5 rounded bg-[#F9EAEA] text-[#6B1A25]"
                          >
                            {track}
                          </span>
                        ))}
                      </div>
                    </div>
                    <RequirementCard
                      title="Admission Requirements for New Student / Transferee"
                      items={SHS_REQUIREMENTS}
                    />
                  </div>

                  {/* Junior High School */}
                  <div className="space-y-3">
                    <h4 className="text-base font-bold text-[#4A1219] m-0">Junior High School</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <RequirementCard
                        title="Admission Requirements for New Student"
                        items={JHS_NEW_REQUIREMENTS}
                      />
                      <RequirementCard
                        title="Admission Requirements for Transferee"
                        items={JHS_TRANSFEREE_REQUIREMENTS}
                      />
                    </div>
                  </div>

                  {/* Elementary & Pre-Elementary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <RequirementCard
                      title="Elementary Admission Requirements"
                      items={ELEMENTARY_REQUIREMENTS}
                    />
                    <RequirementCard
                      title="Pre-Elementary Admission Requirements"
                      items={PRE_ELEMENTARY_REQUIREMENTS}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {kind === 'scholarship' && (
            <>
              {(scholarTab === 'all' || scholarTab === 'institutional') && (
                <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-4 shadow-sm">
                  <div className="rounded-xl bg-[#FCF9F3] border border-[#C9A227]/50 p-4 text-sm text-[#2B2323] leading-relaxed">
                    <strong>Fernandez Colleges</strong> offers a wide variety of scholarships for
                    deserving but financially challenged students. Almost all courses—with a few
                    exceptions like Caregiver—have available scholarships year-round. Please visit
                    the <strong>Registrar&apos;s Office, Ground Floor, FCAT Main Building</strong>{' '}
                    for more details.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {INSTITUTIONAL_SCHOLARSHIPS.map((sc) => (
                      <div
                        key={sc.title}
                        className="rounded-xl border border-[#EAD9D4] bg-white p-4 sm:p-5 flex flex-col gap-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-base font-bold text-[#4A1219] m-0">{sc.title}</h3>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-[#6B1A25] text-white">
                            {sc.badge}
                          </span>
                        </div>
                        {sc.summary && (
                          <p className="text-xs sm:text-sm font-medium text-[#6B1A25] m-0">
                            {sc.summary}
                          </p>
                        )}
                        <ul className="space-y-1.5 m-0 pl-0 list-none text-xs sm:text-sm text-[#2B2323]">
                          {sc.points.map((pt) => (
                            <li key={pt} className="flex items-start gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-[#2F6D39] shrink-0 mt-1" />
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs font-semibold text-[#9A2A1E] bg-[#FBE7E1] border border-[#F3CFC5] rounded-lg px-4 py-2.5 m-0">
                    *All Scholarships are not inclusive of miscellaneous and other fees (books,
                    uniforms, etc.).
                  </p>
                </div>
              )}

              {(scholarTab === 'all' || scholarTab === 'gov') && (
                <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-3 shadow-sm">
                  <h3 className="text-lg font-bold text-[#4A1219] m-0">
                    CHED, TESDA and DepEd Scholarships
                  </h3>
                  <p className="text-sm text-[#2B2323] leading-relaxed m-0">
                    Fernandez College of Arts and Technology (FCAT) has received hundreds of
                    scholarship grants from the Technical Education and Skills Development Authority
                    (TESDA), Department of Social Welfare and Development (DSWD), and Local
                    Government Units (LGUs). These scholarships provide free tuition for FCAT&apos;s
                    various Technical Education Programs including Welding, Automotive, Cookery,
                    Caregiving, Housekeeping, and many others.
                  </p>
                  <p className="text-sm text-[#2B2323] leading-relaxed m-0">
                    Aside from this, FCAT also participates in the Commission on Higher
                    Education&apos;s (CHED) scholarships such as the{' '}
                    <strong>Tertiary Education Subsidy (TES)</strong> and{' '}
                    <strong>CHED Tulong Dunong</strong>, among others. FCAT is also certified by
                    the Private Education Assistance Committee (PEAC) to offer{' '}
                    <strong>Education Service Contracting (ESC)</strong> scholarships from DepEd as
                    well as participate in the <strong>Senior High School Voucher Program</strong>.
                  </p>
                  <InquiryBanner
                    office="TESDA & Government Scholarship Inquiries"
                    details="TESDA Office of FCAT, FCAT Main Building, Gil Carlos St., Poblacion, Baliwag, Bulacan (or inquire with the appropriate Registrar)"
                    contact="Telephone: 044 766 7677"
                  />
                </div>
              )}

              {(scholarTab === 'all' || scholarTab === 'esc') && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-3.5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold text-[#4A1219] m-0">
                        Education Service Contracting (ESC)
                      </h3>
                      <span className="text-xs font-bold px-2.5 py-1 rounded bg-[#E9F4EC] text-[#255A2D]">
                        Junior High (Grade 7)
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[#2B2323] leading-relaxed m-0">
                      Only new Grade 7 students are eligible to become new ESC grantees as provided
                      by DepEd and administered by PEAC (transferees from other ESC schools are also
                      accepted). ESC grantees receive a tuition subsidy for their whole junior high
                      school applied directly through the accounting office (P9,000 for Grade 7 as
                      of SY 2020–21). Grantees receive an ESC identification sticker and must
                      comply with DepEd rules and inspection requirements.
                    </p>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[#9A2A1E] mb-1.5">
                        Grantees may lose privileges if they:
                      </div>
                      <ul className="space-y-1 m-0 pl-0 list-none text-xs sm:text-sm">
                        {ESC_DISQUALIFICATIONS.map((d) => (
                          <li key={d} className="flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#A32424] mt-1.5 shrink-0" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[#6B1A25] mb-1.5">
                        Procedure
                      </div>
                      <ol className="space-y-1.5 m-0 pl-4 text-xs sm:text-sm text-[#2B2323]">
                        {ESC_PROCEDURE.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-3.5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold text-[#4A1219] m-0">
                        SHS Voucher Program (SHSVP)
                      </h3>
                      <span className="text-xs font-bold px-2.5 py-1 rounded bg-[#FBF0D6] text-[#6B5300]">
                        Senior High (Grade 11)
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[#2B2323] leading-relaxed m-0">
                      Only new Grade 11 students are eligible to avail of the DepEd voucher program.
                      Voucher recipients receive a tuition subsidy for two years of senior high
                      school applied directly through the accounting office (P17,500 for public high
                      school graduates and P14,000 for ESC school graduates or individual voucher
                      applicants, good for two semesters), processed via LRN or ESC ID numbers.
                    </p>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[#9A2A1E] mb-1.5">
                        Grantees may lose privileges if they:
                      </div>
                      <ul className="space-y-1 m-0 pl-0 list-none text-xs sm:text-sm">
                        {SHSVP_DISQUALIFICATIONS.map((d) => (
                          <li key={d} className="flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#A32424] mt-1.5 shrink-0" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[#6B1A25] mb-1.5">
                        Procedure
                      </div>
                      <ol className="space-y-1.5 m-0 pl-4 text-xs sm:text-sm text-[#2B2323]">
                        {SHSVP_PROCEDURE.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {kind === 'about' && (
            <>
              {(aboutTab === 'all' || aboutTab === 'history') && (
                <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-5 shadow-sm">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-[#4A1219] m-0 mb-2">
                      A Brief History of Fernandez College
                    </h3>
                    <p className="text-sm text-[#2B2323] leading-relaxed mb-3">
                      Fernandez College of Arts and Technology (FCAT) started as a technical skills
                      school in Cruz na Daan, San Rafael, Bulacan in June 1993 with about 250
                      students. Starting with a dream to help many more financially challenged but
                      deserving students, FCAT established its main branch in Baliuag, Bulacan. By
                      June 1996, there were around 900 students and this would continue to increase
                      over the years because of the school&apos;s pursuit of its mission and vision.
                    </p>
                    <p className="text-sm text-[#2B2323] leading-relaxed m-0">
                      Currently, it has 5 Campuses in Baliuag: <strong>Gil Carlos</strong>,{' '}
                      <strong>R.E. Chico</strong>, <strong>La Rosa</strong>, and{' '}
                      <strong>two in Pinagbarilan</strong> with a total of around 2,000 students.
                      The college is a non-stock, non-profit organization offering 4-year degree
                      courses, 2-year technical skills courses, and review/modular programs such as
                      Caregiving—emphasizing effective education that helps graduates face life&apos;s
                      challenges.
                    </p>
                  </div>

                  <div className="border-t border-[#F0E4DF] pt-4">
                    <h3 className="text-lg sm:text-xl font-bold text-[#4A1219] m-0 mb-2">
                      Management Philosophy
                    </h3>
                    <p className="text-sm text-[#2B2323] leading-relaxed mb-3">
                      The President and Vice President, Mr. and Mrs. Marcelo V. Fernandez, together
                      with their two sons (one a lawyer and the other a professional teacher),
                      envision the school bringing technology, arts, and education to the countryside
                      at standards comparable to—or better than—Manila and international schools.
                      They began in 1991, two years after returning from Papua New Guinea and
                      Australia where they honed their skills as educators.
                    </p>
                    <p className="text-sm text-[#2B2323] leading-relaxed mb-3">
                      Management believes that providing in-demand skills to the youth—immediately
                      useful to manufacturing and service industries locally and abroad—is vital to
                      national progress. The college aspires to deliver these skills in the shortest
                      time possible at the lowest expense possible, striking a balance between
                      quality and efficiency.
                    </p>
                    <p className="text-sm font-semibold italic text-[#6B1A25] m-0">
                      &ldquo;As both usually say, the school is foremost a mission and secondly a
                      business venture.&rdquo;
                    </p>
                  </div>
                </div>
              )}

              {(aboutTab === 'all' || aboutTab === 'policy') && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-[#7A0E2A] to-[#4E0719] text-white rounded-xl p-5 sm:p-6 shadow-sm">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#F3B700] mb-1.5">
                        Mission Statement
                      </div>
                      <p className="font-display text-xl sm:text-2xl font-bold leading-snug m-0">
                        We are here to educate and train students, the global way.
                      </p>
                    </div>
                    <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#6B1A25] mb-1.5">
                        Vision Statement
                      </div>
                      <p className="font-display text-lg sm:text-xl font-bold text-[#4A1219] leading-snug m-0">
                        To be an outstanding school whose graduates are working across the
                        Philippines and around the world, proud and tall as Filipinos.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-3 shadow-sm">
                    <h3 className="text-lg font-bold text-[#4A1219] m-0">Quality Policy</h3>
                    <p className="text-sm text-[#2B2323] leading-relaxed m-0">
                      The Policy of Fernandez College of Arts and Technology (FCAT) is to provide
                      all clients with educational services that consistently exceed their
                      expectations in relationship to quality, safety, reliability, client service,
                      and environmental responsibilities. To achieve this, we will:
                    </p>
                    <ol className="space-y-1.5 m-0 pl-5 text-sm text-[#2B2323]">
                      {QUALITY_POLICY_POINTS.map((pt) => (
                        <li key={pt}>{pt}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              {(aboutTab === 'all' || aboutTab === 'outcomes') && (
                <div className="space-y-4">
                  <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 space-y-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-bold text-[#4A1219] m-0">
                        Institutional Outcomes / Goals
                      </h3>
                      <span className="text-xs font-semibold text-[#6F6464]">
                        Graduates should be:
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {INSTITUTIONAL_OUTCOMES.map((out, i) => (
                        <div
                          key={out.title}
                          className="rounded-lg border border-[#F0E4DF] bg-[#FCF9F7] p-3.5 text-sm"
                        >
                          <div className="font-bold text-[#4A1219]">
                            {i + 1}. {out.title}
                          </div>
                          <div className="text-xs sm:text-sm text-[#574D4D] mt-0.5">{out.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-[#4A1219] m-0 mb-3">
                      Core Values of Fernandez College of Arts &amp; Technology
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                      {CORE_VALUES.map((val, i) => (
                        <div
                          key={val}
                          className="rounded-lg bg-[#7A0E2A] text-white px-3.5 py-3 text-center flex flex-col items-center justify-center"
                        >
                          <span className="text-[11px] font-bold text-[#F3B700]">0{i + 1}</span>
                          <span className="text-xs sm:text-sm font-semibold mt-0.5">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {kind === 'history' && (
            <div className="space-y-4">
              {APP_VERSION_HISTORY.map((rel, idx) => (
                <div
                  key={rel.version}
                  className={`rounded-xl border p-5 bg-white shadow-sm ${
                    idx === 0 ? 'border-[#C9A227]/70' : 'border-[#EAD9D4]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded-md bg-[#6B1A25] text-white">
                        {rel.version}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-[#4A1219] m-0">
                        {rel.title}
                      </h3>
                      {rel.tag && (
                        <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-[#E9F4EC] text-[#255A2D] border border-[#C5E0CB]">
                          {rel.tag}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-[#7A6F6F]">{rel.date}</span>
                  </div>
                  <ul className="space-y-1.5 m-0 pl-0 list-none">
                    {rel.highlights.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs sm:text-sm text-[#2B2323]">
                        <CheckCircle2 className="h-4 w-4 text-[#2F6D39] shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-white border-t border-[#EAD9D4] px-5 sm:px-7 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <a
            href={OFFICIAL_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#6B1A25] hover:underline"
          >
            <Globe className="h-4 w-4" />
            Visit Official Website (fcat.com.ph)
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#4A1219] hover:bg-[#F8F4F0] cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLogin();
              }}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer"
            >
              Log in to ISO Portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequirementCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-[#EAD9D4] bg-[#FAF6F4]/70 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-[#6B1A25] mb-2">{title}</div>
      <ul className="space-y-1.5 m-0 pl-0 list-none text-xs sm:text-sm text-[#2B2323]">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#2F6D39] shrink-0 mt-1" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InquiryBanner({
  office,
  details,
  contact,
}: {
  office: string;
  details: string;
  contact: string;
}) {
  return (
    <div className="rounded-lg border border-[#EAD9D4] bg-[#FCF9F3] px-4 py-3 text-xs sm:text-sm text-[#2B2323] space-y-1">
      <div className="font-bold text-[#4A1219]">{office}</div>
      <div className="flex items-start gap-1.5 text-[#574D4D]">
        <MapPin className="h-3.5 w-3.5 text-[#6B1A25] shrink-0 mt-0.5" />
        <span>{details}</span>
      </div>
      <div className="flex items-start gap-1.5 text-[#574D4D]">
        <Phone className="h-3.5 w-3.5 text-[#6B1A25] shrink-0 mt-0.5" />
        <span>{contact}</span>
      </div>
    </div>
  );
}
