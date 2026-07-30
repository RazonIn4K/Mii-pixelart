type ZodGlobalConfig = {
  jitless?: boolean;
  [key: string]: unknown;
};

type ZodConfigHost = {
  __zod_globalConfig?: ZodGlobalConfig;
};

/**
 * Opt Zod into its interpreter before any lazy validation bundle loads.
 *
 * Zod 4.4+ otherwise tests `new Function` once to detect whether its object
 * parser JIT can run. A strict CSP correctly blocks that probe, but Chromium
 * still records the caught attempt as a DevTools Issue. Pre-populating Zod's
 * shared config keeps the CSP strict and avoids adding Zod to the entry chunk.
 */
export function configureZodForStrictCsp(
  host: ZodConfigHost = globalThis as ZodConfigHost,
): void {
  const config = host.__zod_globalConfig ?? {};
  config.jitless = true;
  host.__zod_globalConfig = config;
}
