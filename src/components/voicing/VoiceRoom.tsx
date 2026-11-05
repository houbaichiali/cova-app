"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  DoorClosed,
  Mic,
  MicOff,
  MonitorUp,
  MousePointerClick,
  PhoneOff,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { VoiceCaptions } from "@/components/voicing/VoiceCaptions";
import { JoinGate } from "@/components/spaces/JoinGate";
import { RoomToolbar } from "@/components/spaces/RoomToolbar";
import { AvatarStage } from "@/components/voicing/AvatarStage";
import { CameraStrip } from "@/components/voicing/CameraStrip";
import { ParticipantsPanel } from "@/components/voicing/ParticipantsPanel";
import { ScreenShareOverlay } from "@/components/voicing/ScreenShareOverlay";
import { useRoomRuntime } from "@/components/voicing/RoomRuntime";
import { useCaptionView } from "@/components/voicing/useCaptionView";
import { readSavedAvatar, readSavedSide } from "@/components/voicing/avatars";
import { useS } from "@/i18n/spaces";
import { findLang } from "@/lib/langs";
import { api, type SpaceView } from "@/lib/spaces-client";
import { cn } from "@/lib/utils";

/**
 * Room page. The connection itself lives in RoomRuntimeProvider (app shell),
 * so navigating away keeps the audio running — this component only paints.
 *
 * Visiting another room's page switches straight over (leaving the previous
 * room in the background): public rooms auto-join with the saved identity,
 * private rooms show the request form. No "you are in another room"
 * stop-over dialog — pressing create / join lands in the room immediately.
 */
export function VoiceRoom({ code }: { code: string }) {
  const t = useS();
  const router = useRouter();
  const runtime = useRoomRuntime();
  const { view, notFound, ended } = runtime;
  const [captionsOpen, setCaptionsOpen] = useState(true);
  const [missing, setMissing] = useState(false);
  /** The دبلجة button in the control bar mirrors the captions panel engine. */
  const [dub, setDub] = useState({ on: false, lang: "" });
  const [dubToggleN, setDubToggleN] = useState(0);
  const [dubPick, setDubPick] = useState(false);

  const mine = runtime.code === code;
  const inRoom = mine && runtime.inRoom;
  const uid = runtime.uid;

  const switchRef = useRef<string | null>(null);
  const autoJoinRef = useRef<string | null>(null);

  useEffect(() => {
    if (missing) return;
    if (runtime.code !== code) {
      // Another room (or nothing) is held — switch over, once per code.
      if (switchRef.current === code) return;
      switchRef.current = code;
      void (async () => {
        // Check the target room exists; private rooms go through the form.
        const r = await api<{ space?: SpaceView }>(
          `/api/spaces/${code}?uid=${encodeURIComponent(runtime.uid)}`,
        ).catch(() => null);
        if (!r?.ok || !r.data.space) {
          setMissing(true);
          return;
        }
        const pub = !!r.data.space.isPublic;
        const prefs = {
          name: runtime.name || "Guest",
          avatar: readSavedAvatar(),
          side: readSavedSide(),
        };
        if (runtime.code) await runtime.leave().catch(() => undefined);
        if (pub) autoJoinRef.current = code;
        runtime.enter(code, pub ? prefs : undefined);
      })();
      return;
    }
    // Already on this room: public rooms join themselves with saved prefs.
    if (!ended && view && view.isPublic && view.status === "none" && autoJoinRef.current !== code) {
      autoJoinRef.current = code;
      runtime.enter(code, {
        name: runtime.name || "Guest",
        avatar: readSavedAvatar(),
        side: readSavedSide(),
      });
    }
  }, [code, view, ended, missing, runtime]);

  // Speech bubbles under the characters, in the viewer's chosen language.
  const bubbles = useCaptionView(inRoom && view ? view.captions : [], uid);

  /** Control-bar دبلجة: toggle when a language is picked, else open the panel. */
  const dubClick = () => {
    if (dub.on || dub.lang) {
      setDubToggleN((n) => n + 1);
    } else {
      setDubPick(true);
      setCaptionsOpen(true);
    }
  };
  // The highlight fades by itself so it never lingers.
  useEffect(() => {
    if (!dubPick) return;
    const id = window.setTimeout(() => setDubPick(false), 8000);
    return () => window.clearTimeout(id);
  }, [dubPick]);

  const leave = async () => {
    await runtime.leave();
    router.push("/voicing");
  };

  if (missing) {
    return (
      <EmptyState
        icon={DoorClosed}
        title={t("room.notFound")}
        description={code}
        action={
          <Button
            onClick={() => {
              setMissing(false);
              router.push("/voicing");
            }}
          >
            {t("room.back")}
          </Button>
        }
      />
    );
  }

  if (mine && (notFound || (!view && ended === "closed"))) {
    return (
      <EmptyState
        icon={DoorClosed}
        title={t("room.notFound")}
        description={code}
        action={
          <Button
            onClick={() => {
              void runtime.leave();
              router.push("/voicing");
            }}
          >
            {t("room.back")}
          </Button>
        }
      />
    );
  }
  if (!mine || !view) return null;

  if (!inRoom) {
    return (
      <JoinGate
        view={view}
        ended={ended}
        defaultName={runtime.name}
        onJoin={async (p) => runtime.enter(code, p)}
        onCancel={async () => void (await runtime.send({ type: "cancel" }))}
        onBack={() => router.push("/voicing")}
      />
    );
  }

  const membersName = Object.fromEntries(view.members.map((m) => [m.uid, m.name]));

  /** Remote button: share + open the control code in one press. */
  const remoteClick = () => {
    void (async () => {
      if (!runtime.sharing) await runtime.toggleShare();
      if (runtime.ctl.allowed || runtime.ctl.controlledBy) runtime.ctlActions.disableControl();
      else runtime.ctlActions.enableControl();
    })();
  };

  return (
    <div className="space-y-4">
      <RoomToolbar
        view={view}
        meUid={uid}
        send={runtime.send}
        captionsOpen={captionsOpen}
        onToggleCaptions={() => setCaptionsOpen((v) => !v)}
      />

      {runtime.deafened && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          {t("room.deafenedYou")}
        </p>
      )}

      <ScreenShareOverlay
        members={membersName}
        remoteVideos={runtime.remoteVideos}
        remoteShares={runtime.remoteShares}
        myScreen={runtime.screenStream}
        sharing={runtime.sharing}
        ctl={runtime.ctl}
        ctlActions={runtime.ctlActions}
      />

      <div className="relative">
        <AvatarStage
          className="h-[26rem] rounded-2xl bg-gradient-to-b from-cova-ink to-[#1b2a3a] shadow-lg sm:h-[32rem]"
          meUid={uid}
          getLevel={runtime.getLevel}
          bubbles={bubbles}
          members={view.members.map((m) => ({
            uid: m.uid,
            name: m.name,
            avatar: m.avatar,
            side: m.side,
            role: m.role,
            muted: m.uid === uid ? runtime.muted : m.muted,
            deafened: m.uid === uid ? runtime.deafened : m.deafened,
            joinedAt: m.joinedAt,
          }))}
        />
        {/* Floating camera tiles over the stage (mine + everyone else's).
            Remote tiles render only for peers whose client signaled a live
            camera — the WebRTC m-line itself also carries a placeholder, so
            the ctl "cam" signal is what makes a tile real. */}
        <CameraStrip
          members={membersName}
          remoteCams={Object.fromEntries(
            Object.entries(runtime.remoteCams).filter(([uid]) => runtime.remoteCamFacing[uid]),
          )}
          remoteCamFacing={runtime.remoteCamFacing}
          myCam={runtime.camStream}
          camFacing={runtime.camFacing}
          onFlip={() => void runtime.flipCam()}
          onStop={() => void runtime.toggleCam()}
        />
      </div>

      {/* Bottom control bar: its own strip below the stage — nothing floats
          over the characters any more, and every button has a blue identity:
          outline = idle, solid blue = active, red = stop / leave. */}
      <div
        className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-cova-line bg-white p-2 shadow-sm"
        data-testid="control-bar"
      >
        <Button
          size="lg"
          variant={runtime.micError || runtime.muted ? "danger" : "primary"}
          onClick={() => {
            if (runtime.micError) runtime.retryMic();
            else runtime.toggleMute(!runtime.muted);
          }}
          aria-pressed={runtime.muted}
        >
          {runtime.micError || runtime.muted ? (
            <MicOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Mic className="h-5 w-5" aria-hidden="true" />
          )}
          {runtime.micError
            ? t("room.micRetry")
            : runtime.muted
              ? t("room.unmute")
              : t("room.mute")}
        </Button>
        <Button
          size="lg"
          variant={dub.on ? "primary" : "secondary"}
          className={dub.on ? "" : "border-blue-200 text-blue-800 hover:bg-blue-50"}
          onClick={dubClick}
          aria-pressed={dub.on}
          data-testid="dub-button"
        >
          <AudioLines className="h-5 w-5" aria-hidden="true" />
          {dub.on
            ? `${t("room.dub")} · ${findLang(dub.lang)?.label ?? ""}`
            : t("room.dub")}
        </Button>
        <Button
          size="lg"
          variant={runtime.sharing ? "danger" : "secondary"}
          className={runtime.sharing ? "" : "border-blue-200 text-blue-800 hover:bg-blue-50"}
          onClick={() => void runtime.toggleShare()}
          aria-pressed={runtime.sharing}
        >
          <MonitorUp className="h-5 w-5" aria-hidden="true" />
          {runtime.sharing ? t("room.shareStop") : t("room.share")}
        </Button>
        <Button
          size="lg"
          variant={runtime.camOn ? "primary" : "secondary"}
          className={runtime.camOn ? "" : "border-blue-200 text-blue-800 hover:bg-blue-50"}
          onClick={() => void runtime.toggleCam()}
          aria-pressed={runtime.camOn}
        >
          <Video className="h-5 w-5" aria-hidden="true" />
          {runtime.camOn ? t("room.camStop") : t("room.cam")}
        </Button>
        <Button
          size="lg"
          variant={runtime.ctl.allowed || runtime.ctl.controlledBy ? "primary" : "secondary"}
          className={
            runtime.ctl.allowed || runtime.ctl.controlledBy
              ? ""
              : "border-blue-200 text-blue-800 hover:bg-blue-50"
          }
          onClick={remoteClick}
        >
          <MousePointerClick className="h-5 w-5" aria-hidden="true" />
          {t("room.remote")}
        </Button>
        <Button
          size="lg"
          className="border border-red-600 bg-red-600 text-white hover:bg-red-700"
          onClick={() => void leave()}
        >
          <PhoneOff className="h-5 w-5" aria-hidden="true" />
          {t("room.leave")}
        </Button>
      </div>

      {runtime.micError && (
        <p className="rounded-lg bg-cova-pale px-3 py-2 text-sm" role="status">
          {t("room.micOff")}
        </p>
      )}
      {dubPick && !dub.on && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">
          {t("room.dubPick")}
        </p>
      )}
      {runtime.shareNotice && (
        <p className="rounded-lg bg-cova-pale px-3 py-2 text-sm" role="status">
          {t(runtime.shareNotice as Parameters<typeof t>[0])}
        </p>
      )}

      {/* Always mounted: translation + dubbing keep running when collapsed. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className={cn(!captionsOpen && "hidden")}>
          <VoiceCaptions
            captions={view.captions}
            meUid={uid}
            send={runtime.send}
            expanded={captionsOpen}
            setPeerVolume={runtime.setPeerVolume}
            remoteDubs={runtime.remoteDubs}
            onDubChange={(on, lang) => {
              setDub({ on, lang });
              if (on) setDubPick(false);
              // Broadcast dubbing: tell the room which language it will hear.
              runtime.ctlActions.broadcastDub(on, lang);
            }}
            dubToggleN={dubToggleN}
            dubHighlight={dubPick}
          />
        </div>
        <div className={cn(!captionsOpen && "lg:col-span-2")}>
          <ParticipantsPanel
            view={view}
            meUid={uid}
            deafened={runtime.deafened}
            send={runtime.send}
          />
        </div>
      </div>
    </div>
  );
}
