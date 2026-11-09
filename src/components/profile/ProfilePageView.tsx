"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Flag,
  GraduationCap,
  Layers,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";

import { BadgeMarquee } from "@/components/profile/BadgeMarquee";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useT } from "@/i18n/client";
import { levelForXp } from "@/lib/level-curve";
import {
  ALIGN_CLASS,
  COVER_PRESET_CLASS,
  FONT_STACKS,
  WEIGHT_CLASS,
  marqueeBackground,
  marqueeTextColor,
  nameOnCover,
  type Appearance,
} from "@/lib/appearance";
import type {
  EarnedBadge,
  GoalItem,
  JourneyEvent,
  LearningStats,
  PortfolioSkillRow,
} from "@/lib/profile-data";
import { cn } from "@/lib/utils";

/**
 * The one renderer shared by:
 *  - /u/[code]  (saved, server-filtered data)
 *  - the editor's draft preview (unsaved changes)
 * Sections that the owner keeps private simply do not render for visitors;
 * the owner sees a small "private" note instead, so nothing looks broken.
 */

export interface ProfileRenderModel {
  identity: {
    user_code: string;
    display_name: string;
    headline: string;
    bio: string;
    domain: string;
    prog_languages: string[];
    spoken_languages: string[];
    avatar_url: string | null;
    location: string;
    joined: string;
    xp: number;
  };
  appearance: Appearance;
  visible: Record<string, boolean>;
  isOwner: boolean;
  data: {
    badges?: EarnedBadge[] | null;
    stats?: LearningStats | null;
    subjects?: string[] | null;
    goals?: GoalItem[] | null;
    groups?: { id: string; name: string; category: string }[] | null;
    journey?: JourneyEvent[] | null;
    skills?: PortfolioSkillRow[] | null;
  };
}

const JOURNEY_FILTERS = ["all", "badge", "lesson", "milestone", "certificate"] as const;
type JourneyFilter = (typeof JOURNEY_FILTERS)[number];

function PrivateNote({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-cova-line bg-cova-pale/50 px-3 py-2 text-xs text-cova-mute">
      {label}
    </p>
  );
}

export function ProfilePageView({ model }: { model: ProfileRenderModel }) {
  const t = useT();
  const { identity, appearance, visible, isOwner, data } = model;
  const level = levelForXp(identity.xp ?? 0);
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilter>("all");

  const coverClass =
    appearance.cover_kind === "color" && appearance.cover_color
      ? ""
      : appearance.cover_kind === "image"
        ? ""
        : COVER_PRESET_CLASS[appearance.cover_preset];
  const coverStyle =
    appearance.cover_kind === "color" && appearance.cover_color
      ? { backgroundColor: appearance.cover_color }
      : undefined;
  const nameColor = nameOnCover(appearance);

  const journey = useMemo(() => {
    const events = data.journey ?? [];
    if (journeyFilter === "all") return events;
    return events.filter((event) => event.kind === journeyFilter);
  }, [data.journey, journeyFilter]);

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- header */}
      <Card className="overflow-hidden p-0">
        <div
          className={cn("relative h-32 sm:h-40", coverClass)}
          style={coverStyle}
        >
          {appearance.cover_kind === "image" && appearance.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- cover art is a public storage URL
            <img
              src={appearance.cover_image_url}
              alt=""
              className={cn(
                "h-full w-full object-cover",
                appearance.cover_position === "top" && "object-top",
                appearance.cover_position === "bottom" && "object-bottom",
              )}
            />
          )}
        </div>
        <CardBody className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end">
          <Avatar
            name={identity.display_name || "Student"}
            src={identity.avatar_url}
            size="lg"
            className="h-20 w-20 border-4 border-white shadow-md"
          />
          <div className="min-w-0 flex-1">
            <h1
              className={cn(
                "flex flex-wrap items-center gap-1 text-2xl",
                WEIGHT_CLASS[appearance.name_weight],
                appearance.name_italic && "italic",
              )}
              style={{ color: nameColor, fontFamily: FONT_STACKS[appearance.name_font] }}
            >
              {appearance.name_prefix_emoji && <span aria-hidden="true">{appearance.name_prefix_emoji}</span>}
              <span>{identity.display_name || "Student"}</span>
              {appearance.name_suffix_emoji && <span aria-hidden="true">{appearance.name_suffix_emoji}</span>}
            </h1>
            <p
              className={cn("mt-0.5 text-sm", ALIGN_CLASS[appearance.bio_align])}
              style={{
                color: appearance.bio_color ?? undefined,
                fontFamily: FONT_STACKS[appearance.bio_font],
              }}
            >
              {identity.headline || identity.user_code}
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cova-mute">
              <li className="flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                {identity.domain || identity.user_code}
              </li>
              {identity.location && (
                <li className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {identity.location}
                </li>
              )}
              <li className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {t("profile.joinedOn", {
                  date: identity.joined ? new Date(identity.joined).toLocaleDateString() : "—",
                })}
              </li>
            </ul>
          </div>
          {visible.portfolio && (
            <Link
              href={`/u/${identity.user_code}/portfolio`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-cova-line px-4 text-sm font-medium hover:bg-cova-pale"
            >
              <Layers className="h-4 w-4" aria-hidden="true" /> {t("profile.viewPortfolio")}
            </Link>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------------ XP + badges */}
      {visible.xp && (
        <Card>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-cova-mute">{t("profile.level", { level: level.level })}</p>
              <p className="text-2xl font-semibold">{(identity.xp ?? 0).toLocaleString()} XP</p>
            </div>
            <div className="w-full sm:max-w-xs">
              <div className="flex items-baseline justify-between text-xs text-cova-mute">
                <span>{t("profile.progressToNext")}</span>
                <span>
                  {level.into}/{level.needed}
                </span>
              </div>
              <ProgressBar
                value={level.into}
                max={level.needed}
                label={t("profile.level", { level: level.level })}
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-cova-mute">
                {t("profile.xpToNext", { xp: Math.max(0, level.needed - level.into) })}
              </p>
            </div>
          </CardBody>
        </Card>
      )}
      {!visible.xp && isOwner && <PrivateNote label={t("profile.hidden.xp")} />}

      {visible.badges &&
        (data.badges === null ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : (
          <BadgeMarquee
            badges={data.badges ?? []}
            className={marqueeBackground(appearance)}
            style={{
              backgroundColor:
                appearance.marquee_kind === "color" && appearance.marquee_color
                  ? appearance.marquee_color
                  : undefined,
              ...(appearance.marquee_border !== "none" && appearance.marquee_border_color
                ? appearance.marquee_border === "glow"
                  ? { boxShadow: `0 0 0 2px ${appearance.marquee_border_color}` }
                  : {
                      borderStyle: appearance.marquee_border === "dashed" ? "dashed" : "solid",
                      borderColor: appearance.marquee_border_color,
                    }
                : {}),
            }}
            textStyle={{ color: marqueeTextColor(appearance) }}
          />
        ))}

      {/* ----------------------------------------------------------- stats */}
      {visible.stats &&
        (data.stats === null ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (
          <Card>
            <CardHeader title={t("profile.sections.stats")} />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: t("profile.stats.lessons"), value: data.stats?.lessons_completed ?? 0 },
                  { label: t("profile.stats.coursesDone"), value: data.stats?.courses_completed ?? 0 },
                  { label: t("profile.stats.quizzes"), value: data.stats?.quizzes_finished ?? 0 },
                  { label: t("profile.stats.minutes"), value: data.stats?.minutes_estimated ?? 0 },
                  { label: t("profile.stats.streak"), value: data.stats?.streak_days ?? 0 },
                  { label: t("profile.stats.badges"), value: data.stats?.badges_count ?? 0 },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs text-cova-mute">{item.label}</dt>
                    <dd className="text-xl font-semibold">{Number(item.value ?? 0).toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[11px] text-cova-mute">{t("profile.stats.sourceNote")}</p>
            </CardBody>
          </Card>
        ))}
      {!visible.stats && isOwner && <PrivateNote label={t("profile.hidden.stats")} />}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------- subjects */}
        {visible.subjects &&
          (data.subjects === null ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : (
            <Card>
              <CardHeader title={t("profile.sections.subjects")} />
              <CardBody>
                {(data.subjects ?? []).length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("profile.subjects.empty")}</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {(data.subjects ?? []).map((subject) => (
                      <li key={subject}>
                        <Badge tone="soft">
                          <BookOpen className="me-1 inline h-3 w-3" aria-hidden="true" />
                          {subject}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}

        {/* ---------------------------------------------------------- goals */}
        {visible.goals &&
          (data.goals === null ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : (
            <Card>
              <CardHeader title={t("profile.sections.goals")} />
              <CardBody className="space-y-3">
                {(data.goals ?? []).length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("profile.goals.empty")}</p>
                ) : (
                  (data.goals ?? []).map((goal) => (
                    <div key={goal.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">
                          {goal.status === "achieved" && (
                            <CheckCircle2 className="me-1 inline h-4 w-4 text-emerald-600" aria-hidden="true" />
                          )}
                          {goal.title}
                        </p>
                        <span className="text-xs text-cova-mute">
                          {goal.target_date ? new Date(goal.target_date).toLocaleDateString() : ""}
                        </span>
                      </div>
                      <ProgressBar
                        value={goal.progress}
                        max={100}
                        label={goal.title}
                        className="mt-1"
                      />
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          ))}

        {/* --------------------------------------------------------- groups */}
        {visible.groups &&
          (data.groups === null ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : (
            <Card>
              <CardHeader title={t("profile.sections.groups")} />
              <CardBody>
                {(data.groups ?? []).length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("profile.groups.empty")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(data.groups ?? []).map((group) => (
                      <li key={group.id}>
                        <Link
                          href={`/groups/${group.id}`}
                          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                        >
                          <Users className="h-4 w-4 text-cova-muted" aria-hidden="true" />
                          {group.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}

        {/* --------------------------------------------------------- skills */}
        {visible.skills &&
          (data.skills === null ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : (
            <Card>
              <CardHeader title={t("profile.sections.skills")} />
              <CardBody>
                {(data.skills ?? []).length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("profile.skills.empty")}</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {(data.skills ?? []).map((skill) => (
                      <li key={skill.id}>
                        <Badge tone={skill.verification_status === "cova_verified" ? "soft" : "outline"}>
                          {skill.verification_status === "cova_verified" && (
                            <Sparkles className="me-1 inline h-3 w-3" aria-hidden="true" />
                          )}
                          {skill.name}
                          <span className="ms-1 text-[10px] uppercase tracking-wide opacity-70">
                            {skill.verification_status === "cova_verified"
                              ? t("profile.skills.verified")
                              : t("profile.skills.selfDeclared")}
                          </span>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}

        {/* ---------------------------------------------------- achievements */}
        {visible.achievements &&
          (data.badges === null ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : (
            <Card>
              <CardHeader title={t("profile.sections.achievements")} />
              <CardBody>
                {(data.badges ?? []).filter((badge) => badge.pinned).length === 0 ? (
                  <p className="text-sm text-cova-mute">{t("profile.achievements.empty")}</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {(data.badges ?? [])
                      .filter((badge) => badge.pinned)
                      .map((badge) => (
                        <li key={badge.badge_key}>
                          <Badge tone="soft">
                            <Award className="me-1 inline h-3 w-3" aria-hidden="true" />
                            {badge.name}
                          </Badge>
                        </li>
                      ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}
      </div>

      {/* --------------------------------------------------------- journey */}
      {visible.journey &&
        (data.journey === null ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <Card>
            <CardHeader title={t("profile.sections.journey")} />
            <CardBody className="space-y-3">
              <Tabs
                tabs={JOURNEY_FILTERS}
                value={journeyFilter}
                onChange={setJourneyFilter}
                label={t("profile.sections.journey")}
                labels={{
                  all: t("profile.journey.filterAll"),
                  badge: t("profile.journey.filterBadges"),
                  lesson: t("profile.journey.filterLessons"),
                  milestone: t("profile.journey.filterMilestones"),
                  certificate: t("profile.journey.filterCertificates"),
                }}
              />
              {journey.length === 0 ? (
                <p className="text-sm text-cova-mute">{t("profile.journey.empty")}</p>
              ) : (
                <ol className="space-y-3 border-s-2 border-cova-pale ps-4">
                  {journey.slice(0, 40).map((event, index) => (
                    <li key={`${event.kind}-${event.ref ?? index}`} className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute -start-[21px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-cova-soft"
                      />
                      <p className="text-sm font-medium">
                        {event.kind === "badge" && <Award className="me-1 inline h-4 w-4 text-amber-500" aria-hidden="true" />}
                        {event.kind === "lesson" && <BookOpen className="me-1 inline h-4 w-4 text-sky-600" aria-hidden="true" />}
                        {event.kind === "milestone" && <Flag className="me-1 inline h-4 w-4 text-violet-600" aria-hidden="true" />}
                        {event.kind === "certificate" && <GraduationCap className="me-1 inline h-4 w-4 text-emerald-600" aria-hidden="true" />}
                        {journeyEventLabel(t, event)}
                      </p>
                      <p className="text-xs text-cova-mute">{event.day}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        ))}

      {/* the bio card: customized text styles */}
      {identity.bio && (
        <Card>
          <CardHeader title={t("profile.about")} />
          <CardBody>
            <p
              className={cn("text-sm leading-relaxed", ALIGN_CLASS[appearance.bio_align])}
              style={{
                color: appearance.bio_color ?? undefined,
                fontFamily: FONT_STACKS[appearance.bio_font],
              }}
            >
              {identity.bio}
            </p>
            {(identity.prog_languages ?? []).length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {(identity.prog_languages ?? []).map((lang) => (
                  <li key={lang}>
                    <Badge tone="outline">{lang}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {(identity.spoken_languages ?? []).length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {(identity.spoken_languages ?? []).map((lang) => (
                  <li key={lang}>
                    <Badge tone="soft">{lang}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function journeyEventLabel(
  t: ReturnType<typeof useT>,
  event: JourneyEvent,
): string {
  switch (event.kind) {
    case "joined":
      return t("profile.journey.joined");
    case "badge":
      return t("profile.journey.badgeEarned", { name: event.extra ?? "" });
    case "lesson":
      return t("profile.journey.firstLesson");
    case "milestone":
      return event.extra ?? t("profile.journey.milestone");
    case "certificate":
      return t("profile.journey.certificate", { name: event.extra ?? "" });
    default:
      return event.extra ?? "";
  }
}
