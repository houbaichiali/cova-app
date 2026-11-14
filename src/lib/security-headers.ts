/**
 * Security response headers for every document and API response.
 *
 * Pure module (no Next imports) so the proxy and the logic tests share the
 * exact same definition of "protected response".
 *
 * CSP note: script-src keeps 'unsafe-inline' on purpose. Next.js hydrates
 * through inline bootstrap scripts and statically prerendered pages cannot
 * carry a per-request nonce; adding a nonce-based CSP here would break every
 * static page. The XSS surface stays closed because React escapes all output
 * and the codebase uses no dangerouslySetInnerHTML / eval / innerHTML at all
 * (verified by scripts/test-security.ts scanning the source).
 */

export function buildSecurityHeaders(isDev: boolean): Record<string, string> {
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: mediastream: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Mic, camera and screen capture stay self-only: the voice rooms need them.
    "Permissions-Policy":
      "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}
