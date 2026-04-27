# Living The Grid Import Round-Trip Test

**Test Date:** 2026-04-26
**Fixture:** `fixtures/living-the-grid-real.json`
**Status:** ✓ PASSED via `scripts/verify-ltg-import.ts`

## Test Procedure

1. **Load real LTG export JSON**
   - Source: living-the-grid.com export (64×64, 15-color palette)
   - Format version: 2

2. **Import through adapter**
   - Use `importLtgNative()` from `json-io.ts`
   - Map indexed palette to internal Tomodachi palette IDs
   - Preserve source metadata in `meta.sourceMetadata`
   - Preserve source palette RGB and H/S/B press counts in `meta.sourcePaletteMappings`

3. **Validate GridDocument**
   - ✓ Dimensions: 64×64 (4,096 cells)
   - ✓ Palette entries: 15 colors
   - ✓ All cells mapped to valid palette IDs or null
   - ✓ No data loss in metadata preservation

4. **Export back to native format**
   - Use `exportGridJson()` to serialize GridDocument
   - Compare pixel data integrity (palette IDs should round-trip)

5. **Studio UI verification**
   - Not run in this workspace state: the repository does not currently include a `package.json`, dependency lockfile, or dev-server script.

## Results

### Format Validation

```
✓ Fixture structure validated
✓ width: 64, height: 64
✓ palette: 15 entries with {hex, rgb, press} structure
✓ pixels: 64×64 2D array of palette indices
✓ Additional metadata: source, version, brush, canvas
```

### Import Validation

```
✓ All palette colors mapped to Tomodachi palette IDs
✓ Mapping warnings generated for non-exact matches
✓ sourceMetadata preserves: source, version, brush, canvas
✓ sourcePaletteMappings preserves: palette[].hex, palette[].rgb, palette[].press, mapped color ID, exact flag, Delta E
✓ sourcePaletteMappings contains 15 entries with deltaE values
```

### Expected Import Warnings

The adapter will generate warnings for any palette colors that don't exactly match the Tomodachi Life palette. For the real fixture:

- Expected warnings: 14 approximate color mappings. The document stores the first 12 warnings plus a summary warning for the remaining 2.
- Format: "Palette index N (#RRGGBB) has no exact game swatch; mapped to R{row}C{col} at Delta E X.XX"

These warnings are **expected and correct** — they inform the user that colors were approximated to the nearest game palette color.

### Round-Trip Test

```
Original LTG JSON → importLtgNative() → GridDocument
                                           ↓
                                      exportGridJson()
                                           ↓
                                  Native GridDocument JSON
```

**Pixel data integrity:** ✓ All cells preserve their palette ID mappings
**Metadata preservation:** ✓ Source metadata stored in meta.sourceMetadata
**Palette metadata preservation:** ✓ Source RGB and H/S/B press counts stored in meta.sourcePaletteMappings
**Native round-trip:** ✓ Confirmed after LTG indices are normalized to internal palette IDs

## Executable Verification

Run:

```bash
npx --yes -p tsx tsx scripts/verify-ltg-import.ts
```

The script checks:

- Real v2 fixture import
- Synthetic indexed-palette fixture import
- Flat row-major `pixels` support
- `grid` alias support
- String palette entries and object palette entries
- Native GridDocument export/import round-trip
- Invalid dimension and invalid palette rejection

## Conclusion

The Living The Grid import adapter is **production-ready** for the confirmed production format:

- ✅ Correctly handles v2 format with object-based palette entries
- ✅ Maps indexed palette colors to internal IDs with Delta E nearest-match fallback
- ✅ Preserves all non-pixel metadata for round-trip compatibility
- ✅ Preserves source RGB and H/S/B press counts for reference-pack use
- ✅ Generates appropriate warnings for user review
- ⚠️ Studio UI import/export still needs browser verification once a runnable app setup is available

**Phase 0 is complete.**
