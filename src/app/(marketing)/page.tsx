import Link from "next/link";
import {
  Award,
  BookOpen,
  Bot,
  ClipboardList,
  Code2,
  MessageSquare,
  Users,
  UsersRound,
  Video,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Avatar } from "@/components/ui/Avatar";
import { getT } from "@/i18n/server";

const features = [
  { icon: Users, key: "f1" },
  { icon: UsersRound, key: "f2" },
  { icon: BookOpen, key: "f3" },
  { icon: ClipboardList, key: "f4" },
  { icon: Code2, key: "f5" },
  { icon: Award, key: "f6" },
] as const;

const steps = ["s1", "s2", "s3"] as const;

const later = [
  { icon: Bot, key: "l1" },
  { icon: Video, key: "l2" },
  { icon: MessageSquare, key: "l3" },
] as const;

export default async function LandingPage() {
  const t = await getT();
  return (
    <>
      <section className="bg-gradient-to-b from-cova-pale/60 to-cova-bg">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <Badge tone="soft">{t("landing.hero.badge")}</Badge>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {t("landing.hero.title")}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-cova-mute">{t("landing.hero.body")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonStyles({ size: "lg" })}>
                {t("landing.hero.cta")}
              </Link>
              <Link
                href="/dashboard"
                className={buttonStyles({ size: "lg", variant: "secondary" })}
              >
                {t("landing.hero.demo")}
              </Link>
            </div>
            <p className="mt-4 text-sm text-cova-mute">{t("landing.hero.note")}</p>
          </div>

          <div className="relative" aria-hidden="true">
            <div className="rounded-2xl border border-cova-line bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">This week</p>
                <Badge>Level 3</Badge>
              </div>
              <ProgressBar value={62} label="Weekly goal" className="mt-3" />
              <p className="mt-2 text-xs text-cova-mute">310 of 500 XP to Level 4</p>

              <div className="mt-5 rounded-xl bg-cova-bg p-4">
                <p className="text-xs text-cova-mute">Next group session</p>
                <p className="mt-1 text-sm font-semibold">Algorithms Study Circle</p>
                <p className="text-sm text-cova-mute">Thursday, 18:00 UTC</p>
                <div className="mt-3 flex -space-x-2">
                  <Avatar name="Amara Okafor" tone="soft" size="sm" className="ring-2 ring-white" />
                  <Avatar name="Priya Nair" tone="pale" size="sm" className="ring-2 ring-white" />
                  <Avatar
                    name="Kenji Tanaka"
                    tone="muted"
                    size="sm"
                    className="ring-2 ring-white"
                  />
                  <Avatar name="Hana Kim" tone="soft" size="sm" className="ring-2 ring-white" />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl border border-cova-line p-4">
                <div>
                  <p className="text-sm font-semibold">Valid brackets</p>
                  <p className="text-xs text-cova-mute">Coding challenge · Medium</p>
                </div>
                <Badge tone="soft">+50 XP</Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">
          {t("landing.features.title")}
        </h2>
        <p className="mt-3 max-w-2xl text-cova-mute">{t("landing.features.body")}</p>
        <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, key }) => (
            <li key={key} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cova-pale">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold">{t(`landing.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-cova-mute">{t(`landing.${key}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="how-it-works" className="scroll-mt-16 border-y border-cova-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">{t("landing.how.title")}</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cova-soft text-sm font-semibold">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{t(`landing.${s}.title`)}</h3>
                <p className="mt-1 text-sm text-cova-mute">{t(`landing.${s}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="roadmap" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">{t("landing.later.title")}</h2>
        <p className="mt-3 max-w-2xl text-cova-mute">{t("landing.later.body")}</p>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {later.map(({ icon: Icon, key }) => (
            <li key={key} className="rounded-xl border border-dashed border-cova-soft bg-white p-5">
              <Icon className="h-5 w-5 text-cova-muted" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">{t(`landing.${key}.title`)}</h3>
              <p className="mt-1 text-sm text-cova-mute">{t(`landing.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-2xl bg-cova-pale px-6 py-12 text-center">
          <h2 className="text-2xl font-semibold">{t("landing.cta.title")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-cova-ink/80">{t("landing.cta.body")}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/register" className={buttonStyles({ size: "lg" })}>
              {t("landing.hero.cta")}
            </Link>
            <Link href="/dashboard" className={buttonStyles({ size: "lg", variant: "secondary" })}>
              {t("landing.cta.open")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
