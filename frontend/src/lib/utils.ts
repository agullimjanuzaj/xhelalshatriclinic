import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  return `${Number(amount).toFixed(2)}€`;
}

// Every backend response passes through a global TransformInterceptor that
// wraps it as `{ success, data }` (and flattens `{ data, meta }` payloads to
// `{ success, data, meta }`). So a list endpoint's resolved value is never
// the array itself — it's always `{ data: [...] }` (or, for an unwrapped
// array response, still `{ data: [...] }` since arrays don't carry their own
// `data`/`meta` keys). This is the single safe way to read a list back:
// accepts the wrapped shape, a bare array (in case that ever changes), or
// null/undefined, and never returns anything `.map` can't be called on.
export function extractList<T = any>(response: unknown): T[] {
  if (Array.isArray(response)) return response;
  if (response && typeof response === 'object' && Array.isArray((response as any).data)) {
    return (response as any).data;
  }
  return [];
}

// Same idea for a single-item response — `{ data: {...} }` or the bare value.
export function extractItem<T = any>(response: unknown): T | undefined {
  if (response && typeof response === 'object' && 'data' in (response as any) && !Array.isArray((response as any).data)) {
    return (response as any).data;
  }
  return response as T | undefined;
}

// Mirrors backend computePlanFinancials' earned-vs-paid debt formula, for
// display contexts (e.g. share-text summaries) that already have a plan
// object in hand and don't need a full /financials round-trip.
export function computeCurrentDebt(plan: {
  completedSessions: number;
  sessionFee: number | string;
  amountPaid: number | string;
}): number {
  const earned = Math.max(0, plan.completedSessions) * Number(plan.sessionFee);
  return Math.max(0, earned - Number(plan.amountPaid));
}

// "Aktiv deri: 14:30" style label for the activeInClinic countdown — shown
// next to the toggle so staff can see at a glance when a check-in expires.
export function formatActiveUntil(expiresAt: string | Date | null | undefined): string {
  if (!expiresAt) return '';
  const d = new Date(expiresAt);
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return 'Ka skaduar';
  const mins = Math.round(diffMs / 60_000);
  const timeStr = d.toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit' });
  if (mins < 60) return `Aktiv deri: ${timeStr} (${mins} min)`;
  return `Aktiv deri: ${timeStr}`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('sq-AL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('sq-AL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

export function getPaymentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PAID: 'Paguar',
    PARTIALLY_PAID: 'Pjesërisht paguar',
    UNPAID: 'Pa paguar',
  };
  return map[status] || status;
}

export function getPaymentStatusColor(status: string): string {
  const map: Record<string, string> = {
    PAID: 'text-green-700 bg-green-50 border-green-200',
    PARTIALLY_PAID: 'text-amber-700 bg-amber-50 border-amber-200',
    UNPAID: 'text-red-700 bg-red-50 border-red-200',
  };
  return map[status] || 'text-gray-600 bg-gray-50';
}

export function getSessionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: 'E planifikuar',
    COMPLETED: 'E kompletuar',
    CANCELLED: 'E anuluar',
    NO_SHOW: 'Nuk u paraqit',
  };
  return map[status] || status;
}

export function getSessionStatusColor(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: 'text-blue-700 bg-blue-50 border-blue-200',
    COMPLETED: 'text-green-700 bg-green-50 border-green-200',
    CANCELLED: 'text-red-700 bg-red-50 border-red-200',
    NO_SHOW: 'text-gray-700 bg-gray-50 border-gray-200',
  };
  return map[status] || 'text-gray-600 bg-gray-50';
}

export function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Administrator',
    MANAGER: 'Menaxher',
    PHYSIOTHERAPIST: 'Fizioterapist',
  };
  return map[role] || role;
}

export function getTreatmentTypeLabel(type: string): string {
  const map: Record<string, string> = {
    DRY_NEEDLING: 'Dry Needling',
    ELECTROTHERAPY: 'Elektroterapi',
    ULTRASOUND: 'Ultratinguj',
    LASER_THERAPY: 'Terapi me Lazer',
    SHOCKWAVE_THERAPY: 'Terapi me Valë Goditëse',
    MANUAL_THERAPY: 'Terapi Manuale',
    THERAPEUTIC_MASSAGE: 'Masazh Terapeutik',
    KINESIO_TAPING: 'Kinesio Taping',
    THERAPEUTIC_EXERCISES: 'Ushtrime Terapeutike',
    JOINT_MOBILIZATION: 'Mobilizim i Nyjës',
  };
  return map[type] || type;
}

export function getSymptomLabel(symptom: string): string {
  const map: Record<string, string> = {
    NECK_PAIN: 'Dhembje qafe',
    LOWER_BACK_PAIN: 'Dhembje shpine',
    SHOULDER_PAIN: 'Dhembje shpullë',
    KNEE_PAIN: 'Dhembje gjuri',
    LEG_NUMBNESS: 'Mpirje e këmbës',
    ARM_NUMBNESS: 'Mpirje e krahut',
    LIMITED_MOBILITY: 'Lëvizje e kufizuar',
    MUSCLE_WEAKNESS: 'Dobësi muskulore',
  };
  return map[symptom] || symptom;
}

// Patient status is intentionally just these two clinical states now —
// "registered"/"active in clinic" are not statuses, they're either "no
// status yet" (null) or the separate activeInClinic front-desk tick.
export function getPatientStatusLabel(status: string | null | undefined): string {
  const map: Record<string, string> = {
    IN_TREATMENT: 'Në trajtim',
    COMPLETED: 'I përfunduar',
  };
  return status ? (map[status] || status) : '';
}

export function getPatientStatusColor(status: string | null | undefined): string {
  const map: Record<string, string> = {
    IN_TREATMENT: 'text-teal-700 bg-teal-50 border-teal-200',
    COMPLETED: 'text-green-700 bg-green-50 border-green-200',
  };
  return status ? (map[status] || 'text-gray-600 bg-gray-50') : '';
}

export function getGenderLabel(gender: string): string {
  return gender === 'MALE' ? 'Mashkull' : gender === 'FEMALE' ? 'Femër' : '—';
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}
