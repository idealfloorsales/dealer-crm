import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { apiFetch, SESSION_TOKEN_KEY, SESSION_USER_KEY } from '@/lib/api';
import type { CRMUser } from '@/types';

type AuthContextValue = {
  user: CRMUser | null;
  token: string | null;
  ready: boolean;
  signingIn: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CRMUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
        if (!storedToken) return;

        const me = await apiFetch<{ user: CRMUser }>('/api/auth/me', {}, storedToken);
        if (!active) return;

        setToken(storedToken);
        setUser(me.user);
        await SecureStore.setItemAsync(SESSION_USER_KEY, JSON.stringify(me.user));
      } catch {
        // Storage cleanup errors must not prevent the login screen from opening.
        await Promise.allSettled([
          SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
          SecureStore.deleteItemAsync(SESSION_USER_KEY),
        ]);
      } finally {
        if (active) setReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const signIn = async (username: string, password: string) => {
    setSigningIn(true);
    try {
      const result = await apiFetch<{ token: string; user: CRMUser }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ username: username.trim(), password }),
        },
        null,
      );

      await SecureStore.setItemAsync(SESSION_TOKEN_KEY, result.token);
      await SecureStore.setItemAsync(SESSION_USER_KEY, JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    await SecureStore.deleteItemAsync(SESSION_USER_KEY);
    setToken(null);
    setUser(null);
    await Haptics.selectionAsync();
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      ready,
      signingIn,
      signIn,
      signOut,
      can: (permission: string) =>
        Boolean(user?.permissions?.is_admin || user?.permissions?.[permission]),
    }),
    [user, token, ready, signingIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
