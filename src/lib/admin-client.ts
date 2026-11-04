"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Client mirror of the server admin gate (for UI visibility only — hiding a
 * button is NOT a security mechanism; every real check happens server-side
 * through the same security-definer RPC).
 *
 * - isAdmin: the account holds an active admin role.
 * - mfaOk: a verified TOTP factor exists; the Admin Center requires it.
 * - can(permission): permission lookup against the granted list.
 */
interface AdminAccessData {
  loading: boolean;
  isAdmin: boolean;
  role: string | null;
  permissions: string[];
  mfaOk: boolean;
}

export interface AdminAccessState extends AdminAccessData {
  can: (permission: string) => boolean;
}

const EMPTY: AdminAccessData = {
  loading: true,
  isAdmin: false,
  role: null,
  permissions: [],
  mfaOk: false,
};

const DENIED: AdminAccessData = { loading: false, isAdmin: false, role: null, permissions: [], mfaOk: false };

export function useAdminAccess(): AdminAccessState {
  const [state, setState] = useState<AdminAccessData>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await getSupabase().rpc("admin_my_access");
        if (cancelled) return;
        if (error) {
          setState(DENIED);
          return;
        }
        const access = data as {
          is_admin: boolean;
          role: string | null;
          permissions: string[];
          mfa_ok: boolean;
        };
        setState({
          loading: false,
          isAdmin: !!access?.is_admin,
          role: access?.role ?? null,
          permissions: Array.isArray(access?.permissions) ? access.permissions : [],
          mfaOk: !!access?.mfa_ok,
        });
      } catch {
        if (!cancelled) setState(DENIED);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ...state,
    can: (permission: string) => state.permissions.includes(permission),
  };
}
