import { cn } from "@/lib/utils";
import {
  islandAvatarRecipe,
  type IslandAvatarRecipe,
} from "@/lib/community/avatar";

function AvatarBackground({ recipe }: { recipe: IslandAvatarRecipe }) {
  if (recipe.backgroundPattern === 0) {
    return (
      <g
        fill="none"
        stroke={recipe.backgroundDetail}
        strokeWidth="3"
        opacity="0.62"
      >
        <circle cx="52" cy="11" r="9" />
        <path d="M43 11H35m26 0h-5M52 2v4m0 10v5" strokeLinecap="round" />
      </g>
    );
  }
  if (recipe.backgroundPattern === 1) {
    return (
      <g
        fill="none"
        stroke={recipe.backgroundDetail}
        strokeWidth="4"
        opacity="0.46"
      >
        <path d="M-8 17 17-8M-4 38 38-4M13 47 47 13M29 55 55 29M45 63 63 45" />
      </g>
    );
  }
  if (recipe.backgroundPattern === 2) {
    return (
      <g fill={recipe.backgroundDetail} opacity="0.68">
        <circle cx="11" cy="12" r="3" />
        <circle cx="54" cy="18" r="2" />
        <circle cx="8" cy="48" r="2" />
        <circle cx="50" cy="51" r="4" />
      </g>
    );
  }
  if (recipe.backgroundPattern === 3) {
    return (
      <g
        fill="none"
        stroke={recipe.backgroundDetail}
        strokeWidth="3"
        opacity="0.58"
        strokeLinecap="round"
      >
        <path d="M-2 13c7-5 13-5 20 0s13 5 20 0 13-5 20 0 13 5 20 0" />
        <path d="M-2 23c7-5 13-5 20 0s13 5 20 0 13-5 20 0 13 5 20 0" />
      </g>
    );
  }
  return (
    <g stroke={recipe.backgroundDetail} strokeWidth="1" opacity="0.44">
      <path d="M0 12h64M0 24h64M0 36h64M0 48h64M12 0v64M24 0v64M36 0v64M48 0v64" />
    </g>
  );
}

function Hair({
  recipe,
  layer,
}: {
  recipe: IslandAvatarRecipe;
  layer: "back" | "front";
}) {
  if (recipe.hairStyle === 0) {
    return layer === "front" ? (
      <path
        d="M12 27C13 10 24 6 33 7c12 0 19 8 20 21-6-3-9-9-10-14-6 7-15 11-31 13Z"
        fill={recipe.hair}
      />
    ) : null;
  }
  if (recipe.hairStyle === 1) {
    return layer === "back" ? (
      <path d="M12 30c0-16 8-24 20-24s20 8 20 24v14H12Z" fill={recipe.hair} />
    ) : (
      <path
        d="M14 23c4-13 13-17 25-14 7 2 11 7 12 15-7-1-12-5-16-10-4 7-11 10-21 9Z"
        fill={recipe.hair}
      />
    );
  }
  if (recipe.hairStyle === 2) {
    return layer === "front" ? (
      <g fill={recipe.hair}>
        <circle cx="16" cy="19" r="7" />
        <circle cx="24" cy="11" r="7" />
        <circle cx="34" cy="10" r="7" />
        <circle cx="44" cy="14" r="7" />
        <circle cx="50" cy="22" r="6" />
      </g>
    ) : null;
  }
  if (recipe.hairStyle === 3) {
    return layer === "front" ? (
      <path
        d="M13 24c1-12 8-18 19-18 12 0 19 7 20 18l-5-5-4 4-5-5-5 5-5-5-5 5-4-4Z"
        fill={recipe.hair}
      />
    ) : null;
  }
  return layer === "front" ? (
    <path
      d="M12 26C13 12 21 6 32 6c10 0 18 5 20 16-7-5-14-7-22-6-5 1-11 5-18 10Zm25-17c5 1 9 4 12 8-7-1-13 0-18 3 3-5 4-8 6-11Z"
      fill={recipe.hair}
    />
  ) : null;
}

function Eyes({ recipe }: { recipe: IslandAvatarRecipe }) {
  if (recipe.eyeStyle === 0)
    return (
      <>
        <circle cx="25" cy="29" r="2.2" fill="#20202a" />
        <circle cx="39" cy="29" r="2.2" fill="#20202a" />
      </>
    );
  if (recipe.eyeStyle === 1)
    return (
      <>
        <path
          d="m21 29 4-2 4 2"
          fill="none"
          stroke="#20202a"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="m35 29 4-2 4 2"
          fill="none"
          stroke="#20202a"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </>
    );
  if (recipe.eyeStyle === 2)
    return (
      <>
        <ellipse cx="25" cy="29" rx="2.6" ry="3.3" fill="#20202a" />
        <ellipse cx="39" cy="29" rx="2.6" ry="3.3" fill="#20202a" />
        <circle cx="24" cy="28" r="0.8" fill="white" />
        <circle cx="38" cy="28" r="0.8" fill="white" />
      </>
    );
  return (
    <>
      <path
        d="M21 29h7"
        stroke="#20202a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M36 29h7"
        stroke="#20202a"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  );
}

function Mouth({ recipe }: { recipe: IslandAvatarRecipe }) {
  if (recipe.mouthStyle === 0)
    return (
      <path
        d="M26 36c4 3 8 3 12 0"
        fill="none"
        stroke="#c95f59"
        strokeWidth="2"
        strokeLinecap="round"
      />
    );
  if (recipe.mouthStyle === 1)
    return <path d="M28 36c2 2 6 2 8 0-1 5-7 5-8 0Z" fill="#c95f59" />;
  if (recipe.mouthStyle === 2)
    return (
      <path
        d="M28 37h8"
        stroke="#8f5149"
        strokeWidth="2"
        strokeLinecap="round"
      />
    );
  return (
    <path
      d="m27 36 5 3 5-3"
      fill="none"
      stroke="#c95f59"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Accessory({ recipe }: { recipe: IslandAvatarRecipe }) {
  if (recipe.accessory === 1) {
    return (
      <g fill="none" stroke="#20202a" strokeWidth="1.7">
        <circle cx="25" cy="29" r="5" />
        <circle cx="39" cy="29" r="5" />
        <path d="M30 29h4" />
      </g>
    );
  }
  if (recipe.accessory === 2) {
    return (
      <path
        d="M15 19c8-8 25-10 35 0"
        fill="none"
        stroke={recipe.accent}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    );
  }
  if (recipe.accessory === 3) {
    return (
      <path
        d="m46 16 1.4 3 3.3.3-2.5 2.2.8 3.2-3-1.7-2.8 1.7.7-3.2-2.5-2.2 3.3-.3Z"
        fill={recipe.accent}
        stroke="#20202a"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    );
  }
  if (recipe.accessory === 4) {
    return (
      <>
        <circle
          cx="12.5"
          cy="33"
          r="2"
          fill={recipe.accent}
          stroke="#20202a"
          strokeWidth="1"
        />
        <circle
          cx="51.5"
          cy="33"
          r="2"
          fill={recipe.accent}
          stroke="#20202a"
          strokeWidth="1"
        />
      </>
    );
  }
  if (recipe.accessory === 5) {
    return (
      <g fill="#9c5f50" opacity="0.75">
        <circle cx="20" cy="33" r="0.7" />
        <circle cx="23" cy="34" r="0.7" />
        <circle cx="41" cy="34" r="0.7" />
        <circle cx="44" cy="33" r="0.7" />
      </g>
    );
  }
  return null;
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
  const recipe = islandAvatarRecipe(seed);

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
      <svg
        viewBox="0 0 64 64"
        className="h-full w-full"
        focusable="false"
        aria-hidden="true"
      >
        <rect width="64" height="64" fill={recipe.background} />
        <AvatarBackground recipe={recipe} />
        <Hair recipe={recipe} layer="back" />
        <path
          d="M7 65c2-15 12-23 25-23s23 8 25 23Z"
          fill={recipe.shirt}
          stroke="#20202a"
          strokeWidth="2"
        />
        <path
          d="m24 44 8 7 8-7 4 2-4 9H24l-4-9Z"
          fill={recipe.accent}
          opacity="0.92"
        />
        <circle
          cx="13"
          cy="30"
          r="4"
          fill={recipe.skin}
          stroke="#20202a"
          strokeWidth="1.3"
        />
        <circle
          cx="51"
          cy="30"
          r="4"
          fill={recipe.skin}
          stroke="#20202a"
          strokeWidth="1.3"
        />
        <circle
          cx="32"
          cy="28"
          r="19"
          fill={recipe.skin}
          stroke="#20202a"
          strokeWidth="1.6"
        />
        <Hair recipe={recipe} layer="front" />
        <Eyes recipe={recipe} />
        <path
          d="M31 30.5 29.5 34H33"
          fill="none"
          stroke="#9c6956"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.65"
        />
        <Mouth recipe={recipe} />
        <Accessory recipe={recipe} />
        <circle
          cx="32"
          cy="57"
          r="2.3"
          fill={recipe.accent}
          stroke="#20202a"
          strokeWidth="1"
        />
      </svg>
    </span>
  );
}
