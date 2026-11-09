"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Printer } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useT } from "@/i18n/client";
import { levelForXp } from "@/lib/level-curve";
import {
  fetchPortfolioOverview,
  type PortfolioCertificateRow,
  type PortfolioImportRow,
  type PortfolioProjectRow,
  type PortfolioSkillRow,
} from "@/lib/profile-data";

/**
 * Print view = the "Download PDF" feature (browser Save-as-PDF).
 *
 * Privacy: the page renders the SAME privacy-filtered RPC data visitors see,
 * further restricted by the owner's PDF options (sections, photo). Private
 * information is never included by default. The owner is the one who prints
 * their own portfolio; other visitors can print whatever they are allowed
 * to see — nothing more.
 */

export function PortfolioPrint({ code }: { code: string }) {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPortfolioOverview>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await fetchPortfolioOverview(code);
        if (active) setData(result);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data || !data.visible) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardBody className="py-12 text-center">
            <p className="text-sm text-cova-mute">{t("portfolio.private")}</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const owner = (data.owner ?? {}) as Record<string, unknown>;
  const sections = (settings.pdf_sections as string[] | undefined) ?? [
    "about",
    "skills",
    "projects",
    "achievements",
    "journey",
    "certificates",
  ];
  const show = (section: string) => sections.includes(section);
  const modern = settings.pdf_template === "modern";
  const skills = (data.skills ?? []) as PortfolioSkillRow[];
  const projects = (data.projects ?? []) as PortfolioProjectRow[];
  const imports = (data.imports ?? []) as PortfolioImportRow[];
  const certificates = (data.certificates ?? []) as PortfolioCertificateRow[];
  const journey = data.journey ?? [];
  const badges = data.badges ?? [];
  const xp = typeof owner.xp === "number" ? owner.xp : null;
  const level = levelForXp(xp ?? 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/u/${code}/portfolio`} className="inline-flex items-center gap-1.5 text-sm font-medium text-cova-mute hover:text-cova-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("portfolio.backToPortfolio")}
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> {t("portfolio.print.button")}
        </Button>
      </div>

      <article
        className={
          modern
            ? "rounded-xl border border-cova-line bg-white p-8 print:rounded-none print:border-0"
            : "bg-white p-8 print:p-0"
        }
      >
        <header className="flex items-center gap-4 border-b border-cova-line pb-4">
          {settings.pdf_photo !== false && (
            <Avatar
              name={String(owner.display_name ?? "Student")}
              src={owner.avatar_url as string | null}
              tone="soft"
              size="lg"
              className="h-16 w-16"
            />
          )}
          <div>
            <h1 className="text-2xl font-semibold">{String(owner.display_name ?? "")}</h1>
            <p className="text-sm text-cova-mute">{String(owner.headline ?? "")}</p>
            <p className="mt-0.5 text-xs text-cova-mute">
              {String(owner.user_code ?? code)}
              {xp !== null && ` · ${t("profile.level", { level: level.level })} · ${xp.toLocaleString()} XP`}
            </p>
          </div>
        </header>

        {show("about") && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">
              {t("portfolio.print.about")}
            </h2>
            {Boolean(settings.about_intro) && <p className="mt-1 text-sm leading-relaxed">{String(settings.about_intro)}</p>}
            {Boolean(settings.about_academic) && (
              <p className="mt-1 text-sm leading-relaxed">{String(settings.about_academic)}</p>
            )}
            {Boolean(settings.about_career) && (
              <p className="mt-1 text-sm leading-relaxed">{String(settings.about_career)}</p>
            )}
            {((settings.expertise as string[] | undefined)?.length ?? 0) > 0 && (
              <p className="mt-1 text-sm">
                <strong>{t("portfolio.about.expertise")}:</strong>{" "}
                {(settings.expertise as string[]).join(", ")}
              </p>
            )}
          </section>
        )}

        {show("skills") && skills.length > 0 && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">
              {t("portfolio.print.skills")}
            </h2>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <li key={skill.id}>
                  <Badge tone={skill.verification_status === "cova_verified" ? "soft" : "outline"}>
                    {skill.name}
                    {skill.verification_status === "cova_verified" ? " ✓" : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        )}

        {show("projects") && projects.length + imports.length > 0 && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">
              {t("portfolio.print.projects")}
            </h2>
            <ul className="mt-2 space-y-2">
              {[...projects, ...imports].map((project) => (
                <li key={project.id} className="border-b border-cova-line pb-2 last:border-0">
                  <p className="text-sm font-semibold">
                    {project.title}
                    {("project_date" in project) && project.project_date ? ` (${project.project_date})` : ""}
                  </p>
                  <p className="text-sm text-cova-mute">
                    {"short_description" in project ? project.short_description : ("note" in project ? project.note : "")}
                  </p>
                  {("tools" in project && project.tools.length > 0) && (
                    <p className="text-xs text-cova-mute">{(project as PortfolioProjectRow).tools.join(", ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {show("achievements") && badges.length > 0 && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">
              {t("portfolio.print.achievements")}
            </h2>
            <ul className="mt-1 grid grid-cols-2 gap-x-4 text-sm">
              {badges.slice(0, 24).map((badge) => (
                <li key={badge.badge_key} className="flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                  {badge.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {show("journey") && journey.length > 0 && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">
              {t("portfolio.print.journey")}
            </h2>
            <ul className="mt-1 space-y-1 text-sm">
              {journey.slice(0, 20).map((event, index) => (
                <li key={`${event.kind}-${index}`}>
                  <strong>{event.day}</strong>{" "}
                  — {event.kind === "joined" ? t("profile.journey.joined") : (event.extra ?? event.kind)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {show("certificates") && certificates.length > 0 && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cova-mute">
              {t("portfolio.print.certificates")}
            </h2>
            <ul className="mt-1 space-y-1 text-sm">
              {certificates.map((cert) => (
                <li key={cert.id}>
                  <strong>{cert.title}</strong>
                  {cert.issuer ? ` · ${cert.issuer}` : ""}
                  {cert.issue_date ? ` · ${cert.issue_date}` : ""}
                  {cert.verification_status === "cova_issued" ? ` · ${t("portfolio.cert.covaIssued")}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-6 border-t border-cova-line pt-2 text-[10px] text-cova-mute">
          {t("portfolio.print.generatedFrom", { url: `/u/${code}/portfolio` })}
        </footer>
      </article>

      <p className="text-center text-xs text-cova-mute print:hidden">
        {t("portfolio.print.hint")}
      </p>
    </div>
  );
}
