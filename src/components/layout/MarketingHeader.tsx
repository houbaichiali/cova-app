import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { buttonStyles } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

export function MarketingHeader() {
  return (
    <header className="border-b border-cova-line bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <nav
          aria-label="Primary"
          className="hidden items-center gap-6 text-sm font-medium text-cova-mute md:flex"
        >
          <a href="#features" className="hover:text-cova-ink">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-cova-ink">
            How it works
          </a>
          <a href="#roadmap" className="hover:text-cova-ink">
            Roadmap
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <Link href="/login" className={buttonStyles({ variant: "ghost" })}>
            Log in
          </Link>
          <Link href="/register" className={buttonStyles({ variant: "primary" })}>
            Create account
          </Link>
        </div>
      </div>
    </header>
  );
}
