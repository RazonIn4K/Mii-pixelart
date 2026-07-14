import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const headersSource = readFileSync(
  new URL("../../client/public/_headers", import.meta.url),
  "utf8",
);
const indexSource = readFileSync(
  new URL("../../client/index.html", import.meta.url),
  "utf8",
);
const contentSecurityPolicy = headersSource.match(
  /^\s*Content-Security-Policy:\s*(.+)$/mu,
)?.[1];
const contentSecurityPolicyReportOnly = headersSource.match(
  /^\s*Content-Security-Policy-Report-Only:\s*(.+)$/mu,
)?.[1];

if (!contentSecurityPolicy) {
  throw new Error("The authored Content-Security-Policy header is missing.");
}

test("uses native font stacks without third-party font origins", () => {
  expect(indexSource).not.toContain("fonts.googleapis.com");
  expect(indexSource).not.toContain("fonts.gstatic.com");
  expect(contentSecurityPolicy).toContain("font-src 'self' data:");
  expect(contentSecurityPolicy).not.toContain("fonts.googleapis.com");
  expect(contentSecurityPolicy).not.toContain("fonts.gstatic.com");
  expect(contentSecurityPolicy).not.toContain("https://*.googleapis.com");
  expect(contentSecurityPolicy).not.toContain("https://*.gstatic.com");
});

test("does not ship a report-only policy without a reporting endpoint", () => {
  expect(contentSecurityPolicyReportOnly).toBeUndefined();
});

test("allows the Google OIDC form redirect required by form-action", async ({
  baseURL,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The CSP is viewport-independent; run this browser-policy probe once.",
  );
  const fixtureUrl = new URL("/__test/oauth-csp", baseURL).href;
  const googleAuthorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const formActionViolations: string[] = [];

  page.on("console", (message) => {
    if (message.text().includes("form-action")) {
      formActionViolations.push(message.text());
    }
  });

  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      body: `<!doctype html><html><body><form action="/api/auth/google/start" method="post"><input type="hidden" name="returnTo" value="/me"><button type="submit">Sign in with Google</button></form></body></html>`,
      contentType: "text/html; charset=utf-8",
      headers: { "Content-Security-Policy": contentSecurityPolicy },
      status: 200,
    }),
  );
  await page.route("**/api/auth/google/start", (route) =>
    route.fulfill({
      headers: { Location: googleAuthorizationUrl },
      status: 303,
    }),
  );
  await page.route(`${googleAuthorizationUrl}**`, (route) => route.abort());

  await page.goto(fixtureUrl);
  const [googleRequest] = await Promise.all([
    page.waitForRequest(googleAuthorizationUrl),
    page
      .getByRole("button", { name: "Sign in with Google" })
      .click({ noWaitAfter: true }),
  ]);

  expect(googleRequest.isNavigationRequest()).toBe(true);
  expect(formActionViolations).toEqual([]);
});
