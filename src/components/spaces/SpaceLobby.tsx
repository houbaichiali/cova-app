"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Lock, Mic, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs } from "@/components/ui/Tabs";
import { useS } from "@/i18n/spaces";
import { demoActions } from "@/lib/demo-store";
import { api, roomPath, useIdentity, type SpaceKind, type SpaceSummary } from "@/lib/spaces-client";
import { cn } from "@/lib/utils";

/** Landing page for Voicing (kind "voice") and Groups (kind "group"): create, join by code, search. */
export function SpaceLobby({ kind }: { kind: SpaceKind }) {
  const t = useS();
  const router = useRouter();
  const { uid, ready } = useIdentity();
  const isVoice = kind === "voice";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<SpaceSummary[]>([]);

  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const load = async () => {
      const qs = new URLSearchParams({ kind, q: query });
      if (mine) qs.set("mine", uid);
      const r = await api<{ spaces?: SpaceSummary[] }>(`/api/spaces?${qs}`).catch(() => null);
      if (!stop && r?.ok) setList(r.data.spaces ?? []);
    };
    void load();
    const id = window.setInterval(load, 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [kind, query, mine, uid, ready]);

  const create = async () => {
    setError("");
    if (name.trim().length < 2) return setError(t("lobby.errName"));
    setBusy(true);
    const r = await api<{ space?: SpaceSummary }>("/api/spaces", {
      method: "POST",
      body: JSON.stringify({ kind, name, description, isPublic, uid }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok || !r.data.space) return setError(t("lobby.errServer"));
    demoActions.addHostedSpace();
    router.push(roomPath(kind, r.data.space.code));
  };

  const joinByCode = () => {
    // Accepts a bare code or a pasted link.
    const last = code.trim().split("/").filter(Boolean).pop() ?? "";
    const clean = last.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length < 4) return setError(t("lobby.errCode"));
    router.push(roomPath(kind, clean));
  };

  const tabPublic = t("lobby.browse");
  const tabMine = t("lobby.mine");
  const Icon = isVoice ? Mic : UsersRound;

  return (
    <>
      <PageHeader
        title={isVoice ? t("v.title") : t("g.title")}
        description={isVoice ? t("v.desc") : t("g.desc")}
      />

      <div className="mb-8 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-base font-semibold">
              {isVoice ? t("lobby.createVoice") : t("lobby.createGroup")}
            </h2>
            <label className="block text-sm font-medium">
              {t("lobby.name")}
              <input
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-cova-line px-3 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              {t("lobby.description")}
              <input
                value={description}
                maxLength={200}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-cova-line px-3 text-sm"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[true, false].map((pub) => (
                <button
                  key={String(pub)}
                  type="button"
                  aria-pressed={isPublic === pub}
                  onClick={() => setIsPublic(pub)}
                  className={cn(
                    "rounded-lg border p-3 text-start",
                    isPublic === pub
                      ? "border-cova-ink bg-cova-pale"
                      : "border-cova-line hover:bg-cova-bg",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {pub ? (
                      <Globe className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Lock className="h-4 w-4" aria-hidden="true" />
                    )}
                    {pub ? t("lobby.public") : t("lobby.private")}
                  </span>
                  <span className="mt-1 block text-xs text-cova-mute">
                    {pub ? t("lobby.publicHint") : t("lobby.privateHint")}
                  </span>
                </button>
              ))}
            </div>
            <Button disabled={busy || !ready} onClick={() => void create()}>
              {t("lobby.submit")}
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-base font-semibold">{t("lobby.joinByCode")}</h2>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinByCode()}
              placeholder={t("lobby.codePlaceholder")}
              aria-label={t("lobby.joinByCode")}
              className="h-10 w-full rounded-lg border border-cova-line px-3 font-mono text-sm uppercase"
            />
            <Button variant="secondary" className="w-full" onClick={joinByCode}>
              {t("lobby.join")}
            </Button>
          </CardBody>
        </Card>
      </div>
      {error && (
        <p className="-mt-4 mb-6 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[tabPublic, tabMine]}
          value={mine ? tabMine : tabPublic}
          onChange={(v) => setMine(v === tabMine)}
          label={tabPublic}
        />
        {!mine && (
          <SearchInput
            label={t("lobby.search")}
            placeholder={t("lobby.search")}
            value={query}
            onChange={setQuery}
            className="sm:w-72"
          />
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={t("lobby.none")}
          description={isVoice ? t("v.desc") : t("g.desc")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <Link
              key={s.code}
              href={roomPath(kind, s.code)}
              className="block rounded-xl focus-visible:outline-offset-4"
            >
              <Card className="h-full transition-colors hover:bg-cova-bg">
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-base font-semibold">{s.name}</h3>
                    <Badge tone={s.isPublic ? "pale" : "soft"}>
                      {s.isPublic ? (
                        <Globe className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Lock className="h-3 w-3" aria-hidden="true" />
                      )}
                      {s.isPublic ? t("lobby.public") : t("lobby.private")}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="line-clamp-2 text-sm text-cova-mute">{s.description}</p>
                  )}
                  <p className="text-xs text-cova-mute">
                    {isVoice
                      ? t("lobby.members", { n: s.memberCount })
                      : t("lobby.membersG", { n: s.memberCount })}{" "}
                    · <span className="font-mono">{s.code}</span>
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
