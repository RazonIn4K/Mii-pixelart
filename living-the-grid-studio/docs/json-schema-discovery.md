# JSON Schema Discovery Plan

**Status:** Awaiting fixture file  
**Last Updated:** 2026-04-26

---

## Purpose

The Living The Grid tool at [livingthegrid.com](https://livingthegrid.com/) allows users to save their pixel art projects as JSON files. To build a reliable import/export adapter, we need to inspect the actual JSON structure and document it precisely.

## What We Know

Based on the tool's public behavior and community documentation:

- The tool runs entirely in the browser (no server-side processing).
- It uses the Tomodachi Life 84-color palette (77 base + 7 saturated).
- The canvas is 256x256 pixels maximum.
- Users can adjust grid size, color count, brightness, and contrast.
- The tool supports both "pixel-perfect" and "smooth" brush modes.
- Saved files appear to use the naming pattern `living-the-grid-{timestamp}.json`.

## Discovery Steps

### Step 1: Obtain the Fixture

Place the actual `living-the-grid-*.json` file in the `fixtures/` directory at the project root. The file referenced in the original notes was `living-the-grid-1777253291337.json`.

### Step 2: Inspect the Structure

Run the following to pretty-print and examine the JSON:

```bash
cat fixtures/living-the-grid-*.json | python3 -m json.tool | head -100
```

Document the top-level keys, their types, and nesting structure in `docs/json-format-notes.md`.

### Step 3: Key Questions to Answer

| Question | Why It Matters |
|----------|---------------|
| How are colors represented? (hex, index, RGB tuple) | Determines the palette mapping strategy |
| Is the grid stored as a 2D array or flat array? | Affects the import adapter's parsing logic |
| What metadata is included? (name, dimensions, settings) | Determines what we can preserve on round-trip |
| Are there multiple layers or just one? | Affects the GridDocument model |
| Is there a version field? | Needed for forward compatibility |
| How are empty cells represented? (null, 0, -1, absent) | Affects cell parsing |

### Step 4: Write the Adapter

Update `client/src/lib/engine/json-io.ts` with the real format:

1. Replace the placeholder `LtgNativeFormat` interface with the actual schema.
2. Update `convertLtgToGrid()` to handle the real data structure.
3. Add an `exportToLtgNative()` function if round-trip export is desired.
4. Write at least three test cases: minimal grid, full 256x256 grid, and edge cases.

### Step 5: Document the Format

Create `docs/json-format-notes.md` with:

- The complete schema (TypeScript interface).
- Example snippets for each section.
- Any quirks or undocumented fields.
- Version history if multiple format versions exist.

## Current Placeholder

The `json-io.ts` module currently assumes a structure like:

```typescript
interface LtgNativeFormat {
  width: number;
  height: number;
  grid: number[][];       // 2D array of color indices
  palette: string[];      // Hex color strings
  name?: string;
}
```

This is a best guess and will be updated once the real fixture is inspected.

## Fixtures Directory

```
fixtures/
├── README.md                           # This discovery plan (linked)
├── living-the-grid-*.json              # Place real fixture here
└── sample-grid-document.json           # Example of our native format
```
