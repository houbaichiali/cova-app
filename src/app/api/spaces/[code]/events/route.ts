import { addListener } from "@/server/spaces-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-Sent Events stream: live state, WebRTC signals, kicks and closures for one person. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const uid = new URL(req.url).searchParams.get("uid") ?? "";
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
      cleanup = addListener(code, uid, send);
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
