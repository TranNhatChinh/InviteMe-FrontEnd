"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import { authApi } from "../api/auth.api";

export function useLogout() {
  const { api, session, queryClient } = useRuntime();
  const router = useRouter();
  const { t } = useTranslation("ui");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async (options?: { force?: boolean }) => {
    setIsLoggingOut(true);
    setError(null);
    try {
      await authApi.logout(api);
    } catch {
      if (!options?.force) {
        setError(t("logout.serverFailed"));
      }
    } finally {
      // Regardless of remote revocation outcome, clear local state and cache
      session.clear();
      queryClient.clear();
      setIsLoggingOut(false);
      router.push("/login");
    }
  };

  return { logout, isLoggingOut, error };
}
