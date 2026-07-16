import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
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
  );
  useStructuredData([
    breadcrumbFor([
      { name: "Home", href: "/" },
      { name: "AI Action Plan", href: "/ai-plan" },
    ]),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-medium hover:underline">
            ← Tomodachi
          </Link>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Free beta
          </span>
        </div>
      </header>

      <main id="main-content" className="container max-w-5xl py-12 sm:py-16">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <p className="section-header mt-7">AI action plan</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            Useful next steps, without a sales call.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Tell Tomodachi what you are trying to make or fix. Get a short,
            reviewable checklist covering what to do first, what can wait, and
            the quickest useful next action.
          </p>
        </section>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-border bg-card p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-header">Available now</p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Free AI plan beta
                </h2>
              </div>
              <span className="rounded-sm bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                $0
              </span>
            </div>

            <ol className="mt-7 space-y-4">
              {FREE_PLAN_STEPS.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-6">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Button asChild>
                <a href="/#recovery">
                  Build a recovery plan
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/studio">Get creative advice</Link>
              </Button>
            </div>
          </Card>

          <Card className="border-border bg-muted/60 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <Clock3 className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="section-header">Product direction</p>
            </div>
            <h2 className="mt-4 text-2xl font-semibold">
              Expanded $5 creator plan
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A one-time expanded plan is being explored, but it is not for sale
              yet. Tomodachi currently accepts no payments and has no checkout.
            </p>
            <ul className="mt-6 space-y-3">
              {EXPANDED_PLAN_IDEAS.map((idea) => (
                <li key={idea} className="flex gap-3 text-sm leading-5">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {idea}
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-sm border border-border bg-background p-4 text-xs leading-5 text-muted-foreground">
              No waitlist or payment details are collected. A paid version will
              launch only after account entitlements, refunds, usage limits,
              privacy controls, and fulfillment are tested end to end.
            </p>
          </Card>
        </div>

        <section className="mt-8 flex gap-4 rounded-sm border border-border bg-card p-6 sm:p-8">
          <ShieldCheck
            className="h-6 w-6 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-lg font-semibold">
              Use AI without sharing secrets
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your description is sent through OpenRouter and its selected model
              provider only after you agree. Never include passwords, payment
              details, recovery codes, government IDs, or other secrets. AI
              output is guidance, not professional or emergency advice.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
