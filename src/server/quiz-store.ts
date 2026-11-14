/**
 * COVA QUIZ live sessions: in-memory, single-server (same dev pattern as
 * spaces-store). The SERVER owns the game state, the clock and the scoring —
 * clients only send answer indexes and receive derived state.
 *
 * Question → reveal → next are driven by server timers, so the game keeps
 * flowing even if the host's tab closes. Hosts can still force reveal/next.
 */

export interface QuizQuestion {
  q: string;
  choices: string[];
  correct: number | number[];
  multiple?: boolean;
  /** Optional per-question timer override, in seconds. */
  seconds?: number;
}

export interface QuizConfig {
  quizId: string;
  title: string;
  hostId: string;
  hostName: string;
  timePerQuestion: number; // seconds
  scoring: "standard" | "fixed";
  randomize: boolean;
  /** Custom player nicknames allowed (otherwise the account name is used). */
  nicknames: boolean;
  questions: QuizQuestion[];
}

export interface QuizPlayer {
  userId: string;
  nickname: string;
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  answeredMs: number; // total response time on correct answers
  answeredCount: number;
}

export interface PlayerAnswer {
  choice: number | number[];
  atMs: number; // ms elapsed when the answer arrived
  correct: boolean;
  gained: number; // points awarded for this answer (scored at submit time)
  streakAfter: number;
}

export type QuizPhase = "lobby" | "question" | "reveal" | "ended";

export interface QuizState {
  pin: string;
  phase: QuizPhase;
  isHost: boolean;
  quizId: string;
  quizTitle: string;
  allowNickname: boolean;
  players: Array<{ userId: string | null; nickname: string; isMe: boolean }>;
  question: {
    q: string;
    choices: string[];
    multiple: boolean;
    index: number;
    total: number;
    timeLeftMs: number;
    limitMs: number;
    answeredCount: number;
    // Correct answers only after the reveal phase.
    correct: number | number[] | null;
  } | null;
  answered: boolean;
  myAnswer: number | number[] | null;
  myScore: number;
  myStreak: number;
  lastGained: number | null;
  lastCorrect: boolean | null;
  ranking: Array<{ nickname: string; score: number; isMe: boolean; rank: number }>;
  /** Full per-player summary once the game has ended (all viewers). */
  final: FinalResults | null;
  questionStartedAt: number;
  serverNow: number;
}

interface Session {
  pin: string;
  phase: QuizPhase;
  config: QuizConfig;
  hostUserId: string;
  order: number[]; // question display order
  index: number; // current position in order
  questionStartedAt: number; // server ms
  questionLimitMs: number;
  players: Map<string, QuizPlayer>; // key: userId
  nicknames: Set<string>;
  answers: Map<string, PlayerAnswer>; // per question: userId -> answer
  lastResults: Array<{ nickname: string; score: number; correct: boolean; gained: number }> | null;
  finishedPersisted: boolean;
  listeners: Set<{ uid: string; send: (event: string, data: unknown) => void }>;
  timer: ReturnType<typeof setTimeout> | null;
  lastActivityAt: number;
}

const sessions = new Map<string, Session>();

/** Time the correct answer stays on screen before the server advances. */
const REVEAL_MS = 6000;
/** Idle sessions are swept after 2 h (ended + persisted ones after 15 min). */
const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const ENDED_TTL_MS = 15 * 60 * 1000;
const SWEEP_MS = 60 * 1000;

function sweep(): void {
  const now = Date.now();
  for (const [pin, session] of sessions) {
    const ttl = session.phase === "ended" && session.finishedPersisted ? ENDED_TTL_MS : IDLE_TTL_MS;
    if (now - session.lastActivityAt > ttl) {
      if (session.timer) clearTimeout(session.timer);
      sessions.delete(pin);
    }
  }
}

// Module-level interval: the Node server keeps sessions bounded over time.
let sweepTimer: ReturnType<typeof setInterval> | null = null;
function ensureSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweep, SWEEP_MS);
}

export function generatePin(): string {
  let pin: string;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (sessions.has(pin));
  return pin;
}

function limitFor(question: QuizQuestion, fallbackSeconds: number): number {
  return Math.max(1, question.seconds ?? fallbackSeconds) * 1000;
}

export function createSession(config: QuizConfig): string {
  ensureSweep();
  const pin = generatePin();
  const session: Session = {
    pin,
    phase: "lobby",
    config,
    hostUserId: config.hostId,
    order: config.questions.map((_, index) => index),
    index: -1,
    questionStartedAt: 0,
    questionLimitMs: 0,
    players: new Map(),
    nicknames: new Set(),
    answers: new Map(),
    lastResults: null,
    finishedPersisted: false,
    listeners: new Set(),
    timer: null,
    lastActivityAt: Date.now(),
  };
  if (config.randomize) {
    for (let i = session.order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = session.order[i] as number;
      const b = session.order[j] as number;
      session.order[i] = b;
      session.order[j] = a;
    }
  }
  sessions.set(pin, session);
  return pin;
}

export function getSession(pin: string): Session | undefined {
  return sessions.get(pin);
}

function clearTimer(session: Session): void {
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
}

function touch(session: Session): void {
  session.lastActivityAt = Date.now();
}

function broadcast(session: Session): void {
  for (const listener of session.listeners) {
    try {
      listener.send("state", sessionState(session.pin, listener.uid));
    } catch {
      /* listener stream already closed */
    }
  }
}

/** SSE gate: only the host or a joined player may listen to a session. */
export function isSessionMember(pin: string, uid: string): boolean {
  const session = sessions.get(pin);
  if (!session) return false;
  return session.hostUserId === uid || session.players.has(uid);
}

/** Live SSE hookup for one viewer; returns a cleanup or null when gone. */
export function addListener(
  pin: string,
  uid: string,
  send: (event: string, data: unknown) => void,
): (() => void) | null {
  const session = sessions.get(pin);
  if (!session) return null;
  const listener = { uid, send };
  session.listeners.add(listener);
  touch(session);
  return () => {
    session.listeners.delete(listener);
  };
}

/** Public snapshot of the session state for one viewer. */
export function sessionState(pin: string, viewerId: string): QuizState | null {
  const session = sessions.get(pin);
  if (!session) return null;
  const questionIndex = session.index >= 0 ? session.order[session.index] ?? -1 : -1;
  const question = questionIndex >= 0 ? session.config.questions[questionIndex] : undefined;
  const reveal = session.phase === "reveal";
  const ranking = [...session.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({
      nickname: player.nickname,
      score: player.score,
      isMe: player.userId === viewerId,
      rank: index + 1,
    }));
  const me = session.players.get(viewerId) ?? null;
  const limitMs = question ? limitFor(question, session.config.timePerQuestion) : session.questionLimitMs;
  const timeLeftMs =
    session.phase === "question" ? Math.max(0, limitMs - (Date.now() - session.questionStartedAt)) : 0;
  const lastMine = session.lastResults?.find((result) => result.nickname === me?.nickname) ?? null;

  return {
    pin: session.pin,
    phase: session.phase,
    isHost: session.hostUserId === viewerId,
    quizId: session.config.quizId,
    quizTitle: session.config.title,
    allowNickname: session.config.nicknames,
    // userId is needed by the host to kick; players only see nicknames.
    players: [...session.players.values()].map((player) => ({
      userId: session.hostUserId === viewerId ? player.userId : null,
      nickname: player.nickname,
      isMe: player.userId === viewerId,
    })),
    question:
      question && (session.phase === "question" || session.phase === "reveal")
        ? {
            q: question.q,
            choices: question.choices,
            multiple: question.multiple ?? false,
            index: session.index + 1,
            total: session.config.questions.length,
            timeLeftMs: session.phase === "question" ? timeLeftMs : 0,
            limitMs: session.phase === "question" ? limitMs : 0,
            answeredCount: session.answers.size,
            correct: reveal ? question.correct : null,
          }
        : null,
    answered: session.answers.has(viewerId),
    myAnswer: session.answers.get(viewerId)?.choice ?? null,
    myScore: me?.score ?? 0,
    myStreak: me?.streak ?? 0,
    lastGained: lastMine?.gained ?? null,
    lastCorrect: lastMine?.correct ?? null,
    ranking,
    final: computeFinal(session),
    questionStartedAt: session.questionStartedAt,
    serverNow: Date.now(),
  };
}

export function joinSession(pin: string, userId: string, nickname: string): { ok: boolean; error?: string } {
  const session = getSession(pin);
  if (!session) return { ok: false, error: "Game not found" };
  touch(session);
  const existing = session.players.get(userId);
  if (existing) return { ok: true }; // reconnection
  if (session.phase !== "lobby") return { ok: false, error: "The game has already started" };
  const clean = nickname.trim().slice(0, 20);
  if (!clean) return { ok: false, error: "Pick a nickname" };
  if (session.nicknames.has(clean.toLowerCase())) return { ok: false, error: "Nickname already taken" };
  session.nicknames.add(clean.toLowerCase());
  session.players.set(userId, {
    userId,
    nickname: clean,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answeredMs: 0,
    answeredCount: 0,
  });
  broadcast(session);
  return { ok: true };
}

export function removePlayer(pin: string, hostId: string, targetUserId: string): { ok: boolean; error?: string } {
  const session = getSession(pin);
  if (!session || session.hostUserId !== hostId) return { ok: false, error: "Host only" };
  const player = session.players.get(targetUserId);
  if (!player) return { ok: false, error: "Player not found" };
  session.nicknames.delete(player.nickname.toLowerCase());
  session.players.delete(targetUserId);
  session.answers.delete(targetUserId);
  touch(session);
  broadcast(session);
  return { ok: true };
}

export function startGame(pin: string, hostId: string): { ok: boolean; error?: string } {
  const session = getSession(pin);
  if (!session || session.hostUserId !== hostId) return { ok: false, error: "Host only" };
  if (session.phase !== "lobby") return { ok: false, error: "Already started" };
  const firstIndex = session.order[0];
  const firstQuestion = firstIndex !== undefined ? session.config.questions[firstIndex] : undefined;
  if (!firstQuestion) return { ok: false, error: "This quiz has no questions" };
  clearTimer(session);
  session.phase = "question";
  session.index = 0;
  session.answers = new Map();
  session.lastResults = null;
  session.questionStartedAt = Date.now();
  session.questionLimitMs = limitFor(firstQuestion, session.config.timePerQuestion);
  touch(session);
  broadcast(session);
  // The server advances the game even if the host tab closes.
  session.timer = setTimeout(() => {
    revealInternal(session.pin);
  }, session.questionLimitMs);
  return { ok: true };
}

function scoreFor(scoring: "standard" | "fixed", atMs: number, limitMs: number): number {
  if (scoring === "fixed") return 1000;
  const ratio = Math.min(1, Math.max(0, atMs / limitMs));
  if (ratio <= 0.2) return 1000;
  if (ratio <= 0.4) return 800;
  if (ratio <= 0.6) return 600;
  if (ratio <= 0.8) return 400;
  return 200;
}

function isCorrect(question: QuizQuestion, choice: number | number[]): boolean {
  if (Array.isArray(question.correct)) {
    if (!Array.isArray(choice)) return false;
    const a = [...choice].sort((x, y) => x - y).join(",");
    const b = [...question.correct].sort((x, y) => x - y).join(",");
    return a === b;
  }
  return choice === question.correct;
}

/** Strict validation: integers inside the choice range, no duplicates. */
function validChoice(question: QuizQuestion, choice: unknown): choice is number | number[] {
  const n = question.choices.length;
  if (Array.isArray(question.correct)) {
    if (!Array.isArray(choice) || choice.length === 0) return false;
    const seen = new Set<number>();
    for (const c of choice) {
      if (!Number.isInteger(c) || (c as number) < 0 || (c as number) >= n || seen.has(c as number)) return false;
      seen.add(c as number);
    }
    return true;
  }
  return typeof choice === "number" && Number.isInteger(choice) && choice >= 0 && choice < n;
}

export function submitAnswer(
  pin: string,
  userId: string,
  choice: number | number[],
): { ok: boolean; error?: string } {
  const session = getSession(pin);
  if (!session) return { ok: false, error: "Game not found" };
  if (session.phase !== "question") return { ok: false, error: "No active question" };
  const player = session.players.get(userId);
  if (!player) return { ok: false, error: "Join the game first" };
  if (session.answers.has(userId)) return { ok: false, error: "Answer already submitted" };

  const questionIndex = session.order[session.index] ?? -1;
  const question = questionIndex >= 0 ? session.config.questions[questionIndex] : undefined;
  if (!question) return { ok: false, error: "Question unavailable" };
  if (!validChoice(question, choice)) return { ok: false, error: "Invalid answer" };

  const atMs = Date.now() - session.questionStartedAt;
  if (atMs > session.questionLimitMs) return { ok: false, error: "Time is over" };

  // Scored immediately, server-side; the reveal only shows the breakdown.
  const correct = isCorrect(question, choice);
  let gained = 0;
  if (correct) {
    const base = scoreFor(session.config.scoring, atMs, session.questionLimitMs);
    player.streak += 1;
    const streakBonus = Math.min(300, (player.streak - 1) * 50);
    gained = base + streakBonus;
    player.score += gained;
    player.correct += 1;
    player.answeredMs += atMs;
    player.answeredCount += 1;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
  } else {
    player.streak = 0;
  }
  session.answers.set(userId, { choice, atMs, correct, gained, streakAfter: player.streak });
  touch(session);
  broadcast(session);
  return { ok: true };
}

function revealInternal(pin: string): void {
  const session = sessions.get(pin);
  if (!session || session.phase !== "question") return;
  clearTimer(session);

  const results: Array<{ nickname: string; score: number; correct: boolean; gained: number }> = [];
  for (const [userId, player] of session.players) {
    const answer = session.answers.get(userId);
    if (!answer) {
      player.streak = 0; // no answer breaks the streak
      results.push({ nickname: player.nickname, score: player.score, correct: false, gained: 0 });
      continue;
    }
    results.push({
      nickname: player.nickname,
      score: player.score,
      correct: answer.correct,
      gained: answer.gained,
    });
  }
  session.lastResults = results;
  session.phase = "reveal";
  touch(session);
  broadcast(session);
  session.timer = setTimeout(() => {
    nextInternal(session.pin);
  }, REVEAL_MS);
}

/** Host forces the reveal before the timer runs out. */
export function revealQuestion(pin: string, hostId: string): { ok: boolean; error?: string } {
  const session = getSession(pin);
  if (!session || session.hostUserId !== hostId) return { ok: false, error: "Host only" };
  if (session.phase !== "question") return { ok: false, error: "Not in question phase" };
  revealInternal(pin);
  return { ok: true };
}

function nextInternal(pin: string): void {
  const session = sessions.get(pin);
  if (!session || session.phase !== "reveal") return;
  clearTimer(session);
  if (session.index + 1 >= session.config.questions.length) {
    session.phase = "ended";
    touch(session);
    broadcast(session);
    return;
  }
  session.index += 1;
  const questionIndex = session.order[session.index] ?? -1;
  const question = questionIndex >= 0 ? session.config.questions[questionIndex] : undefined;
  session.answers = new Map();
  session.lastResults = null;
  session.phase = "question";
  session.questionStartedAt = Date.now();
  session.questionLimitMs = question
    ? limitFor(question, session.config.timePerQuestion)
    : session.config.timePerQuestion * 1000;
  touch(session);
  broadcast(session);
  session.timer = setTimeout(() => {
    revealInternal(session.pin);
  }, session.questionLimitMs);
}

/** Host skips to the next question (or ends the game after the last one). */
export function nextQuestion(pin: string, hostId: string): { ok: boolean; error?: string } {
  const session = getSession(pin);
  if (!session || session.hostUserId !== hostId) return { ok: false, error: "Host only" };
  if (session.phase !== "reveal") return { ok: false, error: "Reveal first" };
  nextInternal(pin);
  return { ok: true };
}

export function endGame(pin: string, hostId: string): { ok: boolean; error?: string } {
  const session = getSession(pin);
  if (!session || session.hostUserId !== hostId) return { ok: false, error: "Host only" };
  clearTimer(session);
  session.phase = "ended";
  touch(session);
  broadcast(session);
  return { ok: true };
}

export interface FinalResults {
  quizId: string;
  title: string;
  podium: Array<{ nickname: string; score: number }>;
  players: Array<{
    nickname: string;
    score: number;
    correct: number;
    total: number;
    accuracy: number;
    avgMs: number;
    xp: number;
  }>;
}

/** Final summary for the results screen. */
function computeFinal(session: Session): FinalResults | null {
  if (session.phase !== "ended") return null;
  const sorted = [...session.players.values()].sort((a, b) => b.score - a.score);
  return {
    quizId: session.config.quizId,
    title: session.config.title,
    podium: sorted.slice(0, 3).map((player) => ({ nickname: player.nickname, score: player.score })),
    players: sorted.map((player, rank) => ({
      nickname: player.nickname,
      score: player.score,
      correct: player.correct,
      total: session.config.questions.length,
      accuracy: player.answeredCount > 0 ? Math.round((player.correct / player.answeredCount) * 100) : 0,
      avgMs: player.answeredCount > 0 ? Math.round(player.answeredMs / player.answeredCount) : 0,
      // Mirrors the quiz_award_live_xp SQL formula so the UI shows what was granted.
      xp: Math.min(200, player.correct * 10 + (rank === 0 && sorted.length > 1 ? 50 : 0)),
    })),
  };
}

export function finalResults(pin: string): FinalResults | null {
  const session = getSession(pin);
  if (!session) return null;
  return computeFinal(session);
}

export function markPersisted(pin: string): void {
  const session = getSession(pin);
  if (session) session.finishedPersisted = true;
}

export function isPersisted(pin: string): boolean {
  return getSession(pin)?.finishedPersisted ?? true;
}
