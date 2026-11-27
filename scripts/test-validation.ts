/**
 * Global text validation tests (spec Phase 3 + 11): every field kind's
 * boundaries, the strict email cases from the spec, and each password
 * requirement independently — including multiple digits and multiple special
 * characters. Run: npx tsx scripts/test-validation.ts
 */
import {
  TEXT_LIMITS,
  isPasswordValid,
  maxLengthFor,
  passwordChecks,
  validateEmail,
  validateHttpsUrl,
  validateLogin,
  validateOptionalText,
  validateRegister,
  validateText,
} from "@/lib/validation";

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
const isOk = (result: { ok: boolean }) => result.ok;

console.log("1) text limits — boundaries");
for (const kind of Object.keys(TEXT_LIMITS) as Array<keyof typeof TEXT_LIMITS>) {
  const { min, max } = TEXT_LIMITS[kind];
  ok(!isOk(validateText(kind, "a".repeat(max + 1))), `${kind}: ${max + 1} chars rejected`);
  ok(maxLengthFor(kind) === max, `${kind}: maxLengthFor = ${max}`);
  if (min > 0 && min < max) {
    ok(!isOk(validateText(kind, "a".repeat(Math.max(0, min - 1)))), `${kind}: ${min - 1} chars rejected`);
  }
}
ok(!isOk(validateText("firstName", "")), "firstName: empty rejected (required)");
ok(isOk(validateOptionalText("firstName", "   ")), "optional: empty allowed");
ok(!isOk(validateOptionalText("firstName", "a")), "optional: wrong value still rejected");
ok(isOk(validateOptionalText("firstName", "Aline")), "optional: valid value accepted");

console.log("2) Unicode names accepted, junk rejected");
ok(isOk(validateText("firstName", "Marie-Claire O'Brien")), "apostrophes + hyphen + spaces ok");
ok(isOk(validateText("firstName", "李小龙")), "CJK name ok");
ok(isOk(validateText("lastName", "N'Diaye")), "typographic apostrophe ok");
ok(!isOk(validateText("firstName", "X")), "1 char rejected");
ok(!isOk(validateText("firstName", "Jean123")), "digits rejected in names");
ok(isOk(validateText("username", "student_01")), "username ok");
ok(!isOk(validateText("username", "no!")), "username punctuation rejected");
ok(isOk(validateText("tag", "web-dev")), "tag hyphen ok");
ok(!isOk(validateText("slug", "Hello-World")), "slug uppercase rejected");
ok(isOk(validateText("slug", "hello-world-42")), "slug lowercase ok");

console.log("3) email — spec examples");
for (const good of ["student@gmail.com", "name.surname@university.edu", "user+study@example.org"]) {
  ok(isOk(validateEmail(good)), `valid: ${good}`);
}
for (const bad of [
  "studentgmail.com", "student@@gmail.com", "@gmail.com", "student@",
  "student @gmail.com", "student@gmail", "student..dot@gmail.com",
  ".lead@gmail.com", "trail.@gmail.com", "a@-bad.com", "a@bad-.com", "a@bad.c", "a@b@c.com",
]) {
  ok(!isOk(validateEmail(bad)), `invalid: ${bad}`);
}
ok(!isOk(validateEmail("a@b.co".padEnd(255, "x"))), "email > 254 rejected");

console.log("4) password — each requirement independently");
const pwChecks = passwordChecks("Abcdefg1!"); // 9 chars, upper, lower, digit, special
ok(pwChecks.every((check) => check.ok), "Cova-style full password passes every check");
ok(!isPasswordValid("cova2026!"), "no uppercase rejected");
ok(!isPasswordValid("COVA2026!"), "no lowercase rejected");
ok(!isPasswordValid("Covaaaaa!"), "no digit rejected");
ok(!isPasswordValid("Cova2026"), "no special rejected");
ok(!isPasswordValid("Ab1!"), "too short rejected");
ok(!isPasswordValid("a".repeat(49) + "A1!"), "51 chars rejected");
ok(!isPasswordValid("Cova 2026!x"), "internal whitespace rejected");
ok(isPasswordValid("Cova123456!!!"), "multiple specials accepted");
ok(isPasswordValid("STUDENT2026!a"), "multiple digits + upper accepted");
ok(isPasswordValid("MyPassword123!!!"), "multiple digits and specials accepted");
ok(isPasswordValid("Mot2Pâssé§#"), "unicode letters + special accepted");
ok(isPasswordValid("Cova2026!".replace("!".repeat(1), "!!!!!!!!!")), "many specials accepted");

console.log("5) login / register forms");
ok(Object.keys(validateLogin({ email: "student@gmail.com", password: "x" })).length === 0, "login valid");
ok(validateLogin({ email: "bad-email", password: "x" }).email === "auth.err.emailInvalid", "login strict email error");
const reg = validateRegister({ name: "Alice", email: "student@gmail.com", password: "Cova2026!", confirm: "Cova2026!", accepted: true });
ok(Object.keys(reg).length === 0, "register valid");
ok(validateRegister({ name: "A", email: "student@gmail.com", password: "Cova2026!", confirm: "Cova2026!", accepted: true }).name === "auth.err.nameShort", "short name");
ok(validateRegister({ name: "Alice", email: "student@gmail.com", password: "cova2026!", confirm: "cova2026!", accepted: true }).password === "validation.password.upper", "granular password error");

console.log("6) URLs");
ok(isOk(validateHttpsUrl("https://university.edu/courses")), "https ok");
ok(!isOk(validateHttpsUrl("http://university.edu")), "http rejected");
ok(!isOk(validateHttpsUrl("https://a.co".padEnd(2049, "x"))), "url > 2048 rejected");

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
