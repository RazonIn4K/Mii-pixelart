import { expect, test, type Page, type Route } from "@playwright/test";

const requestId = "browser-test-request";

function user(overrides: Record<string, unknown> = {}) {
  return {
    avatarSeed: "00000000-0000-4000-8000-000000000001",
    bio: "",
    createdAt: 1_700_000_000_000,
    displayName: "Test Islander",
    id: "00000000-0000-4000-8000-000000000001",
    role: "user",
    status: "active",
    username: "test-islander",
    ...overrides,
  };
}

async function fulfillJson(route: Route, data: unknown, status = 200, headers?: Record<string, string>) {
  await route.fulfill({
    body: JSON.stringify(data),
    contentType: "application/json",
    headers,
    status,
  });
}

async function mockSession(page: Page, currentUser: ReturnType<typeof user> | null) {
  await page.route("**/api/auth/session", (route) => fulfillJson(route, {
    data: currentUser ? {
      session: { createdAt: Date.now(), current: true, expiresAt: Date.now() + 86_400_000, id: "session-1", lastSeenAt: Date.now() },
      user: currentUser,
    } : { session: null, user: null },
    requestId,
  }));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ltg.consent.v1", JSON.stringify({
      analytics: false,
      decidedAt: new Date().toISOString(),
      decision: "rejected",
      essential: true,
      marketing: false,
    }));
  });
});

test("onboarding stores profile, bio, age attestation, and terms in one request", async ({ page }) => {
  let configured = false;
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/auth/session", (route) => fulfillJson(route, {
    data: {
      session: { createdAt: Date.now(), current: true, expiresAt: Date.now() + 86_400_000, id: "session-1", lastSeenAt: Date.now() },
      user: user({
        bio: configured ? "Tiny portraits and paint guides." : "",
        displayName: "New Islander",
        username: configured ? "tiny-islander" : null,
      }),
    },
    requestId,
  }));
  await page.route("**/api/me/setup", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    configured = true;
    await fulfillJson(route, { data: user({ ...submitted }), requestId });
  });
  await page.route("**/api/creations?**", (route) => fulfillJson(route, {
    data: [], meta: { nextCursor: null }, requestId,
  }));

  await page.goto("/me/setup");
  await page.getByLabel("Username").fill("tiny-islander");
  await page.getByLabel("Display name").fill("Tiny Islander");
  await page.getByLabel("Bio (optional)").fill("Tiny portraits and paint guides.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/me\/projects$/);
  expect(submitted).toMatchObject({
    acceptsTerms: true,
    bio: "Tiny portraits and paint guides.",
    confirmsAge13OrOlder: true,
    displayName: "Tiny Islander",
    termsVersion: "2026-07-10",
    username: "tiny-islander",
  });
});

test("project shelf paginates, edits private cards, and uses governed publishing defaults", async ({ page }) => {
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
    state: "draft",
    stats: { comments: 0, likes: 0 },
    tags: [],
    title: "Private draft",
    updatedAt: 1_700_000_000_000,
    visibility: "private",
  };
  const second = { ...creation, id: "00000000-0000-4000-8000-000000000011", slug: "private-draft-0002", title: "Second draft" };
  let publishBody: Record<string, unknown> | null = null;
  await page.route("**/api/creations?**", async (route) => {
    const url = new URL(route.request().url());
    const isSecondPage = Boolean(url.searchParams.get("cursor"));
    await fulfillJson(route, {
      data: isSecondPage ? [second] : [creation],
      meta: { nextCursor: isSecondPage ? null : "next-project-page" },
      requestId,
    });
  });
  await page.route("**/api/tags", (route) => fulfillJson(route, {
    data: [{ description: "Portrait work", name: "Portraits", slug: "portraits" }], requestId,
  }));
  await page.route("**/api/creations/*/publish", async (route) => {
    publishBody = route.request().postDataJSON() as Record<string, unknown>;
    await fulfillJson(route, { data: { ...creation, ...publishBody, state: "published", visibility: "public" }, requestId });
  });
  await page.route("**/api/creations/*/media/*", (route) => route.fulfill({
    body: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"/>",
    contentType: "image/svg+xml",
    status: 200,
  }));

  await page.goto("/me/projects");
  const privateCard = page.getByRole("link", { name: "View Private draft" });
  await expect(privateCard).toHaveAttribute("href", `/studio?cloud=${creation.id}`);
  await page.getByRole("button", { name: "Load more projects" }).click();
  await expect(page.getByText("Second draft", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "More actions for Private draft" }).click();
  await page.getByRole("button", { name: "Review & publish" }).click();
  await expect(page.getByRole("dialog", { name: "Review before publishing" })).toBeVisible();
  await expect(page.getByRole("switch").first()).toBeChecked();
  await expect(page.getByRole("switch").nth(1)).not.toBeChecked();
  await page.getByRole("button", { name: "Portraits" }).click();
  await page.getByRole("button", { name: "Publish publicly" }).click();
  await expect.poll(() => publishBody).not.toBeNull();
  expect(publishBody).toMatchObject({
    commentsEnabled: true,
    projectDownloadEnabled: false,
    tags: ["portraits"],
    visibility: "public",
  });
});

test("a dirty restored cloud draft autosaves before publishing becomes available", async ({ page }) => {
  const currentUser = user();
  await mockSession(page, currentUser);
  let saveCalls = 0;
  await page.route("**/api/creations/*/project", async (route) => {
    saveCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await fulfillJson(route, {
      data: { id: "00000000-0000-4000-8000-000000000020", revision: 2, slug: "restored-draft-01" },
      requestId,
    }, 200, { ETag: '"rev-2"' });
  });

  await page.goto("/");
  await page.evaluate(async ({ userId }) => {
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
        meta: { createdAt: "2026-07-10T12:00:00.000Z", modifiedAt: timestamp, name: "Restored draft" },
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
        if (!open.result.objectStoreNames.contains("drafts")) open.result.createObjectStore("drafts", { keyPath: "id" });
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put(draft);
        transaction.oncomplete = () => { open.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, { userId: currentUser.id });

  await page.goto("/studio");
  await expect(page.getByText("Saving soon…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Saving first…" })).toBeDisabled();
  await expect.poll(() => saveCalls, { timeout: 6_000 }).toBe(1);
  await expect(page.getByText("Saved · v2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
});

test("moderation actions remain disabled until target context and history are reviewed", async ({ page }) => {
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
  await page.route("**/api/moderation/reports?**", (route) => fulfillJson(route, {
    data: [report], meta: { nextCursor: null }, requestId,
  }));
  await page.route("**/api/moderation/stats", (route) => fulfillJson(route, {
    data: { hiddenComments: 0, hiddenCreations: 0, openReports: 1, suspendedUsers: 0 }, requestId,
  }));
  await page.route(`**/api/moderation/reports/${report.id}?**`, (route) => fulfillJson(route, {
    data: {
      actions: [{ action: "lock_comments", createdAt: 1_699_000_000_000, id: "action-1", reason: "Earlier review" }],
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
  }));

  await page.goto("/moderation");
  const rationale = page.getByLabel("Moderator rationale");
  await rationale.fill("Reviewed the current target and retained history.");
  await expect(page.getByRole("button", { name: "Hide & resolve" })).toBeDisabled();
  await page.getByRole("button", { name: "Review target context" }).click();
  await expect(page.getByText("Reported creation", { exact: true })).toBeVisible();
  await expect(page.getByText("Earlier review", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide & resolve" })).toBeEnabled();
});

test("deletion-pending accounts can cancel during the grace period", async ({ page }) => {
  let pending = true;
  await page.route("**/api/auth/session", (route) => fulfillJson(route, {
    data: {
      session: { createdAt: Date.now(), current: true, expiresAt: Date.now() + 86_400_000, id: "session-1", lastSeenAt: Date.now() },
      user: user({ status: pending ? "deletion_pending" : "active" }),
    },
    requestId,
  }));
  await page.route("**/api/me/sessions", (route) => fulfillJson(route, { data: [], requestId }));
  await page.route("**/api/me/deletion/cancel", async (route) => {
    pending = false;
    await fulfillJson(route, { data: user(), requestId });
  });

  await page.goto("/me/settings");
  await expect(page.getByText("Deletion is scheduled")).toBeVisible();
  await page.getByRole("button", { name: "Cancel account deletion" }).click();
  await expect(page.getByText("Deletion is scheduled")).toBeHidden();
  await expect(page.getByRole("button", { name: "Confirm identity with Google" })).toBeVisible();
});
