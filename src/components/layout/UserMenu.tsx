"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, RotateCcw, Settings, User } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { getSupabase } from "@/lib/supabase/client";
import { useOutsideClose } from "@/lib/use-outside-close";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Student");
  const [email, setEmail] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();

  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(ref, open, close);

  const { settings } = useDemoState();

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
          if (active) {
            setName(settings.displayName || "Student");
            setEmail(settings.email || "");
          }
          return;
        }

        const user = data.user;
        const metadataName =
          typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name
            : "";

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();

        if (active) {
          setName(
            profile?.display_name?.trim() ||
              metadataName.trim() ||
              user.email?.split("@")[0] ||
              "Student",
          );
          setEmail(user.email || "");
        }
      } catch {
        if (active) {
          setName(settings.displayName || "Student");
          setEmail(settings.email || "");
        }
      }
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, [settings.displayName, settings.email]);

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
        <Avatar name={name} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
          {name}
        </span>
        <ChevronDown
          className="h-4 w-4 text-cova-mute"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-cova-line bg-white py-2"
        >
          <div className="border-b border-cova-line px-4 pb-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-cova-mute">
              {email || "Signed-in account"}
            </p>
          </div>

          <Link
            href="/settings"
            role="menuitem"
            onClick={close}
            className={itemClass}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
          </Link>

          <Link
            href="/community/amara-okafor"
            role="menuitem"
            onClick={close}
            className={itemClass}
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Example profile
          </Link>

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              demoActions.reset();
              close();
              toast.push("Demo data reset");
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset demo data
          </button>

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={async () => {
              try {
                const { error } = await getSupabase().auth.signOut();

                if (error) {
                  toast.push("Could not sign out. Please try again.");
                  return;
                }

                close();
                router.push("/login");
                router.refresh();
              } catch {
                toast.push("Could not sign out. Please try again.");
              }
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}