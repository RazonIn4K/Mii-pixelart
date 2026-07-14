import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { communityApi, jsonBody, messageFromError } from "@/lib/community/api";
import type {
  CommunityCapabilities,
  CommunityUser,
  SessionInfo,
} from "@/lib/community/types";

type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: CommunityUser | null;
  serviceMessage: string | null;
  serviceAvailable: boolean;
  communityMutationsEnabled: boolean;
  isAuthenticated: boolean;
  applyAccountUpdate: (
    update: Pick<CommunityUser, "id"> & Partial<Omit<CommunityUser, "id">>,
  ) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  revokeAll: () => Promise<void>;
  getSessions: () => Promise<SessionInfo[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function sessionUser(
  value:
    | CommunityUser
    | {
        user?: CommunityUser | null;
        session?: { user?: CommunityUser | null } | null;
      }
    | null,
): CommunityUser | null {
  if (!value) return null;
  if ("user" in value) return value.user ?? null;
  if ("session" in value) return value.session?.user ?? null;
  return "id" in value && typeof value.id === "string"
    ? (value as CommunityUser)
    : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<CommunityUser | null>(null);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [communityMutationsEnabled, setCommunityMutationsEnabled] =
    useState(false);

  const applyAccountUpdate = useCallback(
    (
      nextUser: Pick<CommunityUser, "id"> & Partial<Omit<CommunityUser, "id">>,
    ) => {
      setUser((currentUser) =>
        currentUser?.id === nextUser.id
          ? { ...currentUser, ...nextUser }
          : currentUser,
      );
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const result = await communityApi<
        | CommunityUser
        | {
            capabilities?: Partial<CommunityCapabilities>;
            user?: CommunityUser | null;
            session?: { user?: CommunityUser | null } | null;
          }
        | null
      >("/api/auth/session");
      const nextUser = sessionUser(result.data);
      const nextCapabilities =
        result.data && "capabilities" in result.data
          ? result.data.capabilities
          : undefined;
      setUser(nextUser);
      // Missing or malformed capabilities fail closed so a mixed-version
      // response cannot expose write controls against a read-only Worker.
      setCommunityMutationsEnabled(
        nextCapabilities?.communityMutationsEnabled === true,
      );
      setStatus(nextUser ? "authenticated" : "anonymous");
      setServiceMessage(null);
    } catch (error) {
      setUser(null);
      setCommunityMutationsEnabled(false);
      setStatus("anonymous");
      setServiceMessage(messageFromError(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await communityApi<null>("/api/auth/logout", {
      method: "POST",
      body: jsonBody({}),
    });
    setUser(null);
    setCommunityMutationsEnabled(false);
    setStatus("anonymous");
  }, []);

  const revokeAll = useCallback(async () => {
    await communityApi<null>("/api/auth/revoke-all", {
      method: "POST",
      body: jsonBody({}),
    });
    setUser(null);
    setCommunityMutationsEnabled(false);
    setStatus("anonymous");
  }, []);

  const getSessions = useCallback(async () => {
    const result =
      await communityApi<
        (SessionInfo & { uaLabel?: string | null; label?: string | null })[]
      >("/api/me/sessions");
    return result.data.map((session) => ({
      ...session,
      userAgentLabel:
        session.userAgentLabel ?? session.uaLabel ?? session.label ?? null,
    }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      applyAccountUpdate,
      serviceMessage,
      serviceAvailable: status !== "loading" && serviceMessage === null,
      communityMutationsEnabled,
      isAuthenticated: status === "authenticated" && Boolean(user),
      refresh,
      logout,
      revokeAll,
      getSessions,
    }),
    [
      applyAccountUpdate,
      communityMutationsEnabled,
      getSessions,
      logout,
      refresh,
      revokeAll,
      serviceMessage,
      status,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
