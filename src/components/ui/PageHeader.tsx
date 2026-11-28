import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-fib-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {/* Editorial face on the app-wide page title — the recurring "big
            title" of the Academic Editorial direction (text-h2 token). */}
        <h1 className="font-display text-h2 font-semibold tracking-tight text-cova-ink">{title}</h1>
        {description && <p className="mt-fib-2 max-w-2xl text-sm text-cova-mute">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
