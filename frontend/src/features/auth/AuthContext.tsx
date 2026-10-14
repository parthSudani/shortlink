import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, setUnauthorizedHandler } from '../../lib/api/client';
import type { AuthResponse, User } from '../../types/api';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  authenticate: (path: '/auth/login' | '/auth/register', credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionStorage.getItem('accessToken')));

  const logout = useCallback(() => {
    sessionStorage.removeItem('accessToken');
    setUser(null);
    setLoading(false);
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      sessionStorage.removeItem('accessToken');
      setUser(null);
      setLoading(false);
      navigate('/login', { replace: true });
    });
    const token = sessionStorage.getItem('accessToken');
    if (!token) return;
    const controller = new AbortController();
    apiRequest<User>('/api/v1/auth/me', { signal: controller.signal })
      .then(setUser)
      .catch(() => { if (!controller.signal.aborted) { sessionStorage.removeItem('accessToken'); setUser(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [navigate]);

  const authenticate = useCallback(async (path: '/auth/login' | '/auth/register', credentials: { email: string; password: string }) => {
    const response = await apiRequest<AuthResponse>(`/api/v1${path}`, {
      method: 'POST', body: JSON.stringify(credentials), authenticated: false,
    });
    sessionStorage.setItem('accessToken', response.accessToken);
    try {
      setUser(await apiRequest<User>('/api/v1/auth/me'));
    } catch (error) {
      sessionStorage.removeItem('accessToken');
      setUser(null);
      throw error;
    }
  }, []);

  const value: AuthContextValue = { user, loading, authenticate, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
