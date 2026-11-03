import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSession,
  endGame,
  finalResults,
  getSession,
  isPersisted,
  joinSession,
  markPersisted,
  nextQuestion,
  removePlayer,
  revealQuestion,
  sessionState,
  startGame,
  submitAnswer,
} from "@/server/quiz-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves the caller from their Supabase access token. */
async function getUser(req: Request): Promise<{ id: string; name: string } | null> {
  if (!url || !key) return null;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const name =
    (data.user.user_metadata?.full_name as string | undefined) ||
    (data.user.user_metadata?.name as string | undefined) ||
    data.user.email?.split("@")[0] ||
    "Host";
  return { id: data.user.id, name };
}

/** Supabase client for the caller's token (persist + XP award). */
function clientFor(token: string) {
  return createClient(url as string, key as string, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// GET /api/quiz/session/[pin] -> current state for the caller
export async function GET(req: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const state = sessionState(pin, user.id);
  if (!state) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  return NextResponse.json({ state });
}

// POST /api/quiz/session/[pin] -> { action: join|start|answer|reveal|next|end|kick|persist }
export async function POST(req: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const action = String(body.action ?? "");

  if (action === "join") {
    // Quizzes that disable custom nicknames always use the account name.
    const session = getSession(pin);
    const nickname =
      session && !session.config.nicknames ? user.name : String(body.nickname ?? user.name);
    const result = joinSession(pin, user.id, nickname);
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (action === "answer") {
    const result = submitAnswer(pin, user.id, body.choice as number | number[]);
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // persist must be handled before the action chain below (it used to fall
  // through to "Unknown action" and never reached its own branch).
  if (action === "persist") {
    const results = finalResults(pin);
    if (!results) return NextResponse.json({ error: "Game not finished" }, { status: 400 });
    if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    if (isPersisted(pin)) {
      return NextResponse.json({ ok: true, persisted: true, results });
    }
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const client = clientFor(token);
    const { data: game, error: gameError } = await client
      .from("quiz_games")
      .insert({ quiz_id: results.quizId, host_id: user.id, pin, mode: "live" })
      .select("id")
      .single();
    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 400 });
    const gameId = (game as { id: string }).id;
    const session = getSession(pin);
    const { error: playersError } = await client.from("quiz_game_players").insert(
      results.players.map((player) => ({
        game_id: gameId,
        nickname: player.nickname,
        user_id:
          [...(session?.players.values() ?? [])].find((p) => p.nickname === player.nickname)?.userId ?? null,
        score: player.score,
        correct: player.correct,
        total: player.total,
        accuracy: player.accuracy,
        avg_ms: player.avgMs,
      })),
    );
    if (playersError) return NextResponse.json({ error: playersError.message }, { status: 400 });
    // XP for every signed-in player, server-side and idempotent (best effort:
    // a missing RPC must not lose the persisted results).
    const { error: xpError } = await client.rpc("quiz_award_live_xp", { p_game: gameId });
    if (xpError) console.error("quiz_award_live_xp failed:", xpError.message);
    markPersisted(pin);
    return NextResponse.json({ ok: true, gameId, results });
  }

  const result =
    action === "start" ? startGame(pin, user.id)
      : action === "reveal" ? revealQuestion(pin, user.id)
        : action === "next" ? nextQuestion(pin, user.id)
          : action === "end" ? endGame(pin, user.id)
            : action === "kick" ? removePlayer(pin, user.id, String(body.target ?? ""))
              : { ok: false, error: "Unknown action" };
  if (!result.ok) return NextResponse.json(result, { status: 400 });

  if (action === "end") {
    const results = finalResults(pin);
    return NextResponse.json({ ok: true, results });
  }

  return NextResponse.json({ ok: true });
}

// PUT /api/quiz/session/[pin] -> create the session for a quiz (host only).
// Body: { quizId }. The quiz is loaded from Supabase with the host token.
export async function PUT(req: Request, { params }: { params: Promise<{ pin: string }> }) {
  void params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const quizId = String(body.quizId ?? "");
  if (!UUID_RE.test(quizId)) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const client = clientFor((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const { data: quiz, error } = await client
    .from("quizzes")
    .select("id,title,host_id:created_by,time_per_question,scoring,randomize,nicknames,questions")
    .eq("id", quizId)
    .maybeSingle();
  if (error || !quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  if ((quiz as { host_id: string }).host_id !== user.id) {
    return NextResponse.json({ error: "Only the quiz author can host it" }, { status: 403 });
  }
  const typed = quiz as unknown as {
    id: string; title: string; host_id: string; time_per_question: number;
    scoring: "standard" | "fixed"; randomize: boolean; nicknames: boolean;
    questions: import("@/server/quiz-store").QuizQuestion[];
  };
  if (!Array.isArray(typed.questions) || typed.questions.length === 0) {
    return NextResponse.json({ error: "This quiz has no questions" }, { status: 400 });
  }

  const pin = createSession({
    quizId: typed.id,
    title: typed.title,
    hostId: user.id,
    hostName: user.name,
    timePerQuestion: typed.time_per_question,
    scoring: typed.scoring,
    randomize: typed.randomize,
    nicknames: typed.nicknames,
    questions: typed.questions,
  });
  return NextResponse.json({ pin });
}
