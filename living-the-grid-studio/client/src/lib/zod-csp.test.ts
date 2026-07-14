import { afterEach, describe, expect, it, vi } from "vitest";

import { configureZodForStrictCsp } from "./zod-csp";

describe("configureZodForStrictCsp", () => {
  const globalConfigHost = globalThis as typeof globalThis & {
    __zod_globalConfig?: { jitless?: boolean; [key: string]: unknown };
  };
  const originalGlobalConfig = globalConfigHost.__zod_globalConfig;

  afterEach(() => {
    if (originalGlobalConfig === undefined) {
      delete globalConfigHost.__zod_globalConfig;
    } else {
      globalConfigHost.__zod_globalConfig = originalGlobalConfig;
    }
    vi.resetModules();
  });

  it("preconfigures lazy Zod bundles without importing Zod", () => {
    const host: {
      __zod_globalConfig?: { jitless?: boolean; marker?: string };
    } = {};

    configureZodForStrictCsp(host);

    expect(host.__zod_globalConfig).toEqual({ jitless: true });
  });

  it("preserves the shared config object and unrelated settings", () => {
    const config = { jitless: false, marker: "keep" };
    const host = { __zod_globalConfig: config };

    configureZodForStrictCsp(host);

    expect(host.__zod_globalConfig).toBe(config);
    expect(host.__zod_globalConfig).toEqual({ jitless: true, marker: "keep" });
  });

  it("makes Zod skip its Function-based JIT capability probe", async () => {
    globalConfigHost.__zod_globalConfig = {};
    configureZodForStrictCsp(globalConfigHost);
    vi.resetModules();

    const { util } = await import("zod/v4/core");
    const originalFunction = globalThis.Function;
    let functionProbeCalls = 0;
    globalThis.Function = function blockedFunctionProbe(): never {
      functionProbeCalls += 1;
      throw new Error("Function constructor must not run under strict CSP");
    } as unknown as FunctionConstructor;

    try {
      expect(util.allowsEval.value).toBe(false);
      expect(functionProbeCalls).toBe(0);
    } finally {
      globalThis.Function = originalFunction;
    }
  });
});
