import { expect, test, type Page, type Route } from "@playwright/test";

const requestId = "browser-test-request";

function user(overrides: Record<string, unknown> = {}) {
  return {
    avatarSeed: "00000000-0000-4000-8000-000000000001",
    bio: "",
    createdAt: 1_700_000_000_000,
    displayName: "Test Islander",
    id: "00000000-0000-4000-8000-000000000001",
    requiredTermsVersion: "2026-07-13",
    role: "user",
    status: "active",
    termsAccepted: true,
    termsVersion: "2026-07-13",
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
) {
  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: currentUser
        ? {
            session: {
              createdAt: Date.now(),
              current: true,
              expiresAt: Date.now() + 86_400_000,
              id: "session-1",
              lastSeenAt: Date.now(),
            },
            user: currentUser,
          }
        : { session: null, user: null },
      requestId,
    }),
  );
}

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

test("onboarding stores profile, bio, age attestation, and terms in one request", async ({
  page,
}) => {
  let configured = false;
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: {
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
    termsVersion: "2026-07-13",
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
    name: "Your generated Island Workshop avatar",
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
    name: "Your generated Island Workshop avatar",
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

test("an existing username reviews newer terms without changing identity", async ({
  page,
}) => {
  let accepted = false;
  const returningUser = () =>
    user({
      displayName: "Returning Islander",
      termsAccepted: accepted,
      termsVersion: accepted ? "2026-07-13" : "2026-07-10",
      username: "returning-islander",
    });
  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: {
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
    expect(submitted.termsVersion).toBe("2026-07-13");
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
    expect(attemptedMutations).toEqual([]);
  };

  await page.goto("/discover");
  await page
    .getByRole("button", { name: "Like Terms preflight creation" })
    .click();
  await expectSetupRedirect("/discover");

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

  const gridToggle = page.getByRole("button", { name: "Toggle grid lines" });
  const labelToggle = page.getByRole("button", {
    name: "Toggle paint-by-numbers labels",
  });
  await expect(gridToggle).toHaveAttribute("aria-pressed", "true");
  await expect(labelToggle).toHaveAttribute("aria-pressed", "false");
  await gridToggle.click();
  await labelToggle.click();
  await expect(gridToggle).toHaveAttribute("aria-pressed", "false");
  await expect(labelToggle).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "Create" }).click();
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
  await mockSession(page, currentUser);
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
  await expect(page.getByRole("button", { name: "Use cloud" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save copy" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
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

test("deletion-pending accounts can cancel during the grace period", async ({
  page,
}) => {
  let pending = true;
  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, {
      data: {
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
