import type { Role } from '../types';
import { adaptSources, adaptStudentDashboard, adaptTeacherDashboard } from './adapters';
import { request, setCsrfToken } from './client';
import type { AreaCode, ClassOut, ListOut, SessionOut, SourceOut, StudentDashboardOut, TeacherDashboardOut } from './wire';
export * from './types';
export { ApiError } from './client';
export { SUBJECT_LABELS } from './adapters';
async function saveSession(response: Promise<SessionOut>) { const session = await response; setCsrfToken(session.csrfToken); return session; }
export const api = {
  login: (loginId: string, password: string, role: Role) => saveSession(request<SessionOut>('/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password, role }) })),
  me: () => saveSession(request<SessionOut>('/auth/me')),
  logout: async () => { await request<void>('/auth/logout', { method: 'POST' }); setCsrfToken(null); },
  getClasses: () => request<ListOut<ClassOut>>('/classes'),
  getClassDashboard: async (classId: string) => adaptTeacherDashboard(await request<TeacherDashboardOut>(`/classes/${encodeURIComponent(classId)}/dashboard`)),
  getMaterials: async (classId: string, subject: AreaCode) => adaptSources((await request<ListOut<SourceOut>>(`/classes/${encodeURIComponent(classId)}/sources`)).items, subject),
  getStudentHome: async (classId: string, area: AreaCode = 'daily') => adaptStudentDashboard(await request<StudentDashboardOut>(`/classes/${encodeURIComponent(classId)}/dashboard?area=${area}`)),
};
