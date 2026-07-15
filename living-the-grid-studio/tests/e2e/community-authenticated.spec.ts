import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const requestId = "browser-test-request";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lceV8QAAAABJRU5ErkJggg==",
  "base64",
);

function user(overrides: Record<string, unknown> = {}) {
  return {
    avatarSeed: "00000000-0000-4000-8000-000000000001",
    bio: "",
    createdAt: 1_700_000_000_000,
    displayName: "Test Islander",
    id: "00000000-0000-4000-8000-000000000001",
    requiredTermsVersion: "2026-07-14",
    role: "user",
    status: "active",
    termsAccepted: true,
    termsVersion: "2026-07-14",
    username: "test-islander",
    ...overrides,
  };
}

async function fulfillJson(
  route: Route,
  data: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  await route.fulfill({
    body: JSON.stringify(data),
    contentType: "application/json",
    headers,
    status,
  });
}

async function mockSession(
  page: Page,
  currentUser: ReturnType<typeof user> | null,
  communityMutationsEnabled = true,
) {
  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: currentUser
        ? {
            capabilities: { communityMutationsEnabled },
            session: {
              createdAt: Date.now(),
              current: true,
              expiresAt: Date.now() + 86_400_000,
              id: "session-1",
              lastSeenAt: Date.now(),
            },
            user: currentUser,
          }
        : {
            capabilities: { communityMutationsEnabled },
            session: null,
            user: null,
          },
      requestId,
    }),
  );
}

test("read-only mode explains and disables unavailable profile writes", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared deployment-capability contract.",
  );

  await mockSession(
    page,
    user({ displayName: "New Islander", username: null }),
    false,
  );
  await page.goto("/me/setup");

  await expect(page.getByText("Profile changes are paused")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish setup" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Try another avatar" }),
  ).toBeDisabled();

  await page
    .getByRole("button", { name: "Finish profile for New Islander" })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Finish profile" }),
  ).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "ltg.consent.v1",
      JSON.stringify({
        analytics: false,
        decidedAt: new Date().toISOString(),
        decision: "rejected",
        essential: true,
        marketing: false,
      }),
    );
  });
});

test("authenticated header lazy-loads the complete account menu", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared authenticated account menu boundary.",
  );

  let logoutRequested = false;
  await mockSession(page, user({ role: "admin" }));
  await page.route("**/api/auth/logout", async (route) => {
    logoutRequested = true;
    await fulfillJson(route, { data: null, requestId });
  });

  await page.goto("/");
  const accountTrigger = page.getByRole("button", {
    name: /Test Islander/i,
  });
  await expect(accountTrigger).toBeVisible();
  const compactAvatar = accountTrigger.getByRole("img", {
    name: "Test Islander's profile picture",
  });
  await expect(compactAvatar).toBeVisible();
  const avatarBoxes = await compactAvatar.evaluate((element) => {
    const host = element.getBoundingClientRect();
    const graphic = element.querySelector("svg, img")?.getBoundingClientRect();
    return graphic
      ? {
          graphicHeight: graphic.height,
          graphicWidth: graphic.width,
          hostHeight: host.height,
          hostWidth: host.width,
        }
      : null;
  });
  expect(avatarBoxes).toEqual({
    graphicHeight: 32,
    graphicWidth: 32,
    hostHeight: 32,
    hostWidth: 32,
  });
  await accountTrigger.click();

  await expect(page.getByRole("menuitem", { name: /Profile/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Settings/i })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Moderation" }),
  ).toBeVisible();

  await page.getByRole("menuitem", { name: /Sign out/i }).click();
  await expect.poll(() => logoutRequested).toBe(true);
  await expect(
    page.getByRole("button", { name: "Sign in with Google" }),
  ).toBeVisible();
});

test("onboarding stores profile, bio, age attestation, and terms in one request", async ({
  page,
}) => {
  let configured = false;
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: {
        capabilities: { communityMutationsEnabled: true },
        session: {
          createdAt: Date.now(),
          current: true,
          expiresAt: Date.now() + 86_400_000,
          id: "session-1",
          lastSeenAt: Date.now(),
        },
        user: user({
          bio: configured ? "Tiny portraits and paint guides." : "",
          displayName: "New Islander",
          username: configured ? "tiny-islander" : null,
        }),
      },
      requestId,
    }),
  );
  await page.route("**/api/me/setup", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    configured = true;
    await fulfillJson(route, { data: user({ ...submitted }), requestId });
  });
  await page.route("**/api/creations?**", (route) =>
    fulfillJson(route, {
      data: [],
      meta: { nextCursor: null },
      requestId,
    }),
  );

  await page.goto("/me/setup");
  await page.getByLabel("Username").fill("tiny-islander");
  await page.getByLabel("Display name").fill("Tiny Islander");
  await page
    .getByLabel("Bio (optional)")
    .fill("Tiny portraits and paint guides.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/me\/projects$/);
  expect(submitted).toMatchObject({
    acceptsTerms: true,
    bio: "Tiny portraits and paint guides.",
    confirmsAge13OrOlder: true,
    displayName: "Tiny Islander",
    termsVersion: "2026-07-14",
    username: "tiny-islander",
  });
});

test("onboarding can regenerate its avatar without losing unsaved identity fields", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop", "minimum-phone"].includes(testInfo.project.name),
    "Desktop and minimum-phone avatar-regeneration runs cover the layout edges.",
  );

  let avatarSeed = "00000000-0000-4000-8000-000000000001";
  let submitted: Record<string, unknown> | null = null;
  let releaseResponse: (() => void) | null = null;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const currentUser = () =>
    user({
      avatarSeed,
      bio: "",
      displayName: "New Islander",
      username: null,
    });

  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: {
        capabilities: { communityMutationsEnabled: true },
        session: {
          createdAt: Date.now(),
          current: true,
          expiresAt: Date.now() + 86_400_000,
          id: "session-1",
          lastSeenAt: Date.now(),
        },
        user: currentUser(),
      },
      requestId,
    }),
  );
  await page.route("**/api/me", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await responseGate;
    avatarSeed = "00000000-0000-4000-8000-000000000099";
    await fulfillJson(route, { data: currentUser(), requestId });
  });

  await page.goto("/me/setup");
  await page.getByLabel("Username").fill("unsaved-islander");
  await page.getByLabel("Display name").fill("Unsaved Islander");
  await page.getByLabel("Bio (optional)").fill("This draft must stay here.");
  const avatar = page.getByRole("img", {
    name: "Your profile picture",
  });
  const originalAvatar = await avatar.innerHTML();
  await page.getByRole("button", { name: "Try another avatar" }).click();
  await expect.poll(() => submitted).toEqual({ regenerateAvatar: true });
  await expect(
    page.getByRole("button", { name: "Generating…" }),
  ).toBeDisabled();
  expect(releaseResponse).not.toBeNull();
  releaseResponse?.();

  await expect(page.getByText("New avatar generated").first()).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveValue("unsaved-islander");
  await expect(page.getByLabel("Display name")).toHaveValue("Unsaved Islander");
  await expect(page.getByLabel("Bio (optional)")).toHaveValue(
    "This draft must stay here.",
  );
  await expect.poll(() => avatar.innerHTML()).not.toBe(originalAvatar);
});

test("a late avatar response cannot restore the pre-setup account snapshot", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The account-state race is viewport-independent.",
  );

  let avatarRequested = false;
  let releaseAvatar: (() => void) | null = null;
  const avatarGate = new Promise<void>((resolve) => {
    releaseAvatar = resolve;
  });
  const initialUser = user({
    bio: "",
    displayName: "New Islander",
    termsAccepted: false,
    termsVersion: null,
    username: null,
  });

  await mockSession(page, initialUser);
  await page.route("**/api/me", async (route) => {
    avatarRequested = true;
    await avatarGate;
    await fulfillJson(route, {
      data: user({
        avatarSeed: "00000000-0000-4000-8000-000000000099",
        bio: "",
        displayName: "New Islander",
        termsAccepted: false,
        termsVersion: null,
        username: null,
      }),
      requestId,
    });
  });
  await page.route("**/api/me/setup", (route) =>
    fulfillJson(route, {
      data: user({
        bio: "Configured while the avatar was loading.",
        displayName: "Race Islander",
        username: "race-islander",
      }),
      requestId,
    }),
  );
  await page.route("**/api/creations?**", (route) =>
    fulfillJson(route, {
      data: [],
      meta: { nextCursor: null },
      requestId,
    }),
  );

  await page.goto("/me/setup");
  await page.getByRole("button", { name: "Try another avatar" }).click();
  await expect.poll(() => avatarRequested).toBe(true);
  await page.getByLabel("Username").fill("race-islander");
  await page.getByLabel("Display name").fill("Race Islander");
  await page
    .getByLabel("Bio (optional)")
    .fill("Configured while the avatar was loading.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/me\/projects$/);
  await expect(
    page.getByRole("heading", { name: "Your private shelf." }),
  ).toBeVisible();

  expect(releaseAvatar).not.toBeNull();
  releaseAvatar?.();
  await expect(page.getByText("New avatar generated").first()).toBeVisible();
  await expect(page).toHaveURL(/\/me\/projects$/);
  await expect(
    page.getByRole("heading", { name: "Your private shelf." }),
  ).toBeVisible();
});

test("settings regenerates an avatar and exposes recoverable session loading", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop", "minimum-phone"].includes(testInfo.project.name),
    "Desktop and minimum-phone settings-state runs cover the layout edges.",
  );

  let avatarSeed = "00000000-0000-4000-8000-000000000001";
  let avatarRequest: Record<string, unknown> | null = null;
  let sessionLoads = 0;
  let releaseSessionFailure: (() => void) | null = null;
  const sessionFailureGate = new Promise<void>((resolve) => {
    releaseSessionFailure = resolve;
  });
  const currentUser = () => user({ avatarSeed });

  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: {
        capabilities: { communityMutationsEnabled: true },
        session: {
          createdAt: Date.now(),
          current: true,
          expiresAt: Date.now() + 86_400_000,
          id: "session-1",
          lastSeenAt: Date.now(),
        },
        user: currentUser(),
      },
      requestId,
    }),
  );
  await page.route("**/api/me/sessions", async (route) => {
    sessionLoads += 1;
    if (sessionLoads === 1) {
      await sessionFailureGate;
      await fulfillJson(
        route,
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Session service unavailable.",
          },
          requestId,
        },
        503,
      );
      return;
    }
    await fulfillJson(route, {
      data: [
        {
          createdAt: 1_700_000_000_000,
          current: true,
          expiresAt: 1_800_000_000_000,
          id: "session-1",
          lastSeenAt: 1_700_000_000_000,
          userAgentLabel: "Test browser",
        },
      ],
      requestId,
    });
  });
  await page.route("**/api/me", async (route) => {
    avatarRequest = route.request().postDataJSON() as Record<string, unknown>;
    avatarSeed = "00000000-0000-4000-8000-000000000099";
    await fulfillJson(route, { data: currentUser(), requestId });
  });

  await page.goto("/me/settings");
  await expect(page.getByText("Loading active sessions…")).toBeVisible();
  await expect(page.getByText("No active sessions were returned.")).toHaveCount(
    0,
  );
  expect(releaseSessionFailure).not.toBeNull();
  releaseSessionFailure?.();
  await expect(
    page.getByText("Session details could not be loaded."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry session details" }).click();
  await expect(page.getByText(/Test browser.*This device/)).toBeVisible();

  await page.getByLabel("Display name").fill("Unsaved Settings Name");
  await page.getByLabel("Bio").fill("Unsaved settings bio.");
  const avatar = page.getByRole("img", {
    name: "Your profile picture",
  });
  const originalAvatar = await avatar.innerHTML();
  await page.getByRole("button", { name: "Try another avatar" }).click();
  await expect.poll(() => avatarRequest).toEqual({ regenerateAvatar: true });
  await expect(page.getByLabel("Display name")).toHaveValue(
    "Unsaved Settings Name",
  );
  await expect(page.getByLabel("Bio")).toHaveValue("Unsaved settings bio.");
  await expect.poll(() => avatar.innerHTML()).not.toBe(originalAvatar);
});

test("settings uploads, displays, and removes an optional profile photo", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared profile-image ticket and fallback UI.",
  );

  const userId = "00000000-0000-4000-8000-000000000001";
  const imageId = "00000000-0000-4000-8000-000000000077";
  const avatarUrl = `/api/users/${userId}/avatar/${imageId}`;
  const account = user({ avatarUrl: null, id: userId });
  let ticketInput: Record<string, unknown> | null = null;
  let rawUpload: {
    authorization?: string;
    byteSize: number;
    cookie?: string;
    contentType?: string;
  } | null = null;
  let removeRequested = false;

  await mockSession(page, account);
  await page.route("**/api/me/sessions", (route) =>
    fulfillJson(route, { data: [], requestId }),
  );
  await page.route("**/api/me/avatar/uploads", async (route) => {
    ticketInput = route.request().postDataJSON() as Record<string, unknown>;
    await fulfillJson(
      route,
      {
        data: {
          expiresAt: Date.now() + 600_000,
          maximumBytes: 8 * 1024 * 1024,
          uploadId: imageId,
          uploadToken: "a".repeat(43),
          uploadUrl: `/api/avatar-uploads/${imageId}/content`,
        },
        requestId,
      },
      201,
    );
  });
  await page.route(
    `**/api/avatar-uploads/${imageId}/content`,
    async (route) => {
      const headers = route.request().headers();
      rawUpload = {
        authorization: headers.authorization,
        byteSize: route.request().postDataBuffer()?.byteLength ?? 0,
        cookie: headers.cookie,
        contentType: headers["content-type"],
      };
      await fulfillJson(
        route,
        { data: { ...account, avatarUrl }, requestId },
        201,
      );
    },
  );
  await page.route(`**${avatarUrl}`, (route) =>
    route.fulfill({ body: TINY_PNG, contentType: "image/png", status: 200 }),
  );
  await page.route("**/api/me/avatar", async (route) => {
    removeRequested = true;
    await fulfillJson(route, {
      data: { ...account, avatarUrl: null },
      requestId,
    });
  });

  await page.goto("/me/settings");
  const fileInput = page.locator('input[type="file"][accept*="image/heic"]');
  await fileInput.setInputFiles({
    buffer: TINY_PNG,
    mimeType: "image/png",
    name: "my-profile.png",
  });
  await page.getByRole("slider", { name: /Horizontal focus/ }).fill("35");
  await page.getByRole("slider", { name: /Vertical focus/ }).fill("65");
  await page.getByRole("button", { name: "Upload photo" }).click();

  await expect(page.getByText("Profile photo updated").first()).toBeVisible();
  await expect
    .poll(() => ticketInput)
    .toEqual({
      byteSize: TINY_PNG.byteLength,
      contentType: "image/png",
      focusX: 35,
      focusY: 65,
    });
  await expect
    .poll(() => rawUpload)
    .toEqual({
      authorization: `Bearer ${"a".repeat(43)}`,
      byteSize: TINY_PNG.byteLength,
      cookie: undefined,
      contentType: "image/png",
    });

  const profilePicture = page.getByRole("img", {
    name: "Your profile picture",
  });
  await expect(profilePicture.locator("img")).toHaveAttribute("src", avatarUrl);
  await expect(
    page.getByRole("button", { name: "Try another avatar" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Use generated avatar" }).click();
  await expect.poll(() => removeRequested).toBe(true);
  await expect(
    page.getByText("Generated avatar restored").first(),
  ).toBeVisible();
  await expect(profilePicture.locator("svg")).toHaveCount(1);
});

test("an existing username reviews newer terms without changing identity", async ({
  page,
}) => {
  let accepted = false;
  const returningUser = () =>
    user({
      displayName: "Returning Islander",
      termsAccepted: accepted,
      termsVersion: accepted ? "2026-07-14" : "2026-07-10",
      username: "returning-islander",
    });
  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: {
        capabilities: { communityMutationsEnabled: true },
        session: {
          createdAt: Date.now(),
          current: true,
          expiresAt: Date.now() + 86_400_000,
          id: "session-1",
          lastSeenAt: Date.now(),
        },
        user: returningUser(),
      },
      requestId,
    }),
  );
  await page.route("**/api/me/setup", async (route) => {
    const submitted = route.request().postDataJSON() as Record<string, unknown>;
    expect(submitted.username).toBe("returning-islander");
    expect(submitted.termsVersion).toBe("2026-07-14");
    accepted = true;
    await fulfillJson(route, { data: returningUser(), requestId });
  });
  await page.route("**/api/creations?**", (route) =>
    fulfillJson(route, {
      data: [],
      meta: { nextCursor: null },
      requestId,
    }),
  );

  await page.goto("/me/projects");
  await expect(page).toHaveURL(/\/me\/setup\?returnTo=%2Fme%2Fprojects$/);
  await expect(page.getByLabel("Username")).toHaveValue("returning-islander");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept current terms" }).click();
  await expect(page).toHaveURL(/\/me\/projects$/);
});

test("stale Terms consent redirects public social and report actions before mutation", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One focused onboarding-preflight run is sufficient.",
  );

  const currentUser = user({
    termsAccepted: false,
    termsVersion: "2026-07-10",
    username: "returning-islander",
  });
  const creator = user({
    displayName: "Gallery Creator",
    id: "00000000-0000-4000-8000-000000000031",
    username: "gallery-creator",
  });
  const creation = {
    commentsEnabled: true,
    commentsLocked: false,
    createdAt: 1_700_000_000_000,
    description: "A public creation used to verify onboarding preflights.",
    id: "00000000-0000-4000-8000-000000000032",
    likedByViewer: false,
    owner: creator,
    projectDownloadEnabled: false,
    publishedAt: 1_700_000_000_000,
    revision: 1,
    slug: "terms-preflight-creation",
    state: "published",
    stats: { comments: 0, likes: 0 },
    tags: [],
    title: "Terms preflight creation",
    updatedAt: 1_700_000_000_000,
    visibility: "public",
  };
  const attemptedMutations: string[] = [];

  await mockSession(page, currentUser);
  await page.route("**/api/tags", (route) =>
    fulfillJson(route, {
      data: [],
      requestId,
    }),
  );
  await page.route("**/api/discover/recent**", (route) =>
    fulfillJson(route, {
      data: [creation],
      meta: { nextCursor: null },
      requestId,
    }),
  );
  await page.route("**/api/users/gallery-creator/creations**", (route) =>
    fulfillJson(route, {
      data: [creation],
      meta: { nextCursor: null },
      requestId,
    }),
  );
  await page.route("**/api/users/gallery-creator", (route) =>
    fulfillJson(route, {
      data: { creations: [creation], user: creator },
      requestId,
    }),
  );
  await page.route(
    "**/api/public/creations/terms-preflight-creation",
    (route) =>
      fulfillJson(route, {
        data: creation,
        requestId,
      }),
  );
  await page.route(`**/api/creations/${creation.id}/comments**`, (route) =>
    fulfillJson(route, {
      data: [],
      meta: { nextCursor: null },
      requestId,
    }),
  );
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (
      request.method() !== "GET" &&
      (pathname.endsWith("/like") ||
        pathname.endsWith("/follow") ||
        pathname.endsWith("/comments") ||
        pathname === "/api/reports")
    ) {
      attemptedMutations.push(`${request.method()} ${pathname}`);
    }
  });

  const expectSetupRedirect = async (returnTo: string) => {
    await expect(page).toHaveURL(/\/me\/setup\?returnTo=/);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(returnTo);
    await expect(
      page.getByRole("heading", {
        name: "Review the current community terms.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Review and accept the current Terms before using community features.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(attemptedMutations).toEqual([]);
  };

  await page.goto("/discover");
  await page
    .getByRole("button", { name: "Like Terms preflight creation" })
    .click();
  await expectSetupRedirect("/discover");
  await page.reload();
  await expect(
    page.getByText(
      "Review and accept the current Terms before using community features.",
      { exact: true },
    ),
  ).toHaveCount(0);

  await page.goto("/u/gallery-creator");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expectSetupRedirect("/u/gallery-creator");

  await page.goto("/creation/terms-preflight-creation");
  await page.getByLabel("Join the conversation").fill("A kind comment.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expectSetupRedirect("/creation/terms-preflight-creation");

  await page.goto("/creation/terms-preflight-creation");
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expectSetupRedirect("/creation/terms-preflight-creation");
});

test("anonymous reporting stops before opening the dialog or calling the API", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One focused anonymous-report preflight run is sufficient.",
  );

  const creator = user({
    displayName: "Gallery Creator",
    id: "00000000-0000-4000-8000-000000000041",
    username: "gallery-creator",
  });
  const creation = {
    commentsEnabled: true,
    commentsLocked: false,
    createdAt: 1_700_000_000_000,
    description: "A public creation readable without an account.",
    id: "00000000-0000-4000-8000-000000000042",
    likedByViewer: false,
    owner: creator,
    projectDownloadEnabled: false,
    publishedAt: 1_700_000_000_000,
    revision: 1,
    slug: "anonymous-report-creation",
    state: "published",
    stats: { comments: 0, likes: 0 },
    tags: [],
    title: "Anonymous report creation",
    updatedAt: 1_700_000_000_000,
    visibility: "public",
  };
  let reportRequests = 0;

  await mockSession(page, null);
  await page.route(
    "**/api/public/creations/anonymous-report-creation",
    (route) => fulfillJson(route, { data: creation, requestId }),
  );
  await page.route(`**/api/creations/${creation.id}/comments**`, (route) =>
    fulfillJson(route, {
      data: [],
      meta: { nextCursor: null },
      requestId,
    }),
  );
  await page.route("**/api/reports", async (route) => {
    reportRequests += 1;
    await fulfillJson(
      route,
      {
        error: { code: "UNAUTHENTICATED", message: "Sign in is required." },
        requestId,
      },
      401,
    );
  });

  await page.goto("/creation/anonymous-report-creation");
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(
    page.getByText("Sign in when you need to report community content."),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Report this creation" }),
  ).toHaveCount(0);
  expect(reportRequests).toBe(0);
});

test("an anonymous cloud link keeps its validated destination through sign-in and onboarding", async ({
  page,
}) => {
  const creationId = "00000000-0000-4000-8000-000000000040";
  const returnTo = `/studio?cloud=${creationId}`;
  let authenticated = false;
  let configured = false;
  let postedReturnTo: string | null = null;
  const currentUser = () =>
    user({
      displayName: "New Cloud Islander",
      username: configured ? "new-cloud-islander" : null,
    });

  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: authenticated
        ? {
            capabilities: { communityMutationsEnabled: true },
            session: {
              createdAt: Date.now(),
              current: true,
              expiresAt: Date.now() + 86_400_000,
              id: "session-1",
              lastSeenAt: Date.now(),
            },
            user: currentUser(),
          }
        : { session: null, user: null },
      requestId,
    }),
  );
  await page.route("**/api/auth/google/start", async (route) => {
    postedReturnTo = new URLSearchParams(route.request().postData() ?? "").get(
      "returnTo",
    );
    authenticated = true;
    await route.fulfill({
      body: "",
      headers: {
        Location: `/me/setup?returnTo=${encodeURIComponent(postedReturnTo ?? "/me")}`,
      },
      status: 303,
    });
  });
  await page.route("**/api/me/setup", async (route) => {
    configured = true;
    await fulfillJson(route, { data: currentUser(), requestId });
  });
  await page.route(`**/api/creations/${creationId}`, (route) =>
    fulfillJson(
      route,
      {
        data: {
          id: creationId,
          project: {
            cells: ["R1C1", ...Array.from({ length: 63 }, () => null)],
            height: 8,
            lockedColors: [],
            meta: {
              createdAt: "2026-07-10T12:00:00.000Z",
              modifiedAt: "2026-07-10T12:00:00.000Z",
              name: "Cloud link project",
            },
            usedColors: ["R1C1"],
            version: 1,
            width: 8,
          },
          revision: 1,
          slug: "cloud-link-project-01",
        },
        requestId,
      },
      200,
      { ETag: '"rev-1"' },
    ),
  );

  await page.goto(returnTo);
  await expect(page.getByText("Cloud sign-in required")).toBeVisible();
  const signIn = page.getByRole("button", {
    name: "Sign in to open cloud project",
  });
  await expect(signIn).toBeVisible();
  await expect(page.locator('input[name="returnTo"]')).toHaveValue(returnTo);
  await signIn.click();

  await expect(page).toHaveURL(
    new RegExp(`/me/setup\\?returnTo=${encodeURIComponent(returnTo)}`),
  );
  expect(postedReturnTo).toBe(returnTo);
  await page.getByLabel("Username").fill("new-cloud-islander");
  await page.getByLabel("Display name").fill("New Cloud Islander");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(new RegExp(`/studio\\?cloud=${creationId}$`));
  await expect(
    page.getByText("Cloud link project", { exact: true }),
  ).toBeVisible();
});

test("an authenticated first cloud save explains setup after its hard redirect", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared hard-navigation notification path.",
  );

  await mockSession(
    page,
    user({
      displayName: "New Cloud Islander",
      termsAccepted: false,
      username: null,
    }),
  );

  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank" }).click();
  await page.getByRole("button", { name: "Save to account" }).click();

  await expect(page).toHaveURL(/\/me\/setup\?returnTo=%2Fstudio$/);
  const notice = page.getByText(
    "Finish your public profile once before using cloud projects.",
    { exact: true },
  );
  await expect(notice).toBeVisible();

  await page.reload();
  await expect(notice).toHaveCount(0);
});

test("the deliberate first cloud save still resumes its local draft after onboarding", async ({
  page,
}) => {
  let authenticated = false;
  let configured = false;
  let createCalls = 0;
  const currentUser = () =>
    user({
      displayName: "Draft Islander",
      username: configured ? "draft-islander" : null,
    });

  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: authenticated
        ? {
            capabilities: { communityMutationsEnabled: true },
            session: {
              createdAt: Date.now(),
              current: true,
              expiresAt: Date.now() + 86_400_000,
              id: "session-1",
              lastSeenAt: Date.now(),
            },
            user: currentUser(),
          }
        : { session: null, user: null },
      requestId,
    }),
  );
  await page.route("**/api/auth/google/start", async (route) => {
    const returnTo = new URLSearchParams(route.request().postData() ?? "").get(
      "returnTo",
    );
    expect(returnTo).toBe("/studio");
    authenticated = true;
    await route.fulfill({
      body: "",
      headers: {
        Location: `/me/setup?returnTo=${encodeURIComponent(returnTo ?? "/me")}`,
      },
      status: 303,
    });
  });
  await page.route("**/api/me/setup", async (route) => {
    configured = true;
    await fulfillJson(route, { data: currentUser(), requestId });
  });
  await page.route("**/api/creations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    createCalls += 1;
    await fulfillJson(
      route,
      {
        data: {
          id: "00000000-0000-4000-8000-000000000042",
          revision: 1,
          slug: "resumed-local-draft-01",
        },
        requestId,
      },
      201,
      { ETag: '"rev-1"' },
    );
  });

  await page.goto("/");
  await page.evaluate(async () => {
    const timestamp = "2026-07-10T12:00:00.000Z";
    const draft = {
      document: {
        cells: ["R1C1", ...Array.from({ length: 63 }, () => null)],
        height: 8,
        lockedColors: [],
        meta: {
          createdAt: timestamp,
          modifiedAt: timestamp,
          name: "Resumed local draft",
        },
        usedColors: ["R1C1"],
        version: 1,
        width: 8,
      },
      id: "current",
      updatedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("tomodachi-studio", 1);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains("drafts")) {
          open.result.createObjectStore("drafts", { keyPath: "id" });
        }
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put(draft);
        transaction.oncomplete = () => {
          open.result.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });

  await page.goto("/studio");
  await expect(
    page.getByText("Resumed local draft", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save to account" }).click();
  await expect(page).toHaveURL(/\/me\/setup\?returnTo=%2Fstudio$/);
  await page.getByLabel("Username").fill("draft-islander");
  await page.getByLabel("Display name").fill("Draft Islander");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/studio$/);
  await expect(
    page.getByText("Resumed local draft", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => createCalls).toBe(1);
  await expect(page.getByText("Saved · v1")).toBeVisible();
});

test("an expired cloud-link session offers sign-in with the current destination", async ({
  page,
}) => {
  const creationId = "00000000-0000-4000-8000-000000000041";
  const returnTo = `/studio?cloud=${creationId}`;
  await mockSession(page, user());
  await page.route(`**/api/creations/${creationId}`, (route) =>
    fulfillJson(
      route,
      {
        error: {
          code: "authentication_required",
          message: "Sign in is required.",
        },
        requestId,
      },
      401,
    ),
  );

  await page.goto(returnTo);
  await expect(page.getByText("Cloud sign-in required")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to open cloud project" }),
  ).toBeVisible();
  await expect(page.locator('input[name="returnTo"]')).toHaveValue(returnTo);
});

test("authenticated users finish onboarding before entering account routes", async ({
  page,
}) => {
  await mockSession(page, user({ username: null }));
  let protectedRequests = 0;
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      pathname === "/api/creations" ||
      pathname === "/api/me/sessions" ||
      pathname.startsWith("/api/moderation/")
    ) {
      protectedRequests += 1;
    }
  });

  for (const accountRoute of ["/me", "/me/projects", "/moderation"]) {
    await page.goto(accountRoute);
    await expect(page).toHaveURL(/\/me\/setup\?returnTo=/);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(accountRoute);
    await expect(
      page.getByRole("heading", { name: "Choose your island identity." }),
    ).toBeVisible();
  }

  expect(protectedRequests).toBe(0);

  await page.goto("/me/settings");
  await expect(page).toHaveURL(/\/me\/settings$/);
  await expect(
    page.getByRole("heading", { name: "Account setup is still required" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Delete account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Public profile" }),
  ).toBeHidden();
});

test("project shelf paginates, edits private cards, and uses governed publishing defaults", async ({
  page,
}) => {
  await mockSession(page, user());
  const creation = {
    commentsEnabled: false,
    commentsLocked: false,
    createdAt: 1_700_000_000_000,
    description: "",
    id: "00000000-0000-4000-8000-000000000010",
    likedByViewer: false,
    owner: user(),
    projectDownloadEnabled: false,
    publishedAt: null,
    revision: 1,
    slug: "private-draft-0001",
    status: "draft",
    stats: { comments: 0, likes: 0 },
    tags: [],
    title: "Private draft",
    updatedAt: 1_700_000_000_000,
    visibility: "private",
  };
  const second = {
    ...creation,
    id: "00000000-0000-4000-8000-000000000011",
    slug: "private-draft-0002",
    title: "Second draft",
  };
  const publishBodies: Record<string, unknown>[] = [];
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl20AAAAASUVORK5CYII=",
    "base64",
  );
  const showcaseImage = {
    altText: "A photographed island portrait in a blue frame",
    createdAt: 1_700_000_000_001,
    displayUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl20AAAAASUVORK5CYII=",
    height: 1,
    id: "00000000-0000-4000-8000-000000000099",
    isCover: true,
    socialImageUrl: "/api/creations/creation/images/image/social",
    sortOrder: 0,
    thumbnailUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl20AAAAASUVORK5CYII=",
    updatedAt: 1_700_000_000_001,
    width: 1,
  };
  let rawUploadHeaders: Record<string, string> | null = null;
  let galleryLoads = 0;
  await page.route("**/api/creations?**", async (route) => {
    const url = new URL(route.request().url());
    const isSecondPage = Boolean(url.searchParams.get("cursor"));
    await fulfillJson(route, {
      data: isSecondPage ? [second] : [creation],
      meta: { nextCursor: isSecondPage ? null : "next-project-page" },
      requestId,
    });
  });
  await page.route("**/api/tags", (route) =>
    fulfillJson(route, {
      data: [
        { description: "Portrait work", name: "Portraits", slug: "portraits" },
      ],
      requestId,
    }),
  );
  await page.route("**/api/creations/*/images/uploads", (route) =>
    fulfillJson(
      route,
      {
        data: {
          expiresAt: Date.now() + 600_000,
          maximumBytes: 8_388_608,
          uploadId: "00000000-0000-4000-8000-000000000098",
          uploadToken: "test-one-use-upload-token-000000000000",
          uploadUrl:
            "/api/creation-image-uploads/00000000-0000-4000-8000-000000000098/content",
        },
        requestId,
      },
      201,
    ),
  );
  await page.route("**/api/creation-image-uploads/*/content", async (route) => {
    rawUploadHeaders = route.request().headers();
    expect(route.request().postDataBuffer()).toEqual(onePixelPng);
    await fulfillJson(
      route,
      { data: { image: showcaseImage, images: [showcaseImage] }, requestId },
      201,
    );
  });
  await page.route("**/api/creations/*/images", async (route) => {
    if (route.request().method() === "GET") {
      galleryLoads += 1;
      if (galleryLoads === 1) {
        await fulfillJson(
          route,
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Gallery temporarily unavailable",
            },
            requestId,
          },
          503,
        );
        return;
      }
      await fulfillJson(route, { data: [], requestId });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/creations/*/publish", async (route) => {
    const publishBody = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    publishBodies.push(publishBody);
    await fulfillJson(route, {
      data: {
        ...creation,
        ...publishBody,
        socialImageUrl: `/api/creations/${creation.id}/media/social`,
        status: "published",
      },
      requestId,
    });
  });
  await page.route("**/api/creations/*/media/*", (route) =>
    route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      contentType: "image/svg+xml",
      status: 200,
    }),
  );

  await page.goto("/me/projects");
  const privateCard = page.getByRole("link", { name: "View Private draft" });
  await expect(privateCard).toHaveAttribute(
    "href",
    `/studio?cloud=${creation.id}`,
  );
  await page.getByRole("button", { name: "Load more projects" }).click();
  await expect(page.getByText("Second draft", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "More actions for Private draft" })
    .click();
  await page.getByRole("button", { name: "Review & publish" }).click();
  const publishDialog = page.getByRole("dialog", {
    name: "Review before publishing",
  });
  await expect(publishDialog).toBeVisible();
  await expect(publishDialog.locator('[aria-current="step"]')).toContainText(
    "1. Details",
  );
  await expect(
    publishDialog
      .getByLabel("Live project card preview")
      .getByRole("heading", { name: "Private draft" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await publishDialog.getByLabel("Title").fill("");
  await publishDialog
    .getByRole("button", { name: "Continue to showcase" })
    .click();
  await expect(
    publishDialog.getByText("Give your creation a title before continuing."),
  ).toBeVisible();
  await expect(publishDialog.locator('[aria-current="step"]')).toContainText(
    "1. Details",
  );
  await publishDialog.getByLabel("Title").fill("Private draft");
  await publishDialog.getByRole("button", { name: "Portraits" }).click();
  await publishDialog
    .getByRole("button", { name: "Continue to showcase" })
    .click();
  await expect(publishDialog.locator('[aria-current="step"]')).toContainText(
    "2. Showcase",
  );
  await publishDialog.getByRole("button", { name: "Retry gallery" }).click();
  await expect.poll(() => galleryLoads).toBe(2);
  await expect(
    publishDialog.getByRole("button", { name: "Continue to sharing" }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const trackedWindow = window as Window & {
      __revokedShowcasePreviews?: string[];
    };
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    trackedWindow.__revokedShowcasePreviews = [];
    URL.revokeObjectURL = (url: string) => {
      trackedWindow.__revokedShowcasePreviews?.push(url);
      originalRevoke(url);
    };
  });
  const dropTarget = publishDialog.getByRole("button", {
    name: "Drop image here or choose a file",
  });
  await dropTarget.evaluate((element, encodedPng) => {
    const binary = atob(encodedPng);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
      bytes[index] = binary.charCodeAt(index);
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([bytes], "portrait.png", { type: "image/png" }),
    );
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
  }, onePixelPng.toString("base64"));
  await expect(
    publishDialog.getByAltText("Preview of selected portrait.png"),
  ).toBeVisible();
  await publishDialog
    .getByLabel("Image description")
    .fill(showcaseImage.altText);
  await expect(
    publishDialog.getByRole("button", { name: "Add showcase image" }),
  ).toBeEnabled();
  await publishDialog.getByLabel("Choose a photo or screenshot").setInputFiles({
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    mimeType: "image/svg+xml",
    name: "unsupported.svg",
  });
  await expect(
    publishDialog.getByAltText("Preview of selected portrait.png"),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __revokedShowcasePreviews?: string[] })
            .__revokedShowcasePreviews?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  await expect(
    publishDialog.getByRole("button", { name: "Add showcase image" }),
  ).toBeDisabled();
  await publishDialog.getByLabel("Choose a photo or screenshot").setInputFiles({
    buffer: onePixelPng,
    mimeType: "image/png",
    name: "portrait.png",
  });
  await expect(
    publishDialog.getByAltText("Preview of selected portrait.png"),
  ).toBeVisible();
  await publishDialog
    .getByRole("button", { name: "Add showcase image" })
    .click();
  await expect(publishDialog.getByText(showcaseImage.altText)).toBeVisible();
  expect(rawUploadHeaders?.authorization).toBe(
    "Bearer test-one-use-upload-token-000000000000",
  );
  expect(rawUploadHeaders?.cookie).toBeUndefined();
  await publishDialog
    .getByRole("button", { name: "Continue to sharing" })
    .click();
  await expect(publishDialog.locator('[aria-current="step"]')).toContainText(
    "3. Sharing",
  );
  await expect(
    publishDialog.getByText("1 image", { exact: true }),
  ).toBeVisible();
  await expect(
    publishDialog.getByText("Allow Studio project download", { exact: true }),
  ).toBeVisible();
  await expect(
    publishDialog.getByText(
      "Shares editable Tomodachi Studio JSON only—not a Nintendo game or save file.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    publishDialog.getByText(
      /does not use Living the Dream's local-wireless exchange or transfer anything to a console/u,
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await expect(publishDialog.getByRole("switch").first()).toBeChecked();
  await expect(publishDialog.getByRole("switch").nth(1)).not.toBeChecked();
  await publishDialog.getByRole("button", { name: "Publish publicly" }).click();
  await expect.poll(() => publishBodies.length).toBe(1);
  expect(publishBodies[0]).toMatchObject({
    commentsEnabled: true,
    projectDownloadEnabled: false,
    tags: ["portraits"],
    visibility: "public",
  });
  const publishSuccessDialog = page.getByRole("dialog", {
    name: "Your share page is ready",
  });
  await expect(
    publishSuccessDialog.getByRole("link", { name: "Download social card" }),
  ).toHaveAttribute("href", `/api/creations/${creation.id}/media/social`);

  await page.getByRole("button", { name: "Continue editing" }).click();

  await page.getByRole("button", { name: "Edit publishing" }).click();
  const editDialog = page.getByRole("dialog", {
    name: "Edit publishing settings",
  });
  await expect(editDialog).toBeVisible();
  await editDialog
    .getByRole("button", { name: "Continue to showcase" })
    .click();
  await expect(editDialog.getByText("This gallery is live.")).toBeVisible();
  await expect(
    editDialog.getByRole("button", { name: "Add showcase image" }),
  ).toHaveCount(0);
  await editDialog.getByRole("button", { name: "Continue to sharing" }).click();
  await editDialog.getByRole("switch").first().click();
  await editDialog.getByRole("switch").nth(1).click();
  await editDialog.getByRole("combobox", { name: "Visibility" }).click();
  await page.getByRole("option", { name: /Unlisted/ }).click();
  await editDialog
    .getByRole("button", { name: "Save publishing settings" })
    .click();
  await expect.poll(() => publishBodies.length).toBe(2);
  expect(publishBodies[1]).toMatchObject({
    commentsEnabled: false,
    projectDownloadEnabled: true,
    visibility: "unlisted",
  });
  await expect(
    page.getByRole("heading", { name: "Your share page is ready" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit publishing" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit publishing settings" }),
  ).toBeVisible();
});

test("published creations expose owner editing and the current like state", async ({
  page,
}) => {
  const currentUser = user();
  const creationId = "00000000-0000-4000-8000-000000000012";
  await mockSession(page, currentUser);
  await page.route("**/api/public/creations/owner-published-01", (route) =>
    fulfillJson(route, {
      data: {
        canEdit: true,
        commentsEnabled: true,
        description: "A published owner project.",
        id: creationId,
        images: [
          {
            altText: "A framed photo of the finished island portrait",
            createdAt: 1_700_000_000_001,
            displayUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl20AAAAASUVORK5CYII=",
            height: 1,
            id: "00000000-0000-4000-8000-000000000077",
            isCover: true,
            socialImageUrl: "/api/creations/creation/images/image/social",
            sortOrder: 0,
            thumbnailUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl20AAAAASUVORK5CYII=",
            updatedAt: 1_700_000_000_001,
            width: 1,
          },
          {
            altText:
              "A close-up of the portrait's coral and mint pixel details",
            createdAt: 1_700_000_000_002,
            displayUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl20AAAAASUVORK5CYII=",
            height: 1,
            id: "00000000-0000-4000-8000-000000000078",
            isCover: false,
            socialImageUrl: "/api/creations/creation/images/image-2/social",
            sortOrder: 1,
            thumbnailUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl20AAAAASUVORK5CYII=",
            updatedAt: 1_700_000_000_002,
            width: 1,
          },
        ],
        likedByViewer: false,
        owner: currentUser,
        projectDownloadEnabled: false,
        publishedAt: 1_700_000_000_000,
        revision: 1,
        slug: "owner-published-01",
        state: "published",
        stats: { comments: 0, likes: 0 },
        tags: [],
        title: "Owner published project",
        updatedAt: 1_700_000_000_000,
        visibility: "public",
      },
      requestId,
    }),
  );
  await page.route(`**/api/creations/${creationId}/comments**`, (route) =>
    fulfillJson(route, {
      data: [],
      meta: { nextCursor: null },
      requestId,
    }),
  );
  let likeMethod: string | null = null;
  await page.route(`**/api/creations/${creationId}/like`, async (route) => {
    likeMethod = route.request().method();
    await fulfillJson(route, { data: { liked: true }, requestId });
  });

  // A 320 CSS-pixel viewport also represents the layout width available when
  // a 640px browser window is zoomed to 200%.
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/creation/owner-published-01");
  await expect(
    page.getByRole("heading", { name: "Showcase gallery" }),
  ).toBeVisible();
  await expect(
    page.getByAltText("A framed photo of the finished island portrait"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share", exact: true }),
  ).toBeVisible();
  const socialCardDownload = page.getByRole("link", {
    name: "Download social card",
  });
  await expect(socialCardDownload).toHaveAttribute(
    "href",
    `/api/creations/${creationId}/media/social`,
  );
  await expect(socialCardDownload).toHaveAttribute(
    "download",
    "owner-published-project-social-card.jpg",
  );

  const galleryTrigger = page.getByRole("button", {
    name: "Open image 1 of 2 in full-screen gallery: A framed photo of the finished island portrait",
  });
  await galleryTrigger.click();
  const galleryDialog = page.getByRole("dialog", {
    name: "Showcase gallery for Owner published project",
  });
  await expect(galleryDialog).toBeVisible();
  await expect(galleryDialog.getByText("Image 1 of 2")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"]')),
      ),
    )
    .toBe(true);

  await page.keyboard.press("ArrowRight");
  await expect(galleryDialog.getByText("Image 2 of 2")).toBeVisible();
  await expect(
    galleryDialog.getByAltText(
      "A close-up of the portrait's coral and mint pixel details",
    ),
  ).toBeVisible();
  await galleryDialog
    .getByRole("button", { name: "Previous showcase image" })
    .click();
  await expect(galleryDialog.getByText("Image 1 of 2")).toBeVisible();
  await galleryDialog
    .getByRole("button", {
      name: "View image 2: A close-up of the portrait's coral and mint pixel details",
    })
    .click();
  await expect(galleryDialog.getByText("Image 2 of 2")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(galleryDialog.getByText("Image 1 of 2")).toBeVisible();

  for (let step = 0; step < 7; step += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"]')),
      ),
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(galleryDialog).toBeHidden();
  await expect(galleryTrigger).toBeFocused();

  await expect(
    page.getByRole("link", { name: "Edit in Studio" }),
  ).toHaveAttribute("href", `/studio?cloud=${creationId}`);
  const likeButton = page.getByRole("button", {
    name: "Like Owner published project",
  });
  await expect(likeButton).toHaveAttribute("aria-pressed", "false");
  await likeButton.click();
  await expect(
    page.getByRole("button", { name: "Unlike Owner published project" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(likeMethod).toBe("POST");
});

test("Studio selection controls expose their current state", async ({
  page,
}) => {
  await mockSession(page, null);
  await page.goto("/studio");

  const labelToggle = page.getByRole("button", {
    name: "Toggle paint-by-numbers labels",
  });
  await expect(labelToggle).toHaveAttribute("aria-pressed", "false");
  await labelToggle.click();
  await expect(labelToggle).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "Create" }).click();
  const cellGrid = page.getByRole("button", { name: "Grid density: Cell" });
  const hiddenGrid = page.getByRole("button", { name: "Grid density: Off" });
  await expect(cellGrid).toHaveAttribute("aria-pressed", "true");
  await expect(hiddenGrid).toHaveAttribute("aria-pressed", "false");
  await hiddenGrid.click();
  await expect(cellGrid).toHaveAttribute("aria-pressed", "false");
  await expect(hiddenGrid).toHaveAttribute("aria-pressed", "true");

  const inspectTool = page.getByRole("button", { name: "Inspect tool" });
  const pencilTool = page.getByRole("button", { name: "Pencil tool" });
  const eraserTool = page.getByRole("button", { name: "Eraser tool" });
  await expect(inspectTool).toHaveAttribute("aria-pressed", "false");
  await expect(pencilTool).toHaveAttribute("aria-pressed", "true");
  await eraserTool.click();
  await expect(eraserTool).toHaveAttribute("aria-pressed", "true");
  await expect(pencilTool).toHaveAttribute("aria-pressed", "false");
  await pencilTool.click();
  await expect(inspectTool).toHaveAttribute("aria-pressed", "false");
  await expect(pencilTool).toHaveAttribute("aria-pressed", "true");

  const quickColors = page.locator('[aria-label="Quick paint colors"]');
  const black = quickColors.getByRole("button", {
    name: "Select R10C1 Black",
  });
  await expect(black).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Choose paint color. Current color Black" })
    .click();
  await page.getByRole("button", { name: "Select R1C1 Dark Red" }).click();
  const darkRed = quickColors.getByRole("button", {
    name: "Select R1C1 Dark Red",
  });
  await expect(black).toHaveAttribute("aria-pressed", "false");
  await expect(darkRed).toHaveAttribute("aria-pressed", "true");
});

test("a loaded conflict state fits the minimum supported Studio width", async ({
  page,
}) => {
  const currentUser = user();
  let copyAttempts = 0;
  let copiedProjectName: string | null = null;
  await mockSession(page, currentUser);
  await page.route("**/api/creations", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    copyAttempts += 1;
    copiedProjectName =
      (
        route.request().postDataJSON() as {
          project?: { meta?: { name?: string } };
        }
      ).project?.meta?.name ?? null;
    if (copyAttempts === 1) {
      await fulfillJson(
        route,
        {
          error: {
            code: "temporary_save_failure",
            message: "The copy could not be saved yet.",
          },
          requestId,
        },
        503,
      );
      return;
    }
    await fulfillJson(
      route,
      {
        data: {
          id: "00000000-0000-4000-8000-000000000099",
          revision: 1,
          slug: "conflicted-draft-copy-01",
        },
        requestId,
      },
      201,
      { ETag: '"rev-1"' },
    );
  });
  await page.setViewportSize({ width: 320, height: 760 });

  await page.goto("/");
  await page.evaluate(
    async ({ userId }) => {
      const timestamp = "2026-07-10T12:01:00.000Z";
      const draft = {
        cloud: {
          creationId: "00000000-0000-4000-8000-000000000019",
          error: "A newer cloud revision exists.",
          etag: '"rev-1"',
          lastSyncedModifiedAt: "2026-07-10T12:00:00.000Z",
          revision: 1,
          saveState: "conflict",
          slug: "conflicted-draft-01",
          userId,
        },
        document: {
          cells: ["R1C1", ...Array.from({ length: 63 }, () => null)],
          height: 8,
          lockedColors: [],
          meta: {
            createdAt: "2026-07-10T12:00:00.000Z",
            modifiedAt: timestamp,
            name: "A very long restored conflict project title for mobile",
          },
          usedColors: ["R1C1"],
          version: 1,
          width: 8,
        },
        id: "current",
        updatedAt: Date.now(),
      };
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("tomodachi-studio", 1);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains("drafts")) {
            open.result.createObjectStore("drafts", { keyPath: "id" });
          }
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const transaction = open.result.transaction("drafts", "readwrite");
          transaction.objectStore("drafts").put(draft);
          transaction.oncomplete = () => {
            open.result.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    { userId: currentUser.id },
  );

  await page.goto("/studio");
  await expect(page.getByText("Conflict", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resolve cloud save conflict" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use cloud version" }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "Resolve cloud save conflict" })
    .click();
  const choiceDialog = page.getByRole("dialog", {
    name: "Choose how to resolve this save conflict",
  });
  await expect(choiceDialog).toBeVisible();
  await expect(
    choiceDialog.getByText(
      "Your local work and the newer cloud version are both preserved until you make an explicit choice.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(choiceDialog.getByText("Local work modified")).toBeVisible();
  await expect(
    choiceDialog.locator('time[datetime="2026-07-10T12:01:00.000Z"]'),
  ).toBeVisible();
  await expect(
    choiceDialog.getByText("Last synced cloud revision"),
  ).toBeVisible();
  await expect(choiceDialog.getByText("v1", { exact: true })).toBeVisible();
  await expect(
    choiceDialog.getByRole("button", {
      name: "Save local work as a copy",
    }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include('[data-slot="dialog-content"]')
        .analyze()
    ).violations,
  ).toEqual([]);

  await choiceDialog.getByRole("button", { name: "Use cloud version" }).click();
  const cloudConfirmation = page.getByRole("alertdialog", {
    name: "Replace the local editor with the cloud version?",
  });
  await expect(cloudConfirmation).toBeVisible();
  await expect(
    cloudConfirmation.getByRole("button", {
      name: "Confirm use cloud version",
    }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include('[data-slot="alert-dialog-content"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  await cloudConfirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(cloudConfirmation).toBeHidden();
  await expect(page.getByText("Conflict", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Resolve cloud save conflict" })
    .click();
  await page
    .getByRole("dialog", {
      name: "Choose how to resolve this save conflict",
    })
    .getByRole("button", { name: "Save local work as a copy" })
    .click();
  await expect.poll(() => copyAttempts).toBe(1);
  await expect(
    page.getByRole("dialog", {
      name: "Choose how to resolve this save conflict",
    }),
  ).toBeVisible();
  await expect(page.getByText("Conflict", { exact: true })).toBeVisible();

  await page
    .getByRole("dialog", {
      name: "Choose how to resolve this save conflict",
    })
    .getByRole("button", { name: "Save local work as a copy" })
    .click();
  await expect.poll(() => copyAttempts).toBe(2);
  expect(copiedProjectName).toBe(
    "A very long restored conflict project title for mobile (copy)",
  );
  await expect(page.getByText("Saved · v1", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("saving a conflicted cloud project as a copy replaces the cloud URL before reload", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the cloud query-state binding contract.",
  );

  const currentUser = user();
  const oldCreationId = "00000000-0000-4000-8000-000000000051";
  const newCreationId = "00000000-0000-4000-8000-000000000052";
  const originalProject = {
    cells: ["R1C1", ...Array.from({ length: 63 }, () => null as string | null)],
    height: 8,
    lockedColors: [] as string[],
    meta: {
      createdAt: "2026-07-14T12:00:00.000Z",
      modifiedAt: "2026-07-14T12:00:00.000Z",
      name: "Query-bound conflict project",
    },
    usedColors: ["R1C1"],
    version: 1 as const,
    width: 8,
  };
  let copiedProject: typeof originalProject | null = null;
  let oldProjectReads = 0;
  let newProjectReads = 0;

  const creationDetail = (
    id: string,
    slug: string,
    project: typeof originalProject,
  ) => ({
    commentsEnabled: false,
    commentCount: 0,
    description: "",
    downloadEnabled: false,
    id,
    likeCount: 0,
    owner: currentUser,
    project,
    revision: 1,
    slug,
    status: "draft",
    tags: [],
    title: project.meta.name,
    updatedAt: 1_720_000_000_000,
    visibility: "private",
  });

  await mockSession(page, currentUser);
  await page.route(`**/api/creations/${oldCreationId}`, async (route) => {
    oldProjectReads += 1;
    await fulfillJson(
      route,
      {
        data: creationDetail(
          oldCreationId,
          "query-bound-conflict-project",
          originalProject,
        ),
        requestId,
      },
      200,
      { ETag: '"rev-1"' },
    );
  });
  await page.route(`**/api/creations/${newCreationId}`, async (route) => {
    newProjectReads += 1;
    await fulfillJson(
      route,
      {
        data: creationDetail(
          newCreationId,
          "query-bound-conflict-project-copy",
          copiedProject ?? originalProject,
        ),
        requestId,
      },
      200,
      { ETag: '"rev-1"' },
    );
  });
  await page.route(`**/api/creations/${oldCreationId}/project`, (route) =>
    fulfillJson(
      route,
      {
        error: {
          code: "revision_conflict",
          message: "A newer cloud revision exists.",
        },
        requestId,
      },
      409,
    ),
  );
  await page.route("**/api/creations", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    copiedProject = (
      route.request().postDataJSON() as { project: typeof originalProject }
    ).project;
    await fulfillJson(
      route,
      {
        data: {
          id: newCreationId,
          revision: 1,
          slug: "query-bound-conflict-project-copy",
        },
        requestId,
      },
      201,
      { ETag: '"rev-1"' },
    );
  });

  await page.goto(
    `/studio?cloud=${oldCreationId}&workspace=guided%20copy#canvas`,
  );
  await expect(
    page.getByText("Query-bound conflict project", { exact: true }),
  ).toBeVisible();
  const canvas = page.getByRole("application", {
    name: "Editable 8 by 8 pixel grid",
  });
  await canvas.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("Conflict", { exact: true })).toBeVisible({
    timeout: 7_000,
  });

  await page
    .getByRole("button", { name: "Resolve cloud save conflict" })
    .click();
  await page
    .getByRole("dialog", {
      name: "Choose how to resolve this save conflict",
    })
    .getByRole("button", { name: "Save local work as a copy" })
    .click();
  await expect(page.getByText("Saved · v1", { exact: true })).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("cloud"))
    .toBe(newCreationId);
  expect(new URL(page.url()).searchParams.get("workspace")).toBe("guided copy");
  expect(new URL(page.url()).hash).toBe("#canvas");
  expect(copiedProject?.meta.name).toBe("Query-bound conflict project (copy)");

  await page.reload();
  await expect(
    page.getByText("Query-bound conflict project (copy)", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => newProjectReads).toBe(1);
  expect(oldProjectReads).toBe(1);
  expect(new URL(page.url()).searchParams.get("cloud")).toBe(newCreationId);
  expect(new URL(page.url()).searchParams.get("workspace")).toBe("guided copy");
  expect(new URL(page.url()).hash).toBe("#canvas");
});

test("a dirty restored cloud draft autosaves before publishing becomes available", async ({
  page,
}) => {
  const currentUser = user();
  const creationId = "00000000-0000-4000-8000-000000000020";
  await mockSession(page, currentUser);
  let saveCalls = 0;
  await page.route(`**/api/creations/${creationId}`, (route) =>
    fulfillJson(
      route,
      {
        data: {
          commentsEnabled: false,
          description: "Authoritative draft description",
          id: creationId,
          owner: currentUser,
          projectDownloadEnabled: false,
          revision: 1,
          slug: "restored-draft-01",
          state: "draft",
          stats: { comments: 0, likes: 0 },
          tags: ["portraits"],
          title: "Authoritative draft title",
          updatedAt: 1_700_000_000_000,
          visibility: "private",
        },
        requestId,
      },
      200,
      { ETag: '"rev-1"' },
    ),
  );
  await page.route("**/api/creations/*/project", async (route) => {
    saveCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await fulfillJson(
      route,
      {
        data: {
          id: "00000000-0000-4000-8000-000000000020",
          revision: 2,
          slug: "restored-draft-01",
        },
        requestId,
      },
      200,
      { ETag: '"rev-2"' },
    );
  });

  await page.goto("/");
  await page.evaluate(
    async ({ userId }) => {
      const timestamp = "2026-07-10T12:01:00.000Z";
      const draft = {
        cloud: {
          creationId: "00000000-0000-4000-8000-000000000020",
          etag: '"rev-1"',
          lastSyncedModifiedAt: "2026-07-10T12:00:00.000Z",
          revision: 1,
          saveState: "offline",
          slug: "restored-draft-01",
          userId,
        },
        document: {
          cells: ["R1C1", ...Array.from({ length: 63 }, () => null)],
          height: 8,
          lockedColors: [],
          meta: {
            createdAt: "2026-07-10T12:00:00.000Z",
            modifiedAt: timestamp,
            name: "Restored draft",
          },
          usedColors: ["R1C1"],
          version: 1,
          width: 8,
        },
        id: "current",
        updatedAt: Date.now(),
      };
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("tomodachi-studio", 1);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains("drafts"))
            open.result.createObjectStore("drafts", { keyPath: "id" });
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const transaction = open.result.transaction("drafts", "readwrite");
          transaction.objectStore("drafts").put(draft);
          transaction.oncomplete = () => {
            open.result.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    { userId: currentUser.id },
  );

  await page.goto("/studio");
  await expect(page.getByText("Saving soon…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Saving first…" }),
  ).toBeDisabled();
  await expect.poll(() => saveCalls, { timeout: 6_000 }).toBe(1);
  await expect(page.getByText("Saved · v2")).toBeVisible();
  const shareButton = page.getByRole("button", { name: "Share" });
  await expect(shareButton).toBeEnabled();
  await shareButton.click();
  await expect(page.getByLabel("Title")).toHaveValue(
    "Authoritative draft title",
  );
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Authoritative draft description",
  );
});

test("moderation actions remain disabled until target context and history are reviewed", async ({
  page,
}) => {
  await mockSession(page, user({ role: "admin", username: "admin-islander" }));
  const report = {
    createdAt: 1_700_000_000_000,
    details: "Review this target.",
    id: "00000000-0000-4000-8000-000000000030",
    reason: "other",
    status: "open",
    targetId: "00000000-0000-4000-8000-000000000031",
    targetType: "creation",
  };
  await page.route("**/api/moderation/reports?**", (route) =>
    fulfillJson(route, {
      data: [report],
      meta: { nextCursor: null },
      requestId,
    }),
  );
  await page.route("**/api/moderation/stats", (route) =>
    fulfillJson(route, {
      data: {
        hiddenComments: 0,
        hiddenCreations: 0,
        openReports: 1,
        suspendedUsers: 0,
      },
      requestId,
    }),
  );
  await page.route(`**/api/moderation/reports/${report.id}?**`, (route) =>
    fulfillJson(route, {
      data: {
        actions: [
          {
            action: "lock_comments",
            createdAt: 1_699_000_000_000,
            id: "action-1",
            reason: "Earlier review",
          },
        ],
        report,
        target: {
          description: "Current plain-text creation description.",
          id: report.targetId,
          label: "Reported creation",
          slug: "reported-creation1",
          state: "published",
          type: "creation",
          visibility: "public",
        },
      },
      meta: { hasMore: false, limit: 50, nextCursor: null },
      requestId,
    }),
  );

  await page.goto("/moderation");
  const rationale = page.getByLabel("Moderator rationale");
  await rationale.fill("Reviewed the current target and retained history.");
  await expect(
    page.getByRole("button", { name: "Hide & resolve" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Review target context" }).click();
  await expect(
    page.getByText("Reported creation", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Earlier review", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hide & resolve" }),
  ).toBeEnabled();
});

test("moderators can inspect and remove only the report-time profile photo", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the private moderation evidence workflow.",
  );
  await mockSession(page, user({ role: "admin", username: "admin-islander" }));
  const report = {
    createdAt: 1_700_000_000_000,
    details: "The public profile photo needs review.",
    id: "00000000-0000-4000-8000-000000000032",
    reason: "other",
    status: "open",
    targetId: "00000000-0000-4000-8000-000000000033",
    targetType: "user",
  };
  const imageId = "00000000-0000-4000-8000-000000000034";
  let removalBody: Record<string, unknown> | null = null;
  let resolutionBody: Record<string, unknown> | null = null;

  await page.route("**/api/moderation/reports?**", (route) =>
    fulfillJson(route, {
      data: [report],
      meta: { nextCursor: null },
      requestId,
    }),
  );
  await page.route("**/api/moderation/stats", (route) =>
    fulfillJson(route, {
      data: {
        hiddenComments: 0,
        hiddenCreations: 0,
        openReports: 1,
        suspendedUsers: 0,
      },
      requestId,
    }),
  );
  await page.route(`**/api/moderation/reports/${report.id}?**`, (route) =>
    fulfillJson(route, {
      data: {
        actions: [],
        report,
        target: {
          bio: "Profile with a reported custom photo.",
          id: report.targetId,
          label: "Reported profile owner",
          profileImageEvidence: {
            capturedAt: 1_700_000_000_000,
            imageId,
            mediaUrl: `/api/moderation/reports/${report.id}/profile-image`,
            sha256: "a".repeat(64),
          },
          role: "user",
          state: "active",
          type: "user",
          username: "reported-owner",
        },
      },
      meta: { hasMore: false, limit: 50, nextCursor: null },
      requestId,
    }),
  );
  await page.route(
    `**/api/moderation/reports/${report.id}/profile-image`,
    (route) =>
      route.fulfill({
        body: TINY_PNG,
        contentType: "image/png",
        headers: { "Cache-Control": "private, no-store" },
        status: 200,
      }),
  );
  await page.route(
    `**/api/moderation/reports/${report.id}/remove-profile-image`,
    async (route) => {
      removalBody = route.request().postDataJSON() as Record<string, unknown>;
      await fulfillJson(route, {
        data: {
          avatarUrl: null,
          id: report.targetId,
          removedImageId: imageId,
          reportId: report.id,
        },
        requestId,
      });
    },
  );
  await page.route(
    `**/api/moderation/reports/${report.id}/actions`,
    async (route) => {
      resolutionBody = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      await fulfillJson(route, {
        data: { id: report.id, status: "resolved" },
        requestId,
      });
    },
  );

  await page.goto("/moderation");
  await page.getByRole("button", { name: "Review target context" }).click();
  await expect(
    page.getByRole("img", { name: "Report-time profile photo evidence" }),
  ).toBeVisible();
  await expect(page.getByText("Private report-time photo")).toBeVisible();
  await page
    .getByLabel("Moderator rationale")
    .fill("Reviewed the held image and confirmed it violates the guidelines.");
  await page
    .getByRole("button", { name: "Remove reported photo & resolve" })
    .click();

  await expect
    .poll(() => removalBody)
    .toMatchObject({
      action: "remove_profile_image",
    });
  await expect
    .poll(() => resolutionBody)
    .toMatchObject({
      action: "resolve_report",
    });
});

test("deletion-pending accounts can cancel during the grace period", async ({
  page,
}) => {
  let pending = true;
  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: {
        capabilities: { communityMutationsEnabled: true },
        session: {
          createdAt: Date.now(),
          current: true,
          expiresAt: Date.now() + 86_400_000,
          id: "session-1",
          lastSeenAt: Date.now(),
        },
        user: user({ status: pending ? "deletion_pending" : "active" }),
      },
      requestId,
    }),
  );
  await page.route("**/api/me/sessions", (route) =>
    fulfillJson(route, { data: [], requestId }),
  );
  await page.route("**/api/me/deletion/cancel", async (route) => {
    pending = false;
    await fulfillJson(route, { data: user(), requestId });
  });

  await page.goto("/me/settings");
  await expect(page.getByText("Deletion is scheduled")).toBeVisible();
  await page.getByRole("button", { name: "Cancel account deletion" }).click();
  await expect(page.getByText("Deletion is scheduled")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Confirm identity with Google" }),
  ).toBeVisible();
});

test("a late follow failure cannot replace the next creator profile", async ({
  page,
}) => {
  await mockSession(page, user());
  let releaseFollow = () => {};
  const followGate = new Promise<void>((resolve) => {
    releaseFollow = resolve;
  });
  let markFollowStarted = () => {};
  const followStarted = new Promise<void>((resolve) => {
    markFollowStarted = resolve;
  });
  const creator = (username: string, displayName: string) => ({
    avatarSeed: `${username}-avatar-seed`,
    bio: "",
    createdAt: 1_700_000_000_000,
    creationCount: 0,
    displayName,
    followerCount: 4,
    followingCount: 2,
    id: `${username}-id`,
    isFollowing: false,
    role: "user",
    status: "active",
    username,
  });

  await page.route("**/api/users/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/alpha-maker/follow") {
      markFollowStarted();
      await followGate;
      await fulfillJson(
        route,
        {
          error: { code: "SERVICE_UNAVAILABLE", message: "Follow failed" },
          requestId,
        },
        503,
      );
      return;
    }
    const username = path.includes("beta-maker") ? "beta-maker" : "alpha-maker";
    const displayName =
      username === "beta-maker" ? "Beta Maker" : "Alpha Maker";
    if (path.endsWith("/creations")) {
      await fulfillJson(route, {
        data: [],
        meta: { nextCursor: null },
        requestId,
      });
      return;
    }
    await fulfillJson(route, {
      data: { creations: [], user: creator(username, displayName) },
      requestId,
    });
  });

  await page.goto("/u/alpha-maker");
  await expect(
    page.getByRole("heading", { name: "Alpha Maker", exact: true }),
  ).toBeVisible();
  const delayedFailure = page.waitForResponse((response) =>
    response.url().endsWith("/api/users/alpha-maker/follow"),
  );
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await followStarted;

  await page.evaluate(() => {
    window.history.pushState({}, "", "/u/beta-maker");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Beta Maker", exact: true }),
  ).toBeVisible();

  releaseFollow();
  await delayedFailure;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        ),
      ),
  );
  await expect(page).toHaveURL(/\/u\/beta-maker$/);
  await expect(page).toHaveTitle("Beta Maker (@beta-maker) · Tomodachi");
  await expect(
    page.getByRole("heading", { name: "Alpha Maker", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Follow failed", { exact: true })).toHaveCount(0);
});
