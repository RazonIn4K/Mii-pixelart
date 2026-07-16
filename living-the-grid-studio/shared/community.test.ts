import { describe, expect, it } from "vitest";

import {
  CanonicalGridDocumentSchema,
  CreateCreationImageUploadSchema,
  CreateProfileImageUploadSchema,
  GridDocumentV1Schema,
  ProfileUpdateSchema,
  UpdateCreationImagesSchema,
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
        templateLegacyName: "Heart Sticker",
        guideSections: 4,
        recommendedBrushPixels: 4,
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
      templateLegacyName: "Heart Sticker",
      guideSections: 4,
      recommendedBrushPixels: 4,
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
  it("allows only a server-controlled avatar regeneration request", () => {
    expect(ProfileUpdateSchema.parse({ regenerateAvatar: true })).toEqual({
      regenerateAvatar: true,
    });
    expect(
      ProfileUpdateSchema.safeParse({ regenerateAvatar: false }).success,
    ).toBe(false);
    expect(
      ProfileUpdateSchema.safeParse({ avatarSeed: "chosen-by-client" }).success,
    ).toBe(false);
    expect(ProfileUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("accepts only bounded raster showcase upload tickets", () => {
    const valid = {
      altText: "A painted island flag displayed in the town square.",
      byteSize: 8 * 1024 * 1024,
      contentType: "image/png",
    };
    expect(CreateCreationImageUploadSchema.parse(valid)).toEqual(valid);
    for (const contentType of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ]) {
      expect(
        CreateCreationImageUploadSchema.safeParse({
          ...valid,
          contentType,
        }).success,
      ).toBe(true);
    }
    for (const contentType of [
      "image/svg+xml",
      "image/gif",
      "image/avif",
      "image/bmp",
      "image/heif",
    ]) {
      expect(
        CreateCreationImageUploadSchema.safeParse({
          ...valid,
          contentType,
        }).success,
      ).toBe(false);
    }
    expect(
      CreateCreationImageUploadSchema.safeParse({
        ...valid,
        byteSize: valid.byteSize + 1,
      }).success,
    ).toBe(false);
    expect(
      CreateCreationImageUploadSchema.safeParse({
        ...valid,
        altText: "   ",
      }).success,
    ).toBe(false);
  });

  it("accepts only bounded raster profile image tickets with integer focal points", () => {
    const valid = {
      byteSize: 8 * 1024 * 1024,
      contentType: "image/png",
      focusX: 35,
      focusY: 65,
    };
    expect(CreateProfileImageUploadSchema.parse(valid)).toEqual(valid);
    for (const contentType of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ]) {
      expect(
        CreateProfileImageUploadSchema.safeParse({
          ...valid,
          contentType,
        }).success,
      ).toBe(true);
    }
    for (const input of [
      { ...valid, byteSize: valid.byteSize + 1 },
      { ...valid, contentType: "image/svg+xml" },
      { ...valid, contentType: "image/heif" },
      { ...valid, focusX: -1 },
      { ...valid, focusY: 101 },
      { ...valid, focusX: 12.5 },
      { ...valid, clientFilename: "private-photo.png" },
    ]) {
      expect(CreateProfileImageUploadSchema.safeParse(input).success).toBe(
        false,
      );
    }
  });

  it("requires a unique ordered showcase list containing its cover", () => {
    const first = "00000000-0000-4000-8000-000000000001";
    const second = "00000000-0000-4000-8000-000000000002";
    expect(
      UpdateCreationImagesSchema.parse({
        coverImageId: second,
        orderedImageIds: [first, second],
      }),
    ).toEqual({ coverImageId: second, orderedImageIds: [first, second] });
    expect(
      UpdateCreationImagesSchema.safeParse({
        coverImageId: second,
        orderedImageIds: [first, first],
      }).success,
    ).toBe(false);
    expect(
      UpdateCreationImagesSchema.safeParse({
        coverImageId: second,
        orderedImageIds: [first],
      }).success,
    ).toBe(false);
  });

  it("normalizes valid usernames and rejects reserved or ambiguous names", () => {
    expect(UsernameSchema.parse("  Pixel-Friend ")).toBe("pixel-friend");
    expect(UsernameSchema.safeParse("admin").success).toBe(false);
    expect(UsernameSchema.safeParse("affiliate-disclosure").success).toBe(
      false,
    );
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
