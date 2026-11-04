"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { levelForXp } from "@/lib/level-curve";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n, useT } from "@/i18n/client";
import { useS } from "@/i18n/spaces";

const PAGE_SIZE = 25;

interface UserRow {
  id: string;
  user_code: string | null;
  display_name: string;
  xp: number | null;
  created_at: string;
}

interface LedgerEntry {
  event_key: string;
  amount: number;
  reason: string;
  created_at: string;
}

interface AdminNote {
  id: string;
  note: string;
  author_id: string;
  created_at: string;
}

interface DetailData {
  ledger: LedgerEntry[];
  badgesCount: number;
  notes: AdminNote[];
}

function sanitizeFilter(value: string): string {
  return value.replace(/[,()%]/g, "").trim();
}

/** User management: real profiles only (sample seeds excluded), search,
 * pagination and a detail view with gamification, XP history and notes. */
export function AdminUsers() {
  const t = useT();
  const s = useS();
  const { formatTag } = useI18n();
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(false);

  const [selected, setSelected] = useState<UserRow | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setError(false);
    const from = page * PAGE_SIZE;
    let q = getSupabase()
      .from("profiles")
      .select("id,user_code,display_name,xp,created_at", { count: "exact" })
      .eq("is_sample", false);
    const clean = sanitizeFilter(appliedQuery);
    if (clean) q = q.or(`display_name.ilike.%${clean}%,user_code.ilike.%${clean}%`);
    const { data, count, error: fetchError } = await q
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (fetchError) {
      setError(true);
      setRows([]);
      setTotal(0);
      return;
    }
    setRows((data ?? []) as UserRow[]);
    setTotal(count ?? 0);
  }, [page, appliedQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount/page change into component state (same pattern as lib/gamification)
    void load();
  }, [load]);

  // Debounce the search box into the applied filter.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setPage(0);
      setAppliedQuery(query);
    }, 350);
    return () => window.clearTimeout(id);
  }, [query]);

  const loadDetail = useCallback(async (user: UserRow) => {
    setDetailLoading(true);
    setDetail(null);
    const supabase = getSupabase();
    const [ledgerRes, badgesRes, notesRes] = await Promise.allSettled([
      supabase.rpc("admin_user_ledger", { p_user: user.id, p_limit: 100 }),
      supabase.rpc("admin_user_badges", { p_user: user.id }),
      supabase.rpc("admin_user_notes_list", { p_user: user.id }),
    ]);
    setDetail({
      ledger:
        ledgerRes.status === "fulfilled" && !ledgerRes.value.error
          ? ((ledgerRes.value.data ?? []) as LedgerEntry[])
          : [],
      badgesCount:
        badgesRes.status === "fulfilled" && !badgesRes.value.error
          ? Number((badgesRes.value.data as { count?: number })?.count ?? 0)
          : 0,
      notes:
        notesRes.status === "fulfilled" && !notesRes.value.error
          ? ((notesRes.value.data ?? []) as AdminNote[])
          : [],
    });
    setDetailLoading(false);
  }, []);

  async function addNote() {
    if (!selected || !noteDraft.trim()) return;
    setNoteBusy(true);
    const { error } = await getSupabase().rpc("admin_user_note_add", {
      p_user: selected.id,
      p_note: noteDraft.trim(),
    });
    setNoteBusy(false);
    if (error) return;
    setNoteDraft("");
    await loadDetail(selected);
  }

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(formatTag, { dateStyle: "medium" }),
    [formatTag],
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          title={t("admin.users.title")}
          description={t("admin.users.desc", { count: total })}
          action={
            <div className="w-56">
              <SearchInput
                label={t("admin.users.search")}
                placeholder={t("admin.users.search")}
                value={query}
                onChange={setQuery}
              />
            </div>
          }
        />
        <CardBody className="p-0">
          {error ? (
            <p className="p-5 text-sm font-medium text-red-800">{t("admin.stats.error")}</p>
          ) : rows === null ? (
            <div className="space-y-2 p-5" aria-busy="true">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-cova-pale" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-5 text-sm text-cova-mute">{t("admin.users.empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-cova-line bg-cova-bg text-start text-cova-mute">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("admin.users.student")}</th>
                  <th scope="col" className="hidden px-4 py-3 text-start font-medium sm:table-cell">{t("admin.users.code")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{s("lb.level")}</th>
                  <th scope="col" className="hidden px-4 py-3 text-end font-medium sm:table-cell">{s("lb.xp")}</th>
                  <th scope="col" className="hidden px-4 py-3 text-end font-medium md:table-cell">{t("admin.users.created")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cova-line">
                {rows.map((row) => {
                  const level = levelForXp(row.xp ?? 0);
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-cova-pale/40"
                      onClick={() => {
                        setSelected(row);
                        void loadDetail(row);
                      }}
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar name={row.display_name} size="sm" />
                          <span className="font-medium text-cova-ink">{row.display_name}</span>
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 font-mono text-xs text-cova-mute sm:table-cell">
                        {row.user_code ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-cova-mute">
                        {level.name} · {level.level}
                      </td>
                      <td className="hidden px-4 py-3 text-end font-medium tabular-nums sm:table-cell">
                        {(row.xp ?? 0).toLocaleString(formatTag)}
                      </td>
                      <td className="hidden px-4 py-3 text-end text-cova-mute md:table-cell">
                        {dateFormatter.format(new Date(row.created_at))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
        {rows !== null && rows.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-cova-line px-4 py-3 text-sm">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("admin.users.prev")}
            </Button>
            <span className="text-cova-mute">
              {t("admin.users.page", { page: page + 1, pages: pageCount })}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("admin.users.next")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </Card>

      {/* detail modal */}
      <Modal
        open={selected !== null}
        onClose={() => {
          setSelected(null);
          setDetail(null);
          setNoteDraft("");
        }}
        title={selected?.display_name ?? ""}
        description={selected?.user_code ?? undefined}
      >
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-cova-ink">{t("admin.users.account")}</h3>
            {selected && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-cova-mute">{s("lb.xp")}</dt>
                <dd className="text-end font-medium tabular-nums">{(selected.xp ?? 0).toLocaleString(formatTag)}</dd>
                <dt className="text-cova-mute">{s("lb.level")}</dt>
                <dd className="text-end font-medium">
                  {levelForXp(selected.xp ?? 0).name} · {levelForXp(selected.xp ?? 0).level}
                </dd>
                <dt className="text-cova-mute">{t("admin.users.created")}</dt>
                <dd className="text-end font-medium">{dateFormatter.format(new Date(selected.created_at))}</dd>
                <dt className="text-cova-mute">{t("admin.users.badges")}</dt>
                <dd className="text-end font-medium">{detail?.badgesCount ?? "…"}</dd>
              </dl>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-cova-ink">{t("admin.users.xpHistory")}</h3>
            {detailLoading ? (
              <p className="text-sm text-cova-mute">{t("admin.gate.checking")}</p>
            ) : (detail?.ledger.length ?? 0) === 0 ? (
              <p className="text-sm text-cova-mute">{t("admin.users.noHistory")}</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {detail?.ledger.map((entry) => (
                  <li key={entry.event_key} className="flex items-center justify-between gap-3 border-b border-cova-line py-1.5">
                    <span className="min-w-0 truncate text-cova-mute">
                      {entry.reason || entry.event_key}
                      <span className="ms-2 text-xs">{dateFormatter.format(new Date(entry.created_at))}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">+{entry.amount}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-cova-ink">{t("admin.users.notes")}</h3>
            {detailLoading ? (
              <p className="text-sm text-cova-mute">{t("admin.gate.checking")}</p>
            ) : (detail?.notes.length ?? 0) === 0 ? (
              <p className="text-sm text-cova-mute">{t("admin.users.notesEmpty")}</p>
            ) : (
              <ul className="max-h-36 space-y-2 overflow-y-auto text-sm">
                {detail?.notes.map((note) => (
                  <li key={note.id} className="rounded-lg border border-cova-line bg-cova-bg px-3 py-2">
                    <p className="text-cova-ink">{note.note}</p>
                    <p className="mt-0.5 text-xs text-cova-mute">
                      {dateFormatter.format(new Date(note.created_at))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-end gap-2">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder={t("admin.users.notePlaceholder")}
                aria-label={t("admin.users.notes")}
                className="min-h-10 w-full rounded-lg border border-cova-line bg-white px-3 py-2 text-sm text-cova-ink placeholder:text-cova-mute"
              />
              <Button
                onClick={() => void addNote()}
                disabled={noteBusy || !noteDraft.trim()}
                aria-label={t("admin.users.noteAdd")}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </section>
        </div>
      </Modal>
    </div>
  );
}
