import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  BotMessageSquare,
  CheckCircle2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GoogleSignIn } from "@/components/community/RequireAuth";
import { useAuth } from "@/contexts/AuthContext";
import {
  OPENROUTER_MODEL_PRESETS,
  type AiModelPreset,
} from "@shared/ai";

const BREACH_NOTICE_URL = "https://tomodachishare.com/breach-notice";
const HIBP_PASSWORD_API = "https://api.pwnedpasswords.com/range/";
const DEFAULT_MODEL =
  OPENROUTER_MODEL_PRESETS[0]?.id ?? "google/gemma-4-26b-a4b-it:free";

type PasswordBreachStatus = "idle" | "checking" | "safe" | "found" | "error";

type PasswordBreachResult = {
  status: PasswordBreachStatus;
  message: string;
  count?: number;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** SHA-1 is required by the HIBP Pwned Passwords k-anonymity API. */
async function sha1Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", encoded);
  return bytesToHex(new Uint8Array(hash));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function pickFirstAvailableModel(presets: AiModelPreset[]): string {
  return (
    presets.find((preset) => preset.available !== false)?.id ??
    presets[0]?.id ??
    DEFAULT_MODEL
  );
}

export default function RecoveryHub() {
  const { serviceMessage, status: authStatus, user } = useAuth();
  const [incidentPrompt, setIncidentPrompt] = useState("");
  const [incidentPlan, setIncidentPlan] = useState("");
  const [incidentModel, setIncidentModel] = useState(DEFAULT_MODEL);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordCheck, setPasswordCheck] = useState<PasswordBreachResult>({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    let canceled = false;

    fetch("/api/ai/models")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { presets?: AiModelPreset[] } | null) => {
        if (!canceled && data?.presets?.length) {
          setIncidentModel(pickFirstAvailableModel(data.presets));
        }
      })
      .catch(() => undefined);

    return () => {
      canceled = true;
    };
  }, []);

  const checkPasswordForBreaches = async () => {
    if (!passwordInput) {
      setPasswordCheck({ status: "error", message: "Type a password first." });
      return;
    }

    setPasswordCheck({
      status: "checking",
      message: "Checking a partial hash against known breach data…",
    });

    try {
      const hash = await sha1Hex(passwordInput);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      const response = await fetch(`${HIBP_PASSWORD_API}${prefix}`, {
        headers: { "Add-Padding": "true", Accept: "text/plain" },
      });

      if (!response.ok) {
        throw new Error(`The breach service returned ${response.status}.`);
      }

      const found = (await response.text())
        .split("\n")
        .map((row) => row.trim())
        .find((row) => row.startsWith(`${suffix}:`));

      if (!found) {
        setPasswordCheck({
          status: "safe",
          message:
            "No match was found in the available breach list. Keep using a unique, long passphrase.",
        });
        return;
      }

      const count = Number.parseInt(found.split(":")[1] ?? "0", 10);
      setPasswordCheck({
        status: "found",
        count,
        message: `Found in ${formatNumber(count)} public breach record${count === 1 ? "" : "s"}. Change it anywhere it was used and enable MFA.`,
      });
    } catch (error) {
      setPasswordCheck({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "The check could not be completed.",
      });
    }
  };

  const createBreachRecoveryPlan = async () => {
    const prompt = incidentPrompt.trim().slice(0, 2000);
    if (!prompt || !user) return;

    setIncidentLoading(true);
    setIncidentError(null);
    setIncidentPlan("");

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDocument: null,
          currentGridImage: null,
          messages: [
            {
              role: "user",
              content: `You are a plain-language security assistant. Situation: ${prompt}. Return: 1) next 24-hour actions, 2) account cleanup checklist, 3) password reset order, 4) a short message the user can send, and 5) what not to do. Be concise and practical.`,
            },
          ],
          model: incidentModel,
          requestSketch: false,
          sessionId: "breach-recovery-session",
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        warning?: string;
      };

      if (!response.ok || !data.reply) {
        throw new Error(
          data.warning ?? `The assistant returned ${response.status}.`,
        );
      }

      setIncidentPlan(data.reply);
    } catch (error) {
      setIncidentError(
        error instanceof Error
          ? error.message
          : "The plan could not be created.",
      );
    } finally {
      setIncidentLoading(false);
    }
  };

  return (
    <section id="recovery" className="island-recovery py-20 sm:py-28">
      <div className="container">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--island-mint)] text-[var(--island-ink)] shadow-[5px_5px_0_var(--island-ink)]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <p className="island-kicker">TomodachiShare recovery hub</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.05em] text-[var(--island-ink)] sm:text-5xl">
            Calm help when something goes wrong.
          </h2>
          <p className="mt-5 text-base font-medium leading-7 text-[var(--island-muted-ink)]">
            If you arrived from the{" "}
            <a
              href={BREACH_NOTICE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline decoration-2 underline-offset-4"
            >
              public breach notice
            </a>
            , start here. These tools are intentionally separated from creator
            content and advertising.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <article className="island-tool-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="island-card-number">PRIVATE CHECK</p>
                <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-[var(--island-ink)]">
                  Has this password appeared in a breach?
                </h3>
              </div>
              <Search className="h-6 w-6 shrink-0 text-primary" />
            </div>
            <p className="mt-3 text-sm font-medium leading-6 text-[var(--island-muted-ink)]">
              Your full password never leaves the browser. Only the first five
              characters of its SHA-1 hash are sent to the HIBP range API.
            </p>
            <form
              className="mt-7 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void checkPasswordForBreaches();
              }}
            >
              <Label htmlFor="password-leak-check" className="text-xs font-bold">
                Password to test
              </Label>
              <Input
                id="password-leak-check"
                type="password"
                autoComplete="off"
                placeholder="Do not paste a current critical credential"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                className="h-12 rounded-xl border-[var(--island-ink)]/15 bg-white"
              />
              <Button
                type="submit"
                disabled={passwordCheck.status === "checking"}
                className="island-button h-12 w-full rounded-xl font-bold"
              >
                <Search className="mr-2 h-4 w-4" />
                {passwordCheck.status === "checking"
                  ? "Checking…"
                  : "Check exposure"}
              </Button>
              <p
                aria-live="polite"
                className={`min-h-10 rounded-xl p-3 text-xs font-semibold leading-5 ${passwordCheck.status === "found" || passwordCheck.status === "error" ? "bg-red-50 text-red-800" : passwordCheck.status === "safe" ? "bg-emerald-50 text-emerald-800" : "bg-[var(--island-paper)] text-[var(--island-muted-ink)]"}`}
              >
                {passwordCheck.message ||
                  "Use this as a signal—not proof that a password is safe."}
              </p>
            </form>
          </article>

          <article className="island-tool-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="island-card-number">PLAIN-LANGUAGE PLAN</p>
                <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-[var(--island-ink)]">
                  Build a focused 24-hour recovery plan.
                </h3>
              </div>
              <BotMessageSquare className="h-6 w-6 shrink-0 text-[var(--island-blue)]" />
            </div>
            <p className="mt-3 text-sm font-medium leading-6 text-[var(--island-muted-ink)]">
              Describe the situation without including passwords, payment
              details, recovery codes, or other secrets.
            </p>
            <div className="mt-7 space-y-3">
              <Label htmlFor="breach-situation" className="text-xs font-bold">
                What happened?
              </Label>
              <Textarea
                id="breach-situation"
                rows={4}
                maxLength={2000}
                placeholder="Example: My email appeared in a leak and I reused that password on two accounts…"
                value={incidentPrompt}
                onChange={(event) => setIncidentPrompt(event.target.value)}
                className="rounded-xl border-[var(--island-ink)]/15 bg-white"
              />
              <Button
                onClick={createBreachRecoveryPlan}
                disabled={incidentLoading || !incidentPrompt.trim() || !user}
                className="h-12 w-full rounded-xl bg-[var(--island-blue)] font-bold text-[var(--island-ink)] hover:bg-[var(--island-blue)]/85"
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                {incidentLoading
                  ? "Building your plan…"
                  : user
                    ? "Generate recovery plan"
                    : "Sign in to generate"}
              </Button>
              {!user && authStatus !== "loading" ? (
                serviceMessage ? (
                  <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
                    AI recovery plans are unavailable until the community Worker
                    is connected. The private breach check still works.
                  </p>
                ) : (
                  <div className="flex justify-center rounded-xl bg-[var(--island-paper)] p-3">
                    <GoogleSignIn returnTo="/" />
                  </div>
                )
              ) : null}
              {(incidentError || incidentPlan) && (
                <div
                  aria-live="polite"
                  className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--island-paper)] p-4 text-xs font-medium leading-5 text-[var(--island-ink)]/70"
                >
                  {incidentError ?? incidentPlan}
                </div>
              )}
            </div>
          </article>
        </div>

        <div className="mt-5 flex flex-col items-center justify-between gap-4 rounded-2xl border border-[var(--island-ink)]/10 bg-white/70 p-5 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-[var(--island-mint-dark)]" />
            <p className="text-sm font-semibold text-[var(--island-ink)]/68">
              Need a written checklist or more structured support?
            </p>
          </div>
          <Link
            href="/unlock"
            className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--island-ink)]"
          >
            See recovery guides <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
