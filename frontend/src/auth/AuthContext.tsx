import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { AxiosError } from 'axios';
import {
  api,
  AuthenticatedUser,
  initiateMagicLink,
  logout as apiLogout,
  verifyMagicToken,
  whoami
} from '../services/api';
import { useToast } from '../components/ToastProvider';

type AuthContextValue = {
  user: AuthenticatedUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  initiate: (email: string, classCode: string) => Promise<{ ok: true; token?: string }>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStatus(error: unknown): number | null {
  if (typeof error === 'object' && error && 'response' in error) {
    const maybeAxios = error as AxiosError;
    return maybeAxios.response?.status ?? null;
  }
  return null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const toast = useToast();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const res = await whoami();
      setUser(res.user);
    } catch (error) {
      if (getStatus(error) === 401) {
        setUser(null);
      } else {
        toast.show('Kunde inte hämta användare just nu');
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (getStatus(error) === 401) {
          setUser(null);
          setLoading(false);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, []);

  const handleInitiate = useCallback(async (email: string, classCode: string) => {
    const res = await initiateMagicLink(email, classCode);
    toast.show('Kolla din e-post för magisk länk');
    return res;
  }, [toast]);

  const loginWithToken = useCallback(async (token: string) => {
    try {
      await verifyMagicToken(token.trim());
      await fetchUser();
    } catch (error) {
      if (getStatus(error) === 400) {
        toast.show('Tokenen är ogiltig eller redan använd');
      } else if (getStatus(error) === 401) {
        toast.show('Du måste logga in igen');
      } else {
        toast.show('Kunde inte logga in just nu');
      }
      throw error;
    }
  }, [fetchUser, toast]);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (error) {
      toast.show('Kunde inte logga ut');
      throw error;
    } finally {
      setUser(null);
    }
  }, [toast]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    refresh: fetchUser,
    initiate: handleInitiate,
    loginWithToken,
    logout
  }), [user, loading, fetchUser, handleInitiate, loginWithToken, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
