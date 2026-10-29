import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { ApiFamily, AuthUser, authApi, familyApi } from "./api";

type SessionContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  family: ApiFamily | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  loadFamily: () => Promise<void>;
  createFamily: (name: string) => Promise<void>;
  joinFamily: (code: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  updateMemberRole: (memberId: string, role: "ADMIN" | "MEMBER") => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  regenerateJoinCode: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const ACCESS_KEY = "smartkitchen.access-token";
const REFRESH_KEY = "smartkitchen.refresh-token";

export function SessionProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [family, setFamily] = useState<ApiFamily | null>(null);
  const [ready, setReady] = useState(false);

  const saveTokens = useCallback(async (access: string, refresh: string | undefined, authUser: AuthUser) => {
    setAccessToken(access);
    setUser(authUser);
    await SecureStore.setItemAsync(ACCESS_KEY, access);
    if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    await saveTokens(result.accessToken, result.refreshToken, result.user);
  }, [saveTokens]);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const result = await authApi.register(email, password, fullName);
    await saveTokens(result.accessToken, result.refreshToken, result.user);
  }, [saveTokens]);

  const refreshSession = useCallback(async (refresh: string) => {
    const result = await authApi.refresh(refresh);
    await saveTokens(result.accessToken, result.refreshToken, result.user);
    return result.accessToken;
  }, [saveTokens]);

  const withToken = useCallback(async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
    let token = accessToken ?? await SecureStore.getItemAsync(ACCESS_KEY);
    if (!token) throw new Error("Authentication required");
    try {
      return await operation(token);
    } catch (error) {
      if (!(error instanceof Error) || !("status" in error) || error.status !== 401) throw error;
      const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!refresh) throw error;
      token = await refreshSession(refresh);
      return operation(token);
    }
  }, [accessToken, refreshSession]);

  const loadFamily = useCallback(async () => {
    try {
      const result = await withToken((token) => familyApi.getMine(token));
      setFamily(result.family);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 404) setFamily(null);
      else throw error;
    }
  }, [withToken]);

  const createFamily = useCallback(async (name: string) => {
    const result = await withToken((token) => familyApi.create(token, name));
    setFamily(result.family);
    await loadFamily();
  }, [loadFamily, withToken]);

  const joinFamily = useCallback(async (code: string) => {
    await withToken((token) => familyApi.verifyInvitation(token, code));
    await withToken((token) => familyApi.join(token, code));
    await loadFamily();
  }, [loadFamily, withToken]);

  const leaveFamily = useCallback(async () => {
    await withToken((token) => familyApi.leave(token));
    setFamily(null);
  }, [withToken]);

  const updateMemberRole = useCallback(async (memberId: string, role: "ADMIN" | "MEMBER") => {
    await withToken((token) => familyApi.updateRole(token, memberId, role));
    await loadFamily();
  }, [loadFamily, withToken]);

  const removeMember = useCallback(async (memberId: string) => {
    await withToken((token) => familyApi.removeMember(token, memberId));
    await loadFamily();
  }, [loadFamily, withToken]);

  const regenerateJoinCode = useCallback(async () => {
    const result = await withToken((token) => familyApi.regenerateJoinCode(token));
    setFamily((current) => current ? { ...current, code: result.joinCode.code, codeExpiresAt: result.joinCode.codeExpiresAt } : current);
  }, [withToken]);

  const signOut = useCallback(async () => {
    const access = accessToken ?? await SecureStore.getItemAsync(ACCESS_KEY);
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
    if (access && refresh) await authApi.logout(access, refresh).catch(() => undefined);
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setAccessToken(null);
    setUser(null);
    setFamily(null);
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        let token = await SecureStore.getItemAsync(ACCESS_KEY);
        const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!token && refresh) token = await refreshSession(refresh);
        if (token) {
          const result = await authApi.me(token).catch(async (error: unknown) => {
            if (!(error instanceof Error) || !("status" in error) || error.status !== 401 || !refresh) throw error;
            const renewed = await refreshSession(refresh);
            token = renewed;
            return authApi.me(renewed);
          });
          if (active) {
            setAccessToken(token);
            setUser(result.user);
          }
        }
      } catch {
        await SecureStore.deleteItemAsync(ACCESS_KEY);
        await SecureStore.deleteItemAsync(REFRESH_KEY);
      } finally {
        if (active) setReady(true);
      }
    };
    void restore();
    return () => { active = false; };
  }, [refreshSession]);

  useEffect(() => {
    if (ready && accessToken) void loadFamily().catch(() => undefined);
  }, [accessToken, loadFamily, ready]);

  const value = useMemo(() => ({ user, accessToken, family, ready, signIn, register, signOut, loadFamily, createFamily, joinFamily, leaveFamily, updateMemberRole, removeMember, regenerateJoinCode }), [user, accessToken, family, ready, signIn, register, signOut, loadFamily, createFamily, joinFamily, leaveFamily, updateMemberRole, removeMember, regenerateJoinCode]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within SessionProvider");
  return context;
}
