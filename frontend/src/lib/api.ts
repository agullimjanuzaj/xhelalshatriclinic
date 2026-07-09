import axios, { AxiosError } from 'axios';
import { getSession, signOut } from 'next-auth/react';
import { ROUTES } from './routes';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Request interceptor — attach JWT
api.interceptors.request.use(async (config) => {
  const session = await getSession();
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError<any>) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;

    if (error.response?.status === 401 && original && !original._retried) {
      // The access token can expire in the few seconds between being
      // attached and the backend checking it — getSession() re-runs the
      // jwt() callback's silent-refresh logic, so retry once with whatever
      // token comes back before treating this as a real auth failure.
      // Only an actually-expired refresh token (token.error set) or a
      // second 401 after a fresh token means the session is genuinely gone.
      original._retried = true;
      const session = await getSession();
      if (session?.accessToken && !session.error) {
        original.headers.Authorization = `Bearer ${session.accessToken}`;
        try {
          return await api.request(original);
        } catch {
          // fall through to sign-out below
        }
      }
      await signOut({ callbackUrl: ROUTES.login });
    }
    // 403 (forbidden) is a permissions outcome, not an auth failure — never
    // sign the user out for it, just surface the message below.
    const data = error.response?.data;
    // Show detailed validation errors when backend returns errors array
    const detailedErrors: string[] | null =
      Array.isArray(data?.errors) && data.errors.length ? data.errors : null;
    const rawMessage = data?.message || 'Ndodhi një gabim';
    const message = detailedErrors
      ? detailedErrors.join(', ')
      : Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : rawMessage;
    return Promise.reject(Object.assign(new Error(message), { status: error.response?.status }));
  },
);

export default api;

// Typed API calls
export const authApi = {
  login: (data: { username: string; password: string }) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/profile'),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', data),
};

export const dashboardApi = {
  getAdminStats: (branchId?: string) => api.get('/dashboard/admin', { params: { branchId } }),
  getManagerStats: (branchId?: string) => api.get('/dashboard/manager', { params: { branchId } }),
  getPhysiotherapistStats: () => api.get('/dashboard/physiotherapist'),
  getRevenueChart: (params?: { branchId?: string; year?: number }) =>
    api.get('/dashboard/revenue-chart', { params }),
};

export const branchesApi = {
  getAll: () => api.get('/branches'),
  getOne: (id: string) => api.get(`/branches/${id}`),
  getStats: (id: string) => api.get(`/branches/${id}/stats`),
  create: (data: any) => api.post('/branches', data),
  update: (id: string, data: any) => api.put(`/branches/${id}`, data),
  delete: (id: string) => api.delete(`/branches/${id}`),
};

export const usersApi = {
  getAll: (params?: any) => api.get('/users', { params }),
  getOne: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  toggleActive: (id: string) => api.patch(`/users/${id}/toggle-active`),
};

export const patientsApi = {
  getAll: (params?: any) => api.get('/patients', { params }),
  getOne: (id: string) => api.get(`/patients/${id}`),
  create: (data: any) => api.post('/patients', data),
  update: (id: string, data: any) => api.put(`/patients/${id}`, data),
  delete: (id: string) => api.delete(`/patients/${id}`),
  setActiveInClinic: (id: string, activeInClinic: boolean) =>
    api.patch(`/patients/${id}/active-in-clinic`, { activeInClinic }),
};

export const clinicSettingsApi = {
  get: () => api.get('/clinic-settings'),
  update: (activeInClinicAutoExpireHours: number) =>
    api.patch('/clinic-settings', { activeInClinicAutoExpireHours }),
  updateBonus: (bonusPerCompletedSession: number) =>
    api.patch('/clinic-settings', { bonusPerCompletedSession }),
};

export const treatmentTypesApi = {
  getAll: (params?: { activeOnly?: boolean }) => api.get('/treatment-types', { params }),
  create: (data: { name: string; description?: string }) => api.post('/treatment-types', data),
  update: (id: string, data: { name?: string; description?: string; isActive?: boolean }) =>
    api.patch(`/treatment-types/${id}`, data),
  delete: (id: string) => api.delete(`/treatment-types/${id}`),
};

export const treatmentPlansApi = {
  getAll: (params?: any) => api.get('/treatment-plans', { params }),
  getOne: (id: string) => api.get(`/treatment-plans/${id}`),
  getSummary: (id: string) => api.get(`/treatment-plans/${id}/summary`),
  create: (data: any) => api.post('/treatment-plans', data),
  update: (id: string, data: any) => api.put(`/treatment-plans/${id}`, data),
  delete: (id: string) => api.delete(`/treatment-plans/${id}`),
  checkActivePlan: (patientId: string) => api.get(`/treatment-plans/patient/${patientId}/active`),
  generateNotes: (data: { diagnosis?: string; treatmentTypes?: string[]; totalSessions?: number; existingNotes?: string; complaints?: string[]; selectedDiagnoses?: string[] }) =>
    api.post('/treatment-plans/generate-notes', data),
  generateComplaintDescription: (complaints: string[], category?: string) =>
    api.post('/treatment-plans/generate-complaint-description', { complaints, category }),
};

export const sessionsApi = {
  getAll: (params?: any) => api.get('/sessions', { params }),
  getOne: (id: string) => api.get(`/sessions/${id}`),
  create: (data: any) => api.post('/sessions', data),
  complete: (id: string, data: any) => api.patch(`/sessions/${id}/complete`, data),
  update: (id: string, data: any) => api.put(`/sessions/${id}`, data),
  updatePrice: (id: string, data: { amount: number; reason?: string }) => api.patch(`/sessions/${id}/price`, data),
  delete: (id: string) => api.delete(`/sessions/${id}`),
  generateRecommendation: (data: { notes?: string; treatmentTypes?: string[] }) =>
    api.post('/sessions/generate-recommendation', data),
  generateNote: (data: { treatmentTypes: string[]; complaints?: string[]; complaintDescription?: string; diagnosis?: string; selectedDiagnoses?: string[]; planNotes?: string; sessionNumber?: number; totalSessions?: number }) =>
    api.post('/sessions/generate-note', data),
};

export const treatmentsApi = {
  getAll: (params?: any) => api.get('/treatments', { params }),
  getOne: (id: string) => api.get(`/treatments/${id}`),
  getSuggestions: (symptoms: string[]) =>
    api.get('/treatments/suggestions', { params: { symptoms: symptoms.join(',') } }),
  create: (data: any) => api.post('/treatments', data),
  update: (id: string, data: any) => api.put(`/treatments/${id}`, data),
  delete: (id: string) => api.delete(`/treatments/${id}`),
};

export const paymentsApi = {
  getAll: (params?: any) => api.get('/payments', { params }),
  getOne: (id: string) => api.get(`/payments/${id}`),
  getStats: (branchId?: string) => api.get('/payments/stats', { params: { branchId } }),
  getDebts: (branchId?: string, page?: number, limit?: number) =>
    api.get('/payments/debts', { params: { branchId, page, limit } }),
  getPlanFinancials: (planId: string) => api.get(`/payments/treatment-plan/${planId}/financials`),
  create: (data: any) => api.post('/payments', data),
  update: (id: string, data: any) => api.put(`/payments/${id}`, data),
  delete: (id: string) => api.delete(`/payments/${id}`),
};

export const notificationsApi = {
  getAll: (params?: any) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
};

export const reportsApi = {
  getOverview: (params?: any) => api.get('/reports/overview', { params }),
  getSessions: (params?: any) => api.get('/reports/sessions', { params }),
  getRevenue: (params?: any) => api.get('/reports/revenue', { params }),
  getOutstandingBalances: (params?: any) =>
    api.get('/reports/outstanding-balances', { params: typeof params === 'string' ? { branchId: params } : params }),
  getPatientActivity: (branchId?: string) =>
    api.get('/reports/patient-activity', { params: { branchId } }),
  getBonuses: (params?: { month?: string; dateFrom?: string; dateTo?: string; userId?: string; branchId?: string }) =>
    api.get('/reports/bonuses', { params }),
  getPatientVisits: (params?: { dateFrom?: string; dateTo?: string; branchId?: string; page?: number; limit?: number }) =>
    api.get('/reports/patient-visits', { params }),
  exportPatientVisits: async (params?: { dateFrom?: string; dateTo?: string; branchId?: string }) => {
    const response = await api.get('/reports/patient-visits/export', {
      params,
      responseType: 'blob',
    }) as unknown as Blob;
    return response;
  },
};

export const complaintsApi = {
  getAll: (params?: { activeOnly?: boolean }) => api.get('/complaints', { params }),
  create: (data: { name: string; description?: string; category?: string; suggestedConditionIds?: string[] }) =>
    api.post('/complaints', data),
  update: (id: string, data: { name?: string; description?: string; category?: string; suggestedConditionIds?: string[]; isActive?: boolean }) =>
    api.patch(`/complaints/${id}`, data),
  setSuggestedConditions: (id: string, suggestedConditionIds: string[]) =>
    api.patch(`/complaints/${id}/suggested-conditions`, { suggestedConditionIds }),
  delete: (id: string) => api.delete(`/complaints/${id}`),
};

export const suggestedConditionsApi = {
  getAll: (params?: { activeOnly?: boolean }) => api.get('/suggested-conditions', { params }),
  create: (data: { name: string; description?: string }) => api.post('/suggested-conditions', data),
  update: (id: string, data: { name?: string; description?: string; isActive?: boolean }) =>
    api.patch(`/suggested-conditions/${id}`, data),
  delete: (id: string) => api.delete(`/suggested-conditions/${id}`),
};

export const suggestionsApi = {
  fromComplaints: (complaintIds: string[]) => api.post('/suggestions/from-complaints', { complaintIds }),
};

export const pdfApi = {
  // Invoice/session PDFs are protected endpoints — they must go through the
  // authenticated `api` client (which attaches the Bearer token), never as
  // a bare href/window.open, or the backend correctly rejects with 401.
  downloadInvoicePdf: (paymentId: string) =>
    api.get(`/pdf/invoice/${paymentId}`, { responseType: 'blob' }),
  getInvoiceHtml: (paymentId: string) =>
    api.get(`/pdf/invoice/${paymentId}/html`, { responseType: 'text', transformResponse: (d) => d }),
  downloadSessionReportPdf: (sessionId: string) =>
    api.get(`/pdf/session/${sessionId}`, { responseType: 'blob' }),
  getSessionReportHtml: (sessionId: string) =>
    api.get(`/pdf/session/${sessionId}/html`, { responseType: 'text', transformResponse: (d) => d }),
  getTreatmentPlanHtml: (planId: string) =>
    api.get(`/pdf/treatment-plan/${planId}/html`, { responseType: 'text', transformResponse: (d) => d }),
};

export const pushApi = {
  getVapidPublicKey: () => api.get('/push/vapid-public-key'),
  subscribe: (data: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) =>
    api.post('/push/subscribe', data),
  unsubscribe: (endpoint?: string) => api.post('/push/unsubscribe', { endpoint }),
  getStatus: () => api.get('/push/status'),
  sendTest: () => api.post('/push/test'),
};
