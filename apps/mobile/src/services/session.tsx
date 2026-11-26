import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { ApiError, ApiFamily, ApiFamilySettings, AuthUser, authApi, authCoordinator, familyApi, type FamilyQr } from "./api";
import { jwtExpiresAt, REFRESH_LEAD_MS, RefreshRejectedError, refreshDelayMs, SESSION_EXPIRED_MESSAGE } from "./authSession";

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
  register: (fullName: string, email: string, password: string) => Promise<{ otpSent: boolean; retryAfterSeconds: number }>;
  verifyOtp: (otpCode: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Set when the session ended by itself (refresh token expired / revoked): shown on the sign-in screen. */
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  /** True right after signIn / verifyOtp (not after restoring a saved session) until completeOnboarding or signOut. */
  freshSignIn: boolean;
  /** Ends the "Thông tin cơ bản" step for this session (saved, skipped with "Để sau", or a profile already exists). */
  completeOnboarding: () => void;
  loadFamily: () => Promise<void>;
  createFamily: (name: string) => Promise<void>;
  joinFamily: (code: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  updateMemberRole: (memberId: string, role: "ADMIN" | "MEMBER") => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  regenerateJoinCode: () => Promise<void>;
  transferOwnership: (memberId: string) => Promise<void>;
  updateFamilySettings: (settings: Partial<Omit<ApiFamilySettings, "id" | "familyId" | "createdAt" | "updatedAt">>) => Promise<void>;
  /** "QR gia đình": owner creates / revokes the one-time join QR; others verify a scanned QR and join with it. */
  createFamilyQr: () => Promise<FamilyQr>;
  revokeFamilyQr: (qrToken?: string) => Promise<void>;
  verifyFamilyQr: (scanned: string) => Promise<{ family: { id: string; name: string }; membership: "none" | "this" | "other" }>;
  joinFamilyByQr: (scanned: string) => Promise<void>;
  /** Hồ sơ: saves the display name and/or avatar URL and updates `user`. */
  updateProfile: (changes: { fullName?: string; avatarUrl?: string | null }) => Promise<void>;
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
  const [freshSignIn, setFreshSignIn] = useState(false);
  const completeOnboarding = useCallback(() => setFreshSignIn(false), []);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);

  const retryRestore = useCallback(() => {
    setReady(false);
    setRestoreError(false);
    setRestoreAttempt((attempt) => attempt + 1);
  }, []);

  const saveTokens = useCallback(async (access: string, refresh: string | undefined, authUser: AuthUser) => {
    if (!refresh) throw new Error("Authentication response did not include a refresh token");
    await tokenStorage.set(REFRESH_KEY, refresh);
    await tokenStorage.set(ACCESS_KEY, access);
    authCoordinator.setToken(access);
    setAccessToken(access);
    setUser(authUser);
    setSessionNotice(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await authApi.login(email, password);
      setFreshSignIn(true);
      await saveTokens(result.accessToken, result.refreshToken, result.user);
    } catch (error) {
      setFreshSignIn(false);
      if (error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED") {
        setPendingVerificationEmail(email.trim().toLowerCase());
      }
      throw error;
    }
  }, [saveTokens]);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const result = await authApi.register(email, password, fullName);
    setPendingVerificationEmail(result.email);
    return {
      otpSent: result.otpSent !== false,
      retryAfterSeconds: Number.isFinite(result.retryAfterSeconds) ? result.retryAfterSeconds : 60,
    };
  }, []);

  const verifyOtp = useCallback(async (otpCode: string) => {
    if (!pendingVerificationEmail) throw new Error("No account is waiting for verification");
    const result = await authApi.verifyOtp(pendingVerificationEmail, otpCode);
    setFreshSignIn(true);
    await saveTokens(result.accessToken, result.refreshToken, result.user);
    setPendingVerificationEmail(null);
  }, [pendingVerificationEmail, saveTokens]);

  const resendOtp = useCallback(async () => {
    if (!pendingVerificationEmail) throw new Error("No account is waiting for verification");
    await authApi.resendOtp(pendingVerificationEmail);
  }, [pendingVerificationEmail]);

  /** The session ended by itself: forget the tokens (local only) and tell the user on the sign-in screen. */
  const expireSession = useCallback(() => {
    authCoordinator.setToken(null);
    void Promise.allSettled([tokenStorage.remove(ACCESS_KEY), tokenStorage.remove(REFRESH_KEY)]);
    setAccessToken(null);
    setUser(null);
    setFamily(null);
    setFamilySettings(null);
    setFreshSignIn(false);
    setSessionNotice(SESSION_EXPIRED_MESSAGE);
  }, []);

  // Every API call refreshes through this (services/api.ts authCoordinator): one refresh at a time, rotated tokens
  // saved. A rejected refresh token ends the session; if another tab (web) rotated it meanwhile, its tokens are used.
  useEffect(() => {
    authCoordinator.configure({
      refresh: async () => {
        const refresh = await tokenStorage.get(REFRESH_KEY);
        if (!refresh) throw new RefreshRejectedError();
        try {
          const result = await authApi.refresh(refresh);
          await saveTokens(result.accessToken, result.refreshToken, result.user);
          return result.accessToken;
        } catch (error) {
          if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) throw error;
          const stored = await tokenStorage.get(REFRESH_KEY);
          const storedAccess = await tokenStorage.get(ACCESS_KEY);
          if (stored && stored !== refresh && storedAccess) {
            authCoordinator.setToken(storedAccess);
            setAccessToken(storedAccess);
            return storedAccess;
          }
          throw new RefreshRejectedError();
        }
      },
      onExpired: expireSession,
    });
    return () => authCoordinator.configure(null);
  }, [expireSession, saveTokens]);

  const refreshSession = useCallback((): Promise<string> => authCoordinator.refresh(), []);

  const withToken = useCallback(async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
    const token = authCoordinator.current() ?? accessToken ?? await tokenStorage.get(ACCESS_KEY);
    if (!token) throw new Error("Authentication required");
    try {
      return await operation(token);
    } catch (error) {
      if (!(error instanceof Error) || !("status" in error) || error.status !== 401) throw error;
      let fresh: string;
      try {
        fresh = await authCoordinator.refresh(token);
      } catch (refreshError) {
        if (refreshError instanceof RefreshRejectedError) throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, undefined, "SESSION_EXPIRED");
        throw refreshError;
      }
      return operation(fresh);
    }
  }, [accessToken]);

  // Proactive refresh shortly before the access token expires, and when the app comes back to the foreground with
  // a token that is expired or about to expire (timers do not run in the background).
  useEffect(() => {
    if (!accessToken) return;
    const refreshSoon = () => { authCoordinator.refresh(accessToken).catch(() => undefined); };
    const delay = refreshDelayMs(accessToken, Date.now());
    const timer = delay === null ? null : setTimeout(refreshSoon, delay);
    let appState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      const resumed = appState !== "active" && next === "active";
      appState = next;
      if (!resumed) return;
      const expiresAt = jwtExpiresAt(accessToken);
      if (expiresAt !== null && expiresAt - Date.now() < 2 * REFRESH_LEAD_MS) refreshSoon();
    });
    return () => { if (timer) clearTimeout(timer); subscription.remove(); };
  }, [accessToken]);

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

  const createFamilyQr = useCallback(() => withToken((token) => familyApi.createQr(token)), [withToken]);
  const revokeFamilyQr = useCallback(async (qrToken?: string) => { await withToken((token) => familyApi.revokeQr(token, qrToken)); }, [withToken]);
  const verifyFamilyQr = useCallback((scanned: string) => withToken((token) => familyApi.verifyQr(token, scanned)), [withToken]);
  /** Joins, then reloads the family like a normal join (Kho, menus and Gia đình follow the new family). */
  const joinFamilyByQr = useCallback(async (scanned: string) => {
    await withToken((token) => familyApi.joinQr(token, scanned));
    await loadFamily();
  }, [loadFamily, withToken]);

  const updateProfile = useCallback(async (changes: { fullName?: string; avatarUrl?: string | null }) => {
    const result = await withToken((token) => authApi.updateMe(token, changes));
    setUser(result.user);
  }, [withToken]);

  const signOut = useCallback(async () => {
    const access = accessToken ?? await tokenStorage.get(ACCESS_KEY);
    const refresh = await tokenStorage.get(REFRESH_KEY);
    if (access && refresh) await authApi.logout(access, refresh).catch(() => undefined);
    await tokenStorage.remove(ACCESS_KEY);
    await tokenStorage.remove(REFRESH_KEY);
    authCoordinator.setToken(null);
    setAccessToken(null);
    setUser(null);
    setFamily(null);
    setFamilySettings(null);
    setRestoreError(false);
    setFreshSignIn(false);
    setSessionNotice(null);
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const token = await tokenStorage.get(ACCESS_KEY);
        const refresh = await tokenStorage.get(REFRESH_KEY);
        if (!token && refresh) {
          await refreshSession();
          return;
        }
        if (token) {
          authCoordinator.setToken(token);
          const result = await authApi.me(token).catch(async (error: unknown) => {
            if (!(error instanceof Error) || !("status" in error) || error.status !== 401 || !refresh) throw error;
            await refreshSession();
            return null;
          });
          if (active && result) {
            setAccessToken(token);
            setUser(result.user);
          }
        }
      } catch (error) {
        // A rejected refresh token already ended the session (expireSession shows the notice).
        if (error instanceof RefreshRejectedError) return;
        // A network/server error must not turn a temporary outage into a permanent logout.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          authCoordinator.setToken(null);
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
    user, accessToken, family, familySettings, pendingVerificationEmail, ready, restoreError, retryRestore, signIn, register, verifyOtp, resendOtp, signOut, sessionNotice, clearSessionNotice, loadFamily, freshSignIn, completeOnboarding,
    createFamily, joinFamily, leaveFamily, updateMemberRole, removeMember, regenerateJoinCode,
    transferOwnership, updateFamilySettings, createFamilyQr, revokeFamilyQr, verifyFamilyQr, joinFamilyByQr, updateProfile,
  }), [
    user, accessToken, family, familySettings, pendingVerificationEmail, ready, restoreError, retryRestore, signIn, register, verifyOtp, resendOtp, signOut, sessionNotice, clearSessionNotice, loadFamily, freshSignIn, completeOnboarding,
    createFamily, joinFamily, leaveFamily, updateMemberRole, removeMember, regenerateJoinCode,
    transferOwnership, updateFamilySettings, createFamilyQr, revokeFamilyQr, verifyFamilyQr, joinFamilyByQr, updateProfile,
  ]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within SessionProvider");
  return context;
}
