import { ROUTES } from '@/lib/routes';

export type IconName =
  | 'LayoutDashboard' | 'Users' | 'Stethoscope' | 'Calendar' | 'CreditCard'
  | 'BarChart3' | 'Bell' | 'UserCheck' | 'Building2' | 'Tags' | 'Lightbulb';

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  roles: Array<'ADMIN' | 'MANAGER' | 'PHYSIOTHERAPIST'>;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Paneli', href: ROUTES.dashboard, icon: 'LayoutDashboard', roles: ['ADMIN', 'MANAGER', 'PHYSIOTHERAPIST'] },
  { label: 'Pacientët', href: ROUTES.patients, icon: 'Users', roles: ['ADMIN', 'MANAGER', 'PHYSIOTHERAPIST'] },
  { label: 'Kontrollat', href: ROUTES.treatments, icon: 'Stethoscope', roles: ['ADMIN', 'MANAGER', 'PHYSIOTHERAPIST'] },
  { label: 'Trajtimet', href: ROUTES.sessions, icon: 'Calendar', roles: ['ADMIN', 'MANAGER', 'PHYSIOTHERAPIST'] },
  { label: 'Pagesat', href: ROUTES.payments, icon: 'CreditCard', roles: ['ADMIN', 'MANAGER'] },
  { label: 'Raportet', href: ROUTES.reports, icon: 'BarChart3', roles: ['ADMIN', 'PHYSIOTHERAPIST'] },
  { label: 'Sugjerime', href: ROUTES.suggestions, icon: 'Lightbulb', roles: ['ADMIN'] },
  { label: 'Përdoruesit', href: ROUTES.users, icon: 'UserCheck', roles: ['ADMIN'] },
  { label: 'Degët', href: ROUTES.branches, icon: 'Building2', roles: ['ADMIN'] },
  { label: 'Llojet e Trajtimeve', href: ROUTES.treatmentTypes, icon: 'Tags', roles: ['ADMIN'] },
];

export function getNavItemsForRole(role: string): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.includes(role as any));
}

// Subset shown in the mobile bottom nav (limited to ~5 to keep it usable on a phone).
const MOBILE_LABELS_ADMIN         = ['Paneli', 'Kontrollat', 'Trajtimet', 'Pagesat', 'Raportet'];
// Manager: no Raportet — Kontrollat replaces it
const MOBILE_LABELS_MANAGER       = ['Paneli', 'Pacientët', 'Trajtimet', 'Pagesat', 'Kontrollat'];
// Physio: Pagesat not in their nav so it gets filtered out naturally
const MOBILE_LABELS_PHYSIOTHERAPIST = ['Paneli', 'Pacientët', 'Trajtimet', 'Kontrollat', 'Raportet'];

export function getMobileNavItemsForRole(role: string): NavItem[] {
  const labels =
    role === 'ADMIN' ? MOBILE_LABELS_ADMIN :
    role === 'MANAGER' ? MOBILE_LABELS_MANAGER :
    MOBILE_LABELS_PHYSIOTHERAPIST;
  return getNavItemsForRole(role).filter((i) => labels.includes(i.label)).slice(0, 5);
}
