"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Award,
  Briefcase,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileBadge,
  GraduationCap,
  Printer,
  Sparkles,
} from "lucide-react";

import { BadgeMarquee } from "@/components/profile/BadgeMarquee";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import {
  fetchPortfolioOverview,
  type PortfolioImportRow,
  type PortfolioProjectRow,
  type PortfolioSkillRow,
} from "@/lib/profile-data";

/**
 * /u/[code]/portfolio — the hybrid portfolio. Academic and professional
 * presentations share one body of evidence; the mode only reorders/emphasizes.
 * All data comes from the privacy-filtered RPC; document downloads go through
 * time-limited signed URLs gated by the same visibility rules.
 */

type Mode = "academic" | "professional" | "hybrid";

const PROJECT_CATEGORY_KEYS: Record<string, string> = {
  web: "portfolio.category.web",
  mobile: "portfolio.category.mobile",
  data: "portfolio.category.data",
  ai: "portfolio.category.ai",
  design: "portfolio.category.design",
  hardware: "portfolio.category.hardware",
  research: "portfolio.category.research",
  game: "portfolio.category.game",
  other: "portfolio.category.other",
};

const SKILL_CATEGORY_KEYS: Record<string, string> = {
  technical: "portfolio.skillCat.technical",
  design: "portfolio.skillCat.design",
  languages: "portfolio.skillCat.languages",
  business: "portfolio.skillCat.business",
  soft: "portfolio.skillCat.soft",
  other: "portfolio.skillCat.other",
};

const VERIFICATION_LABEL: Record<string, string> = {
  unverified: "portfolio.cert.unverified",
  external_claim: "portfolio.cert.externalClaim",
  cova_issued: "portfolio.cert.covaIssued",
};

const emptyProject: PortfolioProjectRow = {
  id: "",
  title: "",
  short_description: "",
  full_description: "",
  cover_image_url: null,
  gallery: [],
  category: "other",
  project_type: "personal",
  tools: [],
  skills: [],
  project_date: null,
  github_url: null,
  demo_url: null,
  external_url: null,
  contributors: [],
  featured: false,
  status: "published",
  visibility: "public",
  source: "manual",
};

export function PortfolioView({ code }: { code: string }) {
  const t = useT();
  const toast = useToast();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPortfolioOverview>>>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("academic");
  const [project, setProject] = useState<PortfolioProjectRow | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await fetchPortfolioOverview(code);
        if (!active) return;
        setData(result);
        if (result?.settings?.mode) setMode(result.settings.mode as Mode);
      } catch (error) {
        console.error("Unable to load the portfolio:", error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);

  const projects = useMemo(
    () => ((data?.projects ?? []) as PortfolioProjectRow[]),
    [data?.projects],
  );
  const imports = useMemo(
    () => ((data?.imports ?? []) as PortfolioImportRow[]),
    [data?.imports],
  );
  const featured = useMemo(
    () => [...projects.filter((p) => p.featured), ...imports.filter((p) => p.featured)],
    [projects, imports],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data || !data.visible) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <p className="text-sm text-cova-mute">{t("portfolio.private")}</p>
        </CardBody>
      </Card>
    );
  }

  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const owner = (data.owner ?? {}) as Record<string, unknown>;
  const skills = data.skills ?? [];
  const certificates = data.certificates ?? [];
  const journey = data.journey ?? [];
  const badges = data.badges ?? [];

  const skillsByCategory = skills.reduce<Record<string, PortfolioSkillRow[]>>((acc, skill) => {
    (acc[skill.category] ??= []).push(skill);
    return acc;
  }, {});

  async function copyLink() {
    const url = `${window.location.origin}/u/${code}/portfolio`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.push(t("portfolio.linkCopied"));
    setTimeout(() => setCopied(false), 2000);
  }

  const asProject = (item: PortfolioProjectRow | PortfolioImportRow): PortfolioProjectRow =>
    item.id && "full_description" in item
      ? (item as PortfolioProjectRow)
      : {
          ...emptyProject,
          id: item.id,
          title: item.title,
          short_description: "note" in item ? item.note : item.short_description,
          source: "cova",
        };

  return (
    <div className="space-y-6">
      <Link
        href={`/u/${code}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-cova-mute hover:text-cova-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("portfolio.backToProfile")}
      </Link>

      {/* header */}
      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar
            name={String(owner.display_name ?? "Student")}
            src={owner.avatar_url as string | null}
            tone="soft"
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">{String(owner.display_name ?? "")}</h1>
            <p className="text-sm text-cova-mute">{String(owner.headline ?? "")}</p>
            <p className="mt-1 text-xs text-cova-mute">
              {t("portfolio.modeLabel", {
                mode:
                  mode === "academic"
                    ? t("portfolio.mode.academic")
                    : mode === "professional"
                      ? t("portfolio.mode.professional")
                      : t("portfolio.mode.hybrid"),
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copyLink()}>
              {copied ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {t("portfolio.share")}
            </Button>
            <Link href={`/u/${code}/portfolio/print`} className={buttonStyles()}>
              <Printer className="h-4 w-4" aria-hidden="true" /> {t("portfolio.pdf")}
            </Link>
          </div>
        </CardBody>
        {settings.mode === "hybrid" && (
          <CardBody className="border-t border-cova-line pt-3">
            <Tabs
              tabs={["academic", "professional"] as const}
              value={mode === "professional" ? "professional" : "academic"}
              onChange={setMode}
              label={t("portfolio.modeLabel", { mode: "" })}
              labels={{ academic: t("portfolio.mode.academic"), professional: t("portfolio.mode.professional") }}
            />
          </CardBody>
        )}
      </Card>

      {/* about */}
      <Card>
        <CardHeader title={t("portfolio.sections.about")} />
        <CardBody className="space-y-4">
          {settings.about_intro ? (
            <p className="text-sm leading-relaxed">{String(settings.about_intro)}</p>
          ) : (
            <p className="text-sm text-cova-mute">{t("portfolio.about.empty")}</p>
          )}
          {mode === "academic" && Boolean(settings.about_academic) && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cova-mute">
                {t("portfolio.about.academic")}
              </p>
              <p className="text-sm leading-relaxed">{String(settings.about_academic)}</p>
            </div>
          )}
          {(mode === "professional" || mode === "hybrid") && Boolean(settings.about_career) && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cova-mute">
                {t("portfolio.about.career")}
              </p>
              <p className="text-sm leading-relaxed">{String(settings.about_career)}</p>
            </div>
          )}
          {((settings.expertise as string[] | undefined)?.length ?? 0) > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {(settings.expertise as string[]).map((item) => (
                <li key={item}>
                  <Badge tone="soft">{item}</Badge>
                </li>
              ))}
            </ul>
          )}
          {((settings.external_links as { label: string; url: string }[] | undefined)?.length ?? 0) > 0 && (
            <ul className="flex flex-wrap gap-2">
              {(settings.external_links as { label: string; url: string }[]).map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2 hover:opacity-80"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    {link.label || link.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* skills */}
      <Card>
        <CardHeader title={t("portfolio.sections.skills")} />
        <CardBody className="space-y-4">
          {skills.length === 0 ? (
            <p className="text-sm text-cova-mute">{t("portfolio.skills.empty")}</p>
          ) : (
            Object.entries(skillsByCategory).map(([category, rows]) => (
              <div key={category}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-cova-mute">
                  {t((SKILL_CATEGORY_KEYS[category] ?? SKILL_CATEGORY_KEYS.other) as Parameters<typeof t>[0])}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {rows.map((skill) => (
                    <li key={skill.id}>
                      <Badge tone={skill.highlight ? "soft" : "outline"}>
                        {skill.verification_status === "cova_verified" ? (
                          <>
                            <Sparkles className="me-1 inline h-3 w-3" aria-hidden="true" />
                            {skill.name}
                            <span className="ms-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold uppercase text-emerald-800">
                              {t("portfolio.skills.verified")}
                            </span>
                          </>
                        ) : (
                          <>
                            {skill.name}
                            <span className="ms-1 text-[10px] uppercase tracking-wide opacity-60">
                              {t("portfolio.skills.selfDeclared")}
                            </span>
                          </>
                        )}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      {/* badges marquee */}
      {badges.length > 0 && (
        <Card>
          <CardHeader title={t("portfolio.sections.badges")} />
          <CardBody>
            <BadgeMarquee badges={badges} />
          </CardBody>
        </Card>
      )}

      {/* featured */}
      {featured.length > 0 && (
        <Card>
          <CardHeader title={t("portfolio.sections.featured")} />
          <CardBody>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((item) => (
                <PortfolioCard key={item.id} item={item} onOpen={() => setProject(asProject(item))} />
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* projects */}
      <Card>
        <CardHeader
          title={mode === "professional" ? t("portfolio.sections.projectsPro") : t("portfolio.sections.projects")}
          description={t("portfolio.projects.count", { count: projects.length + imports.length })}
        />
        <CardBody>
          {projects.length + imports.length === 0 ? (
            <p className="text-sm text-cova-mute">{t("portfolio.projects.empty")}</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...projects, ...imports]
                .filter((item) => !featured.some((f) => f.id === item.id))
                .map((item) => (
                  <PortfolioCard key={item.id} item={item} onOpen={() => setProject(asProject(item))} />
                ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* certificates */}
      <Card>
        <CardHeader title={t("portfolio.sections.certificates")} />
        <CardBody>
          {certificates.length === 0 ? (
            <p className="text-sm text-cova-mute">{t("portfolio.cert.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {certificates.map((cert) => (
                <li
                  key={cert.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cova-line bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <FileBadge className="h-4 w-4 text-cova-muted" aria-hidden="true" />
                      {cert.title}
                    </p>
                    <p className="text-xs text-cova-mute">
                      {cert.issuer}
                      {cert.issue_date ? ` · ${cert.issue_date}` : ""} ·{" "}
                      {t((VERIFICATION_LABEL[cert.verification_status] ?? VERIFICATION_LABEL.unverified) as Parameters<typeof t>[0])}
                    </p>
                  </div>
                  {cert.file_path && <CertificateActions filePath={cert.file_path} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* journey */}
      {journey.length > 0 && (
        <Card>
          <CardHeader title={t("portfolio.sections.journey")} />
          <CardBody>
            <ol className="space-y-3 border-s-2 border-cova-pale ps-4">
              {journey.slice(0, 30).map((event, index) => (
                <li key={`${event.kind}-${event.ref ?? index}`} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute -start-[21px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-cova-soft"
                  />
                  <p className="text-sm font-medium">
                    {event.kind === "badge" && <Award className="me-1 inline h-4 w-4 text-amber-500" aria-hidden="true" />}
                    {event.kind === "lesson" && <GraduationCap className="me-1 inline h-4 w-4 text-sky-600" aria-hidden="true" />}
                    {event.kind === "milestone" && <Briefcase className="me-1 inline h-4 w-4 text-violet-600" aria-hidden="true" />}
                    {event.kind === "certificate" && <FileBadge className="me-1 inline h-4 w-4 text-emerald-600" aria-hidden="true" />}
                    {event.kind === "joined"
                      ? t("profile.journey.joined")
                      : event.kind === "lesson"
                        ? t("profile.journey.firstLesson")
                        : (event.extra ?? event.kind)}
                  </p>
                  <p className="text-xs text-cova-mute">{event.day}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {/* project detail modal */}
      <Modal
        open={project !== null}
        onClose={() => setProject(null)}
        title={project?.title ?? ""}
        description={
          project
            ? `${t((PROJECT_CATEGORY_KEYS[project.category] ?? PROJECT_CATEGORY_KEYS.other) as Parameters<typeof t>[0])} · ${project.project_type}${
                project.project_date ? ` · ${project.project_date}` : ""
              }`
            : ""
        }
      >
        {project && (
          <div className="space-y-4">
            {project.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- project covers are public storage URLs
              <img src={project.cover_image_url} alt="" className="max-h-64 w-full rounded-lg object-cover" />
            )}
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {project.full_description || project.short_description}
            </p>
            {project.tools.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cova-mute">
                  {t("portfolio.projects.tools")}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {project.tools.map((tool) => (
                    <li key={tool}>
                      <Badge tone="outline">{tool}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {project.skills.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cova-mute">
                  {t("portfolio.projects.skills")}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {project.skills.map((skill) => (
                    <li key={skill}>
                      <Badge tone="soft">{skill}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {project.contributors.length > 0 && (
              <p className="text-xs text-cova-mute">
                {t("portfolio.projects.contributors")}: {project.contributors.join(", ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {project.github_url && (
                <a href={project.github_url} target="_blank" rel="noreferrer noopener" className={buttonStyles({ variant: "secondary" })}>
                  {t("portfolio.projects.github")}
                </a>
              )}
              {project.demo_url && (
                <a href={project.demo_url} target="_blank" rel="noreferrer noopener" className={buttonStyles({ variant: "secondary" })}>
                  {t("portfolio.projects.demo")}
                </a>
              )}
              {project.external_url && (
                <a href={project.external_url} target="_blank" rel="noreferrer noopener" className={buttonStyles({ variant: "secondary" })}>
                  {t("portfolio.projects.external")}
                </a>
              )}
            </div>
            {project.source === "cova" && (
              <p className="rounded-lg bg-cova-pale px-3 py-2 text-xs text-cova-mute">
                {t("portfolio.imports.sourceNote")}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function PortfolioCard({
  item,
  onOpen,
}: {
  item: PortfolioProjectRow | PortfolioImportRow;
  onOpen: () => void;
}) {
  const t = useT();
  const cover = "cover_image_url" in item ? item.cover_image_url : null;
  const type = "project_type" in item ? item.project_type : null;
  const skills = "skills" in item ? item.skills : [];
  const summary = "short_description" in item ? item.short_description : ("note" in item ? item.note : "");
  return (
    <li className="overflow-hidden rounded-xl border border-cova-line bg-white">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- project covers are public storage URLs
        <img src={cover} alt="" className="h-32 w-full object-cover" />
      ) : (
        <div className="flex h-32 items-center justify-center bg-cova-pale">
          <Sparkles className="h-8 w-8 text-cova-muted" aria-hidden="true" />
        </div>
      )}
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-tight">{item.title}</p>
          {"source" in item && item.source === "cova" && (
            <Badge tone="soft">
              <Award className="me-1 inline h-3 w-3" aria-hidden="true" />
              COVA
            </Badge>
          )}
        </div>
        <p className="line-clamp-2 text-xs text-cova-mute">{summary}</p>
        <div className="flex flex-wrap items-center gap-1">
          {type && (
            <span className="rounded-full bg-cova-pale px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cova-mute">
              {type}
            </span>
          )}
          {skills.slice(0, 3).map((skill) => (
            <span key={skill} className="rounded-full bg-cova-pale px-2 py-0.5 text-[10px] text-cova-mute">
              {skill}
            </span>
          ))}
        </div>
        <Button variant="secondary" className="w-full justify-center" onClick={onOpen}>
          {t("portfolio.projects.details")}
        </Button>
      </div>
    </li>
  );
}

function CertificateActions({ filePath }: { filePath: string }) {
  const t = useT();
  const toast = useToast();
  const [opening, setOpening] = useState(false);

  return (
    <Button
      variant="secondary"
      disabled={opening}
      aria-label={t("portfolio.cert.download")}
      onClick={async () => {
        setOpening(true);
        const { data, error } = await getSupabase()
          .storage.from("portfolio-documents")
          .createSignedUrl(filePath, 3600);
        setOpening(false);
        if (error || !data) {
          toast.push(t("portfolio.cert.openError"));
          return;
        }
        window.open(data.signedUrl, "_blank", "noopener");
      }}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
