/**
 * File policy tests (spec Phases 4 + 11): exact KB limits per category,
 * per-area extensions, MIME mismatches, content-signature checks (a renamed
 * file cannot pose as another type), and the both-problems case. Pure Node —
 * File objects are emulated with Node's File (available since Node 20).
 * Run: npx tsx scripts/test-file-policy.ts
 */
import {
  KB_LIMITS,
  formatKB,
  safeFileName,
  validateFile,
} from "@/lib/file-policy";

let passed = 0;
let failed = 0;
function ok(condition: boolean, name: string): void {
  if (condition) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}`);
  }
}

function fileFrom(bytes: number[], name: string, mime = ""): File {
  return new File([new Uint8Array(bytes)], name, { type: mime });
}

// Real signatures (first bytes only — content is a stub, signatures match).
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const RIFF_WEBP = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const RIFF_WAVE = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
const MP4 = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32];
const DOCX = ZIP; // OOXML files are zip containers

async function main(): Promise<void> {
  console.log("1) KB limits — spec table exact");
  ok(KB_LIMITS.avatar === 512, "avatar 512 KB");
  ok(KB_LIMITS.cover === 1024, "cover 1,024 KB");
  ok(KB_LIMITS.postImage === 1024, "post image 1,024 KB");
  ok(KB_LIMITS.projectImage === 1024, "project image 1,024 KB");
  ok(KB_LIMITS.pdf === 2560 && KB_LIMITS.doc === 2560 && KB_LIMITS.xls === 2560, "pdf/doc/xls 2,560 KB");
  ok(KB_LIMITS.ppt === 5120, "ppt 5,120 KB");
  ok(KB_LIMITS.zip === 10240, "zip 10,240 KB");
  ok(KB_LIMITS.audio === 2560, "audio 2,560 KB");
  ok(KB_LIMITS.video === 5120, "video exactly 5,120 KB (5 MB)");
  ok(KB_LIMITS.code === 512, "code 512 KB");
  ok(KB_LIMITS.generic === 2560, "generic 2,560 KB");

  console.log("2) avatar — real image content, size limit");
  ok((await validateFile("avatar", fileFrom(PNG, "me.png", "image/png"))).ok, "real PNG accepted");
  ok((await validateFile("avatar", fileFrom(JPEG, "me.jpg", "image/jpeg"))).ok, "real JPEG accepted");
  ok(!(await validateFile("avatar", fileFrom(PDF, "fake.png", "image/png"))).ok, "PDF bytes named .png rejected (signature)");
  ok(!(await validateFile("avatar", fileFrom(PNG, "doc.pdf", "application/pdf"))).ok, "PNG bytes named .pdf rejected");
  const bigAvatar = fileFrom(PNG, "big.png", "image/png");
  Object.defineProperty(bigAvatar, "size", { value: 513 * 1024 });
  const bigResult = await validateFile("avatar", bigAvatar);
  ok(!bigResult.ok && bigResult.issue.kind === "too_large" && bigResult.issue.actualKB === 513 && bigResult.issue.maxKB === 512,
    "513 KB avatar rejected with exact numbers");

  console.log("3) avatar — wrong type family");
  ok(!(await validateFile("avatar", fileFrom(PDF, "notes.pdf", "application/pdf"))).ok, "avatar refuses a real PDF");

  console.log("4) documents — a DOCX pretending to be PDF must fail");
  ok((await validateFile("document", fileFrom(PDF, "course.pdf", "application/pdf"))).ok, "real PDF accepted");
  ok(!(await validateFile("document", fileFrom(DOCX, "course.pdf", "application/pdf"))).ok,
    "DOCX bytes named .pdf rejected (spec 4.3)");
  ok(!(await validateFile("document", fileFrom(PDF, "course.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).ok,
    "PDF bytes named .docx rejected");
  const zipDoc = fileFrom(DOCX, "course.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  ok((await validateFile("document", zipDoc)).ok, "real DOCX (zip container) accepted");

  console.log("5) video — exactly 5,120 KB, family check");
  ok((await validateFile("video", fileFrom(MP4, "clip.mp4", "video/mp4"))).ok, "real MP4 accepted");
  ok(!(await validateFile("video", fileFrom(ZIP, "archive.zip", "application/zip"))).ok, "video field refuses a ZIP");
  const bigVideo = fileFrom(MP4, "clip.mp4", "video/mp4");
  Object.defineProperty(bigVideo, "size", { value: 5121 * 1024 });
  const videoResult = await validateFile("video", bigVideo);
  ok(!videoResult.ok && videoResult.issue.maxKB === 5120 && videoResult.issue.kind === "too_large",
    "5,121 KB video rejected, max 5,120 KB");

  console.log("6) both problems (wrong type AND too large)");
  const bothFile = fileFrom(DOCX, "slides.pdf", "application/pdf");
  Object.defineProperty(bothFile, "size", { value: 5300 * 1024 });
  const bothResult = await validateFile("document", bothFile);
  ok(!bothResult.ok && bothResult.issue.kind === "both", "combined case flagged as 'both'");

  console.log("7) coding submission — text/code only, 512 KB");
  ok((await validateFile("codingSubmission", fileFrom([], "main.py", "text/plain"))).ok, "py source accepted");
  ok(!(await validateFile("codingSubmission", fileFrom(PDF, "main.py", "application/pdf"))).ok, "binary posing as .py rejected");
  const bigCode = fileFrom([], "main.py", "text/plain");
  Object.defineProperty(bigCode, "size", { value: 513 * 1024 });
  ok(!(await validateFile("codingSubmission", bigCode)).ok, "513 KB code rejected (512 KB limit)");

  console.log("8) audio / general attachments");
  ok((await validateFile("audio", fileFrom(RIFF_WAVE, "voice.wav", "audio/wav"))).ok, "real WAV accepted");
  ok((await validateFile("audio", fileFrom(MP4, "song.m4a", "audio/mp4"))).ok, "m4a (ftyp) accepted");
  ok(!(await validateFile("audio", fileFrom(PDF, "song.wav", "audio/wav"))).ok, "PDF bytes as .wav rejected");
  ok((await validateFile("general", fileFrom(PDF, "guide.pdf", "application/pdf"))).ok, "general accepts PDF");
  ok((await validateFile("general", fileFrom(RIFF_WEBP, "pic.webp", "image/webp"))).ok, "general accepts WEBP");

  console.log("9) helpers");
  ok(safeFileName("../../etc/passwd") === "..-..-etc-passwd", "path traversal sanitized");
  ok(safeFileName("notes  final.pdf") === "notes final.pdf", "double spaces collapsed");
  ok(formatKB(4800, "en-US") === "4,800 KB", "KB formatting");

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main();
