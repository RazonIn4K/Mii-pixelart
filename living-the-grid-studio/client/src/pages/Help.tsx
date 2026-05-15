/**
 * Help page for trust-first support flow.
 *
 * This route separates security-sensitive guidance from monetization surfaces and
 * keeps sensitive guidance UI light on promotional elements.
 */

import { Link } from "wouter";
import { AlertTriangle, BookOpen, Download, ShieldCheck } from "lucide-react";

const HELP_STEPS = [
  "If you have a real password concern, stop reuse immediately and rotate the affected credentials first.",
  "Enable 2FA on the highest-value accounts before doing other cleanup tasks.",
  "Review account recovery options and backup codes from least to most critical first.",
  "Run a full sign-in audit for sessions, API keys, and connected apps.",
  "If this is a live data exposure, use breach-aware language in public posts and avoid sharing sensitive evidence publicly.",
];

export default function Help() {
  return (
    <div className="min-h-screen">
      <section className="pt-14">
        <div className="container py-12 lg:py-20">
          <p className="section-header mb-3">Account safety help</p>
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-foreground">
            Tomodachi incident support
          </h1>
          <p className="mt-4 text-muted-foreground max-w-2xl">
            A calm, practical path for users coming from breach notices or trust
            alerts. This route is intentionally light on promotions.
          </p>
        </div>
      </section>

      <section className="pb-12">
        <div className="container grid lg:grid-cols-2 gap-6">
          <article className="rounded-sm border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold mb-4">
              <ShieldCheck className="h-4 w-4 text-primary" />
              24-hour priority checklist
            </div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {HELP_STEPS.map((step) => (
                <li
                  key={step}
                  className="flex items-start gap-2 text-muted-foreground"
                >
                  <span className="mt-1 h-1 w-1 rounded-full bg-primary" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-sm border border-border bg-card p-5">
            <p className="text-sm font-semibold">Where to go next</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Try the browser-only tools and AI assistant on the homepage if you
              need a generated recovery sequence.
            </p>
            <div className="mt-4 space-y-2">
              <Link href="/" className="inline-flex items-center text-xs underline underline-offset-2">
                <AlertTriangle className="h-4 w-4 mr-1" /> Open breach recovery tools
              </Link>
              <br />
              <Link href="/studio" className="inline-flex items-center text-xs underline underline-offset-2">
                <Download className="h-4 w-4 mr-1" /> Open studio
              </Link>
              <br />
              <Link href="/privacy" className="inline-flex items-center text-xs underline underline-offset-2">
                <BookOpen className="h-4 w-4 mr-1" /> Read privacy policy
              </Link>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
