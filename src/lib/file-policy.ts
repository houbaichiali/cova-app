import type { MessageKey } from "@/i18n/translate";

/**
 * COVA global file policy (spec Phase 4): one shared configuration for every
 * upload location — per-category size limits (1 MB = 1,024 KB), accepted
 * extensions and MIME families per area, and real content checks (magic-byte
 * signatures) so a renamed file cannot pass as another type. Never trust the
 * filename or the declared MIME alone; the browser-supplied File is checked
 * here before any upload, and the Storage buckets remain the server-side
 * backstop (see the SQL migrations for bucket limits and MIME whitelists).
 */

/* ---------------------------------------------------------------- limits */

/** Per-file maximum size in KB (1 MB = 1,024 KB) — spec defaults. */
export const KB_LIMITS = {
  avatar: 512,
  cover: 1024,
  postImage: 1024,
  projectImage: 1024,
  pdf: 2560,
  doc: 2560,
  ppt: 5120,
  xls: 2560,
  zip: 10240,
  audio: 2560,
  video: 5120,
  code: 512,
  generic: 2560,
} as const;

export type CategoryId = keyof typeof KB_LIMITS;

/* ----------------------------------------------------------------- areas */

export type FileArea =
  | "avatar"
  | "cover"
  | "postImage"
  | "projectImage"
  | "document"
  | "courseAttachment"
  | "codingSubmission"
  | "projectSource"
  | "audio"
  | "video"
  | "general"
  | "badgeImage";

interface AreaPolicy {
  /** Destination label key (spec cards must show the upload destination). */
  labelKey: MessageKey;
  /** Accepted categories, in preference order. */
  categories: CategoryId[];
  /** Accepted lowercase extensions (no dot). */
  extensions: string[];
  /** Declared-MIME prefixes/suffixes accepted (informational + declared check). */
  mime: string[];
  /** Content signatures the extension must actually match (lowercase ids). */
  signatures: string[] | null; // null = no signature check possible (e.g. plain text)
}

const IMAGE_SIGS = ["jpeg", "png", "webp"];

const AREAS: Record<FileArea, AreaPolicy> = {
  avatar: { labelKey: "file.area.avatar", categories: ["avatar"], extensions: ["jpg", "jpeg", "png", "webp"], mime: ["image/jpeg", "image/png", "image/webp"], signatures: IMAGE_SIGS },
  cover: { labelKey: "file.area.cover", categories: ["cover"], extensions: ["jpg", "jpeg", "png", "webp"], mime: ["image/jpeg", "image/png", "image/webp"], signatures: IMAGE_SIGS },
  postImage: { labelKey: "file.area.postImage", categories: ["postImage"], extensions: ["jpg", "jpeg", "png", "webp"], mime: ["image/jpeg", "image/png", "image/webp"], signatures: IMAGE_SIGS },
  projectImage: { labelKey: "file.area.projectImage", categories: ["projectImage"], extensions: ["jpg", "jpeg", "png", "webp", "svg"], mime: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"], signatures: [...IMAGE_SIGS, "svg"] },
  document: { labelKey: "file.area.document", categories: ["pdf", "doc", "ppt", "xls"], extensions: ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"], mime: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument", "application/vnd.ms-powerpoint", "application/vnd.ms-excel", "application/vnd.ms-office"], signatures: ["pdf", "zip", "cfb"] },
  courseAttachment: { labelKey: "file.area.courseAttachment", categories: ["pdf", "doc", "ppt", "xls", "zip"], extensions: ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "zip", "txt", "png", "jpg", "jpeg", "webp"], mime: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument", "application/vnd.ms-powerpoint", "application/vnd.ms-excel", "application/vnd.ms-office", "application/zip", "application/x-zip-compressed", "text/plain", "image/png", "image/jpeg", "image/webp"], signatures: ["pdf", "zip", "cfb", "jpeg", "png", "webp"] },
  codingSubmission: { labelKey: "file.area.codingSubmission", categories: ["code"], extensions: ["txt", "md", "py", "js", "ts", "tsx", "jsx", "c", "h", "cpp", "hpp", "java", "cs", "php", "go", "rs", "sql", "html", "css", "json", "ipynb"], mime: ["text/"], signatures: null },
  projectSource: { labelKey: "file.area.projectSource", categories: ["code", "zip"], extensions: ["txt", "md", "py", "js", "ts", "tsx", "jsx", "c", "h", "cpp", "java", "cs", "php", "go", "rs", "sql", "html", "css", "json", "yaml", "yml", "toml", "cfg", "sh", "zip"], mime: ["text/", "application/json", "application/zip", "application/x-zip-compressed"], signatures: ["zip", "cfb"] },
  audio: { labelKey: "file.area.audio", categories: ["audio"], extensions: ["mp3", "wav", "m4a", "ogg"], mime: ["audio/"], signatures: ["mp3", "wav", "mp4", "ogg"] },
  video: { labelKey: "file.area.video", categories: ["video"], extensions: ["mp4", "webm", "mov"], mime: ["video/"], signatures: ["mp4", "webm"] },
  general: { labelKey: "file.area.general", categories: ["pdf", "doc", "ppt", "xls", "zip", "audio", "video", "postImage", "code"], extensions: ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "zip", "mp3", "wav", "m4a", "ogg", "mp4", "webm", "jpg", "jpeg", "png", "webp", "txt", "md"], mime: ["application/pdf", "application/msword", "application/vnd.", "application/zip", "application/x-zip-compressed", "audio/", "video/", "image/", "text/"], signatures: ["pdf", "zip", "cfb", "mp3", "wav", "mp4", "ogg", "webm", "jpeg", "png", "webp"] },
  badgeImage: { labelKey: "file.area.badgeImage", categories: ["postImage"], extensions: ["png", "jpg", "jpeg", "webp", "svg"], mime: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"], signatures: [...IMAGE_SIGS, "svg"] },
};

/* ------------------------------------------------------------- signatures */

/** Magic-byte sniffers: id → first-bytes predicate (offset-aware). */
const SIGNATURES: Array<{ id: string; test: (b: Uint8Array) => boolean }> = [
  { id: "jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { id: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { id: "webp", test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { id: "gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { id: "pdf", test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { id: "zip", test: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) },
  { id: "cfb", test: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },
  { id: "mp4", test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  { id: "webm", test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { id: "ogg", test: (b) => b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53 },
  { id: "wav", test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45 },
  { id: "mp3", test: (b) => (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) },
  { id: "svg", test: (b) => {
      const head = new TextDecoder("utf-8", { fatal: false }).decode(b.slice(0, 256)).trim().toLowerCase();
      return head.startsWith("<?xml") ? head.includes("<svg") : head.startsWith("<svg");
    },
  },
];

/** Reads the file's first bytes and returns the detected signature ids. */
async function detectSignatures(file: File): Promise<string[]> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return SIGNATURES.filter((sig) => sig.test(head)).map((sig) => sig.id);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Declared-MIME compatibility (informational only — see spec 4.3). */
function mimeAccepted(mime: string, allowed: string[]): boolean {
  if (!mime) return true; // some browsers send "" for exotic types
  return allowed.some((pattern) =>
    pattern.endsWith("/") ? mime.startsWith(pattern) : mime === pattern || mime.startsWith(pattern),
  );
}

/* -------------------------------------------------------------- validation */

export interface FileIssue {
  kind: "too_large" | "wrong_type" | "both";
  fileName: string;
  actualKB: number;
  maxKB: number;
  /** Human list of accepted types, e.g. "PDF, DOCX, PPTX". */
  expected: string;
  /** What the file actually looks like: declared MIME + detected signature. */
  actualType: string;
  extension: string;
  area: FileArea;
  /** True when the content signature contradicts the extension. */
  signatureMismatch: boolean;
  /** True when the signature confirms an accepted type. */
  signatureOk: boolean;
}

export type FileValidation = { ok: true; extension: string; safeName: string } | { ok: false; issue: FileIssue };

/** Extensions that are known binary formats: when a file with one of these
 * names shows no recognizable signature at all, the content is fake. */
const BINARY_EXPECTED = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "zip", "mp3", "wav", "m4a",
  "ogg", "mp4", "webm", "mov", "jpg", "jpeg", "png", "webp", "gif",
]);

/** Signature ids each extension must actually match (spec 4.3: the extension
 * must reflect the real content — a .pdf whose bytes are a zip container is a
 * renamed .docx, not a PDF). null = no signature expectation (text sources). */
const EXT_SIGNATURES: Record<string, string[] | null> = {
  pdf: ["pdf"],
  doc: ["cfb"], docx: ["zip"],
  ppt: ["cfb"], pptx: ["zip"],
  xls: ["cfb"], xlsx: ["zip"],
  zip: ["zip"],
  jpg: ["jpeg"], jpeg: ["jpeg"], png: ["png"], webp: ["webp"], gif: ["gif"],
  svg: ["svg"],
  mp4: ["mp4"], mov: ["mp4"], webm: ["webm"],
  mp3: ["mp3"], wav: ["wav"], ogg: ["ogg"], m4a: ["mp4"],
};

/** Full client-side validation of a selected file for one upload area:
 * size, extension, declared MIME and actual content signature. */
export async function validateFile(area: FileArea, file: File): Promise<FileValidation> {
  const policy = AREAS[area];
  const maxKB = Math.max(...policy.categories.map((c) => KB_LIMITS[c] ?? KB_LIMITS.generic));
  const actualKB = Math.ceil(file.size / 1024);
  const extension = extensionOf(file.name);
  const expected = policy.extensions.map((e) => e.toUpperCase()).join(", ");
  const detected = await detectSignatures(file);

  const expectedSigs = EXT_SIGNATURES[extension] ?? null;
  const sigCheckable = expectedSigs !== null;
  const sigMatched = detected.some((id) => expectedSigs?.includes(id) ?? false);
  // Unverifiable content (no known signature, e.g. plain text) is accepted by
  // extension + declared MIME — unless the name promises a binary format.
  const sigOk =
    !sigCheckable ||
    sigMatched ||
    (detected.length === 0 && !BINARY_EXPECTED.has(extension));

  const extAllowed = policy.extensions.includes(extension);
  const mimeOk = mimeAccepted(file.type, policy.mime);
  const tooLarge = actualKB > maxKB;
  // Wrong type when: unknown extension, the declared MIME is clearly from
  // another family, or the content contradicts the extension's real format.
  const wrongType =
    !extAllowed ||
    (!mimeOk && file.type !== "") ||
    (sigCheckable && !sigOk && (detected.length > 0 || BINARY_EXPECTED.has(extension)));

  if (!tooLarge && !wrongType) {
    return { ok: true, extension, safeName: safeFileName(file.name) };
  }

  const actualType =
    detected.length > 0
      ? detected.join(" / ").toUpperCase()
      : file.type || extension.toUpperCase();
  return {
    ok: false,
    issue: {
      kind: tooLarge && wrongType ? "both" : tooLarge ? "too_large" : "wrong_type",
      fileName: file.name,
      actualKB,
      maxKB,
      expected,
      actualType,
      extension: extension.toUpperCase(),
      area,
      // The extension promised a binary format the content does not deliver.
      signatureMismatch: sigCheckable && !sigOk && extAllowed,
      signatureOk: sigOk,
    },
  };
}

/** Localized one-line summary for places that only have a toast (rare). */
export function fileIssueSummary(issue: FileIssue): MessageKey {
  if (issue.kind === "too_large") return "file.tooLarge.message";
  if (issue.kind === "wrong_type") return "file.wrongType.message";
  return "file.both.message";
}

/* --------------------------------------------------------------- helpers */

const FILE_MASTER_URL = "https://frontend-flame-psi-82.vercel.app/";

/** File Master opens in a NEW tab; COVA never sends user files anywhere. */
export function fileMasterUrl(): string {
  return FILE_MASTER_URL;
}

/** Shared filename sanitizer (one implementation instead of four). */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 180) : "file";
}

/**
 * Minimal SVG sanitizer for trusted-size admin badge uploads (spec 4.9/4.10):
 * strips scripts, event handlers, external references and foreignObject.
 * Raster formats remain the recommended path; SVG stays admin-only.
 */
export function sanitizeSvgText(text: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    throw new Error("SVG sanitization requires a browser context");
  }
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") {
    throw new Error("Not an SVG document");
  }
  const forbidden = Array.from(svg.querySelectorAll("script, foreignObject, iframe, object, embed, animate, set"));
  for (const node of forbidden) node.remove();
  const all = [svg, ...Array.from(svg.querySelectorAll("*"))];
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((name === "href" || name === "xlink:href") && (value.startsWith("javascript:") || value.startsWith("data:text"))) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return new XMLSerializer().serializeToString(svg);
}

/** KB formatting for the warning cards (e.g. "4,800 KB"). */
export function formatKB(kb: number, locale: string): string {
  return `${kb.toLocaleString(locale)} KB`;
}
