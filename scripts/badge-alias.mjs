/**
 * Alias hook for the pure-TypeScript tests run with plain Node
 * (node --import ./scripts/badge-alias.mjs scripts/test-badge-progression.ts).
 * Maps "@/lib/x" specifiers to <repo>/src/lib/x.ts so the shared modules can
 * be tested without a bundler. Type-only imports of UI modules are stripped
 * before execution, so nothing from React/Supabase is ever loaded.
 */
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/lib/") || specifier.startsWith("@/data/") || specifier.startsWith("@/i18n/")) {
      const target = join(here, "..", "src", specifier.slice(2)) + ".ts";
      return next(pathToFileURL(target).href, context);
    }
    return next(specifier, context);
  },
});
