const TOKEN_KEY = 'ctpl_admin_token';
const USER_KEY = 'ctpl_admin_user';

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  isSuperAdmin: boolean;
}

export function saveAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function saveAdminUser(user: AdminUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAdminUser(): AdminUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AdminUser; }
  catch { return null; }
}

export function clearAdminUser(): void {
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAdminToken();
}

export function clearAuth(): void {
  clearAdminToken();
  clearAdminUser();
}
