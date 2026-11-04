"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, CircleUserRound, LogOut, Settings, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { useAdminAccess } from "@/lib/admin-client";
import { getSupabase } from "@/lib/supabase/client";
import { useOutsideClose } from "@/lib/use-outside-close";

/**
 * The signed-in person's menu: photo, links to their profile and the settings,
 * and the real sign-out. Profile details are edited on /profile.
 * Admins also get the workspace switcher entry to the Admin Center — the
 * entry only appears for accounts whose admin role the database confirms.
 */
export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const admin = useAdminAccess();

  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(ref, open, close);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          if (active) {
            setName("");
            setEmail("");
            setAvatarUrl(null);
          }
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name,avatar_url")
          .eq("id", data.user.id)
          .maybeSingle();
        if (active) {
          setName(
            profile?.display_name?.trim() ||
              data.user.user_metadata?.name?.trim() ||
              data.user.email?.split("@")[0] ||
              "Student",
          );
          setEmail(data.user.email ?? "");
          setAvatarUrl((profile?.avatar_url as string | null) ?? null);
        }
      } catch {
        if (active) {
          setName("");
          setEmail("");
          setAvatarUrl(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const itemClass =
    "flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-cova-ink hover:bg-cova-bg";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg p-1.5 pr-2 hover:bg-cova-pale"
      >
        <Avatar name={name || "Student"} src={avatarUrl} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
          {name || "Student"}
        </span>
        <ChevronDown className="h-4 w-4 text-cova-mute" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-cova-line bg-white py-2"
        >
          <div className="border-b border-cova-line px-4 pb-2">
            <p className="truncate text-sm font-semibold">{name || "Student"}</p>
            <p className="truncate text-xs text-cova-mute">{email || t("user.signedIn")}</p>
          </div>

          <Link href="/profile" role="menuitem" onClick={close} className={itemClass}>
            <CircleUserRound className="h-4 w-4" aria-hidden="true" />
            {t("nav.profile")}
          </Link>

          <Link href="/settings" role="menuitem" onClick={close} className={itemClass}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            {t("user.settings")}
          </Link>

          {admin.isAdmin && (
            <Link href="/admin" role="menuitem" onClick={close} className={itemClass}>
              <ShieldCheck className="h-4 w-4 text-cova-muted" aria-hidden="true" />
              {t("admin.switch.toAdmin")}
              {!admin.mfaOk && <span className="ms-auto text-xs text-amber-700">{t("admin.mfa.requiredShort")}</span>}
            </Link>
          )}

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={async () => {
              try {
                const { error } = await getSupabase().auth.signOut();
                if (error) {
                  toast.push(t("user.signOutError"));
                  return;
                }
                close();
                router.push("/login");
                router.refresh();
              } catch {
                toast.push(t("user.signOutError"));
              }
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t("user.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
