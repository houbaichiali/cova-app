import { addListener } from "@/server/spaces-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-Sent Events stream: live state, WebRTC signals, kicks and closures for one person. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid") ?? "";
  // Room token: a member's live stream is member-only data (state, WebRTC
  // signals, captions) — a bare uid claim gets no stream at all.
  const token = url.searchParams.get("t") ?? "";
  const enc = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* stream already closed */
        }
      };
      cleanup = addListener(code, uid, send, token);
      if (!cleanup) {
        send("closed", {});
        controller.close();
        return;
      }
      ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          /* closed */
        }
      }, 20000);
      req.signal.addEventListener("abort", () => {
        if (ping) clearInterval(ping);
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* closed */
        }
      });
    },
    cancel() {
      if (ping) clearInterval(ping);
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
