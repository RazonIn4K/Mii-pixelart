/**
 * templates.ts — Original starter designs for creative pixel builds
 */

import {
  createGridDocument,
  recomputeUsedColors,
  resampleGridNearest,
  type GridDocument,
} from "./grid";

const CREATIVE_TEMPLATE_SOURCES = [
  {
    id: "face-guide",
    name: "Face Guide",
    category: "Faces & Portraits",
    description:
      "A simple original Face Paint and portrait base with skin tones and details.",
    width: 64,
    height: 64,
  },
  {
    id: "mascot-head",
    name: "Mascot Head",
    category: "Characters",
    description: "An original mascot-style character head for fan builds.",
    width: 64,
    height: 64,
  },
  {
    id: "space-crew",
    name: "Space Crew",
    category: "Characters",
    description:
      "An original bubble-pod explorer with a round window, tool arms, and tripod feet.",
    width: 64,
    height: 64,
  },
  {
    id: "tiny-dino",
    name: "Tiny Dino",
    category: "Characters",
    description:
      "An original pocket drake with a quilted shell, leaf plates, and a curled tail.",
    width: 64,
    height: 64,
  },
  {
    id: "cute-monster",
    name: "Cute Monster",
    category: "Characters",
    description: "A playful monster face starter with horns and big eyes.",
    width: 64,
    height: 64,
  },
  {
    id: "haunted-mascot",
    name: "Haunted Mascot",
    category: "Horror & Spooky",
    description:
      "An original midnight moth mascot with crescent wings and mismatched starry eyes.",
    width: 64,
    height: 64,
  },
  {
    id: "bald-teacher",
    name: "Bald Teacher",
    category: "Horror & Spooky",
    description:
      "An original geometric coach-bot with a timer visor, whistle, and clipboard.",
    width: 64,
    height: 64,
  },
  {
    id: "masked-slasher",
    name: "Masked Slasher",
    category: "Horror & Spooky",
    description:
      "An original celestial festival mask with moon panels, star eyes, and ribbon tails.",
    width: 64,
    height: 64,
  },
  {
    id: "pumpkin-ghoul",
    name: "Pumpkin Ghoul",
    category: "Horror & Spooky",
    description: "A jack-o-lantern character starter with cloak and glow.",
    width: 64,
    height: 64,
  },
  {
    id: "ghost-sheet",
    name: "Ghost Sheet",
    category: "Horror & Spooky",
    description: "A readable sheet-ghost starter for simple spooky builds.",
    width: 64,
    height: 64,
  },
  {
    id: "vampire-count",
    name: "Vampire Count",
    category: "Horror & Spooky",
    description: "A classic vampire portrait starter with cape and fangs.",
    width: 64,
    height: 64,
  },
  {
    id: "zombie-buddy",
    name: "Zombie Buddy",
    category: "Horror & Spooky",
    description: "A goofy zombie head starter with scars and uneven eyes.",
    width: 64,
    height: 64,
  },
  {
    id: "creepy-clown",
    name: "Creepy Clown",
    category: "Horror & Spooky",
    description:
      "An original angular carnival mask with jewel tones, tiny bells, and a zigzag grin.",
    width: 64,
    height: 64,
  },
  {
    id: "heart-sticker",
    name: "Heart Sticker",
    category: "Marks & Objects",
    description: "A bold heart sticker with highlight and shadow.",
    width: 64,
    height: 64,
  },
  {
    id: "star-badge",
    name: "Star Badge",
    category: "Marks & Objects",
    description: "A badge-style icon with a central star.",
    width: 64,
    height: 64,
  },
  {
    id: "smile-icon",
    name: "Smile Icon",
    category: "Marks & Objects",
    description: "A compact 16x16 icon starter.",
    width: 16,
    height: 16,
  },
  {
    id: "portrait-bust",
    name: "Portrait Bust",
    category: "Faces & Portraits",
    description: "A simple person/celebrity-style portrait base.",
    width: 64,
    height: 64,
  },
  {
    id: "red-cap-hero",
    name: "Red Cap Hero",
    category: "Characters",
    description:
      "An original trail courier portrait with a teal hood, compass visor, scarf, and satchel strap.",
    width: 64,
    height: 64,
  },
  {
    id: "green-adventurer",
    name: "Green Adventurer",
    category: "Characters",
    description:
      "An original owl forest scout with leaf plumage, field goggles, and a bright neckerchief.",
    width: 64,
    height: 64,
  },
  {
    id: "blue-speed-mascot",
    name: "Blue Speed Mascot",
    category: "Characters",
    description:
      "An original comet courier-bot with a glass visor, orbit fin, and ribbon-like thruster trail.",
    width: 64,
    height: 64,
  },
  {
    id: "arcade-fighter",
    name: "Arcade Fighter",
    category: "Faces & Portraits",
    description: "A generic fighting-game portrait starter.",
    width: 64,
    height: 64,
  },
  {
    id: "space-helmet",
    name: "Space Helmet",
    category: "Faces & Portraits",
    description: "A sci-fi helmet starter for armored characters.",
    width: 64,
    height: 64,
  },
  {
    id: "robot-face",
    name: "Robot Face",
    category: "Faces & Portraits",
    description: "A mechanical face starter for robots and masks.",
    width: 64,
    height: 64,
  },
  {
    id: "letter-mark",
    name: "Letter Mark",
    category: "Marks & Objects",
    description: "A bold badge starter for brand-style marks.",
    width: 64,
    height: 64,
  },
  {
    id: "controller-icon",
    name: "Controller Icon",
    category: "Marks & Objects",
    description: "A simple game-object icon starter.",
    width: 32,
    height: 32,
  },
  {
    id: "racing-kart",
    name: "Racing Kart",
    category: "Marks & Objects",
    description:
      "A small kart-style vehicle icon for fun room and item builds.",
    width: 64,
    height: 64,
  },
  {
    id: "pizza-slice",
    name: "Pizza Slice",
    category: "Marks & Objects",
    description: "A bold snack icon starter with toppings and crust.",
    width: 64,
    height: 64,
  },
  {
    id: "sword-badge",
    name: "Sword Badge",
    category: "Marks & Objects",
    description: "A fantasy badge starter with a readable sword silhouette.",
    width: 64,
    height: 64,
  },
] as const;

const TEMPLATE_WORKFLOW_BY_CATEGORY = {
  "Faces & Portraits": {
    guideSections: 8,
    guideLabel: "Center + 8×8 guide",
  },
  Characters: {
    guideSections: 8,
    guideLabel: "8×8 section guide",
  },
  "Horror & Spooky": {
    guideSections: 8,
    guideLabel: "8×8 section guide",
  },
  "Marks & Objects": {
    guideSections: 4,
    guideLabel: "4×4 section guide",
  },
} as const;

const SUPPORTED_TEMPLATE_BRUSH_PIXELS = [4, 8, 16, 32] as const;

export type CreativeTemplateGuideSections = 4 | 8;
export type CreativeTemplateBrushPixels =
  (typeof SUPPORTED_TEMPLATE_BRUSH_PIXELS)[number];

function getRecommendedBrushPixels(
  sourceWidth: number,
): CreativeTemplateBrushPixels {
  const expandedCellWidth = 256 / sourceWidth;

  return SUPPORTED_TEMPLATE_BRUSH_PIXELS.reduce((closest, candidate) =>
    Math.abs(candidate - expandedCellWidth) <
    Math.abs(closest - expandedCellWidth)
      ? candidate
      : closest,
  );
}

const ORIGINAL_DISPLAY_NAME_BY_ID: Readonly<Record<string, string>> = {
  "face-guide": "Face Landmark Guide",
  "mascot-head": "Island Mascot",
  "space-crew": "Bubble Explorer",
  "tiny-dino": "Pocket Dino",
  "cute-monster": "Pebble Monster",
  "haunted-mascot": "Midnight Mascot",
  "bald-teacher": "Grid Coach",
  "masked-slasher": "Moon Mask",
  "red-cap-hero": "Trail Courier",
  "green-adventurer": "Forest Scout",
  "blue-speed-mascot": "Comet Runner",
  "arcade-fighter": "Neon Challenger",
  "controller-icon": "Twin-Stick Badge",
  "racing-kart": "Solar Buggy",
};

/**
 * Template IDs intentionally remain stable internal provenance keys. Some
 * local projects and exported Studio JSON may already carry these values;
 * changing them would break traceability without improving the user-facing
 * catalog, which exposes only the original display names above.
 */

/**
 * Every starter opens on the game's full 256×256 planning surface. The source
 * drawings below deliberately stay compact and are expanded with nearest-
 * neighbour blocks so their marks remain easy to count and copy in-game.
 */
export const CREATIVE_TEMPLATES = CREATIVE_TEMPLATE_SOURCES.map((template) => {
  const workflow = TEMPLATE_WORKFLOW_BY_CATEGORY[template.category];
  const recommendedBrushPixels = getRecommendedBrushPixels(template.width);

  return {
    ...template,
    displayName: ORIGINAL_DISPLAY_NAME_BY_ID[template.id] ?? template.name,
    sourceWidth: template.width,
    sourceHeight: template.height,
    width: 256,
    height: 256,
    surfaceLabel: "256×256 transparent",
    ...workflow,
    guideSections: workflow.guideSections as CreativeTemplateGuideSections,
    recommendedBrushPixels,
    brushLabel: `${recommendedBrushPixels} px game stamp`,
  };
});

export type CreativeTemplateId =
  (typeof CREATIVE_TEMPLATE_SOURCES)[number]["id"];

export function getCreativeTemplateDefinition(templateId: CreativeTemplateId) {
  const template = CREATIVE_TEMPLATES.find((entry) => entry.id === templateId);
  if (!template) {
    throw new Error(`Unknown creative template: ${templateId}`);
  }
  return template;
}

type MutableCells = (string | null)[];

function createCreativeTemplateSourceDocument(
  templateId: CreativeTemplateId,
): GridDocument {
  switch (templateId) {
    case "face-guide":
      return createFaceGuideTemplate();
    case "mascot-head":
      return createMascotHeadTemplate();
    case "space-crew":
      return createSpaceCrewTemplate();
    case "tiny-dino":
      return createTinyDinoTemplate();
    case "cute-monster":
      return createCuteMonsterTemplate();
    case "haunted-mascot":
      return createHauntedMascotTemplate();
    case "bald-teacher":
      return createBaldTeacherTemplate();
    case "masked-slasher":
      return createMaskedSlasherTemplate();
    case "pumpkin-ghoul":
      return createPumpkinGhoulTemplate();
    case "ghost-sheet":
      return createGhostSheetTemplate();
    case "vampire-count":
      return createVampireCountTemplate();
    case "zombie-buddy":
      return createZombieBuddyTemplate();
    case "creepy-clown":
      return createCreepyClownTemplate();
    case "heart-sticker":
      return createHeartStickerTemplate();
    case "star-badge":
      return createStarBadgeTemplate();
    case "smile-icon":
      return createSmileIconTemplate();
    case "portrait-bust":
      return createPortraitBustTemplate();
    case "red-cap-hero":
      return createRedCapHeroTemplate();
    case "green-adventurer":
      return createGreenAdventurerTemplate();
    case "blue-speed-mascot":
      return createBlueSpeedMascotTemplate();
    case "arcade-fighter":
      return createArcadeFighterTemplate();
    case "space-helmet":
      return createSpaceHelmetTemplate();
    case "robot-face":
      return createRobotFaceTemplate();
    case "letter-mark":
      return createLetterMarkTemplate();
    case "controller-icon":
      return createControllerIconTemplate();
    case "racing-kart":
      return createRacingKartTemplate();
    case "pizza-slice":
      return createPizzaSliceTemplate();
    case "sword-badge":
      return createSwordBadgeTemplate();
    default:
      return exhaustive(templateId);
  }
}

/** Expand one compact, transparent source design onto the game surface. */
export function createCreativeTemplateDocument(
  templateId: CreativeTemplateId,
): GridDocument {
  const template = getCreativeTemplateDefinition(templateId);
  const expanded = resampleGridNearest(
    createCreativeTemplateSourceDocument(templateId),
    256,
    256,
  );

  return {
    ...expanded,
    meta: {
      ...expanded.meta,
      name: template.displayName,
      notes: template.description,
      sourceFormat: "creative-template",
      sourceMetadata: {
        templateId: template.id,
        templateCategory: template.category,
        templateName: template.displayName,
        templateLegacyName: template.name,
        guideSections: template.guideSections,
        recommendedBrushPixels: template.recommendedBrushPixels,
      },
    },
  };
}

/**
 * Compact, lossless fixture form used by repository verification.
 *
 * Runtime starters stay canonical 256×256 documents. The generated artwork is
 * composed of exact nearest-neighbour blocks, so downsampling it to its source
 * dimensions and expanding it again is lossless while avoiding tens of
 * megabytes of repetitive checked-in JSON.
 */
export function createCreativeTemplateFixtureDocument(
  templateId: CreativeTemplateId,
): GridDocument {
  return createCreativeTemplateSourceDocument(templateId);
}

function createFaceGuideTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  ellipse(cells, width, height, 32, 35, 22, 26, "R11C2");
  ellipse(cells, width, height, 32, 36, 19, 23, "R9C5");
  ellipse(cells, width, height, 32, 39, 15, 18, "R9C6");
  ellipse(cells, width, height, 21, 36, 5, 14, "R9C4");
  ellipse(cells, width, height, 43, 36, 5, 14, "R9C4");
  ellipse(cells, width, height, 32, 18, 19, 9, "R11C1");
  ellipse(cells, width, height, 32, 18, 17, 7, "R11C2");
  rect(cells, width, 17, 18, 47, 23, "R11C2");
  rect(cells, width, 20, 24, 29, 26, "R11C1");
  rect(cells, width, 35, 24, 44, 26, "R11C1");
  rect(cells, width, 22, 29, 28, 31, "R10C1");
  rect(cells, width, 36, 29, 42, 31, "R10C1");
  rect(cells, width, 24, 30, 25, 31, "R10C7");
  rect(cells, width, 38, 30, 39, 31, "R10C7");
  rect(cells, width, 31, 32, 33, 42, "R9C3");
  rect(cells, width, 29, 43, 35, 45, "R9C3");
  line(cells, width, 25, 49, 39, 49, "R1C2");
  line(cells, width, 28, 51, 36, 51, "R1C4");
  rect(cells, width, 17, 39, 21, 42, "R1C6");
  rect(cells, width, 43, 39, 47, 42, "R1C6");
  rect(cells, width, 30, 56, 34, 60, "R9C4");
  rect(cells, width, 20, 60, 44, 63, "R6C6");

  return createTemplateDocument(width, height, "Face Guide Template", cells);
}

function createMascotHeadTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  // Original showtime-bear archetype: strong outline first, then readable
  // mask landmarks that survive downscaling and repainting.
  circle(cells, width, height, 18, 17, 12, "R11C1");
  circle(cells, width, height, 46, 17, 12, "R11C1");
  circle(cells, width, height, 18, 17, 9, "R9C2");
  circle(cells, width, height, 46, 17, 9, "R9C2");
  circle(cells, width, height, 18, 18, 5, "R9C1");
  circle(cells, width, height, 46, 18, 5, "R9C1");

  ellipse(cells, width, height, 32, 36, 24, 23, "R11C1");
  ellipse(cells, width, height, 32, 36, 21, 20, "R9C2");
  ellipse(cells, width, height, 32, 34, 17, 16, "R9C3");
  ellipse(cells, width, height, 21, 36, 5, 15, "R9C1");
  ellipse(cells, width, height, 43, 36, 5, 15, "R9C1");
  rect(cells, width, 26, 22, 38, 25, "R9C4");
  rect(cells, width, 29, 24, 35, 27, "R9C4");

  rect(cells, width, 21, 29, 28, 36, "R10C1");
  rect(cells, width, 36, 29, 43, 36, "R10C1");
  rect(cells, width, 23, 30, 24, 31, "R10C7");
  rect(cells, width, 38, 30, 39, 31, "R10C7");
  rect(cells, width, 19, 26, 29, 27, "R11C1");
  rect(cells, width, 35, 26, 45, 27, "R11C1");

  ellipse(cells, width, height, 32, 42, 15, 10, "R11C1");
  ellipse(cells, width, height, 32, 41, 13, 8, "R9C5");
  ellipse(cells, width, height, 32, 38, 6, 4, "R10C1");
  rect(cells, width, 31, 42, 33, 47, "R10C1");
  line(cells, width, 25, 48, 39, 48, "R10C1");
  rect(cells, width, 25, 50, 39, 54, "R11C1");
  rect(cells, width, 27, 50, 30, 53, "R10C7");
  rect(cells, width, 33, 50, 36, 53, "R10C7");
  rect(cells, width, 31, 51, 32, 54, "R10C7");
  rect(cells, width, 28, 55, 36, 56, "R1C1");

  rect(cells, width, 18, 41, 20, 43, "R2C3");
  rect(cells, width, 44, 41, 46, 43, "R2C3");
  rect(cells, width, 21, 44, 22, 45, "R11C1");
  rect(cells, width, 42, 44, 43, 45, "R11C1");
  rect(cells, width, 27, 8, 37, 12, "R10C1");
  rect(cells, width, 24, 13, 40, 17, "R11C1");
  rect(cells, width, 23, 15, 27, 17, "R9C4");
  rect(cells, width, 37, 15, 41, 17, "R9C4");
  line(cells, width, 17, 48, 13, 51, "R11C1");
  line(cells, width, 47, 48, 51, 51, "R11C1");
  rect(cells, width, 15, 20, 18, 22, "R9C4");
  rect(cells, width, 46, 20, 49, 22, "R9C4");

  return createTemplateDocument(width, height, "Mascot Head Template", cells);
}

function createSpaceCrewTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, null);

  // A round bubble-pod with tool arms and a three-point landing base. The
  // silhouette is deliberately radial instead of a one-piece space suit.
  line(cells, width, 31, 10, 36, 4, "R11C1");
  circle(cells, width, height, 37, 4, 4, "R11C1");
  circle(cells, width, height, 37, 4, 2, "R3C3");
  circle(cells, width, height, 53, 12, 3, "R5C2");
  circle(cells, width, height, 57, 18, 2, "R5C4");

  circle(cells, width, height, 32, 28, 22, "R11C1");
  circle(cells, width, height, 32, 28, 19, "R5C2");
  circle(cells, width, height, 32, 27, 15, "R5C5");
  ellipse(cells, width, height, 34, 26, 12, 10, "R6C5");
  rect(cells, width, 21, 27, 45, 33, "R6C4");
  rect(cells, width, 25, 26, 29, 30, "R10C1");
  rect(cells, width, 38, 26, 42, 30, "R10C1");
  rect(cells, width, 27, 27, 28, 28, "R10C7");
  rect(cells, width, 40, 27, 41, 28, "R10C7");
  line(cells, width, 29, 34, 38, 34, "R6C1");
  rect(cells, width, 18, 37, 46, 42, "R11C1");
  rect(cells, width, 21, 38, 43, 42, "R3C3");
  rect(cells, width, 29, 39, 35, 41, "R3C6");

  polygon(
    cells,
    width,
    height,
    [
      [14, 39],
      [5, 45],
      [10, 51],
      [20, 45],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [15, 40],
      [8, 45],
      [11, 48],
      [20, 43],
    ],
    "R2C3",
  );
  rect(cells, width, 5, 48, 10, 53, "R11C1");
  rect(cells, width, 6, 49, 9, 52, "R3C3");

  polygon(
    cells,
    width,
    height,
    [
      [47, 39],
      [57, 35],
      [60, 42],
      [47, 47],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [46, 41],
      [56, 38],
      [57, 41],
      [46, 45],
    ],
    "R7C4",
  );
  circle(cells, width, height, 59, 38, 3, "R11C1");
  circle(cells, width, height, 59, 38, 1, "R3C3");

  polygon(
    cells,
    width,
    height,
    [
      [20, 43],
      [28, 43],
      [25, 59],
      [15, 59],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [36, 43],
      [44, 43],
      [49, 59],
      [39, 59],
    ],
    "R11C1",
  );
  rect(cells, width, 18, 55, 26, 60, "R5C2");
  rect(cells, width, 39, 55, 47, 60, "R5C2");
  polygon(
    cells,
    width,
    height,
    [
      [29, 43],
      [35, 43],
      [36, 61],
      [28, 61],
    ],
    "R11C1",
  );
  rect(cells, width, 30, 44, 34, 58, "R2C3");

  return createTemplateDocument(width, height, "Space Crew Template", cells);
}

function createTinyDinoTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, null);

  // A low, quilted pocket drake: round leaf plates and a curled tail keep it
  // visually separate from familiar upright dinosaur mascots.
  circle(cells, width, height, 12, 37, 10, "R11C1");
  circle(cells, width, height, 12, 37, 7, "R7C4");
  circle(cells, width, height, 13, 36, 3, "R5C4");
  rect(cells, width, 12, 27, 22, 43, "R11C1");

  ellipse(cells, width, height, 31, 38, 22, 15, "R11C1");
  ellipse(cells, width, height, 31, 38, 19, 12, "R7C5");
  ellipse(cells, width, height, 29, 39, 15, 9, "R5C5");
  line(cells, width, 19, 31, 38, 46, "R7C2");
  line(cells, width, 22, 47, 41, 31, "R7C2");
  circle(cells, width, height, 25, 36, 3, "R2C4");
  circle(cells, width, height, 35, 41, 3, "R2C4");
  circle(cells, width, height, 38, 32, 2, "R3C4");

  circle(cells, width, height, 22, 22, 7, "R11C1");
  circle(cells, width, height, 22, 22, 5, "R4C4");
  circle(cells, width, height, 32, 20, 8, "R11C1");
  circle(cells, width, height, 32, 20, 6, "R4C5");
  circle(cells, width, height, 42, 22, 7, "R11C1");
  circle(cells, width, height, 42, 22, 5, "R4C4");

  ellipse(cells, width, height, 49, 30, 11, 10, "R11C1");
  ellipse(cells, width, height, 49, 31, 8, 7, "R4C4");
  rect(cells, width, 50, 33, 60, 38, "R11C1");
  rect(cells, width, 51, 33, 58, 36, "R4C5");
  circle(cells, width, height, 51, 28, 3, "R10C1");
  set(cells, width, 52, 27, "R10C7");
  rect(cells, width, 57, 35, 60, 36, "R2C3");
  polygon(
    cells,
    width,
    height,
    [
      [44, 21],
      [50, 12],
      [53, 24],
    ],
    "R3C3",
  );

  rect(cells, width, 21, 47, 28, 56, "R11C1");
  rect(cells, width, 23, 47, 27, 53, "R7C5");
  rect(cells, width, 19, 54, 29, 58, "R11C1");
  rect(cells, width, 39, 46, 46, 55, "R11C1");
  rect(cells, width, 40, 46, 44, 52, "R7C5");
  rect(cells, width, 38, 53, 48, 57, "R11C1");

  return createTemplateDocument(width, height, "Tiny Dino Template", cells);
}

function createCuteMonsterTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  polygon(
    cells,
    width,
    height,
    [
      [19, 18],
      [25, 7],
      [30, 21],
    ],
    "R10C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [45, 18],
      [39, 7],
      [34, 21],
    ],
    "R10C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [20, 17],
      [25, 9],
      [28, 21],
    ],
    "R3C4",
  );
  polygon(
    cells,
    width,
    height,
    [
      [44, 17],
      [39, 9],
      [36, 21],
    ],
    "R3C4",
  );
  ellipse(cells, width, height, 32, 35, 24, 23, "R10C1");
  ellipse(cells, width, height, 32, 35, 21, 20, "R7C3");
  ellipse(cells, width, height, 32, 38, 17, 14, "R7C4");
  circle(cells, width, height, 23, 32, 8, "R10C7");
  circle(cells, width, height, 41, 32, 8, "R10C7");
  rect(cells, width, 21, 31, 25, 36, "R10C1");
  rect(cells, width, 39, 31, 43, 36, "R10C1");
  rect(cells, width, 24, 31, 25, 32, "R10C7");
  rect(cells, width, 42, 31, 43, 32, "R10C7");
  rect(cells, width, 23, 46, 41, 49, "R10C1");
  rect(cells, width, 25, 46, 28, 48, "R10C7");
  rect(cells, width, 32, 46, 35, 48, "R10C7");
  rect(cells, width, 38, 46, 40, 48, "R10C7");
  rect(cells, width, 19, 41, 22, 44, "R8C5");
  rect(cells, width, 42, 41, 45, 44, "R8C5");
  rect(cells, width, 27, 55, 31, 58, "R10C1");
  rect(cells, width, 35, 55, 39, 58, "R10C1");
  rect(cells, width, 20, 53, 25, 56, "R7C4");
  rect(cells, width, 39, 53, 44, 56, "R7C4");
  rect(cells, width, 18, 53, 19, 54, "R10C1");
  rect(cells, width, 45, 53, 46, 54, "R10C1");
  rect(cells, width, 28, 23, 36, 25, "R8C5");

  return createTemplateDocument(width, height, "Cute Monster Template", cells);
}

function createHauntedMascotTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, null);

  // Midnight moth mascot: broad crescent wings, a diamond head, antennae,
  // and mismatched celestial eyes instead of animal ears and teeth.
  line(cells, width, 28, 16, 22, 6, "R11C1");
  line(cells, width, 36, 16, 43, 6, "R11C1");
  circle(cells, width, height, 21, 5, 3, "R3C3");
  circle(cells, width, height, 44, 5, 3, "R5C4");
  polygon(
    cells,
    width,
    height,
    [
      [27, 18],
      [7, 9],
      [10, 36],
      [24, 46],
      [30, 36],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [25, 20],
      [10, 13],
      [13, 32],
      [24, 40],
      [28, 34],
    ],
    "R7C2",
  );
  polygon(
    cells,
    width,
    height,
    [
      [37, 18],
      [57, 9],
      [54, 36],
      [40, 46],
      [34, 36],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [39, 20],
      [54, 13],
      [51, 32],
      [40, 40],
      [36, 34],
    ],
    "R6C1",
  );
  line(cells, width, 14, 20, 24, 27, "R7C5");
  line(cells, width, 50, 20, 40, 27, "R6C5");

  polygon(
    cells,
    width,
    height,
    [
      [32, 13],
      [47, 29],
      [40, 47],
      [32, 53],
      [24, 47],
      [17, 29],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [32, 17],
      [43, 30],
      [37, 44],
      [32, 48],
      [27, 44],
      [21, 30],
    ],
    "R7C4",
  );
  polygon(
    cells,
    width,
    height,
    [
      [26, 27],
      [30, 31],
      [26, 35],
      [22, 31],
    ],
    "R3C3",
  );
  circle(cells, width, height, 38, 31, 6, "R5C5");
  circle(cells, width, height, 40, 29, 5, "R7C2");
  rect(cells, width, 31, 35, 34, 39, "R2C3");
  line(cells, width, 27, 42, 32, 44, "R5C4");
  line(cells, width, 32, 44, 37, 41, "R5C4");
  circle(cells, width, height, 32, 44, 2, "R3C3");

  polygon(
    cells,
    width,
    height,
    [
      [22, 49],
      [32, 53],
      [26, 61],
      [17, 55],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [42, 49],
      [32, 53],
      [38, 61],
      [47, 55],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [21, 51],
      [30, 54],
      [26, 58],
    ],
    "R5C2",
  );
  polygon(
    cells,
    width,
    height,
    [
      [43, 51],
      [34, 54],
      [38, 58],
    ],
    "R2C3",
  );

  return createTemplateDocument(
    width,
    height,
    "Haunted Mascot Template",
    cells,
  );
}

function createBaldTeacherTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, null);

  // A geometric coach-bot with an LED timer face, whistle, clipboard, and
  // checker jersey. It reads as equipment rather than a human teacher.
  line(cells, width, 32, 10, 32, 3, "R11C1");
  circle(cells, width, height, 32, 3, 3, "R2C3");
  rect(cells, width, 14, 14, 50, 39, "R11C1");
  rect(cells, width, 17, 17, 47, 36, "R5C2");
  rect(cells, width, 20, 20, 44, 30, "R10C1");
  rect(cells, width, 23, 23, 29, 27, "R3C3");
  rect(cells, width, 35, 23, 41, 27, "R3C3");
  rect(cells, width, 30, 22, 34, 28, "R5C4");
  rect(cells, width, 25, 31, 39, 33, "R10C7");
  rect(cells, width, 27, 31, 29, 33, "R10C1");
  rect(cells, width, 35, 31, 37, 33, "R10C1");
  rect(cells, width, 9, 22, 14, 32, "R11C1");
  rect(cells, width, 10, 24, 13, 30, "R2C3");
  rect(cells, width, 50, 22, 55, 32, "R11C1");
  rect(cells, width, 51, 24, 54, 30, "R7C4");

  polygon(
    cells,
    width,
    height,
    [
      [18, 39],
      [46, 39],
      [51, 61],
      [13, 61],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [20, 41],
      [44, 41],
      [47, 58],
      [17, 58],
    ],
    "R2C3",
  );
  rect(cells, width, 20, 42, 27, 49, "R5C5");
  rect(cells, width, 28, 42, 35, 49, "R7C4");
  rect(cells, width, 36, 42, 43, 49, "R5C5");
  rect(cells, width, 20, 50, 27, 57, "R7C4");
  rect(cells, width, 28, 50, 35, 57, "R5C5");
  rect(cells, width, 36, 50, 43, 57, "R7C4");

  line(cells, width, 32, 39, 32, 46, "R3C3");
  circle(cells, width, height, 32, 48, 4, "R11C1");
  circle(cells, width, height, 32, 48, 2, "R3C3");
  line(cells, width, 14, 45, 6, 50, "R11C1");
  circle(cells, width, height, 5, 51, 3, "R5C2");

  rect(cells, width, 46, 39, 60, 57, "R11C1");
  rect(cells, width, 48, 41, 58, 55, "R3C6");
  rect(cells, width, 51, 39, 55, 42, "R2C3");
  line(cells, width, 50, 46, 56, 46, "R10C3");
  line(cells, width, 50, 50, 55, 50, "R10C3");
  line(cells, width, 50, 54, 54, 54, "R10C3");

  return createTemplateDocument(width, height, "Bald Teacher Template", cells);
}

function createMaskedSlasherTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, null);

  // A floating celestial festival mask. The split moon panels, star windows,
  // forehead gem, and ribbon tails avoid the language of a human slasher mask.
  polygon(
    cells,
    width,
    height,
    [
      [32, 6],
      [49, 12],
      [58, 29],
      [50, 47],
      [32, 55],
      [14, 47],
      [6, 29],
      [15, 12],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [31, 10],
      [28, 50],
      [16, 44],
      [10, 29],
      [17, 15],
    ],
    "R6C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [33, 10],
      [47, 15],
      [54, 29],
      [48, 44],
      [32, 51],
    ],
    "R7C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [32, 11],
      [37, 18],
      [32, 23],
      [27, 18],
    ],
    "R3C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [21, 24],
      [26, 29],
      [21, 34],
      [16, 29],
    ],
    "R5C5",
  );
  circle(cells, width, height, 43, 29, 7, "R3C4");
  circle(cells, width, height, 46, 27, 6, "R7C3");
  rect(cells, width, 30, 27, 34, 39, "R2C3");
  polygon(
    cells,
    width,
    height,
    [
      [23, 40],
      [32, 45],
      [41, 40],
      [36, 47],
      [28, 47],
    ],
    "R5C4",
  );
  circle(cells, width, height, 14, 18, 3, "R2C3");
  circle(cells, width, height, 50, 18, 3, "R3C3");

  polygon(
    cells,
    width,
    height,
    [
      [22, 49],
      [30, 53],
      [25, 63],
      [15, 56],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [42, 49],
      [34, 53],
      [39, 63],
      [49, 56],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [22, 51],
      [28, 54],
      [24, 59],
    ],
    "R6C4",
  );
  polygon(
    cells,
    width,
    height,
    [
      [42, 51],
      [36, 54],
      [40, 59],
    ],
    "R7C4",
  );

  return createTemplateDocument(
    width,
    height,
    "Masked Slasher Template",
    cells,
  );
}

function createPumpkinGhoulTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  rect(cells, width, 17, 48, 47, 63, "R11C1");
  rect(cells, width, 20, 49, 44, 63, "R7C1");
  rect(cells, width, 29, 11, 35, 18, "R11C1");
  rect(cells, width, 30, 9, 34, 16, "R4C1");
  ellipse(cells, width, height, 32, 33, 24, 20, "R11C1");
  ellipse(cells, width, height, 32, 33, 21, 17, "R2C3");
  ellipse(cells, width, height, 24, 33, 9, 15, "R2C4");
  ellipse(cells, width, height, 40, 33, 9, 15, "R2C4");
  polygon(
    cells,
    width,
    height,
    [
      [21, 29],
      [29, 24],
      [29, 35],
    ],
    "R10C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [43, 29],
      [35, 24],
      [35, 35],
    ],
    "R10C1",
  );
  rect(cells, width, 30, 34, 34, 38, "R10C1");
  polygon(
    cells,
    width,
    height,
    [
      [20, 43],
      [26, 39],
      [32, 43],
      [38, 39],
      [45, 43],
      [39, 48],
      [25, 48],
    ],
    "R10C1",
  );
  rect(cells, width, 25, 43, 29, 45, "R3C4");
  rect(cells, width, 35, 43, 39, 45, "R3C4");
  line(cells, width, 19, 32, 45, 32, "R2C2");
  line(cells, width, 32, 17, 32, 50, "R2C2");
  rect(cells, width, 16, 53, 20, 63, "R7C2");
  rect(cells, width, 44, 53, 48, 63, "R7C2");

  return createTemplateDocument(width, height, "Pumpkin Ghoul Template", cells);
}

function createGhostSheetTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  ellipse(cells, width, height, 32, 28, 22, 20, "R11C1");
  rect(cells, width, 11, 28, 53, 51, "R11C1");
  polygon(
    cells,
    width,
    height,
    [
      [11, 51],
      [20, 59],
      [29, 51],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [26, 51],
      [34, 60],
      [42, 51],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [39, 51],
      [48, 59],
      [53, 51],
    ],
    "R11C1",
  );
  ellipse(cells, width, height, 32, 28, 19, 17, "R10C7");
  rect(cells, width, 14, 29, 50, 50, "R10C7");
  polygon(
    cells,
    width,
    height,
    [
      [15, 50],
      [21, 55],
      [28, 50],
    ],
    "R10C7",
  );
  polygon(
    cells,
    width,
    height,
    [
      [28, 50],
      [34, 56],
      [40, 50],
    ],
    "R10C7",
  );
  polygon(
    cells,
    width,
    height,
    [
      [41, 50],
      [47, 55],
      [50, 50],
    ],
    "R10C7",
  );
  ellipse(cells, width, height, 24, 31, 5, 7, "R10C1");
  ellipse(cells, width, height, 40, 31, 5, 7, "R10C1");
  rect(cells, width, 29, 42, 36, 45, "R10C1");
  rect(cells, width, 20, 20, 27, 22, "R10C6");
  rect(cells, width, 18, 23, 22, 25, "R10C6");
  rect(cells, width, 44, 44, 48, 47, "R10C5");

  return createTemplateDocument(width, height, "Ghost Sheet Template", cells);
}

function createVampireCountTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  polygon(
    cells,
    width,
    height,
    [
      [12, 51],
      [26, 40],
      [32, 63],
      [15, 63],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [52, 51],
      [38, 40],
      [32, 63],
      [49, 63],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [16, 53],
      [28, 44],
      [31, 63],
      [18, 63],
    ],
    "R1C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [48, 53],
      [36, 44],
      [33, 63],
      [46, 63],
    ],
    "R1C1",
  );
  rect(cells, width, 20, 51, 44, 63, "R11C1");
  rect(cells, width, 23, 52, 41, 63, "R7C1");
  ellipse(cells, width, height, 32, 30, 19, 22, "R11C1");
  ellipse(cells, width, height, 32, 31, 16, 19, "R9C5");
  polygon(
    cells,
    width,
    height,
    [
      [13, 19],
      [24, 8],
      [32, 19],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [51, 19],
      [40, 8],
      [32, 19],
    ],
    "R11C1",
  );
  rect(cells, width, 18, 19, 46, 25, "R11C1");
  rect(cells, width, 20, 22, 44, 27, "R11C2");
  rect(cells, width, 23, 32, 29, 35, "R10C1");
  rect(cells, width, 35, 32, 41, 35, "R10C1");
  rect(cells, width, 25, 32, 26, 33, "R1C2");
  rect(cells, width, 38, 32, 39, 33, "R1C2");
  rect(cells, width, 31, 36, 33, 41, "R9C3");
  rect(cells, width, 25, 44, 39, 46, "R1C2");
  rect(cells, width, 28, 47, 30, 50, "R10C7");
  rect(cells, width, 34, 47, 36, 50, "R10C7");
  rect(cells, width, 31, 53, 33, 63, "R10C7");

  return createTemplateDocument(width, height, "Vampire Count Template", cells);
}

function createZombieBuddyTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  rect(cells, width, 16, 50, 48, 63, "R11C1");
  rect(cells, width, 19, 51, 45, 63, "R4C3");
  ellipse(cells, width, height, 32, 32, 21, 24, "R11C1");
  ellipse(cells, width, height, 32, 33, 18, 21, "R4C4");
  rect(cells, width, 17, 18, 47, 23, "R4C2");
  rect(cells, width, 20, 14, 31, 19, "R11C2");
  rect(cells, width, 34, 15, 45, 20, "R11C2");
  rect(cells, width, 21, 31, 29, 38, "R10C7");
  rect(cells, width, 36, 30, 44, 37, "R10C7");
  rect(cells, width, 24, 33, 28, 37, "R10C1");
  rect(cells, width, 37, 31, 40, 35, "R10C1");
  rect(cells, width, 31, 38, 34, 43, "R4C2");
  rect(cells, width, 25, 47, 41, 50, "R10C1");
  rect(cells, width, 27, 47, 30, 49, "R10C7");
  rect(cells, width, 34, 47, 37, 49, "R10C7");
  line(cells, width, 20, 27, 27, 24, "R10C1");
  line(cells, width, 37, 24, 45, 27, "R10C1");
  line(cells, width, 19, 42, 25, 38, "R1C2");
  line(cells, width, 42, 42, 47, 46, "R1C2");
  rect(cells, width, 21, 53, 27, 63, "R10C7");
  rect(cells, width, 37, 53, 43, 63, "R10C7");

  return createTemplateDocument(width, height, "Zombie Buddy Template", cells);
}

function createCreepyClownTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, null);

  // Angular jewel-toned carnival mask. A bell crown, split-color planes, and
  // geometric makeup replace the red-hair/white-face horror-clown shorthand.
  polygon(
    cells,
    width,
    height,
    [
      [18, 19],
      [17, 4],
      [28, 16],
      [32, 2],
      [37, 16],
      [49, 5],
      [46, 21],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [20, 16],
      [20, 8],
      [27, 17],
    ],
    "R5C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [29, 15],
      [32, 6],
      [35, 15],
    ],
    "R2C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [38, 17],
      [46, 9],
      [44, 18],
    ],
    "R7C4",
  );
  circle(cells, width, height, 18, 5, 3, "R3C3");
  circle(cells, width, height, 32, 3, 3, "R5C4");
  circle(cells, width, height, 49, 6, 3, "R2C3");

  polygon(
    cells,
    width,
    height,
    [
      [32, 12],
      [51, 22],
      [48, 46],
      [32, 57],
      [16, 46],
      [13, 22],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [31, 16],
      [30, 52],
      [19, 44],
      [17, 24],
    ],
    "R5C2",
  );
  polygon(
    cells,
    width,
    height,
    [
      [33, 16],
      [47, 24],
      [45, 44],
      [33, 52],
    ],
    "R7C2",
  );
  polygon(
    cells,
    width,
    height,
    [
      [23, 25],
      [30, 30],
      [24, 36],
      [18, 30],
    ],
    "R3C3",
  );
  circle(cells, width, height, 24, 30, 3, "R10C1");
  polygon(
    cells,
    width,
    height,
    [
      [40, 24],
      [46, 31],
      [39, 36],
      [34, 29],
    ],
    "R5C4",
  );
  circle(cells, width, height, 40, 30, 3, "R10C1");
  polygon(
    cells,
    width,
    height,
    [
      [32, 32],
      [38, 39],
      [32, 44],
      [26, 39],
    ],
    "R2C3",
  );
  line(cells, width, 21, 44, 27, 48, "R10C1");
  line(cells, width, 27, 48, 32, 45, "R10C1");
  line(cells, width, 32, 45, 38, 49, "R10C1");
  line(cells, width, 38, 49, 44, 44, "R10C1");
  circle(cells, width, height, 18, 40, 2, "R8C4");
  circle(cells, width, height, 46, 40, 2, "R4C4");

  polygon(
    cells,
    width,
    height,
    [
      [15, 50],
      [26, 54],
      [32, 62],
      [8, 58],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [49, 50],
      [38, 54],
      [32, 62],
      [56, 58],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [13, 52],
      [26, 56],
      [29, 59],
    ],
    "R2C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [51, 52],
      [38, 56],
      [35, 59],
    ],
    "R5C3",
  );

  return createTemplateDocument(width, height, "Creepy Clown Template", cells);
}

function createHeartStickerTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  for (let y = 6; y < 58; y += 1) {
    for (let x = 8; x < 56; x += 1) {
      const nx = (x - 32) / 22;
      const ny = (y - 33) / 22;
      const value = (nx * nx + ny * ny - 1) ** 3 - nx * nx * ny ** 3;
      if (value <= 0.05) set(cells, width, x, y, "R11C1");
      if (value <= 0) set(cells, width, x, y, "R1C2");
      if (value <= -0.18 && x < 31 && y < 33) set(cells, width, x, y, "R1C4");
      if (value <= -0.42 && x > 31 && y > 38) set(cells, width, x, y, "R1C1");
    }
  }

  rect(cells, width, 18, 19, 26, 22, "R1C5");
  rect(cells, width, 16, 24, 20, 29, "R1C5");
  rect(cells, width, 24, 16, 30, 18, "R1C6");
  rect(cells, width, 39, 44, 45, 51, "R1C1");
  line(cells, width, 47, 52, 51, 56, "R11C2");
  line(cells, width, 14, 52, 11, 55, "R1C6");

  return createTemplateDocument(width, height, "Heart Sticker Template", cells);
}

function createStarBadgeTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  circle(cells, width, height, 32, 32, 28, "R11C1");
  circle(cells, width, height, 32, 32, 25, "R6C3");
  circle(cells, width, height, 32, 32, 20, "R5C4");

  const star = [
    [32, 9],
    [38, 25],
    [55, 25],
    [41, 36],
    [47, 53],
    [32, 43],
    [17, 53],
    [23, 36],
    [9, 25],
    [26, 25],
  ];
  const outlineStar = star.map(([x, y]) => [
    Math.round(32 + (x - 32) * 1.08),
    Math.round(32 + (y - 32) * 1.08),
  ]);
  polygon(cells, width, height, outlineStar, "R11C1");
  polygon(cells, width, height, star, "R3C3");
  const innerStar = star.map(([x, y]) => [
    Math.round(32 + (x - 32) * 0.78),
    Math.round(32 + (y - 32) * 0.78),
  ]);
  polygon(cells, width, height, innerStar, "R3C4");
  rect(cells, width, 18, 29, 46, 34, "R3C4");
  rect(cells, width, 24, 20, 30, 24, "R3C6");
  rect(cells, width, 37, 42, 41, 47, "R3C1");
  rect(cells, width, 12, 12, 17, 15, "R10C7");
  rect(cells, width, 48, 13, 52, 17, "R10C7");
  rect(cells, width, 12, 48, 16, 52, "R10C7");

  return createTemplateDocument(width, height, "Star Badge Template", cells);
}

function createSmileIconTemplate(): GridDocument {
  const width = 16;
  const height = 16;
  const cells = filledCells(width, height, "R10C7");

  circle(cells, width, height, 8, 8, 7, "R11C1");
  circle(cells, width, height, 8, 8, 6, "R3C3");
  circle(cells, width, height, 7, 7, 5, "R3C4");
  rect(cells, width, 4, 5, 6, 7, "R10C1");
  rect(cells, width, 10, 5, 12, 7, "R10C1");
  rect(cells, width, 5, 6, 5, 6, "R10C7");
  rect(cells, width, 11, 6, 11, 6, "R10C7");
  rect(cells, width, 4, 10, 12, 10, "R10C1");
  rect(cells, width, 5, 11, 11, 11, "R1C2");
  rect(cells, width, 6, 12, 10, 12, "R1C4");
  rect(cells, width, 3, 3, 5, 4, "R3C6");

  return createTemplateDocument(width, height, "Smile Icon Template", cells);
}

function createPortraitBustTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  rect(cells, width, 15, 50, 49, 63, "R11C1");
  rect(cells, width, 18, 51, 46, 63, "R6C2");
  rect(cells, width, 26, 45, 38, 56, "R9C4");
  ellipse(cells, width, height, 32, 29, 19, 22, "R11C1");
  ellipse(cells, width, height, 32, 30, 16, 19, "R9C5");
  ellipse(cells, width, height, 32, 32, 12, 15, "R9C6");
  ellipse(cells, width, height, 32, 15, 18, 8, "R11C1");
  rect(cells, width, 15, 16, 26, 34, "R11C1");
  rect(cells, width, 38, 16, 49, 34, "R11C1");
  rect(cells, width, 21, 19, 27, 24, "R11C2");
  rect(cells, width, 37, 19, 43, 24, "R11C2");
  rect(cells, width, 23, 28, 28, 30, "R10C1");
  rect(cells, width, 36, 28, 41, 30, "R10C1");
  rect(cells, width, 25, 29, 26, 30, "R10C7");
  rect(cells, width, 38, 29, 39, 30, "R10C7");
  rect(cells, width, 31, 31, 33, 39, "R9C3");
  line(cells, width, 26, 42, 38, 42, "R1C2");
  line(cells, width, 28, 44, 36, 44, "R1C4");
  rect(cells, width, 20, 37, 24, 39, "R1C6");
  rect(cells, width, 40, 37, 44, 39, "R1C6");
  polygon(
    cells,
    width,
    height,
    [
      [19, 52],
      [30, 52],
      [26, 63],
      [15, 63],
    ],
    "R10C7",
  );
  polygon(
    cells,
    width,
    height,
    [
      [45, 52],
      [34, 52],
      [38, 63],
      [49, 63],
    ],
    "R10C7",
  );
  rect(cells, width, 30, 52, 34, 63, "R1C2");

  return createTemplateDocument(width, height, "Portrait Bust Template", cells);
}

function createRedCapHeroTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, null);

  // Trail courier portrait: a teal weather hood and compass visor replace the
  // cap silhouette, while the orange scarf and satchel strap tell the role.
  polygon(
    cells,
    width,
    height,
    [
      [32, 5],
      [48, 13],
      [53, 31],
      [45, 47],
      [19, 47],
      [11, 31],
      [16, 13],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [32, 8],
      [45, 15],
      [49, 30],
      [42, 42],
      [22, 42],
      [15, 30],
      [19, 15],
    ],
    "R5C2",
  );
  ellipse(cells, width, height, 32, 30, 14, 16, "R11C1");
  ellipse(cells, width, height, 32, 31, 12, 14, "R9C4");
  rect(cells, width, 20, 20, 44, 27, "R11C1");
  rect(cells, width, 22, 21, 42, 25, "R3C4");
  circle(cells, width, height, 32, 16, 5, "R11C1");
  circle(cells, width, height, 32, 16, 3, "R2C3");
  line(cells, width, 32, 14, 32, 18, "R3C6");
  line(cells, width, 30, 16, 34, 16, "R3C6");
  rect(cells, width, 23, 29, 28, 32, "R10C1");
  rect(cells, width, 36, 29, 41, 32, "R10C1");
  set(cells, width, 26, 29, "R10C7");
  set(cells, width, 39, 29, "R10C7");
  rect(cells, width, 30, 32, 34, 38, "R9C2");
  line(cells, width, 27, 41, 37, 41, "R8C2");

  polygon(
    cells,
    width,
    height,
    [
      [17, 43],
      [47, 43],
      [55, 63],
      [9, 63],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [20, 46],
      [44, 46],
      [50, 63],
      [14, 63],
    ],
    "R6C4",
  );
  polygon(
    cells,
    width,
    height,
    [
      [18, 45],
      [32, 51],
      [46, 45],
      [40, 58],
      [24, 58],
    ],
    "R2C3",
  );
  line(cells, width, 21, 47, 43, 63, "R11C1");
  line(cells, width, 23, 47, 45, 63, "R9C2");
  rect(cells, width, 39, 53, 48, 61, "R11C1");
  rect(cells, width, 41, 55, 46, 59, "R3C4");

  return createTemplateDocument(width, height, "Red Cap Hero Template", cells);
}

function createGreenAdventurerTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, null);

  // An owl field scout with layered leaf plumage, large round goggles, and a
  // neckerchief—no pointed cap, sword, or humanoid fantasy-hero silhouette.
  polygon(
    cells,
    width,
    height,
    [
      [21, 20],
      [12, 6],
      [29, 14],
      [32, 4],
      [36, 14],
      [52, 6],
      [43, 21],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [21, 18],
      [15, 9],
      [29, 16],
    ],
    "R4C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [35, 16],
      [49, 9],
      [43, 18],
    ],
    "R4C2",
  );
  polygon(
    cells,
    width,
    height,
    [
      [29, 15],
      [32, 7],
      [35, 15],
    ],
    "R3C3",
  );

  ellipse(cells, width, height, 32, 34, 24, 22, "R11C1");
  ellipse(cells, width, height, 32, 34, 21, 19, "R4C2");
  polygon(
    cells,
    width,
    height,
    [
      [12, 34],
      [4, 44],
      [20, 50],
      [25, 35],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [13, 36],
      [8, 43],
      [19, 47],
      [23, 37],
    ],
    "R4C4",
  );
  polygon(
    cells,
    width,
    height,
    [
      [52, 34],
      [60, 44],
      [44, 50],
      [39, 35],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [51, 36],
      [56, 43],
      [45, 47],
      [41, 37],
    ],
    "R4C4",
  );

  circle(cells, width, height, 23, 31, 10, "R11C1");
  circle(cells, width, height, 41, 31, 10, "R11C1");
  circle(cells, width, height, 23, 31, 7, "R3C6");
  circle(cells, width, height, 41, 31, 7, "R3C6");
  circle(cells, width, height, 23, 31, 3, "R10C1");
  circle(cells, width, height, 41, 31, 3, "R10C1");
  set(cells, width, 24, 30, "R10C7");
  set(cells, width, 42, 30, "R10C7");
  rect(cells, width, 31, 29, 33, 32, "R3C3");
  polygon(
    cells,
    width,
    height,
    [
      [27, 39],
      [37, 39],
      [32, 46],
    ],
    "R2C3",
  );

  polygon(
    cells,
    width,
    height,
    [
      [18, 47],
      [32, 53],
      [46, 47],
      [50, 63],
      [14, 63],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [21, 50],
      [32, 55],
      [43, 50],
      [46, 61],
      [18, 61],
    ],
    "R4C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [22, 48],
      [32, 53],
      [27, 60],
    ],
    "R2C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [42, 48],
      [32, 53],
      [37, 60],
    ],
    "R3C3",
  );
  circle(cells, width, height, 32, 55, 4, "R11C1");
  circle(cells, width, height, 32, 55, 2, "R5C4");

  return createTemplateDocument(
    width,
    height,
    "Green Adventurer Template",
    cells,
  );
}

function createBlueSpeedMascotTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, null);

  // Comet courier-bot: a single glass eye, orbit fin, wheel-foot, and layered
  // thruster ribbons produce motion without an animal mascot silhouette.
  polygon(
    cells,
    width,
    height,
    [
      [28, 18],
      [5, 8],
      [18, 25],
      [3, 31],
      [20, 34],
      [7, 50],
      [31, 41],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [25, 20],
      [9, 12],
      [20, 27],
    ],
    "R8C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [20, 29],
      [7, 31],
      [22, 33],
    ],
    "R3C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [26, 38],
      [11, 46],
      [29, 40],
    ],
    "R5C3",
  );

  ellipse(cells, width, height, 39, 31, 20, 18, "R11C1");
  ellipse(cells, width, height, 39, 31, 17, 15, "R7C3");
  polygon(
    cells,
    width,
    height,
    [
      [35, 15],
      [44, 3],
      [48, 19],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [39, 15],
      [44, 7],
      [46, 18],
    ],
    "R2C3",
  );
  ellipse(cells, width, height, 45, 29, 13, 10, "R5C5");
  rect(cells, width, 38, 23, 57, 34, "R6C5");
  circle(cells, width, height, 49, 28, 5, "R10C1");
  circle(cells, width, height, 50, 27, 2, "R10C7");
  rect(cells, width, 35, 36, 51, 40, "R2C3");
  line(cells, width, 37, 42, 52, 42, "R3C3");
  line(cells, width, 34, 18, 55, 11, "R5C4");
  circle(cells, width, height, 57, 10, 3, "R3C3");

  polygon(
    cells,
    width,
    height,
    [
      [30, 42],
      [41, 44],
      [37, 54],
      [23, 52],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [31, 44],
      [38, 46],
      [35, 51],
      [27, 50],
    ],
    "R5C2",
  );
  circle(cells, width, height, 42, 51, 9, "R11C1");
  circle(cells, width, height, 42, 51, 6, "R3C3");
  circle(cells, width, height, 42, 51, 2, "R10C1");
  polygon(
    cells,
    width,
    height,
    [
      [48, 38],
      [60, 41],
      [54, 48],
      [45, 43],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [49, 40],
      [57, 42],
      [53, 45],
      [47, 42],
    ],
    "R8C4",
  );

  return createTemplateDocument(
    width,
    height,
    "Blue Speed Mascot Template",
    cells,
  );
}

function createArcadeFighterTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  rect(cells, width, 14, 50, 50, 63, "R11C1");
  rect(cells, width, 17, 51, 47, 63, "R1C2");
  ellipse(cells, width, height, 32, 34, 18, 20, "R11C1");
  ellipse(cells, width, height, 32, 35, 15, 17, "R9C4");
  rect(cells, width, 13, 21, 51, 28, "R10C1");
  rect(cells, width, 18, 16, 46, 22, "R11C2");
  rect(cells, width, 16, 28, 28, 31, "R11C1");
  rect(cells, width, 36, 28, 48, 31, "R11C1");
  rect(cells, width, 22, 34, 29, 36, "R10C1");
  rect(cells, width, 35, 34, 42, 36, "R10C1");
  rect(cells, width, 25, 35, 26, 36, "R10C7");
  rect(cells, width, 38, 35, 39, 36, "R10C7");
  rect(cells, width, 31, 37, 34, 43, "R9C2");
  rect(cells, width, 24, 45, 40, 48, "R1C1");
  rect(cells, width, 26, 46, 38, 47, "R1C4");
  rect(cells, width, 10, 43, 18, 60, "R9C4");
  rect(cells, width, 46, 43, 54, 60, "R9C4");
  rect(cells, width, 7, 38, 16, 47, "R1C6");
  rect(cells, width, 48, 38, 57, 47, "R1C6");
  rect(cells, width, 21, 54, 25, 63, "R3C3");
  rect(cells, width, 39, 54, 43, 63, "R3C3");
  rect(cells, width, 27, 18, 37, 20, "R1C2");
  rect(cells, width, 30, 50, 34, 63, "R10C7");
  rect(cells, width, 19, 60, 28, 63, "R11C1");
  rect(cells, width, 36, 60, 45, 63, "R11C1");
  line(cells, width, 12, 36, 20, 32, "R1C2");

  return createTemplateDocument(
    width,
    height,
    "Arcade Fighter Template",
    cells,
  );
}

function createSpaceHelmetTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  ellipse(cells, width, height, 32, 33, 24, 26, "R11C1");
  ellipse(cells, width, height, 32, 33, 21, 23, "R10C5");
  ellipse(cells, width, height, 32, 32, 18, 16, "R6C1");
  ellipse(cells, width, height, 32, 31, 15, 12, "R6C3");
  rect(cells, width, 22, 26, 43, 37, "R6C4");
  rect(cells, width, 24, 29, 41, 39, "R10C1");
  rect(cells, width, 26, 28, 36, 31, "R6C6");
  rect(cells, width, 16, 47, 48, 56, "R11C1");
  rect(cells, width, 18, 48, 46, 55, "R10C4");
  rect(cells, width, 20, 53, 44, 63, "R10C3");
  rect(cells, width, 18, 18, 24, 23, "R1C3");
  rect(cells, width, 40, 18, 46, 23, "R4C3");
  rect(cells, width, 12, 33, 16, 44, "R10C2");
  rect(cells, width, 48, 33, 52, 44, "R10C2");
  rect(cells, width, 8, 39, 13, 42, "R1C2");
  rect(cells, width, 51, 39, 56, 42, "R1C2");
  rect(cells, width, 25, 58, 39, 60, "R10C6");

  return createTemplateDocument(width, height, "Space Helmet Template", cells);
}

function createRobotFaceTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  rect(cells, width, 13, 16, 51, 54, "R11C1");
  rect(cells, width, 16, 19, 48, 51, "R10C4");
  rect(cells, width, 19, 22, 45, 48, "R10C5");
  rect(cells, width, 19, 27, 30, 37, "R10C1");
  rect(cells, width, 34, 27, 45, 37, "R10C1");
  rect(cells, width, 21, 29, 28, 35, "R5C3");
  rect(cells, width, 36, 29, 43, 35, "R5C3");
  rect(cells, width, 24, 31, 26, 33, "R10C7");
  rect(cells, width, 39, 31, 41, 33, "R10C7");
  rect(cells, width, 23, 42, 41, 46, "R10C1");
  rect(cells, width, 26, 43, 28, 45, "R10C7");
  rect(cells, width, 31, 43, 33, 45, "R10C7");
  rect(cells, width, 36, 43, 38, 45, "R10C7");
  rect(cells, width, 29, 8, 35, 16, "R10C3");
  circle(cells, width, height, 32, 7, 5, "R11C1");
  circle(cells, width, height, 32, 7, 3, "R1C3");
  rect(cells, width, 8, 29, 14, 41, "R10C3");
  rect(cells, width, 50, 29, 56, 41, "R10C3");
  rect(cells, width, 7, 32, 10, 38, "R10C4");
  rect(cells, width, 54, 32, 57, 38, "R10C4");

  return createTemplateDocument(width, height, "Robot Face Template", cells);
}

function createLetterMarkTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  circle(cells, width, height, 32, 32, 28, "R11C1");
  circle(cells, width, height, 32, 32, 25, "R1C2");
  circle(cells, width, height, 32, 32, 21, "R1C3");
  rect(cells, width, 18, 16, 28, 49, "R10C7");
  rect(cells, width, 35, 16, 45, 49, "R10C7");
  rect(cells, width, 25, 16, 39, 25, "R10C7");
  rect(cells, width, 26, 31, 40, 38, "R10C7");
  rect(cells, width, 24, 48, 42, 53, "R11C1");
  rect(cells, width, 25, 48, 41, 51, "R1C1");
  rect(cells, width, 17, 13, 47, 16, "R1C5");
  rect(cells, width, 20, 17, 27, 19, "R1C5");
  rect(cells, width, 12, 30, 16, 34, "R10C7");
  rect(cells, width, 48, 30, 52, 34, "R10C7");

  return createTemplateDocument(width, height, "Letter Mark Template", cells);
}

function createControllerIconTemplate(): GridDocument {
  const width = 32;
  const height = 32;
  const cells = filledCells(width, height, "R10C7");

  ellipse(cells, width, height, 16, 18, 14, 8, "R11C1");
  ellipse(cells, width, height, 16, 18, 12, 6, "R10C2");
  rect(cells, width, 8, 12, 24, 22, "R10C3");
  rect(cells, width, 9, 16, 15, 17, "R10C7");
  rect(cells, width, 12, 13, 13, 20, "R10C7");
  rect(cells, width, 10, 14, 15, 19, "R10C2");
  rect(cells, width, 11, 16, 16, 17, "R10C7");
  rect(cells, width, 13, 14, 14, 19, "R10C7");
  circle(cells, width, height, 21, 15, 2, "R1C3");
  circle(cells, width, height, 25, 18, 2, "R4C3");
  circle(cells, width, height, 20, 21, 2, "R6C3");
  rect(cells, width, 14, 10, 18, 11, "R10C5");
  rect(cells, width, 15, 23, 17, 24, "R10C1");

  return createTemplateDocument(
    width,
    height,
    "Controller Icon Template",
    cells,
  );
}

function createRacingKartTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  rect(cells, width, 15, 34, 50, 49, "R11C1");
  rect(cells, width, 18, 32, 47, 47, "R1C2");
  polygon(
    cells,
    width,
    height,
    [
      [23, 30],
      [33, 20],
      [43, 30],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [25, 30],
      [33, 23],
      [41, 30],
    ],
    "R6C5",
  );
  rect(cells, width, 27, 25, 39, 30, "R6C6");
  rect(cells, width, 30, 16, 36, 24, "R11C1");
  rect(cells, width, 31, 17, 35, 23, "R10C7");
  rect(cells, width, 19, 37, 31, 42, "R1C4");
  rect(cells, width, 35, 37, 47, 42, "R1C1");
  circle(cells, width, height, 19, 50, 7, "R11C1");
  circle(cells, width, height, 45, 50, 7, "R11C1");
  circle(cells, width, height, 19, 50, 4, "R10C4");
  circle(cells, width, height, 45, 50, 4, "R10C4");
  rect(cells, width, 28, 43, 36, 47, "R3C3");
  rect(cells, width, 12, 40, 17, 45, "R10C2");
  rect(cells, width, 48, 40, 54, 45, "R10C2");

  return createTemplateDocument(width, height, "Racing Kart Template", cells);
}

function createPizzaSliceTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  polygon(
    cells,
    width,
    height,
    [
      [14, 10],
      [54, 18],
      [28, 57],
    ],
    "R11C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [18, 13],
      [50, 19],
      [29, 52],
    ],
    "R3C4",
  );
  polygon(
    cells,
    width,
    height,
    [
      [16, 10],
      [56, 17],
      [53, 25],
      [15, 18],
    ],
    "R9C3",
  );
  polygon(
    cells,
    width,
    height,
    [
      [18, 12],
      [53, 18],
      [51, 22],
      [17, 17],
    ],
    "R9C4",
  );
  circle(cells, width, height, 31, 27, 4, "R1C2");
  circle(cells, width, height, 41, 33, 4, "R1C2");
  circle(cells, width, height, 29, 41, 3, "R1C2");
  circle(cells, width, height, 38, 45, 2, "R4C2");
  circle(cells, width, height, 24, 31, 2, "R4C2");
  line(cells, width, 29, 52, 32, 58, "R3C2");
  line(cells, width, 25, 47, 23, 53, "R3C2");
  rect(cells, width, 47, 21, 50, 24, "R3C6");

  return createTemplateDocument(width, height, "Pizza Slice Template", cells);
}

function createSwordBadgeTemplate(): GridDocument {
  const width = 64;
  const height = 64;
  const cells = filledCells(width, height, "R10C7");

  circle(cells, width, height, 32, 32, 28, "R11C1");
  circle(cells, width, height, 32, 32, 25, "R7C1");
  circle(cells, width, height, 32, 32, 20, "R7C2");
  polygon(
    cells,
    width,
    height,
    [
      [32, 7],
      [40, 17],
      [35, 42],
      [29, 42],
      [24, 17],
    ],
    "R10C1",
  );
  polygon(
    cells,
    width,
    height,
    [
      [32, 10],
      [37, 18],
      [34, 40],
      [30, 40],
      [27, 18],
    ],
    "R10C6",
  );
  line(cells, width, 32, 12, 32, 40, "R10C7");
  rect(cells, width, 22, 41, 42, 46, "R10C1");
  rect(cells, width, 25, 42, 39, 44, "R3C3");
  rect(cells, width, 29, 46, 35, 54, "R9C2");
  rect(cells, width, 27, 54, 37, 57, "R11C1");
  rect(cells, width, 12, 30, 18, 34, "R3C4");
  rect(cells, width, 46, 30, 52, 34, "R3C4");

  return createTemplateDocument(width, height, "Sword Badge Template", cells);
}

function createTemplateDocument(
  width: number,
  height: number,
  name: string,
  cells: MutableCells,
): GridDocument {
  const template = CREATIVE_TEMPLATES.find((entry) =>
    name.startsWith(entry.name),
  );
  const transparentSource = clearEdgeConnectedColor(
    cells,
    width,
    height,
    "R10C7",
  );
  const doc = createGridDocument(
    width,
    height,
    template ? `${template.displayName} Template` : name,
  );
  return recomputeUsedColors({
    ...doc,
    cells: transparentSource,
    meta: {
      ...doc.meta,
      notes: template?.description,
      sourceFormat: "creative-template",
      sourceMetadata: template
        ? {
            templateId: template.id,
            templateCategory: template.category,
            templateName: template.displayName,
            templateLegacyName: template.name,
          }
        : undefined,
    },
  });
}

/**
 * Removes only the white field connected to the source boundary. Enclosed
 * white details such as eyes, teeth, shine, or mask panels remain intentional
 * paint while the surrounding canvas becomes genuinely transparent.
 */
function clearEdgeConnectedColor(
  source: MutableCells,
  width: number,
  height: number,
  colorId: string,
): MutableCells {
  const cells = [...source];
  const visited = new Uint8Array(cells.length);
  const queue: number[] = [];

  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = y * width + x;
    if (visited[index] || cells[index] !== colorId) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    cells[index] = null;
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  return cells;
}

function filledCells(
  width: number,
  height: number,
  colorId: string | null,
): MutableCells {
  return new Array(width * height).fill(colorId);
}

function set(
  cells: MutableCells,
  width: number,
  x: number,
  y: number,
  colorId: string | null,
): void {
  if (x < 0 || x >= width || y < 0) return;
  const index = y * width + x;
  if (index < 0 || index >= cells.length) return;
  cells[index] = colorId;
}

function rect(
  cells: MutableCells,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colorId: string,
): void {
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) set(cells, width, x, y, colorId);
  }
}

function line(
  cells: MutableCells,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colorId: string,
): void {
  let x = x1;
  let y = y1;
  const dx = Math.abs(x2 - x1);
  const sx = x1 < x2 ? 1 : -1;
  const dy = -Math.abs(y2 - y1);
  const sy = y1 < y2 ? 1 : -1;
  let error = dx + dy;

  while (true) {
    set(cells, width, x, y, colorId);
    if (x === x2 && y === y2) return;
    const doubledError = 2 * error;
    if (doubledError >= dy) {
      error += dy;
      x += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function circle(
  cells: MutableCells,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  colorId: string,
): void {
  ellipse(cells, width, height, cx, cy, radius, radius, colorId);
}

function ellipse(
  cells: MutableCells,
  width: number,
  height: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colorId: string,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) {
        set(cells, width, x, y, colorId);
      }
    }
  }
}

function polygon(
  cells: MutableCells,
  width: number,
  height: number,
  points: number[][],
  colorId: string,
): void {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.max(0, Math.min(...xs));
  const maxX = Math.min(width - 1, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxY = Math.min(height - 1, Math.max(...ys));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) {
        set(cells, width, x, y, colorId);
      }
    }
  }
}

function pointInPolygon(x: number, y: number, points: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled creative template: ${value}`);
}
