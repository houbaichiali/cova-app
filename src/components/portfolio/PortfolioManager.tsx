"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SelectFilter, TextAreaField, TextField } from "@/components/ui/FormField";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { splitTags } from "@/lib/profile";
import {
  useMyPortfolio,
  useMyProfileWorkspace,
  type PortfolioCertificateRow,
  type PortfolioProjectRow,
} from "@/lib/profile-data";

/**
 * /profile/portfolio — the owner's portfolio editing space (About, Skills,
 * Projects, COVA imports, Certificates). All writes are owner-only RLS rows;
 * document uploads go to the private portfolio-documents bucket.
 */

type ManagerTab = "about" | "skills" | "projects" | "imports" | "certificates";

const CATEGORIES = ["web", "mobile", "data", "ai", "design", "hardware", "research", "game", "other"] as const;
const SKILL_CATEGORIES = ["technical", "design", "languages", "business", "soft", "other"] as const;
const PROJECT_TYPES = ["academic", "personal", "professional"] as const;

const emptyProjectDraft: PortfolioProjectRow = {
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
  status: "draft",
  visibility: "public",
  source: "manual",
};

export function PortfolioManager() {
  const t = useT();
  const workspace = useMyProfileWorkspace();
  const portfolio = useMyPortfolio();
  const [tab, setTab] = useState<ManagerTab>("about");

  if (portfolio.loading || workspace.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-96 rounded-lg" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={["about", "skills", "projects", "imports", "certificates"] as const}
          value={tab}
          onChange={setTab}
          label={t("portfolio.manager.tabs")}
          labels={{
            about: t("portfolio.manager.tabAbout"),
            skills: t("portfolio.manager.tabSkills"),
            projects: t("portfolio.manager.tabProjects"),
            imports: t("portfolio.manager.tabImports"),
            certificates: t("portfolio.manager.tabCertificates"),
          }}
        />
        {workspace.userCode && (
          <Link
            href={`/u/${workspace.userCode}/portfolio`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-cova-line px-4 text-sm font-medium hover:bg-cova-pale"
          >
            <Eye className="h-4 w-4" aria-hidden="true" /> {t("portfolio.manager.viewPublic")}
          </Link>
        )}
      </div>

      {tab === "about" && <AboutTab portfolio={portfolio} />}
      {tab === "skills" && <SkillsTab portfolio={portfolio} />}
      {tab === "projects" && <ProjectsTab portfolio={portfolio} />}
      {tab === "imports" && <ImportsTab portfolio={portfolio} />}
      {tab === "certificates" && <CertificatesTab portfolio={portfolio} />}
    </div>
  );
}

type Portfolio = ReturnType<typeof useMyPortfolio>;

/* --------------------------------------------------------------------- about */

function AboutTab({ portfolio }: { portfolio: Portfolio }) {
  const t = useT();
  const toast = useToast();
  const [draft, setDraft] = useState(portfolio.settings);
  const [saving, setSaving] = useState(false);
  const [expertiseRaw, setExpertiseRaw] = useState((portfolio.settings?.expertise ?? []).join(", "));
  const [links, setLinks] = useState<{ label: string; url: string }[]>(
    portfolio.settings?.external_links ?? [],
  );

  useEffect(() => {
    if (!portfolio.settings) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing editor drafts from the loaded rows
    setDraft({ ...portfolio.settings });
    setLinks(portfolio.settings.external_links ?? []);
  }, [portfolio.settings]);

  if (!draft) return null;

  async function save() {
    if (!draft) return;
    setSaving(true);
    const result = await portfolio.saveSettings({
      ...draft,
      expertise: splitTags(expertiseRaw),
      external_links: links.filter((link) => link.url.trim() !== ""),
    });
    setSaving(false);
    toast.push(result.ok ? t("portfolio.manager.saved") : (result.error ?? ""));
  }

  const pdfSections = ["about", "skills", "projects", "achievements", "journey", "certificates"] as const;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
      <Card>
        <CardHeader title={t("portfolio.about.editor")} />
        <CardBody className="space-y-4">
          <SelectFilter
            id="portfolio-mode"
            label={t("portfolio.about.mode")}
            options={[
              { value: "academic", label: t("portfolio.mode.academic") },
              { value: "professional", label: t("portfolio.mode.professional") },
              { value: "hybrid", label: t("portfolio.mode.hybrid") },
            ]}
            value={draft.mode}
            onChange={(event) => setDraft({ ...draft, mode: event.target.value as typeof draft.mode })}
          />
          <TextAreaField
            id="about-intro"
            label={t("portfolio.about.intro")}
            value={draft.about_intro}
            rows={3}
            maxLength={800}
            onChange={(event) => setDraft({ ...draft, about_intro: event.target.value })}
          />
          <TextAreaField
            id="about-academic"
            label={t("portfolio.about.academic")}
            value={draft.about_academic}
            rows={3}
            maxLength={800}
            onChange={(event) => setDraft({ ...draft, about_academic: event.target.value })}
          />
          <TextAreaField
            id="about-career"
            label={t("portfolio.about.career")}
            value={draft.about_career}
            rows={3}
            maxLength={800}
            onChange={(event) => setDraft({ ...draft, about_career: event.target.value })}
          />
          <TextField
            id="about-expertise"
            label={t("portfolio.about.expertise")}
            value={expertiseRaw}
            onChange={(event) => setExpertiseRaw(event.target.value)}
            placeholder="Python, UX Design…"
            hint={t("profile.tagsHint")}
          />
          <div>
            <p className="mb-1 text-xs font-medium text-cova-mute">{t("portfolio.about.links")}</p>
            {links.map((link, index) => (
              <div key={index} className="mb-2 flex gap-2">
                <input
                  value={link.label}
                  onChange={(event) =>
                    setLinks(links.map((l, i) => (i === index ? { ...l, label: event.target.value } : l)))
                  }
                  placeholder={t("portfolio.about.linkLabel")}
                  aria-label={t("portfolio.about.linkLabel")}
                  className="h-9 w-32 rounded-lg border border-cova-line bg-white px-2 text-sm"
                />
                <input
                  value={link.url}
                  onChange={(event) =>
                    setLinks(links.map((l, i) => (i === index ? { ...l, url: event.target.value } : l)))
                  }
                  placeholder="https://…"
                  aria-label={t("portfolio.about.linkUrl")}
                  className="h-9 flex-1 rounded-lg border border-cova-line bg-white px-2 text-sm"
                />
                <button
                  type="button"
                  aria-label={t("portfolio.about.linkRemove")}
                  onClick={() => setLinks(links.filter((_, i) => i !== index))}
                  className="rounded p-2 text-cova-mute hover:bg-cova-pale"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setLinks([...links, { label: "", url: "" }])}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {t("portfolio.about.linkAdd")}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {t("portfolio.manager.save")}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("portfolio.pdf.title")} description={t("portfolio.pdf.hint")} />
        <CardBody className="space-y-3">
          <p className="text-xs font-medium text-cova-mute">{t("portfolio.pdf.sections")}</p>
          {pdfSections.map((section) => (
            <label key={section} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.pdf_sections.includes(section)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    pdf_sections: event.target.checked
                      ? [...draft.pdf_sections, section]
                      : draft.pdf_sections.filter((s) => s !== section),
                  })
                }
                className="h-4 w-4"
              />
              {t(`portfolio.pdf.section.${section}` as Parameters<typeof t>[0])}
            </label>
          ))}
          <SelectFilter
            id="pdf-template"
            label={t("portfolio.pdf.template")}
            options={[
              { value: "classic", label: t("portfolio.pdf.templateClassic") },
              { value: "modern", label: t("portfolio.pdf.templateModern") },
            ]}
            value={draft.pdf_template}
            onChange={(event) => setDraft({ ...draft, pdf_template: event.target.value as "classic" | "modern" })}
          />
          <Switch
            checked={draft.pdf_photo}
            onChange={(pdf_photo) => setDraft({ ...draft, pdf_photo })}
            label={t("portfolio.pdf.photo")}
          />
          <p className="text-[11px] text-cova-mute">{t("portfolio.pdf.privacyNote")}</p>
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------- skills */

function SkillsTab({ portfolio }: { portfolio: Portfolio }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof SKILL_CATEGORIES)[number]>("technical");

  async function addSkill() {
    const value = name.trim().slice(0, 40);
    if (!value) return;
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from("portfolio_skills").insert({
      user_id: auth.user.id,
      name: value,
      category,
      position: portfolio.skills.length,
    });
    if (error) {
      toast.push(error.message);
      return;
    }
    setName("");
    await portfolio.reload();
  }

  async function removeSkill(id: string) {
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { error } = await supabase.from("portfolio_skills").delete().eq("id", id);
    if (error) {
      toast.push(error.message);
      return;
    }
    await portfolio.reload();
  }

  async function toggleHighlight(id: string, highlight: boolean) {
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { error } = await supabase.from("portfolio_skills").update({ highlight }).eq("id", id);
    if (error) {
      toast.push(error.message);
      return;
    }
    await portfolio.reload();
  }

  return (
    <Card>
      <CardHeader title={t("portfolio.skills.editor")} description={t("portfolio.skills.hint")} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            id="skill-name"
            label={t("portfolio.skills.name")}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addSkill();
              }
            }}
          />
          <SelectFilter
            id="skill-category"
            label={t("portfolio.skills.category")}
            options={SKILL_CATEGORIES.map((value) => ({
              value,
              label: t(`portfolio.skillCat.${value}` as Parameters<typeof t>[0]),
            }))}
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
          />
          <Button onClick={() => void addSkill()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("portfolio.skills.add")}
          </Button>
        </div>
        {portfolio.skills.length === 0 ? (
          <p className="text-sm text-cova-mute">{t("portfolio.skills.emptyEditor")}</p>
        ) : (
          <ul className="space-y-1.5">
            {portfolio.skills.map((skill) => (
              <li
                key={skill.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cova-line bg-white px-3 py-1.5"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {skill.name}
                  {skill.verification_status === "cova_verified" ? (
                    <Badge tone="soft">
                      COVA ✓ {t("portfolio.skills.verified")}
                    </Badge>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-cova-mute">
                      {t("portfolio.skills.selfDeclared")}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("portfolio.skills.highlight")}
                    onClick={() => void toggleHighlight(skill.id, !skill.highlight)}
                    className="rounded p-1.5 hover:bg-cova-pale"
                  >
                    <Star className={`h-4 w-4 ${skill.highlight ? "fill-amber-400 text-amber-400" : "text-cova-mute"}`} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("portfolio.skills.remove")}
                    onClick={() => void removeSkill(skill.id)}
                    className="rounded p-1.5 text-cova-mute hover:bg-cova-pale"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ projects */

function ProjectsTab({ portfolio }: { portfolio: Portfolio }) {
  const t = useT();
  const toast = useToast();
  const [editing, setEditing] = useState<PortfolioProjectRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function persist(project: PortfolioProjectRow) {
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const row = {
      user_id: auth.user.id,
      title: project.title.trim().slice(0, 100),
      short_description: project.short_description.slice(0, 200),
      full_description: project.full_description.slice(0, 4000),
      cover_image_url: project.cover_image_url,
      gallery: project.gallery.slice(0, 8),
      category: project.category,
      project_type: project.project_type,
      tools: project.tools,
      skills: project.skills,
      project_date: project.project_date || null,
      github_url: project.github_url || null,
      demo_url: project.demo_url || null,
      external_url: project.external_url || null,
      contributors: project.contributors,
      featured: project.featured,
      status: project.status,
      visibility: project.visibility,
    };
    const { error } = project.id
      ? await supabase.from("portfolio_projects").update(row).eq("id", project.id)
      : await supabase.from("portfolio_projects").insert(row);
    if (error) {
      toast.push(error.message);
      return;
    }
    setEditing(null);
    await portfolio.reload();
    toast.push(t("portfolio.manager.saved"));
  }

  async function removeProject(id: string) {
    if (!window.confirm(t("portfolio.projects.confirmDelete"))) return;
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { error } = await supabase.from("portfolio_projects").delete().eq("id", id);
    if (error) {
      toast.push(error.message);
      return;
    }
    await portfolio.reload();
  }

  async function quickUpdate(id: string, patch: Partial<PortfolioProjectRow>) {
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { error } = await supabase.from("portfolio_projects").update(patch).eq("id", id);
    if (error) {
      toast.push(error.message);
      return;
    }
    await portfolio.reload();
  }

  async function move(index: number, delta: -1 | 1) {
    const sorted = [...portfolio.projects].sort((a, b) => a.id.localeCompare(b.id));
    void sorted;
    const target = index + delta;
    if (target < 0 || target >= portfolio.projects.length) return;
    const current = portfolio.projects[index];
    const other = portfolio.projects[target];
    if (!current || !other) return;
    await quickUpdate(current.id, { position: target });
    await quickUpdate(other.id, { position: index });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ ...emptyProjectDraft })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {t("portfolio.projects.add")}
        </Button>
      </div>

      {editing && (
        <Card>
          <CardHeader
            title={editing.id ? t("portfolio.projects.editTitle") : t("portfolio.projects.addTitle")}
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="project-title"
                label={t("portfolio.projects.title")}
                value={editing.title}
                maxLength={100}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
              />
              <TextField
                id="project-date"
                label={t("portfolio.projects.date")}
                type="date"
                value={editing.project_date ?? ""}
                onChange={(event) => setEditing({ ...editing, project_date: event.target.value || null })}
              />
            </div>
            <TextField
              id="project-short"
              label={t("portfolio.projects.short")}
              value={editing.short_description}
              maxLength={200}
              onChange={(event) => setEditing({ ...editing, short_description: event.target.value })}
            />
            <TextAreaField
              id="project-full"
              label={t("portfolio.projects.full")}
              value={editing.full_description}
              rows={5}
              maxLength={4000}
              onChange={(event) => setEditing({ ...editing, full_description: event.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectFilter
                id="project-category"
                label={t("portfolio.projects.category")}
                options={CATEGORIES.map((value) => ({ value, label: t(`portfolio.category.${value}` as Parameters<typeof t>[0]) }))}
                value={editing.category}
                onChange={(event) => setEditing({ ...editing, category: event.target.value })}
              />
              <SelectFilter
                id="project-type"
                label={t("portfolio.projects.type")}
                options={PROJECT_TYPES.map((value) => ({ value, label: t(`portfolio.projectType.${value}` as Parameters<typeof t>[0]) }))}
                value={editing.project_type}
                onChange={(event) => setEditing({ ...editing, project_type: event.target.value as typeof editing.project_type })}
              />
              <SelectFilter
                id="project-visibility"
                label={t("portfolio.projects.visibility")}
                options={[
                  { value: "public", label: t("profile.privacy.public") },
                  { value: "friends", label: t("profile.privacy.friends") },
                  { value: "private", label: t("profile.privacy.private") },
                ]}
                value={editing.visibility}
                onChange={(event) => setEditing({ ...editing, visibility: event.target.value as typeof editing.visibility })}
              />
            </div>
            <TextField
              id="project-tools"
              label={t("portfolio.projects.tools")}
              value={editing.tools.join(", ")}
              onChange={(event) => setEditing({ ...editing, tools: splitTags(event.target.value) })}
              hint={t("profile.tagsHint")}
            />
            <TextField
              id="project-skills"
              label={t("portfolio.projects.skills")}
              value={editing.skills.join(", ")}
              onChange={(event) => setEditing({ ...editing, skills: splitTags(event.target.value) })}
              hint={t("profile.tagsHint")}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                id="project-github"
                label={t("portfolio.projects.github")}
                value={editing.github_url ?? ""}
                onChange={(event) => setEditing({ ...editing, github_url: event.target.value || null })}
                placeholder="https://github.com/…"
              />
              <TextField
                id="project-demo"
                label={t("portfolio.projects.demo")}
                value={editing.demo_url ?? ""}
                onChange={(event) => setEditing({ ...editing, demo_url: event.target.value || null })}
                placeholder="https://…"
              />
              <TextField
                id="project-external"
                label={t("portfolio.projects.external")}
                value={editing.external_url ?? ""}
                onChange={(event) => setEditing({ ...editing, external_url: event.target.value || null })}
                placeholder="https://…"
              />
            </div>
            <TextField
              id="project-contributors"
              label={t("portfolio.projects.contributors")}
              value={editing.contributors.join(", ")}
              onChange={(event) => setEditing({ ...editing, contributors: splitTags(event.target.value) })}
              hint={t("profile.tagsHint")}
            />
            <div className="flex items-center gap-4">
              <div>
                <p className="mb-1 text-xs font-medium text-cova-mute">{t("portfolio.projects.cover")}</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setUploading(true);
                    const result = await portfolio.uploadImage(file);
                    setUploading(false);
                    if (result.ok) setEditing({ ...editing, cover_image_url: result.value });
                    else toast.push(result.error);
                  }}
                />
                <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                  {t("portfolio.projects.uploadCover")}
                </Button>
              </div>
              {editing.cover_image_url && (
                // eslint-disable-next-line @next/next/no-img-element -- preview of the uploaded public cover
                <img src={editing.cover_image_url} alt="" className="h-12 w-20 rounded object-cover" />
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => void persist(editing)} disabled={editing.title.trim().length === 0}>
                {t("portfolio.manager.save")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {portfolio.projects.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-cova-mute">{t("portfolio.projects.emptyEditor")}</p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {portfolio.projects.map((project, index) => (
            <li
              key={project.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cova-line bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {project.title}
                  {project.featured && <Star className="ms-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />}
                </p>
                <p className="text-xs text-cova-mute">
                  {project.status} · {project.visibility} · {project.project_type}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="secondary" onClick={() => void quickUpdate(project.id, { status: project.status === "published" ? "draft" : "published" })}>
                  {project.status === "published" ? <><EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> {t("portfolio.projects.unpublish")}</> : <><Eye className="h-3.5 w-3.5" aria-hidden="true" /> {t("portfolio.projects.publish")}</>}
                </Button>
                <button type="button" aria-label={t("portfolio.projects.feature")} onClick={() => void quickUpdate(project.id, { featured: !project.featured })} className="rounded p-1.5 hover:bg-cova-pale">
                  <Star className={`h-4 w-4 ${project.featured ? "fill-amber-400 text-amber-400" : "text-cova-mute"}`} aria-hidden="true" />
                </button>
                <button type="button" aria-label={t("profile.subjects.moveUp")} disabled={index === 0} onClick={() => void move(index, -1)} className="rounded p-1.5 text-cova-mute hover:bg-cova-pale disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label={t("profile.subjects.moveDown")} disabled={index === portfolio.projects.length - 1} onClick={() => void move(index, 1)} className="rounded p-1.5 text-cova-mute hover:bg-cova-pale disabled:opacity-30">
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <Button variant="secondary" onClick={() => setEditing(project)}>
                  {t("common.edit")}
                </Button>
                <button type="button" aria-label={t("portfolio.projects.delete")} onClick={() => void removeProject(project.id)} className="rounded p-1.5 text-cova-mute hover:bg-cova-pale">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- imports */

function ImportsTab({ portfolio }: { portfolio: Portfolio }) {
  const t = useT();
  const toast = useToast();
  const [options, setOptions] = useState<{
    assignments: { source_id: string; title: string; course: string | null; submitted_at: string }[];
    challenges: { source_id: string; title: string; category: string; submitted_at: string }[];
  } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const supabase = (await import("@/lib/supabase/client")).getSupabase();
      const { data } = await supabase.rpc("portfolio_import_options");
      setOptions((data as never) ?? { assignments: [], challenges: [] });
    })();
  }, []);

  async function addImport(sourceKind: "assignment" | "challenge", sourceId: string) {
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from("portfolio_imports").insert({
      user_id: auth.user.id,
      source_kind: sourceKind,
      source_id: sourceId,
      position: portfolio.imports.length,
    });
    if (error) {
      toast.push(error.message);
      return;
    }
    await portfolio.reload();
    toast.push(t("portfolio.manager.saved"));
  }

  async function removeImport(id: string) {
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { error } = await supabase.from("portfolio_imports").delete().eq("id", id);
    if (error) {
      toast.push(error.message);
      return;
    }
    await portfolio.reload();
  }

  async function updateImport(id: string, patch: { featured?: boolean; note?: string; position?: number }) {
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { error } = await supabase.from("portfolio_imports").update(patch).eq("id", id);
    if (error) {
      toast.push(error.message);
      return;
    }
    await portfolio.reload();
  }

  async function swapImports(index: number, target: number) {
    const current = portfolio.imports[index];
    const other = portfolio.imports[target];
    if (!current || !other || target < 0 || target >= portfolio.imports.length) return;
    await updateImport(current.id, { position: target });
    await updateImport(other.id, { position: index });
  }

  const importedIds = new Set(portfolio.imports.map((row) => `${row.source_kind}:${row.source_id}`));

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader title={t("portfolio.imports.available")} description={t("portfolio.imports.hint")} />
        <CardBody className="space-y-4">
          {!options ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : (
            <>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cova-mute">
                  {t("portfolio.imports.assignments")}
                </p>
                {options.assignments.length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("portfolio.imports.none")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {options.assignments.map((option) => (
                      <li key={option.source_id} className="flex items-center justify-between gap-2 rounded-lg border border-cova-line px-3 py-1.5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{option.title}</span>
                          <span className="text-xs text-cova-mute">{option.course ?? ""}</span>
                        </span>
                        <Button
                          variant="secondary"
                          disabled={importedIds.has(`assignment:${option.source_id}`)}
                          onClick={() => void addImport("assignment", option.source_id)}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cova-mute">
                  {t("portfolio.imports.challenges")}
                </p>
                {options.challenges.length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("portfolio.imports.none")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {options.challenges.map((option) => (
                      <li key={option.source_id} className="flex items-center justify-between gap-2 rounded-lg border border-cova-line px-3 py-1.5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{option.title}</span>
                          <span className="text-xs text-cova-mute">{option.category}</span>
                        </span>
                        <Button
                          variant="secondary"
                          disabled={importedIds.has(`challenge:${option.source_id}`)}
                          onClick={() => void addImport("challenge", option.source_id)}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("portfolio.imports.selected")} description={t("portfolio.imports.selectedHint")} />
        <CardBody>
          {portfolio.imports.length === 0 ? (
            <p className="text-sm text-cova-mute">{t("portfolio.imports.emptyEditor")}</p>
          ) : (
            <ul className="space-y-2">
              {portfolio.imports.map((row, index) => (
                <li key={row.id} className="rounded-lg border border-cova-line bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {row.title}
                        {row.featured && <Star className="ms-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />}
                      </span>
                      <span className="text-xs text-cova-mute">
                        {row.source_kind === "assignment" ? t("portfolio.imports.assignments") : t("portfolio.imports.challenges")}
                        {row.date ? ` · ${new Date(row.date).toLocaleDateString()}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <button type="button" aria-label={t("portfolio.projects.feature")} onClick={() => void updateImport(row.id, { featured: !row.featured })} className="rounded p-1.5 hover:bg-cova-pale">
                        <Star className={`h-4 w-4 ${row.featured ? "fill-amber-400 text-amber-400" : "text-cova-mute"}`} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={t("profile.subjects.moveUp")} disabled={index === 0} onClick={() => void swapImports(index, index - 1)} className="rounded p-1.5 text-cova-mute hover:bg-cova-pale disabled:opacity-30">
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={t("profile.subjects.moveDown")} disabled={index === portfolio.imports.length - 1} onClick={() => void swapImports(index, index + 1)} className="rounded p-1.5 text-cova-mute hover:bg-cova-pale disabled:opacity-30">
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={t("portfolio.imports.remove")} onClick={() => void removeImport(row.id)} className="rounded p-1.5 text-cova-mute hover:bg-cova-pale">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                  <input
                    value={noteDrafts[row.id] ?? row.note}
                    onChange={(event) => setNoteDrafts({ ...noteDrafts, [row.id]: event.target.value })}
                    placeholder={t("portfolio.imports.notePlaceholder")}
                    aria-label={t("portfolio.imports.note")}
                    maxLength={500}
                    className="mt-2 h-8 w-full rounded-lg border border-cova-line bg-white px-2 text-xs"
                    onBlur={() => {
                      const note = (noteDrafts[row.id] ?? row.note).slice(0, 500);
                      if (note !== row.note) void updateImport(row.id, { note });
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- certificates */

function CertificatesTab({ portfolio }: { portfolio: Portfolio }) {
  const t = useT();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    kind: "upload" as "upload" | "external",
    title: "",
    issuer: "",
    issue_date: "",
    description: "",
    external_url: "",
    visibility: "public" as "public" | "friends" | "private",
    file_path: null as string | null,
  });

  async function persist() {
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from("portfolio_certificates").insert({
      user_id: auth.user.id,
      kind: form.kind,
      title: form.title.trim().slice(0, 140),
      issuer: form.issuer.trim().slice(0, 120),
      issue_date: form.issue_date || null,
      description: form.description.slice(0, 600),
      external_url: form.kind === "external" && form.external_url ? form.external_url : null,
      file_path: form.kind === "upload" ? form.file_path : null,
      visibility: form.visibility,
    });
    if (error) {
      toast.push(error.message);
      return;
    }
    setAdding(false);
    setForm({ ...form, title: "", issuer: "", issue_date: "", description: "", external_url: "", file_path: null });
    await portfolio.reload();
    toast.push(t("portfolio.manager.saved"));
  }

  async function removeCertificate(id: string) {
    if (!window.confirm(t("portfolio.cert.confirmDelete"))) return;
    const supabase = (await import("@/lib/supabase/client")).getSupabase();
    const { error } = await supabase.from("portfolio_certificates").delete().eq("id", id);
    if (error) {
      toast.push(error.message);
      return;
    }
    await portfolio.reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cova-mute">{t("portfolio.cert.hint")}</p>
        <Button onClick={() => setAdding(!adding)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {t("portfolio.cert.add")}
        </Button>
      </div>

      {adding && (
        <Card>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectFilter
                id="cert-kind"
                label={t("portfolio.cert.kind")}
                options={[
                  { value: "upload", label: t("portfolio.cert.kindUpload") },
                  { value: "external", label: t("portfolio.cert.kindExternal") },
                ]}
                value={form.kind}
                onChange={(event) => setForm({ ...form, kind: event.target.value as typeof form.kind })}
              />
              <SelectFilter
                id="cert-visibility"
                label={t("portfolio.projects.visibility")}
                options={[
                  { value: "public", label: t("profile.privacy.public") },
                  { value: "friends", label: t("profile.privacy.friends") },
                  { value: "private", label: t("profile.privacy.private") },
                ]}
                value={form.visibility}
                onChange={(event) => setForm({ ...form, visibility: event.target.value as typeof form.visibility })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="cert-title"
                label={t("portfolio.cert.title")}
                value={form.title}
                maxLength={140}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <TextField
                id="cert-issuer"
                label={t("portfolio.cert.issuer")}
                value={form.issuer}
                maxLength={120}
                onChange={(event) => setForm({ ...form, issuer: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="cert-date"
                label={t("portfolio.cert.date")}
                type="date"
                value={form.issue_date}
                onChange={(event) => setForm({ ...form, issue_date: event.target.value })}
              />
              {form.kind === "external" ? (
                <TextField
                  id="cert-url"
                  label={t("portfolio.cert.url")}
                  value={form.external_url}
                  onChange={(event) => setForm({ ...form, external_url: event.target.value })}
                  placeholder="https://…"
                />
              ) : (
                <div>
                  <p className="mb-1 text-xs font-medium text-cova-mute">{t("portfolio.cert.file")}</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setUploading(true);
                      const result = await portfolio.uploadDocument(file);
                      setUploading(false);
                      if (result.ok) setForm({ ...form, file_path: result.value });
                      else toast.push(result.error);
                    }}
                  />
                  <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                    {form.file_path ? t("portfolio.cert.fileDone") : t("portfolio.cert.filePick")}
                  </Button>
                </div>
              )}
            </div>
            <TextAreaField
              id="cert-description"
              label={t("portfolio.cert.description")}
              value={form.description}
              rows={2}
              maxLength={600}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <p className="text-[11px] text-cova-mute">{t("portfolio.cert.neverVerified")}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdding(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => void persist()} disabled={form.title.trim().length === 0 || (form.kind === "upload" && !form.file_path)}>
                {t("portfolio.manager.save")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {portfolio.certificates.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-cova-mute">{t("portfolio.cert.emptyEditor")}</p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {portfolio.certificates.map((cert: PortfolioCertificateRow) => (
            <li
              key={cert.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cova-line bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{cert.title}</p>
                <p className="text-xs text-cova-mute">
                  {cert.issuer}
                  {cert.issue_date ? ` · ${cert.issue_date}` : ""} · {cert.visibility} ·{" "}
                  {t(
                    (cert.verification_status === "cova_issued"
                      ? "portfolio.cert.covaIssued"
                      : cert.verification_status === "external_claim"
                        ? "portfolio.cert.externalClaim"
                        : "portfolio.cert.unverified") as Parameters<typeof t>[0],
                  )}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("portfolio.cert.delete")}
                onClick={() => void removeCertificate(cert.id)}
                className="rounded p-1.5 text-cova-mute hover:bg-cova-pale"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
