# Technical Architecture — Living The Grid Repaint Studio

**Version:** 2.0  
**Last Updated:** 2026-05-15

---

## Overview

The studio is a **client-side single-page application** built with React 19 and TypeScript. All processing happens in the browser — no server, no uploads, no accounts. This architecture was chosen to match the privacy-first approach of the original Living The Grid tool and to ensure zero-latency interaction with the pixel grid.

---

## Repository Layout

```
Mii-pixelart/
├── .gitignore
└── living-the-grid-studio/
    ├── client/                    ← React SPA (Vite + TypeScript + Tailwind 4)
    │   ├── index.html
    │   ├── public/                ← Static assets, _headers, _redirects, robots.txt
    │   └── src/
    │       ├── App.tsx            ← Root component + router
    │       ├── main.tsx           ← React DOM entry point
    │       ├── index.css          ← Tailwind + design tokens
    │       ├── const.ts           ← App-wide constants
    │       ├── components/
    │       │   ├── studio/        ← Studio panel components
    │       │   └── ui/            ← shadcn/ui primitives (53 files)
    │       ├── contexts/          ← ThemeContext
    │       ├── hooks/
    │       │   └── useGridDocument.ts  ← Central state hook
    │       ├── lib/
    │       │   └── engine/        ← Pure TS engine (no React deps)
    │       └── pages/             ← Route-level page components
    ├── server/                    ← Thin Express server (dev only)
    │   ├── index.ts
    │   ├── openrouter.ts
    │   └── stripe.ts
    ├── functions/                 ← Cloudflare Pages Functions (edge)
    │   └── api/
    ├── shared/                    ← Shared types/constants
    ├── fixtures/                  ← Test fixtures and creative templates
    ├── scripts/                   ← Verification and utility scripts
    ├── patches/                   ← pnpm patches (wouter)
    ├── package.json
    ├── vite.config.ts
    ├── wrangler.toml
    └── doppler.yaml
```

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 19 + TypeScript | Type safety for complex grid operations |
| Build | Vite 7 + esbuild | Fast HMR, native ESM; esbuild bundles the server |
| Styling | Tailwind CSS 4 + shadcn/ui | Utility-first with accessible Radix primitives |
| Routing | Wouter | Lightweight client-side routing |
| State | React hooks (`useState`, `useCallback`) | No external state library needed |
| Canvas | HTML5 Canvas API | Direct pixel rendering for grid display |
| Color Science | Custom CIELAB + Delta E (CIE76) | Perceptual color matching |
| Package manager | pnpm | Required; lockfile committed |
| Deploy | Cloudflare Pages + Functions | Edge-hosted SPA + serverless API routes |
| Secrets | Doppler | Runtime injection; no `.env` files committed |

---

## High-Level System Architecture

```mermaid
graph TB
    subgraph Browser["Browser (all processing here)"]
        SPA["React SPA<br/>/studio"]
        Engine["Engine Modules<br/>(pure TypeScript)"]
        Canvas["HTML5 Canvas API"]
        FileAPI["File API / Blob / URL"]
        LS["localStorage<br/>(AI sessions)"]

        SPA -->|"calls"| Engine
        Engine -->|"renders to"| Canvas
        Engine -->|"reads/writes"| FileAPI
        SPA -->|"persists"| LS
    end

    subgraph Edge["Cloudflare Pages (Edge)"]
        Static["Static Assets<br/>dist/public/"]
        Fn_AI["Function: /api/ai/*"]
        Fn_Stripe["Function: /api/stripe/*"]
    end

    subgraph External["External Services"]
        OR["OpenRouter API<br/>(AI models)"]
        Stripe["Stripe API<br/>(payments)"]
    end

    Browser -->|"GET /"| Static
    Browser -->|"POST /api/ai/chat"| Fn_AI
    Browser -->|"POST /api/stripe/checkout"| Fn_Stripe
    Fn_AI -->|"OPENROUTER_API_KEY"| OR
    Fn_Stripe -->|"STRIPE_SECRET_KEY"| Stripe

    style Browser fill:#faf8f5,stroke:#d4c9b8
    style Edge fill:#f0f4ff,stroke:#b8c4d4
    style External fill:#f5f0fa,stroke:#c4b8d4
```

---

## Engine Module Architecture

All engine modules are **pure TypeScript with zero React dependencies**. They can be tested and used outside the UI.

```mermaid
graph LR
    subgraph Engine["client/src/lib/engine/"]
        palette["palette.ts<br/>84-color game palette<br/>PaletteColor[]"]
        color["color.ts<br/>RGB ↔ HSL ↔ CIELAB<br/>Delta E CIE76"]
        grid["grid.ts<br/>GridDocument type<br/>immutable mutations"]
        components["components.ts<br/>BFS flood fill<br/>connected components"]
        optimizer["optimizer.ts<br/>4-pass optimization<br/>pure functions"]
        json_io["json-io.ts<br/>import/export<br/>LTG v2 adapter"]
        canvas_renderer["canvas-renderer.ts<br/>Canvas rendering<br/>zoom/pan/labels"]
        image_import["image-import.ts<br/>image → GridDocument<br/>palette quantization"]
        barrel["index.ts<br/>barrel export"]
    end

    color -->|"findClosestPaletteColor"| palette
    grid -->|"GridDocument"| optimizer
    grid -->|"GridDocument"| components
    components -->|"Component[]"| optimizer
    color -->|"deltaE"| optimizer
    grid -->|"GridDocument"| json_io
    grid -->|"GridDocument"| canvas_renderer
    grid -->|"GridDocument"| image_import
    color -->|"deltaERgb"| image_import
    palette -->|"TOMODACHI_PALETTE"| image_import

    palette --> barrel
    color --> barrel
    grid --> barrel
    components --> barrel
    optimizer --> barrel
    json_io --> barrel
    canvas_renderer --> barrel
    image_import --> barrel

    style Engine fill:#faf8f5,stroke:#d4c9b8
```

---

## Data Model

The central data structure is the **`GridDocument`** — a fully serializable representation of a pixel grid project.

```mermaid
classDiagram
    class GridDocument {
        +version: 1
        +meta: GridMeta
        +width: number
        +height: number
        +cells: (string|null)[]
        +usedColors: string[]
        +lockedColors: string[]
    }

    class GridMeta {
        +name: string
        +createdAt: string
        +modifiedAt: string
        +sourceImage?: string
        +sourceJson?: string
        +notes?: string
        +sourceMetadata?: object
        +sourcePaletteMappings?: object
        +importWarnings?: string[]
    }

    class PaletteColor {
        +id: string
        +name: string
        +hex: string
        +rgb: [number, number, number]
        +row: number
        +col: number
        +isSaturated: boolean
    }

    class Component {
        +colorId: string
        +cells: [number, number][]
        +size: number
        +bounds: [minX, minY, maxX, maxY]
    }

    GridDocument "1" --> "1" GridMeta : contains
    GridDocument "1" --> "0..*" PaletteColor : references via cells[]
    GridDocument "1" --> "0..*" Component : analyzed by components.ts
```

**Critical design decision:** `cells` stores **palette color IDs** (e.g., `"R1C3"`, `"S4"`) — never raw hex values. Cell indexing: `cells[y * width + x]` (row-major, 0-based).

---

## React Component Tree

```mermaid
graph TD
    App["App.tsx<br/>ErrorBoundary + ThemeProvider<br/>+ TooltipProvider + Toaster"]
    Router["Router (Wouter Switch)"]

    Home["/  →  Home.tsx"]
    Studio["/studio  →  Studio.tsx"]
    Help["/help  →  Help.tsx"]
    Guides["/guides  →  Guides.tsx"]
    Unlock["/unlock  →  Unlock.tsx"]
    Support["/support  →  Support.tsx"]
    Legal["Legal pages<br/>Privacy / Terms / Cookies<br/>Disclosure"]
    NotFound["* → NotFound.tsx"]

    App --> Router
    Router --> Home
    Router --> Studio
    Router --> Help
    Router --> Guides
    Router --> Unlock
    Router --> Support
    Router --> Legal
    Router --> NotFound

    subgraph StudioTree["Studio.tsx internals"]
        Hook["useGridDocument hook<br/>(central state)"]
        TopBar["Top bar<br/>name · toggles · undo/redo"]
        CanvasArea["Canvas area (65%)<br/>CanvasViewer.tsx"]
        SidePanel["Control panel (35%)<br/>Tabs: Import / Palette / Optimize / Export"]

        ImportPanel["ImportPanel.tsx"]
        PalettePanel["PalettePanel.tsx"]
        OptimizerPanel["OptimizerPanel.tsx"]
        ExportPanel["ExportPanel.tsx"]
        AiPanel["AiPanel.tsx"]
        CreationPanel["CreationPanel.tsx"]
        ResidentPanel["ResidentPanel.tsx"]

        Hook --> TopBar
        Hook --> CanvasArea
        Hook --> SidePanel
        SidePanel --> ImportPanel
        SidePanel --> PalettePanel
        SidePanel --> OptimizerPanel
        SidePanel --> ExportPanel
        SidePanel --> AiPanel
        SidePanel --> CreationPanel
        SidePanel --> ResidentPanel
    end

    Studio --> StudioTree

    style StudioTree fill:#faf8f5,stroke:#d4c9b8
```

---

## State Management & Data Flow

```mermaid
flowchart TD
    subgraph Hook["useGridDocument hook"]
        State["State:\ndoc: GridDocument | null\nhistory: GridDocument[]\nhistoryIndex: number\nimagePreview: GridDocument | null\nisLoading: boolean\nerror: string | null"]
    end

    subgraph Actions["Mutations (all return new GridDocument)"]
        setDoc["setDoc(doc) → push history"]
        createNew["createNew(w, h, name?, fill?)"]
        importImage["importFromImage(file, options) async"]
        importJson["importFromJson(json)"]
        paintCell["paintCell(x, y, colorId)"]
        fillRegion["fillRegion(x, y, colorId)"]
        mergeColors["mergeColors(fromId, toId)"]
        toggleLock["toggleColorLock(colorId)"]
        runOptimizer["runOptimizer(config?)"]
        undo["undo() / redo()"]
    end

    subgraph Consumers["UI Consumers"]
        CV["CanvasViewer\n(renders doc)"]
        PP["PalettePanel\n(reads usedColors)"]
        OP["OptimizerPanel\n(calls runOptimizer)"]
        IP["ImportPanel\n(calls importFromImage\nimportFromJson)"]
        EP["ExportPanel\n(calls exportJson\ndownloadGridAsPng)"]
    end

    Hook -->|"doc, colorCounts,\ncanUndo, canRedo"| Consumers
    Consumers -->|"user actions"| Actions
    Actions -->|"new GridDocument"| State
    State -->|"re-render"| Consumers

    style Hook fill:#f0f4ff,stroke:#b8c4d4
    style Actions fill:#faf8f5,stroke:#d4c9b8
    style Consumers fill:#f5f0fa,stroke:#c4b8d4
```

---

## Image Import Pipeline

```mermaid
flowchart TD
    A["User drops / selects image file\n(PNG, JPG, GIF, WebP, AVIF, BMP)"]
    B["ImportPanel retains File in state\n(lastImageFile)"]
    C["loadImage(file)\nURL.createObjectURL → HTMLImageElement"]
    D["computeImagePlacement()\nApply frameMode: cover / contain / stretch\nApply focusX / focusY"]
    E["sampleImage()\nDraw to off-screen canvas\nApply brightness / contrast / saturation\nPhoto (smooth) or Pixel/Logo (crisp) sampling"]
    F{"backgroundMode\n= flatten?"}
    G["Background cleanup\nEstimate dominant edge color\nFlood-fill edge-connected pixels\nReplace with backgroundColor"]
    H["For each pixel:\nfindClosestPaletteColor(rgb)\n→ palette color ID"]
    I{"maxColors > 0?"}
    J["passLimitPalette()\nMerge most-similar pairs\nuntil count ≤ maxColors"]
    K["Return GridDocument\nmeta.sourceImage = file.name"]
    L["imagePreview set in hook\n(not yet in history)"]
    M{"User clicks\nCommit Preview?"}
    N["setDoc(preview)\n→ pushed to undo history"]
    O["Cancel: imagePreview cleared\nno history entry"]

    A --> B --> C --> D --> E --> F
    F -->|"yes"| G --> H
    F -->|"no"| H
    H --> I
    I -->|"yes"| J --> K
    I -->|"no"| K
    K --> L --> M
    M -->|"yes"| N
    M -->|"no"| O
```

---

## Optimization Pipeline

```mermaid
flowchart TD
    Start["optimizeGrid(doc, config)\nInput: GridDocument + OptimizerConfig"]

    subgraph Pass1["Pass 1 — Color Merging"]
        P1A["Sort unlocked colors by usage count ↑"]
        P1B["For each rare color:\nfind nearest color by Delta E CIE76"]
        P1C{"Delta E < mergeThreshold?"}
        P1D["replaceColor(rare → common)\nrecomputeUsedColors()"]
        P1A --> P1B --> P1C
        P1C -->|"yes"| P1D
        P1C -->|"no"| P1E["skip"]
    end

    subgraph Pass2["Pass 2 — Island Removal"]
        P2A["findComponents(doc)\nBFS flood fill, 4-connected"]
        P2B["Filter: size ≤ maxIslandSize"]
        P2C["For each island:\nfindDominantNeighborColor()"]
        P2D["Replace island cells with neighbor color"]
        P2A --> P2B --> P2C --> P2D
    end

    subgraph Pass3["Pass 3 — Single-Cell Cleanup"]
        P3A["Scan every cell"]
        P3B{"≥ 3 of 4 neighbors\nare different color?"}
        P3C["Replace with most common neighbor"]
        P3A --> P3B
        P3B -->|"yes"| P3C
        P3B -->|"no"| P3D["skip"]
    end

    subgraph Pass4["Pass 4 — Palette Limiting"]
        P4A{"usedColors.length\n> maxColors?"}
        P4B["Find two most similar\nunlocked colors by Delta E"]
        P4C["Merge less-used into more-used"]
        P4A -->|"yes"| P4B --> P4C --> P4A
        P4A -->|"no"| P4E["done"]
    end

    End["Return { doc, log: OptimizationResult[] }\nPushed to undo history"]

    Start --> Pass1 --> Pass2 --> Pass3 --> Pass4 --> End

    note1["All passes respect lockedColors\nAll passes are pure functions\nAll passes return new GridDocument"]
    style note1 fill:#fffbe6,stroke:#d4c9b8
```

---

## Canvas Rendering Pipeline

```mermaid
sequenceDiagram
    participant User
    participant CanvasViewer
    participant renderGrid
    participant Canvas as HTML5 Canvas

    User->>CanvasViewer: mouse wheel / resize
    CanvasViewer->>CanvasViewer: update zoom / pan / viewportSize
    CanvasViewer->>CanvasViewer: getRenderMetrics()<br/>compute cellSize, panX, panY
    CanvasViewer->>Canvas: set canvas.width/height × devicePixelRatio
    CanvasViewer->>Canvas: ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    CanvasViewer->>renderGrid: renderGrid(ctx, doc, options)
    renderGrid->>Canvas: clear rect
    renderGrid->>Canvas: draw cells (fillRect per cell)
    renderGrid->>Canvas: draw highlight ring (if highlightColorId)
    renderGrid->>Canvas: draw grid lines (if showGrid)
    renderGrid->>Canvas: draw paint-by-numbers labels (if showLabels)

    User->>CanvasViewer: click / drag
    CanvasViewer->>CanvasViewer: canvasToCell(clientX, clientY, options)
    CanvasViewer->>CanvasViewer: getCell(doc, x, y)
    CanvasViewer-->>Studio: onCellClick(x, y, colorId)
```

---

## File I/O Model

All file operations use browser-native APIs. **No files ever leave the user's browser.**

```mermaid
flowchart LR
    subgraph Import
        I1["Image file\n(PNG/JPG/GIF/WebP/AVIF/BMP)"]
        I2["JSON file\n(GridDocument v1\nor LTG v2)"]
        I1 -->|"FileReader → HTMLImageElement\n→ off-screen canvas\n→ pixel sampling\n→ palette matching"| GD
        I2 -->|"FileReader → JSON.parse\n→ validate → normalize\n→ GridDocument"| GD
    end

    GD["GridDocument\n(in-memory)"]

    subgraph Export
        E1["PNG Guide\n(with grid lines + labels)"]
        E2["PNG Clean\n(no overlays)"]
        E3["JSON\n(GridDocument v1)"]
        E4["HTML Reference\n(metadata + palette + JSON)"]
        GD -->|"off-screen canvas\n→ toDataURL('image/png')\n→ <a> click download"| E1
        GD -->|"same, showGrid=false\nshowLabels=false"| E2
        GD -->|"JSON.stringify\n→ Blob → createObjectURL\n→ <a> click download"| E3
        GD -->|"template string\n→ Blob → createObjectURL\n→ <a> click download"| E4
    end

    style GD fill:#f0f4ff,stroke:#b8c4d4
```

---

## API Routes

The same API logic runs in two environments: the Vite dev server (Express middleware) and Cloudflare Pages Functions (edge).

```mermaid
graph LR
    subgraph Dev["Dev: vite.config.ts middleware"]
        D1["GET /api/ai/status"]
        D2["GET /api/ai/models"]
        D3["POST /api/ai/chat"]
        D4["GET /api/stripe/products"]
        D5["POST /api/stripe/checkout"]
        D6["GET /api/stripe/session"]
    end

    subgraph Edge["Prod: functions/api/"]
        E1["ai/[[path]].ts"]
        E2["stripe/[[path]].ts"]
    end

    subgraph Shared["Shared logic: server/"]
        OR["openrouter.ts\ngetOpenRouterStatus()\ngetOpenRouterModels()\nsendOpenRouterChat()"]
        ST["stripe.ts\nlistPublicProducts()\ncreateCheckoutSession()\nverifyCheckoutSession()"]
    end

    D1 & D2 & D3 --> OR
    D4 & D5 & D6 --> ST
    E1 --> OR
    E2 --> ST

    style Dev fill:#faf8f5,stroke:#d4c9b8
    style Edge fill:#f0f4ff,stroke:#b8c4d4
    style Shared fill:#f5f0fa,stroke:#c4b8d4
```

---

## Deployment Architecture

```mermaid
graph TB
    subgraph Repo["GitHub: RazonIn4K/Mii-pixelart"]
        Code["Source code\n(main branch)"]
    end

    subgraph Doppler["Doppler: tomodachi-platform"]
        Dev_cfg["config: dev\n(local)"]
        Stg_cfg["config: stg\n(preview)"]
        Prd_cfg["config: prd\n(production)"]
    end

    subgraph CF["Cloudflare Pages: tomodachi-studio"]
        Build["Build step\npnpm install --frozen-lockfile\npnpm vite build\nRoot: living-the-grid-studio\nOutput: dist/public"]
        Preview["Preview deployment\n*.pages.dev"]
        Production["Production deployment\ntomodachi.pw"]
        Fns["Pages Functions\n/api/ai/*\n/api/stripe/*"]
    end

    Code -->|"git push → triggers build"| Build
    Doppler -->|"Doppler → CF Pages integration\nstg → Preview env vars"| Preview
    Doppler -->|"prd → Production env vars"| Production
    Build --> Preview
    Build --> Production
    Production --> Fns
    Preview --> Fns

    style Repo fill:#faf8f5,stroke:#d4c9b8
    style Doppler fill:#f5f0fa,stroke:#c4b8d4
    style CF fill:#f0f4ff,stroke:#b8c4d4
```

---

## Color Science

```mermaid
flowchart LR
    RGB["RGB\n[0–255, 0–255, 0–255]"]
    HSL["HSL\n[0–360°, 0–1, 0–1]"]
    Linear["Linear RGB\n(sRGB gamma removed)"]
    XYZ["CIE XYZ\n(D65 illuminant)"]
    Lab["CIELAB\n[L*, a*, b*]"]
    DeltaE["Delta E CIE76\n√((ΔL*)² + (Δa*)² + (Δb*)²)"]

    RGB -->|"rgbToHsl()"| HSL
    RGB -->|"linearize gamma"| Linear
    Linear -->|"Bradford matrix"| XYZ
    XYZ -->|"cube root compression"| Lab
    Lab -->|"compare two Lab values"| DeltaE

    DeltaE -->|"< threshold → merge"| Optimizer["Optimizer\npassMergeColors\npassLimitPalette"]
    DeltaE -->|"find minimum"| Matcher["findClosestPaletteColor()\nimage-import.ts"]

    style DeltaE fill:#fffbe6,stroke:#d4c9b8
```

---

## Palette Structure

The game palette has 84 colors organized in a 12-row grid:

```
Rows 1–11: 7 columns each = 77 base colors
Row 12:    7 saturated extras (IDs: S1–S7)

ID format:
  Base colors:      R{row}C{col}   e.g. R1C3 = Row 1, Column 3
  Saturated extras: S{col}         e.g. S4

Row themes:
  R1  Reds        R2  Oranges     R3  Yellows
  R4  Greens      R5  Cyans       R6  Blues
  R7  Purples     R8  Pinks       R9  Browns/Skin tones
  R10 Grays       R11 Warm Grays  R12 Saturated extras
```

---

## Future Considerations

- **Web Workers:** For grids larger than 128×128, optimizer passes could move off the main thread.
- **IndexedDB:** Project auto-save and recovery using browser storage.
- **WASM:** If Delta E calculations become a bottleneck at 256×256, a Rust/WASM module could accelerate the inner loop.
- **Crop rectangle:** Full pan-and-zoom crop controls for image import (Phase 4 remaining).
- **Palette sheet export:** Swatches with labels and IDs as a downloadable image (Phase 5 remaining).
