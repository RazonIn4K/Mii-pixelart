import { describe, expect, it } from "vitest";

import {
  CREATIVE_TEMPLATES,
  createCreativeTemplateDocument,
  createCreativeTemplateFixtureDocument,
} from "./templates";

describe("creative templates", () => {
  it("creates every starter on a transparent native 256 by 256 surface", () => {
    for (const template of CREATIVE_TEMPLATES) {
      const doc = createCreativeTemplateDocument(template.id);

      expect(template.surfaceLabel).toBe("256×256 transparent");
      expect(doc.width).toBe(256);
      expect(doc.height).toBe(256);
      expect(doc.cells).toHaveLength(256 * 256);
      expect(doc.cells[0]).toBeNull();
      expect(doc.cells.some((cell) => cell === null)).toBe(true);
      expect(doc.cells.some((cell) => cell !== null)).toBe(true);
    }
  });

  it("keeps intentional enclosed white details while clearing the white field", () => {
    const doc = createCreativeTemplateDocument("face-guide");

    expect(doc.cells[0]).toBeNull();
    expect(doc.cells).toContain("R10C7");
    expect(doc.usedColors).toContain("R10C7");
  });

  it("expands compact source art into countable nearest-neighbour blocks", () => {
    const doc = createCreativeTemplateDocument("face-guide");

    for (let y = 0; y < doc.height; y += 4) {
      for (let x = 0; x < doc.width; x += 4) {
        const expected = doc.cells[y * doc.width + x];
        for (let offsetY = 0; offsetY < 4; offsetY += 1) {
          for (let offsetX = 0; offsetX < 4; offsetX += 1) {
            expect(doc.cells[(y + offsetY) * doc.width + x + offsetX]).toBe(
              expected,
            );
          }
        }
      }
    }
  });

  it("keeps lightweight preview fixtures lossless without allocating the full surface", () => {
    const fixture = createCreativeTemplateFixtureDocument("face-guide");
    const expanded = createCreativeTemplateDocument("face-guide");

    expect(fixture.width).toBe(64);
    expect(fixture.height).toBe(64);
    expect(fixture.cells).toHaveLength(64 * 64);
    expect(expanded.cells).toHaveLength(256 * 256);

    for (let y = 0; y < fixture.height; y += 1) {
      for (let x = 0; x < fixture.width; x += 1) {
        expect(expanded.cells[y * 4 * expanded.width + x * 4]).toBe(
          fixture.cells[y * fixture.width + x],
        );
      }
    }
  });

  it("advertises the exact nearest-neighbour block as the copy brush", () => {
    for (const template of CREATIVE_TEMPLATES) {
      expect(template.brushLabel).toBe(
        `${256 / template.sourceWidth} px game stamp`,
      );
    }

    expect(
      CREATIVE_TEMPLATES.find((template) => template.id === "heart-sticker")
        ?.brushLabel,
    ).toBe("4 px game stamp");
    expect(
      CREATIVE_TEMPLATES.find((template) => template.id === "controller-icon")
        ?.brushLabel,
    ).toBe("8 px game stamp");
    expect(
      CREATIVE_TEMPLATES.find((template) => template.id === "smile-icon")
        ?.brushLabel,
    ).toBe("16 px game stamp");
  });

  it("ships structured guide and brush metadata for face and object starters", () => {
    for (const template of CREATIVE_TEMPLATES) {
      expect(template.guideSections).toBe(
        template.category === "Marks & Objects" ? 4 : 8,
      );
      expect([4, 8, 16, 32]).toContain(template.recommendedBrushPixels);
      expect(template.recommendedBrushPixels).toBe(256 / template.sourceWidth);
    }

    const face = CREATIVE_TEMPLATES.find(
      (template) => template.id === "face-guide",
    );
    const controller = CREATIVE_TEMPLATES.find(
      (template) => template.id === "controller-icon",
    );
    const smile = CREATIVE_TEMPLATES.find(
      (template) => template.id === "smile-icon",
    );

    expect(face).toMatchObject({
      displayName: "Face Landmark Guide",
      guideSections: 8,
      recommendedBrushPixels: 4,
    });
    expect(controller).toMatchObject({
      displayName: "Twin-Stick Badge",
      guideSections: 4,
      recommendedBrushPixels: 8,
    });
    expect(smile).toMatchObject({
      guideSections: 4,
      recommendedBrushPixels: 16,
    });
  });

  it("uses the public display name while retaining stable starter provenance", () => {
    const doc = createCreativeTemplateDocument("face-guide");

    expect(doc.meta.name).toBe("Face Landmark Guide");
    expect(doc.meta.sourceMetadata).toEqual({
      templateId: "face-guide",
      templateCategory: "Faces & Portraits",
      templateName: "Face Landmark Guide",
      templateLegacyName: "Face Guide",
      guideSections: 8,
      recommendedBrushPixels: 4,
    });
  });

  it("ships the redesigned original character catalog under stable internal IDs", () => {
    const redesignedStarters = [
      ["space-crew", "Bubble Explorer"],
      ["tiny-dino", "Pocket Dino"],
      ["haunted-mascot", "Midnight Mascot"],
      ["bald-teacher", "Grid Coach"],
      ["masked-slasher", "Moon Mask"],
      ["creepy-clown", "Creepy Clown"],
      ["red-cap-hero", "Trail Courier"],
      ["green-adventurer", "Forest Scout"],
      ["blue-speed-mascot", "Comet Runner"],
    ] as const;

    for (const [id, displayName] of redesignedStarters) {
      const template = CREATIVE_TEMPLATES.find((entry) => entry.id === id);
      const fixture = createCreativeTemplateFixtureDocument(id);
      const runtime = createCreativeTemplateDocument(id);

      expect(template).toMatchObject({ displayName });
      expect(template?.description).toMatch(/^An original /);
      expect(fixture.meta.name).toBe(`${displayName} Template`);
      expect(fixture.cells[0]).toBeNull();
      expect(runtime.meta.name).toBe(displayName);
      expect(runtime.meta.sourceMetadata?.templateId).toBe(id);
    }
  });
});
