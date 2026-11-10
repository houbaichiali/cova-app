"use client";

import {
  Crown,
  Ear,
  EarOff,
  Lock,
  MicOff,
  ShieldCheck,
  UserX,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useS } from "@/i18n/spaces";
import { resolveRestoreVolume } from "@/components/voicing/dubModel";
import type { SpaceView } from "@/lib/spaces-client";

type Send = (body: Record<string, unknown>) => Promise<unknown>;

/**
 * Participants panel for voice rooms:
 *  - everyone in the room with their mic / hearing flags,
 *  - a per-person volume slider for every OTHER member — how loud they are
 *    FOR ME only, never for the room (persisted per browser),
 *  - for the owner and moderators: mute (locked — the target cannot lift it
 *    themselves), deafen, kick; the owner can also allow a removed person
 *    back in,
 *  - join requests are approved here too.
 */
export function ParticipantsPanel({
  view,
  meUid,
  deafened,
  send,
  volumes,
  setUserVolume,
}: {
  view: SpaceView;
  meUid: string;
  /** Live deafen state of ME (drives the banner). */
  deafened: boolean;
  send: Send;
  /** uid -> my chosen loudness for that person (1 = default). */
  volumes: Record<string, number>;
  setUserVolume: (uid: string, v: number) => void;
}) {
  const t = useS();
  const isOwner = view.status === "owner";
  const canMod = isOwner || view.status === "mod";

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {t("room.people")}
            <Badge tone="pale">{view.members.length}</Badge>
          </h3>
          <span className="font-mono text-xs tracking-widest text-cova-mute">{view.code}</span>
        </div>

        {deafened && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
            {t("room.deafenedYou")}
          </p>
        )}

        {canMod && view.pending.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5">
            <p className="mb-2 text-xs font-semibold text-amber-800">{t("room.requests")}</p>
            <ul className="space-y-2">
              {view.pending.map((p) => (
                <li key={p.uid} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="flex shrink-0 gap-1">
                    <Button size="sm" onClick={() => void send({ type: "approve", target: p.uid })}>
                      {t("room.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void send({ type: "deny", target: p.uid })}
                    >
                      {t("room.deny")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-2.5">
          {view.members.map((m) => {
            const isMe = m.uid === meUid;
            const canActOn =
              canMod && !isMe && m.role !== "owner" && !(view.status === "mod" && m.role === "mod");
            const myVol = resolveRestoreVolume(false, volumes[m.uid]);
            return (
              <li
                key={m.uid}
                className="rounded-lg bg-cova-bg px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {m.name}
                      {isMe && <span className="text-cova-mute"> ({t("room.you")})</span>}
                    </span>
                    {m.role === "owner" && (
                      <Crown
                        className="h-4 w-4 shrink-0 text-cova-muted"
                        aria-label={t("room.owner")}
                      />
                    )}
                    {m.role === "mod" && (
                      <ShieldCheck
                        className="h-4 w-4 shrink-0 text-cova-muted"
                        aria-label={t("room.mod")}
                      />
                    )}
                    {(m.muted || m.forceMuted) && (
                      <MicOff className="h-3.5 w-3.5 shrink-0 text-cova-mute" aria-hidden="true" />
                    )}
                    {m.forceMuted && (
                      <Lock
                        className="h-3 w-3 shrink-0 text-red-500"
                        aria-label={t("room.muteLocked")}
                      />
                    )}
                    {m.deafened && (
                      <EarOff className="h-3.5 w-3.5 shrink-0 text-cova-mute" aria-hidden="true" />
                    )}
                  </span>
                  {canActOn && (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void send({ type: "forceMute", target: m.uid, value: !m.forceMuted })
                        }
                        aria-label={m.forceMuted ? t("room.unmuteThem") : t("room.muteThem")}
                        title={m.forceMuted ? t("room.unmuteThem") : t("room.muteThem")}
                      >
                        {m.forceMuted ? (
                          <Volume2 className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <VolumeX className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                      {view.kind === "voice" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void send({ type: "deafen", target: m.uid, value: !m.deafened })
                          }
                          aria-label={m.deafened ? t("room.undeafen") : t("room.deafen")}
                          title={m.deafened ? t("room.undeafen") : t("room.deafen")}
                        >
                          {m.deafened ? (
                            <Ear className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <EarOff className="h-4 w-4" aria-hidden="true" />
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void send({ type: "kick", target: m.uid })}
                        aria-label={t("room.remove")}
                        title={t("room.remove")}
                      >
                        <UserX className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </span>
                  )}
                </div>
                {/* Per-person loudness, FOR ME only — nobody else hears this. */}
                {!isMe && (
                  <label className="mt-1.5 flex items-center gap-2">
                    <Volume2 className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
                    <span className="shrink-0 text-[11px] font-medium text-cova-mute">
                      {t("room.volumeForMe")}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={myVol}
                      onChange={(e) => setUserVolume(m.uid, Number(e.target.value))}
                      aria-label={t("room.volumeForMeAria", { name: m.name })}
                      className="h-1.5 min-w-0 flex-1 cursor-pointer accent-blue-600"
                    />
                    <span className="w-10 shrink-0 text-end font-mono text-[11px] text-cova-mute">
                      {Math.round(myVol * 100)}%
                    </span>
                  </label>
                )}
              </li>
            );
          })}
        </ul>

        {isOwner && view.banned.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-2.5">
            <p className="mb-2 text-xs font-semibold text-red-800">{t("room.bannedTitle")}</p>
            <ul className="space-y-2">
              {view.banned.map((buid) => (
                <li key={buid} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-mono text-xs text-red-700">{buid}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void send({ type: "unban", target: buid })}
                  >
                    {t("room.unban")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isOwner && (
          <div className="flex flex-wrap gap-2 border-t border-cova-line pt-2.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void send({ type: "setPublic", isPublic: !view.isPublic })}
            >
              {view.isPublic ? t("room.makePrivate") : t("room.makePublic")}
            </Button>
            <Button size="sm" variant="danger" onClick={() => void send({ type: "close" })}>
              {t("room.close")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
