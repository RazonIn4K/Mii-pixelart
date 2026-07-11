import { cn } from "@/lib/utils";

const COLORS = ["#f36b5f", "#69b7ef", "#f7cd57", "#79d2ad", "#a992dc"];

function seedNumber(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function IslandAvatar({
  seed,
  label,
  className,
}: {
  seed: string;
  label?: string;
  className?: string;
}) {
  const value = seedNumber(seed || "islander");
  const background = COLORS[value % COLORS.length];
  const shirt = COLORS[(value >>> 4) % COLORS.length];
  const hair = value % 2 === 0 ? "#20202a" : "#6f4a2e";
  const eyesWide = (value >>> 6) % 2 === 0;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-full border-2 border-[var(--island-ink)] bg-white shadow-[2px_2px_0_var(--island-ink)]",
        className,
      )}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 64 64" className="h-full w-full" focusable="false">
        <rect width="64" height="64" fill={background} />
        <circle cx="32" cy="29" r="19" fill="#ffe4c6" />
        <path d="M12 27C13 10 24 6 33 7c12 0 19 8 20 21-6-3-9-9-10-14-6 7-15 11-31 13Z" fill={hair} />
        <path d="M8 64c2-16 12-22 24-22s22 6 24 22Z" fill={shirt} />
        {eyesWide ? (
          <>
            <circle cx="25" cy="29" r="2.2" fill="#20202a" />
            <circle cx="39" cy="29" r="2.2" fill="#20202a" />
          </>
        ) : (
          <>
            <path d="m21 29 4-2 4 2" fill="none" stroke="#20202a" strokeWidth="2" strokeLinecap="round" />
            <path d="m35 29 4-2 4 2" fill="none" stroke="#20202a" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        <path d="M26 36c4 3 8 3 12 0" fill="none" stroke="#d56a61" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
