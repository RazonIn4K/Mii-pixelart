import { describe, expect, it } from "vitest";

import {
  CanonicalGridDocumentSchema,
  GridDocumentV1Schema,
  UsernameSchema,
  decodeCursor,
  encodeCursor,
} from "./community";

function validDocument() {
  return {
    version: 1 as const,
    meta: {
      name: "Cloud draft",
      createdAt: "2026-07-10T00:00:00.000Z",
      modifiedAt: "2026-07-10T00:00:00.000Z",
      sourceImage: "private-family-photo.png",
      sourceFormat: "creative-template",
      sourceMetadata: {
        templateId: "heart-sticker",
        templateCategory: "Marks & Objects",
        templateName: "Heart Sticker",
        arbitrarySecret: "must not persist",
      },
    },
    width: 8,
    height: 8,
    cells: ["R1C1", ...new Array(63).fill(null)] as (string | null)[],
    usedColors: ["R2C2"],
    lockedColors: ["R1C1"],
  };
}

describe("GridDocumentV1Schema", () => {
  it("keeps the current v1 shape importable and canonicalizes persistence", () => {
    expect(GridDocumentV1Schema.parse(validDocument()).meta.sourceImage).toBe(
      "private-family-photo.png",
    );

    const canonical = CanonicalGridDocumentSchema.parse(validDocument());
    expect(canonical.usedColors).toEqual(["R1C1"]);
    expect(canonical.meta).not.toHaveProperty("sourceImage");
    expect(canonical.meta.sourceMetadata).toEqual({
      templateId: "heart-sticker",
      templateCategory: "Marks & Objects",
      templateName: "Heart Sticker",
    });
  });

  it("rejects invalid dimensions, palette IDs, and orphaned locks", () => {
    expect(
      GridDocumentV1Schema.safeParse({
        ...validDocument(),
        width: 7,
      }).success,
    ).toBe(false);
    expect(
      GridDocumentV1Schema.safeParse({
        ...validDocument(),
        cells: ["#FF0000", ...new Array(63).fill(null)],
      }).success,
    ).toBe(false);
    expect(
      GridDocumentV1Schema.safeParse({
        ...validDocument(),
        lockedColors: ["R2C2"],
      }).success,
    ).toBe(false);
  });
});

describe("community helpers", () => {
  it("normalizes valid usernames and rejects reserved or ambiguous names", () => {
    expect(UsernameSchema.parse("  Pixel-Friend ")).toBe("pixel-friend");
    expect(UsernameSchema.safeParse("admin").success).toBe(false);
    expect(UsernameSchema.safeParse("affiliate-disclosure").success).toBe(false);
    expect(UsernameSchema.safeParse("moderator").success).toBe(false);
    expect(UsernameSchema.safeParse("pixel__friend").success).toBe(false);
    expect(UsernameSchema.safeParse("piñata").success).toBe(false);
  });

  it("round-trips opaque cursors and rejects malformed input", () => {
    const cursor = encodeCursor({ id: "creation-id", sortValue: 1234 });
    expect(decodeCursor(cursor)).toEqual({
      id: "creation-id",
      sortValue: 1234,
    });
    expect(() => decodeCursor("not.a.cursor")).toThrow("Invalid cursor");
  });
});
