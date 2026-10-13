"use client";

import { useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, Clock, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { SelectFilter } from "@/components/ui/FormField";
import { Tabs } from "@/components/ui/Tabs";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { useToast } from "@/components/ui/Toast";
import { resources } from "@/data/resources";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { matchesQuery, pluralize } from "@/lib/utils";
import type { Resource } from "@/types";

const TABS = ["All resources", "Saved"] as const;
const ALL = "All types";
const types = [ALL, ...Array.from(new Set(resources.map((r) => r.type)))];

export function ResourcesBrowser() {
  const toast = useToast();
  const { bookmarks } = useDemoState();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All resources");
  const [query, setQuery] = useState("");
  const [type, setType] = useState(ALL);
  const [active, setActive] = useState<Resource | null>(null);

  const results = useMemo(
    () =>
      resources.filter(
        (r) =>
          (tab === "All resources" || bookmarks.includes(r.id)) &&
          (type === ALL || r.type === type) &&
          matchesQuery(query, r.title, r.description, r.category),
      ),
    [tab, bookmarks, type, query],
  );

  const toggle = (r: Resource) => {
    const saved = bookmarks.includes(r.id);
    demoActions.toggleBookmark(r.id);
    toast.push(saved ? "Removed from saved" : "Saved to your list");
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          label="Resources view"
          counts={{ Saved: bookmarks.length }}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            label="Search resources"
            placeholder="Search resources"
            value={query}
            onChange={setQuery}
            className="sm:w-64"
          />
          <SelectFilter
            label="Type"
            options={types}
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </div>
      </div>
      <p className="mb-4 text-sm text-cova-mute" aria-live="polite">
        {pluralize(results.length, "resource")} found
      </p>

      {results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={tab === "Saved" ? "Nothing saved yet" : "No resources match your search"}
          description={
            tab === "Saved"
              ? "Save resources to build your own reading list."
              : "Try different keywords or another type."
          }
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setType(ALL);
                setTab("All resources");
              }}
            >
              Show all resources
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((r) => {
            const saved = bookmarks.includes(r.id);
            return (
              <Card key={r.id} className="flex flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="soft">{r.type}</Badge>
                  <button
                    type="button"
                    onClick={() => toggle(r)}
                    aria-pressed={saved}
                    aria-label={saved ? `Remove ${r.title} from saved` : `Save ${r.title}`}
                    className="rounded-lg p-1.5 hover:bg-cova-pale"
                  >
                    {saved ? (
                      <BookmarkCheck className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Bookmark className="h-5 w-5 text-cova-mute" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <h2 className="mt-3 font-semibold">{r.title}</h2>
                <p className="mt-1 line-clamp-3 flex-1 text-sm text-cova-mute">{r.description}</p>
                <p className="mt-4 flex items-center justify-between text-xs text-cova-mute">
                  <span>{r.category}</span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {r.minutes} min
                  </span>
                </p>
                <Button size="sm" variant="secondary" className="mt-4" onClick={() => setActive(r)}>
                  View details
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active?.title ?? ""}
        description={
          active ? `${active.type} · ${active.category} · ${active.minutes} min` : undefined
        }
      >
        {active && (
          <div className="space-y-4">
            <p className="text-sm">{active.description}</p>
            <DemoNotice>
              Demo only: the full resource file is not included. Uploads and downloads need file
              storage on the backend.
            </DemoNotice>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setActive(null)}>
                Close
              </Button>
              <Button onClick={() => toggle(active)}>
                {bookmarks.includes(active.id) ? "Remove from saved" : "Save resource"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
