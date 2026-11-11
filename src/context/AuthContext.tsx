import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Business } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  business: Business | null;
  currentBusinessId: string;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<User>;
  register: (data: any) => Promise<User>;
  /** Resolves to the signed-in user, or null when Google verified the person but business details are still needed. */
  googleAuth: (params: Parameters<typeof api.googleAuth>[0]) => Promise<User | null>;
  /** A verified Google identity waiting for the business details step of registration. */
  pendingGoogle: PendingGoogle | null;
  clearPendingGoogle: () => void;
  refreshBusiness: () => Promise<void>;
  logout: () => void;
  switchDemoRole: (role: 'OWNER' | 'EMPLOYEE' | 'CUSTOMER' | 'SUPER_ADMIN' | 'BIZ_2') => Promise<User>;
  setCurrentBusinessId: (id: string) => void;
}

export interface PendingGoogle {
  credential: string;
  profile: { name: string; email: string; picture?: string | null };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('shopmate_token'));
  const [currentBusinessId, setCurrentBizId] = useState<string>(
    localStorage.getItem('shopmate_current_biz_id') || ''
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pendingGoogle, setPendingGoogle] = useState<PendingGoogle | null>(null);

  const setCurrentBusinessId = (id: string) => {
    setCurrentBizId(id);
    localStorage.setItem('shopmate_current_biz_id', id);
  };

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await api.getMe();
        setUser(data.user);
        if (data.business) {
          setBusiness(data.business);
          setCurrentBusinessId(data.business.id);
        }
      } catch (err) {
        console.warn('Session expired, clearing token');
        setToken(null);
        localStorage.removeItem('shopmate_token');
      } finally {
        setIsLoading(false);
      }
    }
    loadUser();
  }, [token]);

  const login = async (email: string, pass: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await api.login(email, pass);
      setUser(res.user);
      setToken(res.token);
      localStorage.setItem('shopmate_token', res.token);
      if (res.user.business_id) {
        setCurrentBusinessId(res.user.business_id);
      }
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: any): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await api.register(data);
      setUser(res.user);
      setToken(res.token);
      localStorage.setItem('shopmate_token', res.token);
      if (res.business) setBusiness(res.business);
      if (res.user.business_id) {
        setCurrentBusinessId(res.user.business_id);
      }
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const googleAuth = async (params: Parameters<typeof api.googleAuth>[0]): Promise<User | null> => {
    setIsLoading(true);
    try {
      const res = await api.googleAuth(params);
      if (res.needsProfile) {
        setPendingGoogle({ credential: params.credential, profile: res.profile });
        return null;
      }
      setPendingGoogle(null);
      setUser(res.user);
      setToken(res.token);
      localStorage.setItem('shopmate_token', res.token);
      if (res.business) setBusiness(res.business);
      if (res.user.business_id) {
        setCurrentBusinessId(res.user.business_id);
      }
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  /** Reload the signed-in user's store (e.g. after editing assistant settings). */
  const refreshBusiness = async () => {
    try {
      const fresh = await api.getBusinessMe();
      if (fresh && (fresh as any).id) setBusiness(fresh);
    } catch {
      /* keep the current copy */
    }
  };

  const logout = () => {
    setUser(null);
    setBusiness(null);
    setToken(null);
    localStorage.removeItem('shopmate_token');
  };

  const switchDemoRole = async (role: 'OWNER' | 'EMPLOYEE' | 'CUSTOMER' | 'SUPER_ADMIN' | 'BIZ_2'): Promise<User> => {
    setIsLoading(true);
    try {
      const personaKey = (role === 'BIZ_2' ? 'OWNER' : role) as 'OWNER' | 'EMPLOYEE' | 'CUSTOMER' | 'SUPER_ADMIN';
      const res = await api.loginDemoPersona(personaKey);
      setUser(res.user);
      setToken(res.token);
      localStorage.setItem('shopmate_token', res.token);
      if (res.business) {
        setBusiness(res.business);
        setCurrentBusinessId(res.business.id);
      } else if (res.user.business_id) {
        setCurrentBusinessId(res.user.business_id);
      }
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        business,
        currentBusinessId,
        token,
        isLoading,
        login,
        register,
        googleAuth,
        pendingGoogle,
        clearPendingGoogle: () => setPendingGoogle(null),
        refreshBusiness,
        logout,
        switchDemoRole,
        setCurrentBusinessId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
