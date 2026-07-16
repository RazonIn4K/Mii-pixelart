import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  BotMessageSquare,
  CheckCircle2,
  Search,
  ShieldCheck,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GoogleSignIn } from "@/components/community/RequireAuth";
import { useAuth } from "@/contexts/AuthContext";
import { OPENROUTER_MODEL_PRESETS, type AiModelPreset } from "@shared/ai";
import { readAiChatResponse } from "@/lib/ai-http";

const BREACH_NOTICE_URL = "https://tomodachishare.com/breach-notice";
const HIBP_PASSWORD_API = "https://api.pwnedpasswords.com/range/";
const DEFAULT_MODEL =
  OPENROUTER_MODEL_PRESETS[0]?.id ?? "google/gemma-4-26b-a4b-it:free";
const RECOVERY_AI_TIMEOUT_MS = 95_000;

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

function pickFirstAvailableModel(presets: AiModelPreset[]): string | null {
  return presets.find((preset) => preset.available !== false)?.id ?? null;
}

export default function RecoveryHub() {
  const { serviceMessage, status: authStatus, user } = useAuth();
  const [incidentPrompt, setIncidentPrompt] = useState("");
  const [incidentPlan, setIncidentPlan] = useState("");
  const [incidentModel, setIncidentModel] = useState<string | null>(
    DEFAULT_MODEL,
  );
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [showIncidentConsent, setShowIncidentConsent] = useState(false);
  const incidentRequestRef = useRef<{
    controller: AbortController;
    timeoutId: number;
  } | null>(null);
  const incidentGenerationRef = useRef(0);
  const incidentConsentAcceptRef = useRef<HTMLButtonElement>(null);
  const passwordRequestRef = useRef<AbortController | null>(null);
  const passwordGenerationRef = useRef(0);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordCheck, setPasswordCheck] = useState<PasswordBreachResult>({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    let canceled = false;

    fetch("/api/ai/models", { signal: AbortSignal.timeout(10_000) })
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

  useEffect(() => {
    setIncidentLoading(false);
    setShowIncidentConsent(false);
    setIncidentPrompt("");
    setIncidentPlan("");
    setIncidentError(null);
    setPasswordInput("");
    setPasswordCheck({ status: "idle", message: "" });
    return () => {
      passwordGenerationRef.current += 1;
      passwordRequestRef.current?.abort();
      passwordRequestRef.current = null;
      const request = incidentRequestRef.current;
      if (!request) return;
      window.clearTimeout(request.timeoutId);
      request.controller.abort();
      incidentRequestRef.current = null;
      incidentGenerationRef.current += 1;
    };
  }, [user?.id]);

  useEffect(() => {
    if (showIncidentConsent) incidentConsentAcceptRef.current?.focus();
  }, [showIncidentConsent]);

  const checkPasswordForBreaches = async () => {
    if (!passwordInput) {
      setPasswordCheck({ status: "error", message: "Type a password first." });
      return;
    }

    passwordGenerationRef.current += 1;
    passwordRequestRef.current?.abort();
    const generation = passwordGenerationRef.current;
    const controller = new AbortController();
    passwordRequestRef.current = controller;

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
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`The breach service returned ${response.status}.`);
      }

      const found = (await response.text())
        .split("\n")
        .map((row) => row.trim())
        .find((row) => row.startsWith(`${suffix}:`));

      if (passwordGenerationRef.current !== generation) return;

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
      if (passwordGenerationRef.current !== generation) return;
      setPasswordCheck({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "The check could not be completed.",
      });
    } finally {
      if (passwordRequestRef.current === controller) {
        passwordRequestRef.current = null;
      }
    }
  };

  const createBreachRecoveryPlan = async () => {
    const prompt = incidentPrompt.trim().slice(0, 2000);
    const model = incidentModel;
    if (!prompt || !user || !model) return;

    setShowIncidentConsent(false);
    setIncidentLoading(true);
    setIncidentError(null);
    setIncidentPlan("");

    const generation = ++incidentGenerationRef.current;
    const controller = new AbortController();
    const activeRequest = {
      controller,
      timeoutId: window.setTimeout(
        () => controller.abort(),
        RECOVERY_AI_TIMEOUT_MS,
      ),
    };
    incidentRequestRef.current = activeRequest;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          currentDocument: null,
          currentGridImage: null,
          messages: [
            {
              role: "user",
              content: `You are a plain-language security assistant. Situation: ${prompt}. Return: 1) next 24-hour actions, 2) account cleanup checklist, 3) password reset order, 4) a short message the user can send, and 5) what not to do. Be concise and practical.`,
            },
          ],
          model,
          purpose: "recovery",
          requestSketch: false,
        }),
      });
      const data = await readAiChatResponse(response);
      if (incidentGenerationRef.current !== generation) return;
      setIncidentPlan(data.reply);
    } catch (error) {
      if (incidentGenerationRef.current !== generation) return;
      setIncidentError(
        controller.signal.aborted
          ? "The recovery-plan request timed out. Your description stayed here so you can try again."
          : error instanceof Error
            ? error.message
            : "The plan could not be created.",
      );
    } finally {
      window.clearTimeout(activeRequest.timeoutId);
      if (incidentRequestRef.current === activeRequest) {
        incidentRequestRef.current = null;
      }
      if (incidentGenerationRef.current === generation) {
        setIncidentLoading(false);
      }
    }
  };

  const requestBreachRecoveryPlan = () => {
    if (!incidentPrompt.trim() || !user || !incidentModel || incidentLoading)
      return;
    setIncidentError(null);
    setShowIncidentConsent(true);
  };

  const cancelBreachRecoveryPlan = () => {
    const request = incidentRequestRef.current;
    if (!request) return;
    incidentGenerationRef.current += 1;
    window.clearTimeout(request.timeoutId);
    request.controller.abort();
    incidentRequestRef.current = null;
    setIncidentLoading(false);
    setIncidentError(
      "Recovery-plan request canceled. Your description is ready to edit or send again.",
    );
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
              <Label
                htmlFor="password-leak-check"
                className="text-xs font-bold"
              >
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
                onClick={requestBreachRecoveryPlan}
                disabled={
                  incidentLoading ||
                  !incidentPrompt.trim() ||
                  !incidentModel ||
                  !user
                }
                className="h-12 w-full rounded-xl bg-[var(--island-blue)] font-bold text-[var(--island-ink)] hover:bg-[var(--island-blue)]/85"
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                {incidentLoading
                  ? "Building your plan…"
                  : user
                    ? "Generate recovery plan"
                    : "Sign in to generate"}
              </Button>
              {incidentLoading ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelBreachRecoveryPlan}
                  className="h-11 w-full rounded-xl font-bold"
                >
                  <Square className="mr-2 h-4 w-4" />
                  Cancel recovery request
                </Button>
              ) : null}
              {!incidentModel ? (
                <p
                  role="status"
                  className="rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900"
                >
                  No free AI recovery model is currently available. The private
                  breach check and recovery guides still work.
                </p>
              ) : null}
              {showIncidentConsent ? (
                <div
                  role="alertdialog"
                  aria-label="Recovery AI processing consent"
                  aria-describedby="recovery-ai-consent-description"
                  className="space-y-3 rounded-xl border border-[var(--island-blue)]/35 bg-sky-50 p-4"
                >
                  <p className="text-xs font-black text-[var(--island-ink)]">
                    Send this description to a third-party AI service?
                  </p>
                  <p
                    id="recovery-ai-consent-description"
                    className="text-xs font-medium leading-5 text-[var(--island-muted-ink)]"
                  >
                    The description is sent through OpenRouter to an external
                    model provider. Do not include passwords, recovery codes,
                    payment details, government IDs, or other secrets. The
                    password breach checker remains separate and never sends the
                    password to AI.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      ref={incidentConsentAcceptRef}
                      onClick={() => void createBreachRecoveryPlan()}
                    >
                      Agree and generate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowIncidentConsent(false)}
                    >
                      Not now
                    </Button>
                  </div>
                </div>
              ) : null}
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
              Want a clearer explanation of the AI plan and its limits?
            </p>
          </div>
          <Link
            href="/ai-plan"
            className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--island-ink)]"
          >
            See the AI Action Plan <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
