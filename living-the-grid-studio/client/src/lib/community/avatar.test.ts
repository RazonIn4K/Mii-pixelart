import { describe, expect, it } from "vitest";

import { ISLAND_AVATAR_VERSION, islandAvatarRecipe } from "./avatar";

describe("islandAvatarRecipe", () => {
  it("returns a stable recipe for the same seed", () => {
    expect(ISLAND_AVATAR_VERSION).toBe(2);
    expect(islandAvatarRecipe("islander-mira")).toEqual(
      islandAvatarRecipe("islander-mira"),
    );
    expect(islandAvatarRecipe("")).toEqual(islandAvatarRecipe("islander"));
  });

  it("creates visibly varied but bounded avatar recipes", () => {
    const recipes = [
      "mira-coral",
      "sol-sunbeam",
      "jun-grid",
      "ada-mint",
      "kai-lilac",
      "noor-blue",
      "remy-canvas",
      "imani-brush",
    ].map(islandAvatarRecipe);

    expect(
      new Set(recipes.map((recipe) => recipe.skin)).size,
    ).toBeGreaterThanOrEqual(4);
    expect(
      new Set(recipes.map((recipe) => recipe.hairStyle)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(
      new Set(recipes.map((recipe) => recipe.backgroundPattern)).size,
    ).toBeGreaterThanOrEqual(3);
    for (const recipe of recipes) {
      expect(recipe.accessory).toBeGreaterThanOrEqual(0);
      expect(recipe.accessory).toBeLessThan(6);
      expect(recipe.eyeStyle).toBeGreaterThanOrEqual(0);
      expect(recipe.eyeStyle).toBeLessThan(4);
      expect(recipe.mouthStyle).toBeGreaterThanOrEqual(0);
      expect(recipe.mouthStyle).toBeLessThan(4);
    }
  });
});
