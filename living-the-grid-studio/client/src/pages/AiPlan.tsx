import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";

const FREE_PLAN_STEPS = [
  "Describe what you are trying to make, improve, or recover from.",
  "Review a short checklist ordered by urgency and effort.",
  "Keep control: AI suggestions never change a project automatically.",
];

const EXPANDED_PLAN_IDEAS = [
  "A saved, account-bound checklist with clear milestones",
  "Canvas-aware recommendations for the current creation",
  "One bounded regeneration plus a downloadable summary",
];

export default function AiPlan() {
  useDocumentTitle(
    "AI Action Plan",
    "Try Tomodachi's free AI action-plan beta for practical, reviewable next steps. No payment or checkout is required.",
    { canonicalPath: "/ai-plan" },
  );
  useStructuredData([
    breadcrumbFor([
      { name: "Home", href: "/" },
      { name: "AI Action Plan", href: "/ai-plan" },
    ]),
  ]);

  return (
    <div className="min-h-screen bg-[var(--island-paper)] text-[var(--island-ink)]">
      <header className="border-b border-[var(--island-ink)]/10 bg-white/75 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-extrabold hover:underline">
            ← Tomodachi
          </Link>
          <span className="rounded-full bg-[var(--island-mint)] px-3 py-1 text-xs font-black">
            Free beta
          </span>
        </div>
      </header>

      <main id="main-content" className="container max-w-5xl py-12 sm:py-16">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--island-blue)] shadow-[6px_6px_0_var(--island-ink)]">
            <Sparkles className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="island-kicker mt-7">AI action plan</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-6xl">
            Useful next steps, without a sales call.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-[var(--island-muted-ink)]">
            Tell Tomodachi what you are trying to make or fix. Get a short,
            reviewable checklist covering what to do first, what can wait, and
            the quickest useful next action.
          </p>
        </section>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-3xl border-2 border-[var(--island-ink)] bg-white p-6 shadow-[8px_8px_0_var(--island-ink)] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--island-ink)]/65">
                  Available now
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                  Free AI plan beta
                </h2>
              </div>
              <span className="rounded-xl bg-[var(--island-mint)] px-3 py-2 text-sm font-black">
                $0
              </span>
            </div>

            <ol className="mt-7 space-y-4">
              {FREE_PLAN_STEPS.map((step, index) => (
                <li
                  key={step}
                  className="flex gap-3 text-sm font-semibold leading-6"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--island-yellow)] text-xs font-black">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <a
              href="/#recovery"
              className="island-button mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-black"
            >
              Build a recovery plan
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link
              href="/studio"
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--island-ink)]/15 bg-[var(--island-paper)] px-5 text-sm font-black hover:border-[var(--island-ink)]/35"
            >
              Get creative advice in Studio
            </Link>
          </Card>

          <Card className="rounded-3xl border border-[var(--island-ink)]/15 bg-[var(--island-yellow-soft)] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <Clock3
                className="h-6 w-6 text-[var(--island-orange)]"
                aria-hidden="true"
              />
              <p className="text-xs font-black uppercase tracking-[0.18em]">
                Product direction
              </p>
            </div>
            <h2 className="mt-4 text-2xl font-black tracking-[-0.035em]">
              Expanded $5 creator plan
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--island-muted-ink)]">
              A one-time expanded plan is being explored, but it is not for sale
              yet. Tomodachi currently accepts no payments and has no checkout.
            </p>
            <ul className="mt-6 space-y-3">
              {EXPANDED_PLAN_IDEAS.map((idea) => (
                <li
                  key={idea}
                  className="flex gap-3 text-sm font-semibold leading-5"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--island-mint-dark)]"
                    aria-hidden="true"
                  />
                  {idea}
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-2xl bg-white/80 p-4 text-xs font-semibold leading-5 text-[var(--island-muted-ink)]">
              No waitlist or payment details are collected. A paid version will
              launch only after account entitlements, refunds, usage limits,
              privacy controls, and fulfillment are tested end to end.
            </p>
          </Card>
        </div>

        <section className="mt-8 rounded-3xl border border-[var(--island-ink)]/10 bg-white/70 p-6 sm:p-8">
          <div className="flex gap-4">
            <ShieldCheck
              className="h-7 w-7 shrink-0 text-[var(--island-mint-dark)]"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-lg font-black">
                Use AI without sharing secrets
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-[var(--island-muted-ink)]">
                Your description is sent through OpenRouter and its selected
                model provider only after you agree. Do not include passwords,
                payment details, recovery codes, government IDs, or other
                secrets. AI output is guidance—not legal, financial, medical, or
                emergency advice.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
