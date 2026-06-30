export const ROUTES = {
  dashboard: '/paneli',
  patients: '/pacientet',
  patientsNew: '/pacientet/new',
  patientDetail: (id: string) => `/pacientet/${id}`,
  // "treatments" here means the TreatmentPlan resource — labeled
  // "Kontrolla"/"Kontrollë" in the UI after the rename. URL moved from
  // /trajtimet to /kontrollat; /trajtimet itself was handed to Session below.
  treatments: '/kontrollat',
  treatmentDetail: (id: string) => `/kontrollat/${id}`,
  // "sessions" here means the Session resource — labeled "Trajtimet"/"Trajtim"
  // in the UI after the rename. URL moved from /seancat to /trajtimet.
  sessions: '/trajtimet',
  sessionDetail: (id: string) => `/trajtimet/${id}`,
  notifications: '/notifications',
  payments: '/pagesat',
  debts: '/borxhet',
  reports: '/raportet',
  users: '/perdoruesit',
  branches: '/deget',
  treatmentTypes: '/treatment-types',
  suggestions: '/sugjerime',
  login: '/kycu',
};

export function getDashboardPath(_role?: string | null) {
  return ROUTES.dashboard;
}
export function getNotificationsPath(_role?: string | null) {
  return ROUTES.notifications;
}
export function getSessionsPath(_role?: string | null) {
  return ROUTES.sessions;
}
export function getSessionDetailPath(_role: string | null | undefined, sessionId: string) {
  return ROUTES.sessionDetail(sessionId);
}
export function getPatientsPath(_role?: string | null) {
  return ROUTES.patients;
}
export function getPatientDetailPath(_role: string | null | undefined, patientId: string) {
  return ROUTES.patientDetail(patientId);
}
export function getTreatmentsPath(_role?: string | null) {
  return ROUTES.treatments;
}
export function getTreatmentDetailPath(_role: string | null | undefined, treatmentId: string) {
  return ROUTES.treatmentDetail(treatmentId);
}
export function getReportsPath(_role?: string | null) {
  return ROUTES.reports;
}
export function getPaymentsPath(_role?: string | null) {
  return ROUTES.payments;
}
export function getUsersPath(_role?: string | null) {
  return ROUTES.users;
}
export function getBranchesPath(_role?: string | null) {
  return ROUTES.branches;
}
export function getDebtsPath(_role?: string | null) {
  return ROUTES.debts;
}
export function getTreatmentTypesPath(_role?: string | null) {
  return ROUTES.treatmentTypes;
}
export function getSuggestionsPath(_role?: string | null) {
  return ROUTES.suggestions;
}
export function getDefaultRedirect(role?: string | null) {
  return role ? ROUTES.dashboard : ROUTES.login;
}

const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  ADMIN: [
    ROUTES.dashboard, ROUTES.patients, ROUTES.treatments, ROUTES.sessions,
    ROUTES.payments, ROUTES.debts, ROUTES.reports, ROUTES.users,
    ROUTES.branches, ROUTES.treatmentTypes, ROUTES.notifications, ROUTES.suggestions,
  ],
  MANAGER: [
    ROUTES.dashboard, ROUTES.patients, ROUTES.payments, ROUTES.debts, ROUTES.reports,
    ROUTES.treatments, ROUTES.sessions, ROUTES.notifications,
  ],
  PHYSIOTHERAPIST: [
    ROUTES.dashboard, ROUTES.patients, ROUTES.sessions,
    ROUTES.reports, ROUTES.treatments, ROUTES.notifications, ROUTES.suggestions,
  ],
};

export function isRouteAllowed(role: string | null | undefined, pathname: string): boolean {
  if (!role) return false;
  if (pathname === '/') return true;
  return (ROLE_ALLOWED_PREFIXES[role] || []).some((p) => pathname === p || pathname.startsWith(p + '/'));
}
