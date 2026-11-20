import React from 'react';
import {
  Award,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  ClipboardCheck,
  Compass,
  Cpu,
  DoorOpen,
  FileCheck2,
  FlaskConical,
  FolderArchive,
  Gavel,
  GraduationCap,
  HandHeart,
  HardHat,
  HeartHandshake,
  HeartPulse,
  Landmark,
  Leaf,
  Library,
  Megaphone,
  Scale,
  Server,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  UserCheck,
  UserPlus,
  Users,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

interface DeptVisual {
  icon: LucideIcon;
  bg: string;
  fg: string;
  ring: string;
  label: string;
}

const DEPT_VISUALS: Array<{ match: RegExp; visual: DeptVisual }> = [
  {
    match: /computer science/i,
    visual: { icon: Cpu, bg: 'bg-[#EEF4FF]', fg: 'text-[#1E40AF]', ring: 'border-[#BFDBFE]', label: 'Computer Science' },
  },
  {
    match: /nursing/i,
    visual: { icon: HeartPulse, bg: 'bg-[#FDF2F4]', fg: 'text-[#9F1239]', ring: 'border-[#FECDD3]', label: 'College of Nursing' },
  },
  {
    match: /hospitality/i,
    visual: { icon: UtensilsCrossed, bg: 'bg-[#FFF7ED]', fg: 'text-[#9A3412]', ring: 'border-[#FED7AA]', label: 'Hospitality Management' },
  },
  {
    match: /college of education/i,
    visual: { icon: BookOpen, bg: 'bg-[#EFF6FF]', fg: 'text-[#1D4ED8]', ring: 'border-[#BFDBFE]', label: 'College of Education' },
  },
  {
    match: /business administration|accountancy/i,
    visual: { icon: Briefcase, bg: 'bg-[#FEFCE8]', fg: 'text-[#854D0E]', ring: 'border-[#FDE68A]', label: 'CBAA' },
  },
  {
    match: /criminal justice/i,
    visual: { icon: Scale, bg: 'bg-[#F5F3FF]', fg: 'text-[#5B21B6]', ring: 'border-[#DDD6FE]', label: 'Criminal Justice' },
  },
  {
    match: /tesda/i,
    visual: { icon: Wrench, bg: 'bg-[#FFFBEB]', fg: 'text-[#92400E]', ring: 'border-[#FDE68A]', label: 'TESDA' },
  },
  {
    match: /academic services/i,
    visual: { icon: GraduationCap, bg: 'bg-[#FDF2F2]', fg: 'text-[#6B1A25]', ring: 'border-[#EAD9D4]', label: 'Academic Services' },
  },
  {
    match: /document control/i,
    visual: { icon: FileCheck2, bg: 'bg-[#F0FDF4]', fg: 'text-[#166534]', ring: 'border-[#BBF7D0]', label: 'Document Control' },
  },
  {
    match: /review & improvement/i,
    visual: { icon: ClipboardCheck, bg: 'bg-[#FDF2F2]', fg: 'text-[#6B1A25]', ring: 'border-[#EAD9D4]', label: 'Review & Improvement' },
  },
  {
    match: /strategic planning/i,
    visual: { icon: Compass, bg: 'bg-[#ECFEFF]', fg: 'text-[#155E75]', ring: 'border-[#A5F3FC]', label: 'Strategic Planning' },
  },
  {
    match: /alumni/i,
    visual: { icon: Users, bg: 'bg-[#FEF9C3]', fg: 'text-[#713F12]', ring: 'border-[#FDE047]', label: 'Alumni Services' },
  },
  {
    match: /student affairs/i,
    visual: { icon: Sparkles, bg: 'bg-[#FAF5FF]', fg: 'text-[#6B21A8]', ring: 'border-[#E9D5FF]', label: 'Student Affairs' },
  },
  {
    match: /extension/i,
    visual: { icon: HandHeart, bg: 'bg-[#FFF1F2]', fg: 'text-[#9F1239]', ring: 'border-[#FECDD3]', label: 'Extension Services' },
  },
  {
    match: /\bit services\b/i,
    visual: { icon: Server, bg: 'bg-[#EEF2FF]', fg: 'text-[#3730A3]', ring: 'border-[#C7D2FE]', label: 'IT Services' },
  },
  {
    match: /human resource/i,
    visual: { icon: UserCheck, bg: 'bg-[#ECFEFF]', fg: 'text-[#0E7490]', ring: 'border-[#A5F3FC]', label: 'Human Resources' },
  },
  {
    match: /library/i,
    visual: { icon: Library, bg: 'bg-[#FFF7ED]', fg: 'text-[#9A3412]', ring: 'border-[#FED7AA]', label: 'Library Services' },
  },
  {
    match: /research/i,
    visual: { icon: FlaskConical, bg: 'bg-[#F0F9FF]', fg: 'text-[#0369A1]', ring: 'border-[#BAE6FD]', label: 'Research Services' },
  },
  {
    match: /disciplinary/i,
    visual: { icon: Gavel, bg: 'bg-[#FEF2F2]', fg: 'text-[#991B1B]', ring: 'border-[#FECACA]', label: 'Disciplinary Services' },
  },
  {
    match: /scholarship/i,
    visual: { icon: Award, bg: 'bg-[#FEFCE8]', fg: 'text-[#A16207]', ring: 'border-[#FDE047]', label: 'Scholarship Services' },
  },
  {
    match: /guidance/i,
    visual: { icon: HeartHandshake, bg: 'bg-[#F0FDF4]', fg: 'text-[#15803D]', ring: 'border-[#BBF7D0]', label: 'Guidance & Counseling' },
  },
  {
    match: /accounting/i,
    visual: { icon: Landmark, bg: 'bg-[#ECFDF5]', fg: 'text-[#047857]', ring: 'border-[#A7F3D0]', label: 'Accounting Services' },
  },
  {
    match: /procurement/i,
    visual: { icon: ShoppingBag, bg: 'bg-[#FFF7ED]', fg: 'text-[#C2410C]', ring: 'border-[#FED7AA]', label: 'Procurement Services' },
  },
  {
    match: /registrar/i,
    visual: { icon: FolderArchive, bg: 'bg-[#F5F3FF]', fg: 'text-[#6D28D9]', ring: 'border-[#DDD6FE]', label: 'Registrar' },
  },
  {
    match: /enrollment/i,
    visual: { icon: UserPlus, bg: 'bg-[#EFF6FF]', fg: 'text-[#1D4ED8]', ring: 'border-[#BFDBFE]', label: 'Enrollment Services' },
  },
  {
    match: /admission/i,
    visual: { icon: DoorOpen, bg: 'bg-[#F0FDFA]', fg: 'text-[#0F766E]', ring: 'border-[#99F6E4]', label: 'Admission Services' },
  },
  {
    match: /marketing/i,
    visual: { icon: Megaphone, bg: 'bg-[#FDF2F8]', fg: 'text-[#9D174D]', ring: 'border-[#FBCFE8]', label: 'Marketing Services' },
  },
  {
    match: /maintenance/i,
    visual: { icon: Wrench, bg: 'bg-[#F3F4F6]', fg: 'text-[#374151]', ring: 'border-[#D1D5DB]', label: 'Maintenance Services' },
  },
  {
    match: /inventory/i,
    visual: { icon: Boxes, bg: 'bg-[#FFFBEB]', fg: 'text-[#B45309]', ring: 'border-[#FDE68A]', label: 'Inventory Services' },
  },
  {
    match: /pollution control/i,
    visual: { icon: Leaf, bg: 'bg-[#ECFDF5]', fg: 'text-[#15803D]', ring: 'border-[#A7F3D0]', label: 'Pollution Control' },
  },
  {
    match: /security/i,
    visual: { icon: Shield, bg: 'bg-[#EFF6FF]', fg: 'text-[#1E3A8A]', ring: 'border-[#BFDBFE]', label: 'Security Services' },
  },
  {
    match: /safety/i,
    visual: { icon: HardHat, bg: 'bg-[#FFFBEB]', fg: 'text-[#B45309]', ring: 'border-[#FDE68A]', label: 'Safety Services' },
  },
  {
    match: /medical/i,
    visual: { icon: Stethoscope, bg: 'bg-[#FEF2F2]', fg: 'text-[#B91C1C]', ring: 'border-[#FECACA]', label: 'Medical Services' },
  },
];

export function splitDepartments(departmentStr?: string): string[] {
  return String(departmentStr || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

export function getDepartmentVisual(department?: string, role?: string): DeptVisual {
  const name = String(department || '').trim();
  if (name) {
    const found = DEPT_VISUALS.find((entry) => entry.match.test(name));
    if (found) return found.visual;
    return {
      icon: Building2,
      bg: 'bg-[#F7ECEC]',
      fg: 'text-[#6B1A25]',
      ring: 'border-[#EAD9D4]',
      label: name,
    };
  }
  if (role === 'Admin' || role === 'Admin+Employee') {
    return {
      icon: ShieldCheck,
      bg: 'bg-[#FBF3DB]',
      fg: 'text-[#6B1A25]',
      ring: 'border-[#E5C97B]',
      label: 'System Administrator',
    };
  }
  if (role === 'Auditor' || role === 'Auditor+Employee') {
    return {
      icon: ClipboardCheck,
      bg: 'bg-[#F7ECEC]',
      fg: 'text-[#6B1A25]',
      ring: 'border-[#EAD9D4]',
      label: 'Internal Quality Auditor',
    };
  }
  return {
    icon: Building2,
    bg: 'bg-[#F7ECEC]',
    fg: 'text-[#6B1A25]',
    ring: 'border-[#EAD9D4]',
    label: 'FCAT Services',
  };
}

export function DepartmentAvatar({
  department,
  role,
  size = 'lg',
}: {
  department?: string;
  role?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const primary = splitDepartments(department)[0];
  const visual = getDepartmentVisual(primary, role);
  const Icon = visual.icon;

  const sizeClass =
    size === 'sm'
      ? 'w-8 h-8 rounded-lg'
      : size === 'md'
        ? 'w-11 h-11 rounded-xl'
        : 'w-[72px] h-[72px] rounded-2xl shadow-sm';
  const iconClass =
    size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-8 h-8';

  return (
    <div
      className={`${sizeClass} ${visual.bg} ${visual.fg} border ${visual.ring} inline-flex items-center justify-center shrink-0`}
      title={primary || visual.label}
      aria-label={primary || visual.label}
    >
      <Icon className={iconClass} />
    </div>
  );
}
