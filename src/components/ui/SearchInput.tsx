import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Visually-hidden accessible name; a placeholder alone is not enough. */
  label?: string;
  className?: string;
  /** Hard input cap (spec: search fields cap at 100 characters). */
  maxLength?: number;
}

export function SearchInput({ value, onChange, placeholder, label, className, maxLength }: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cova-mute"
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="h-10 w-full rounded-lg border border-cova-line bg-white pl-9 pr-3 text-sm text-cova-ink placeholder:text-cova-mute"
      />
    </div>
  );
}
