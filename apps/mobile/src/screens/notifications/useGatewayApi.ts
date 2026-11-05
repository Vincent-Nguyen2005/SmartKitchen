import { useMemo } from "react";
import { useSession } from "../../services/session";
import { createGatewayClient, type GatewayClient } from "./gatewayApi";

export type GatewaySession = {
  api: GatewayClient;
  userId: string | null;
  role: string | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

/** Identity comes only from useSession(): user.id, user.role and the access token. */
export function useGatewayApi(): GatewaySession {
  const { user, accessToken, signOut } = useSession();
  const api = useMemo(() => createGatewayClient(accessToken), [accessToken]);
  return {
    api,
    userId: user?.id ?? null,
    role: user?.role ?? null,
    isAdmin: user?.role === "ADMIN",
    signOut,
  };
}
