import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ApiError, ApiFamily, ApiFamilySettings, AuthUser, authApi, familyApi } from "./api";

type SessionContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  family: ApiFamily | null;
  familySettings: ApiFamilySettings | null;
  pendingVerificationEmail: string | null;
  ready: boolean;
  restoreError: boolean;
  retryRestore: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  verifyOtp: (otpCode: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  signOut: () => Promise<void>;
  loadFamily: () => Promise<void>;
  createFamily: (name: string) => Promise<void>;
  joinFamily: (code: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  updateMemberRole: (memberId: string, role: "ADMIN" | "MEMBER") => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  regenerateJoinCode: () => Promise<void>;
  transferOwnership: (memberId: string) => Promise<void>;
  updateFamilySettings: (settings: Partial<Omit<ApiFamilySettings, "id" | "familyId" | "createdAt" | "updatedAt">>) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const ACCESS_KEY = "smartkitchen.access-token";
const REFRESH_KEY = "smartkitchen.refresh-token";

const tokenStorage = {
  get: async (key: string): Promise<string | null> =>
    Platform.OS === "web" ? globalThis.localStorage?.getItem(key) ?? null : SecureStore.getItemAsync(key),
  set: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  remove: async (key: string): Promise<void> => {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};

export function SessionProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [family, setFamily] = useState<ApiFamily | null>(null);
  const [familySettings, setFamilySettings] = useState<ApiFamilySettings | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const refreshInFlight = useRef<Promise<string> | null>(null);

  const retryRestore = useCallback(() => {
    setReady(false);
    setRestoreError(false);
    setRestoreAttempt((attempt) => attempt + 1);
  }, []);

  const saveTokens = useCallback(async (access: string, refresh: string | undefined, authUser: AuthUser) => {
    if (!refresh) throw new Error("Authentication response did not include a refresh token");
    await tokenStorage.set(REFRESH_KEY, refresh);
    await tokenStorage.set(ACCESS_KEY, access);
    setAccessToken(access);
    setUser(authUser);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    await saveTokens(result.accessToken, result.refreshToken, result.user);
  }, [saveTokens]);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const result = await authApi.register(email, password, fullName);
    setPendingVerificationEmail(result.email);
  }, []);

  const verifyOtp = useCallback(async (otpCode: string) => {
    if (!pendingVerificationEmail) throw new Error("No account is waiting for verification");
    const result = await authApi.verifyOtp(pendingVerificationEmail, otpCode);
    await saveTokens(result.accessToken, result.refreshToken, result.user);
    setPendingVerificationEmail(null);
  }, [pendingVerificationEmail, saveTokens]);

  const resendOtp = useCallback(async () => {
    if (!pendingVerificationEmail) throw new Error("No account is waiting for verification");
    await authApi.resendOtp(pendingVerificationEmail);
  }, [pendingVerificationEmail]);

  const refreshSession = useCallback((refresh: string): Promise<string> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const pending = (async () => {
      try {
        const result = await authApi.refresh(refresh);
        await saveTokens(result.accessToken, result.refreshToken, result.user);
        return result.accessToken;
      } finally {
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = pending;
    return pending;
  }, [saveTokens]);

  const withToken = useCallback(async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
    let token = accessToken ?? await tokenStorage.get(ACCESS_KEY);
    if (!token) throw new Error("Authentication required");
    try {
      return await operation(token);
    } catch (error) {
      if (!(error instanceof Error) || !("status" in error) || error.status !== 401) throw error;
      const refresh = await tokenStorage.get(REFRESH_KEY);
      if (!refresh) throw error;
      token = await refreshSession(refresh);
      return operation(token);
    }
  }, [accessToken, refreshSession]);

  const loadFamily = useCallback(async () => {
    try {
      const results = await withToken(async (token) => Promise.all([
        familyApi.getMine(token),
        familyApi.getSettings(token),
      ]));
      setFamily(results[0].family);
      setFamilySettings(results[1].settings);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 404) {
        setFamily(null);
        setFamilySettings(null);
      }
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
    setFamilySettings(null);
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

  const transferOwnership = useCallback(async (memberId: string) => {
    await withToken((token) => familyApi.transferOwnership(token, memberId));
    await loadFamily();
  }, [loadFamily, withToken]);

  const updateFamilySettings = useCallback(async (settings: Partial<Omit<ApiFamilySettings, "id" | "familyId" | "createdAt" | "updatedAt">>) => {
    const result = await withToken((token) => familyApi.updateSettings(token, settings));
    setFamilySettings(result.settings);
  }, [withToken]);

  const signOut = useCallback(async () => {
    const access = accessToken ?? await tokenStorage.get(ACCESS_KEY);
    const refresh = await tokenStorage.get(REFRESH_KEY);
    if (access && refresh) await authApi.logout(access, refresh).catch(() => undefined);
    await tokenStorage.remove(ACCESS_KEY);
    await tokenStorage.remove(REFRESH_KEY);
    setAccessToken(null);
    setUser(null);
    setFamily(null);
    setFamilySettings(null);
    setRestoreError(false);
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const token = await tokenStorage.get(ACCESS_KEY);
        const refresh = await tokenStorage.get(REFRESH_KEY);
        if (!token && refresh) {
          await refreshSession((await tokenStorage.get(REFRESH_KEY)) ?? refresh);
          return;
        }
        if (token) {
          const result = await authApi.me(token).catch(async (error: unknown) => {
            if (!(error instanceof Error) || !("status" in error) || error.status !== 401 || !refresh) throw error;
            await refreshSession((await tokenStorage.get(REFRESH_KEY)) ?? refresh);
            return null;
          });
          if (active && result) {
            setAccessToken(token);
            setUser(result.user);
          }
        }
      } catch (error) {
        // A network/server error must not turn a temporary outage into a permanent logout.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await Promise.allSettled([
            tokenStorage.remove(ACCESS_KEY),
            tokenStorage.remove(REFRESH_KEY),
          ]);
        } else if (active) {
          setRestoreError(true);
        }
      } finally {
        if (active) setReady(true);
      }
    };
    void restore();
    return () => { active = false; };
  }, [refreshSession, restoreAttempt]);

  useEffect(() => {
    if (ready && accessToken) void loadFamily().catch(() => undefined);
  }, [accessToken, loadFamily, ready]);

  const value = useMemo(() => ({
    user, accessToken, family, familySettings, pendingVerificationEmail, ready, restoreError, retryRestore, signIn, register, verifyOtp, resendOtp, signOut, loadFamily,
    createFamily, joinFamily, leaveFamily, updateMemberRole, removeMember, regenerateJoinCode,
    transferOwnership, updateFamilySettings,
  }), [
    user, accessToken, family, familySettings, pendingVerificationEmail, ready, restoreError, retryRestore, signIn, register, verifyOtp, resendOtp, signOut, loadFamily,
    createFamily, joinFamily, leaveFamily, updateMemberRole, removeMember, regenerateJoinCode,
    transferOwnership, updateFamilySettings,
  ]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within SessionProvider");
  return context;
}
