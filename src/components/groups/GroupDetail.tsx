"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorClosed, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { JoinGate } from "@/components/spaces/JoinGate";
import { SpacePanel } from "@/components/spaces/SpacePanel";
import { useS } from "@/i18n/spaces";
import { useI18n } from "@/i18n/client";
import { demoActions } from "@/lib/demo-store";
import { useIdentity, useSpace } from "@/lib/spaces-client";
import { cn } from "@/lib/utils";

/** A group chat opened by its code / link (/groups/<code>). */
export function GroupDetail({ code }: { code: string }) {
  const t = useS();
  const { formatTag } = useI18n();
  const router = useRouter();
  const { uid, name, ready } = useIdentity();
  const { view, notFound, ended, send } = useSpace(code, uid);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const count = view?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  if (!ready) return null;
  if (notFound) {
    return (
      <EmptyState
        icon={DoorClosed}
        title={t("room.notFound")}
        description={code}
        action={<Button onClick={() => router.push("/groups")}>{t("room.back")}</Button>}
      />
    );
  }
  if (!view) return null;

  const isMember =
    (view.status === "owner" || view.status === "mod" || view.status === "member") && !ended;
  if (!isMember) {
    return (
      <JoinGate
        view={view}
        ended={ended}
        defaultName={name}
        onBack={() => router.push("/groups")}
        onCancel={async () => void (await send({ type: "cancel" }))}
        onJoin={async (p) => void (await send({ type: "join", name: p.name }))}
      />
    );
  }

  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    const r = await send({ type: "message", text: value });
    if (r.ok) demoActions.addGroupMessage();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        <div className="mb-3">
          <h1 className="truncate text-xl font-semibold">{view.name}</h1>
          {view.description && <p className="text-sm text-cova-mute">{view.description}</p>}
        </div>
        <Card className="flex h-[30rem] flex-col sm:h-[36rem]">
          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {view.messages.length === 0 && (
              <p className="py-10 text-center text-sm text-cova-mute">{t("room.noMessages")}</p>
            )}
            {view.messages.map((m) => {
              const mine = m.uid === uid;
              return (
                <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  <span className="mb-0.5 text-xs text-cova-mute">
                    {mine ? t("room.you") : m.name} ·{" "}
                    {new Date(m.at).toLocaleTimeString(formatTag, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <p
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                      mine ? "bg-cova-soft" : "bg-cova-pale",
                    )}
                  >
                    {m.text}
                  </p>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <form
            className="flex gap-2 border-t border-cova-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("room.type")}
              aria-label={t("room.type")}
              className="h-10 min-w-0 flex-1 rounded-lg border border-cova-line px-3 text-sm"
            />
            <Button type="submit" disabled={!text.trim()}>
              <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              {t("room.send")}
            </Button>
          </form>
        </Card>
      </div>
      <div className="space-y-4">
        <SpacePanel view={view} meUid={uid} send={send} />
        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            await send({ type: "leave" });
            router.push("/groups");
          }}
        >
          {t("room.leave")}
        </Button>
      </div>
    </div>
  );
}
