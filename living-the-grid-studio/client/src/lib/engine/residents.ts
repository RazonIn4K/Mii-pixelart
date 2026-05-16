import type { MiiResidentSpec, QuestHook } from "@shared/residents";
import { validateMiiResidentSpec } from "@shared/residents";

export interface DistrictSpec {
  id: string;
  name: string;
  order: number;
  summary: string;
  waypoint: string;
}

export interface ResidentInteraction {
  id: string;
  title: string;
  residentIds: string[];
  requiredQuestIds: string[];
  quest: QuestHook;
}

export interface IslandGrowthStage {
  id: string;
  name: string;
  order: number;
  gamePattern: string;
  learningGoal: string;
  residentIds: string[];
  unlocks: string[];
  requiredQuestIds: string[];
}

export interface IslandFacilityPlan {
  id: string;
  name: string;
  gameRole: string;
  learningRole: string;
  unlockStageId: string;
}

export interface ResidentCreationStep {
  id: string;
  label: string;
  purpose: string;
}

export const LAYERS_OF_ABSTRACTION_ISLAND = {
  name: "Layers of Abstraction",
  sourceNote:
    "Fan-made educational planning system for Tomodachi Life: Living the Dream. Not affiliated with Nintendo, TomodachiShare, MIT Press, Pearson, or the named authors.",
  styleNote:
    "Use TomodachiShare-inspired cards: warm paper, orange chips, clear tags, portrait, feature screenshot, source credit, and makeup tier.",
  gameResearchNote:
    "Based on Nintendo's public description of Living the Dream: create Mii residents, care for them, level them up through happiness, observe friendships and conflicts, pick residents up to encourage meetings, decorate homes, build island amenities, and create UGC such as pets, food, clothes, books, games, and items.",
};

export const DISTRICTS: DistrictSpec[] = [
  {
    id: "silicon-beach",
    name: "Silicon Beach",
    order: 0,
    summary: "Physical invention layer: circuits become manufacturable objects.",
    waypoint: "Integrated circuit and device-level memory hooks.",
  },
  {
    id: "boolean-boardwalk",
    name: "Boolean Boardwalk",
    order: 1,
    summary: "Logic, relays-as-logic, truth tables, and switching circuits.",
    waypoint: "Translate physical switches into Boolean behavior.",
  },
  {
    id: "circuit-plaza",
    name: "Circuit Plaza",
    order: 2,
    summary: "NAND, combinational chips, ALU, memory, flip-flops, and registers.",
    waypoint: "Build reliable state with feedback plus clocked sequencing.",
  },
  {
    id: "architecture-atrium",
    name: "Architecture Atrium",
    order: 3,
    summary: "CPU, Hack computer, stored programs, Turing machines, and ISA behavior.",
    waypoint: "Make state and symbols execute as a machine.",
  },
  {
    id: "assembly-avenue",
    name: "Assembly Avenue",
    order: 4,
    summary: "Machine language, symbols, opcodes, and assembler translation.",
    waypoint: "Turn readable mnemonics into numerical machine instructions.",
  },
  {
    id: "vm-village",
    name: "VM Village",
    order: 5,
    summary: "Stack machine, memory segments, function calls, and VM translator.",
    waypoint: "Decouple compiler output from target hardware.",
  },
  {
    id: "compiler-grove",
    name: "Compiler Grove",
    order: 6,
    summary: "Jack language, syntax, parsing, and high-level translation.",
    waypoint: "Lower expressive syntax into VM operations.",
  },
  {
    id: "oz-oasis",
    name: "Oz Oasis",
    order: 7,
    summary: "Computation models, declarative programming, concurrency, and explicit state.",
    waypoint: "Reason about execution models and the cost of state.",
  },
  {
    id: "perlis-peak",
    name: "Perlis Peak",
    order: 8,
    summary: "Programming philosophy, language thought, and abstraction critique.",
    waypoint: "Ask what the abstraction makes easier or harder to think.",
  },
];

export const ISLAND_GROWTH_STAGES: IslandGrowthStage[] = [
  {
    id: "welcome-edition",
    name: "Welcome Edition",
    order: 0,
    gamePattern:
      "Start small: create up to three anchor residents, learn the tone, and prove the island concept before overfilling it.",
    learningGoal:
      "Anchor the memory system with physical invention, logic, and computation.",
    residentIds: ["jack-kilby", "george-boole", "alan-turing"],
    unlocks: ["Basic resident cards", "First face-paint masks", "Daily one-question check-in"],
    requiredQuestIds: [],
  },
  {
    id: "first-neighborhood",
    name: "First Neighborhood",
    order: 1,
    gamePattern:
      "Add enough residents for friendships, mismatched compatibility, and small social surprises.",
    learningGoal:
      "Connect physical signals to Boolean logic, switching circuits, and gate symbols.",
    residentIds: ["claude-shannon", "charles-petzold", "nand-mascot"],
    unlocks: ["Boolean Boardwalk", "Circuit Plaza", "first bridge locks"],
    requiredQuestIds: ["kilby-package-circuit", "boole-truth-table"],
  },
  {
    id: "machine-town",
    name: "Machine Town",
    order: 2,
    gamePattern:
      "Grow the island after residents have enough gifts, rooms, and problems to make their personalities visible.",
    learningGoal:
      "Build the machine layer: state, memory, CPU, stored programs, and architecture.",
    residentIds: ["noam-nisan", "shimon-schocken", "john-von-neumann"],
    unlocks: ["Architecture Atrium", "state bridge quest", "system architect roles"],
    requiredQuestIds: ["nand-universal-gate", "shannon-switching"],
  },
  {
    id: "translation-district",
    name: "Translation District",
    order: 3,
    gamePattern:
      "Use the island's grown social graph to stage multi-resident events instead of isolated flashcards.",
    learningGoal:
      "Trace one computation from high-level source to VM, assembly, and CPU behavior.",
    residentIds: ["dennis-ritchie", "stackpointer", "john-backus"],
    unlocks: ["Assembly Avenue", "VM Village", "Compiler Grove", "translation traversal"],
    requiredQuestIds: ["turing-state-machine", "nisan-interface-contract"],
  },
  {
    id: "model-oasis",
    name: "Model Oasis",
    order: 4,
    gamePattern:
      "Let relationships mature, including disagreement, fights, and surprising pairings.",
    learningGoal:
      "Compare hardware state with software mutable state, declarative models, and concurrency.",
    residentIds: ["peter-van-roy", "seif-haridi", "alan-perlis"],
    unlocks: ["Oz Oasis", "Perlis Peak", "weekly island summit"],
    requiredQuestIds: ["translation-source-vm-assembly-cpu", "state-bridge-flipflop-variable"],
  },
];

export const ISLAND_FACILITY_PLANS: IslandFacilityPlan[] = [
  {
    id: "mii-news-station",
    name: "Mii News Station",
    gameRole: "Daily reports and island happenings.",
    learningRole:
      "Daily recap: one surprise social event becomes a written abstraction bridge.",
    unlockStageId: "welcome-edition",
  },
  {
    id: "resident-homes",
    name: "Resident Homes",
    gameRole: "Residents live, relax, and reveal likes, dislikes, and moods.",
    learningRole:
      "Each home stores the resident's book source, key artifact, gifts, and recall prompt.",
    unlockStageId: "welcome-edition",
  },
  {
    id: "quik-build-amenities",
    name: "Quik Build Amenities",
    gameRole: "Island objects and amenities placed around the world.",
    learningRole:
      "District props: relays, truth-table kiosks, register benches, VM elevators, and kernel-language plaques.",
    unlockStageId: "first-neighborhood",
  },
  {
    id: "marketplace",
    name: "Marketplace",
    gameRole: "Finds, mystery bags, and items.",
    learningRole:
      "UGC prompt source: each item becomes a small pixel-art artifact or quiz token.",
    unlockStageId: "first-neighborhood",
  },
  {
    id: "palette-house",
    name: "Palette House Workshop",
    gameRole: "Create custom pets, food, clothing, books, games, and items.",
    learningRole:
      "Make repaintable concept assets: NAND pet, stack food tower, book covers, CPU badges, and language logos.",
    unlockStageId: "machine-town",
  },
  {
    id: "foto-tomo",
    name: "Foto-Tomo Photography",
    gameRole: "Absurd photo ops and memories with residents.",
    learningRole:
      "Screenshot one interaction and annotate the concept bridge it represented.",
    unlockStageId: "translation-district",
  },
  {
    id: "relationship-map",
    name: "Relationship Map",
    gameRole: "Friendship, compatibility, fights, grudges, love, and family growth.",
    learningRole:
      "Use compatibility as dependency tension: non-adjacent layers need bridge quests before deep interaction.",
    unlockStageId: "model-oasis",
  },
];

export const RESIDENT_CREATION_STEPS: ResidentCreationStep[] = [
  {
    id: "role",
    label: "Pick the abstraction role",
    purpose:
      "Choose exactly one layer job before touching face paint: inventor, logic bridge, state machine, translator, model critic, or mascot.",
  },
  {
    id: "features",
    label: "Create the Mii feature sheet",
    purpose:
      "Capture hair, eyes, brows, voice, personality, quirks, gifts, home plan, and relationship plan.",
  },
  {
    id: "face-paint",
    label: "Design concept-encoded face paint",
    purpose:
      "Use face paint only for readable concept cues: tape marks, switch dots, quote marks, stack arrows, NAND merge dots.",
  },
  {
    id: "gift-loop",
    label: "Assign growth gifts",
    purpose:
      "Leveling gifts become study affordances: expressions for confidence, quirks for mnemonics, clothes for district identity.",
  },
  {
    id: "relationship",
    label: "Place them near a bridge resident",
    purpose:
      "Use pickup-and-place style planning: you can encourage an interaction, but the recall quest decides what unlocks.",
  },
  {
    id: "export",
    label: "Export the resident pack",
    purpose:
      "Save resident JSON, feature sheet, face-paint guide, palette sheet, and source notes.",
  },
];

export const STARTER_RESIDENTS: MiiResidentSpec[] = [
  {
    id: "jack-kilby",
    name: "Jack Kilby",
    district: "Silicon Beach",
    districtId: "silicon-beach",
    layerRole: "Integrated-circuit origin resident",
    tags: ["hardware", "integrated-circuit", "physical-layer"],
    sourceCredits: ["Historical integrated-circuit reference"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "NONE",
    bridgeBelow: "Below this layer are materials, wires, and device physics.",
    bridgeAbove:
      "Above this layer, packaged circuits become reliable building blocks for logic.",
    questHook: {
      id: "kilby-package-circuit",
      title: "From Parts to Package",
      trigger: "residentChat",
      input: "A hand-wired circuit is too large and fragile to scale.",
      artifactType: "circuit",
      bridgeQuestion:
        "What abstraction changes when multiple components become one packaged circuit?",
      expectedOutput:
        "The packaged circuit hides physical wiring details behind a reusable component boundary.",
      correctionHint:
        "Think about the interface: the outside sees pins and behavior, not every internal wire.",
      retryVariant:
        "Explain why a packaged adder is easier to reuse than a loose pile of gates.",
      acceptanceKeywords: ["package", "component", "interface", "wire"],
    },
    visualFeatures: {
      hair: { note: "Short neat inventor hair" },
      head: { note: "Plain human base" },
      eyebrows: { note: "Calm focused brows" },
      eyes: { note: "Small attentive eyes" },
      height: 52,
      weight: 48,
    },
    personality: { note: "Quiet builder, practical inventor" },
    quirks: ["Tinkers with tiny objects", "Explains why scale matters"],
    giftPlan: ["Chip-pin shirt", "Workbench interior", "Simple expression"],
    homePlan: "Silicon Beach lab with one clear integrated-circuit prop.",
    relationshipPlan:
      "Place near Boole after the packaging quest to show physical components becoming logic.",
    catchphrase: "Put it in one package.",
    recallPrompt:
      "What does integration hide, and what interface does it expose?",
    pixelArtNotes:
      "Use a simple chip-pin motif on clothing or face paint only if the likeness still reads clearly.",
  },
  {
    id: "george-boole",
    name: "George Boole",
    district: "Boolean Boardwalk",
    districtId: "boolean-boardwalk",
    layerRole: "Boolean algebra resident",
    tags: ["logic", "boolean", "truth-table"],
    sourceCredits: ["Boolean algebra historical reference"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow: "Below Boole, physical switches produce on/off signals.",
    bridgeAbove: "Above Boole, algebraic operators become logic gates.",
    questHook: {
      id: "boole-truth-table",
      title: "Truth Table Prediction",
      trigger: "residentChat",
      input: "A = 1, B = 0, C = 1. Compute (A AND B) OR C.",
      artifactType: "truthTable",
      bridgeQuestion:
        "How does Boolean algebra preserve behavior before a circuit exists?",
      expectedOutput: "1",
      correctionHint:
        "Evaluate the inner AND first: 1 AND 0 is 0. Then 0 OR 1 is 1.",
      retryVariant: "A = 1, B = 1, C = 0. Compute (A AND B) OR C.",
      acceptanceKeywords: ["1", "true"],
    },
    visualFeatures: {
      hair: { note: "Side-parted Victorian silhouette" },
      eyebrows: { note: "Thick formal brows" },
      eyes: { note: "Small thoughtful eyes" },
      other: { facePaint: "Tiny 1/0 cheek marks if readable" },
      height: 50,
      weight: 45,
    },
    catchphrase: "Let true meet false.",
    quirks: ["Turns everyday choices into truth tables"],
    giftPlan: ["Monochrome outfit", "Truth-table notebook"],
    homePlan: "Boolean Boardwalk study with black/white swatches.",
    relationshipPlan:
      "Pair with Shannon once the user can evaluate Boolean expressions reliably.",
    recallPrompt:
      "What output does the expression produce, and which operator did you apply first?",
    pixelArtNotes:
      "Use binary contrast marks: one black cheek dot and one white cheek dot, not tiny unreadable text.",
  },
  {
    id: "claude-shannon",
    name: "Claude Shannon",
    district: "Boolean Boardwalk",
    districtId: "boolean-boardwalk",
    layerRole: "Switching-circuit bridge resident",
    tags: ["switching", "information", "logic-to-circuit"],
    sourceCredits: ["Switching circuits and information theory reference"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow: "Below Shannon are physical relay or switch states.",
    bridgeAbove: "Above Shannon, Boolean expressions become actual circuits.",
    questHook: {
      id: "shannon-switching",
      title: "Switches Become Logic",
      trigger: "districtBridge",
      input: "Two switches are wired in series. Switch A is closed, B is open.",
      artifactType: "circuit",
      bridgeQuestion:
        "Which Boolean operator does a series circuit model, and what is the output?",
      expectedOutput: "Series switches model AND, so the output is 0.",
      correctionHint:
        "Current only flows through a series path if every switch is closed.",
      retryVariant:
        "Two switches are wired in parallel. A is open, B is closed. Name the operator and output.",
      acceptanceKeywords: ["and", "0", "series"],
    },
    visualFeatures: {
      hair: { note: "Neat mid-century hair" },
      eyebrows: { note: "Defined brows" },
      other: { facePaint: "One small switch mark or bit mark near the temple" },
      height: 54,
      weight: 50,
    },
    catchphrase: "The switch has meaning.",
    quirks: ["Sees switches as sentences", "Keeps saying one bit can carry intent"],
    giftPlan: ["Switch badge", "Binary snack", "Radio-room interior"],
    homePlan: "Boardwalk lab where switch diagrams sit beside logic symbols.",
    relationshipPlan:
      "Bridge Boole to Turing by making switch outputs feed state transitions.",
    recallPrompt:
      "Why does switch wiring let Boolean algebra become engineering?",
    pixelArtNotes:
      "Use one clean switch-like line and a binary dot pair. Keep it readable at 64x64.",
  },
  {
    id: "charles-petzold",
    name: "Charles Petzold",
    district: "Boolean Boardwalk",
    districtId: "boolean-boardwalk",
    layerRole: "Physical explanation chronicler",
    tags: ["code", "relays", "gates", "explanation"],
    sourceCredits: ["Code by Charles Petzold"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "NONE",
    bridgeBelow: "Below Petzold are concrete devices: wires, relays, and signals.",
    bridgeAbove:
      "Above Petzold, relay behavior is compressed into gate symbols and diagrams.",
    questHook: {
      id: "petzold-relay-abstraction",
      title: "Relay to Gate",
      trigger: "residentChat",
      input: "A relay circuit behaves like an AND gate.",
      artifactType: "circuit",
      bridgeQuestion:
        "What is gained and what is hidden when you replace the relay drawing with an AND symbol?",
      expectedOutput:
        "The symbol exposes behavior and hides physical wiring, delay, and power details.",
      correctionHint:
        "The diagram becomes easier to compose, but the physics still exists underneath.",
      retryVariant:
        "Explain the same tradeoff for replacing a full adder circuit with an adder box.",
      acceptanceKeywords: ["behavior", "hide", "wiring", "delay"],
    },
    visualFeatures: {
      hair: { note: "Short author-like hair" },
      glasses: { note: "Optional square glasses" },
      height: 55,
      weight: 52,
    },
    personality: { note: "Patient explainer" },
    quirks: ["Starts every explanation from a physical object"],
    giftPlan: ["Relay model", "Graph-paper room", "Wire-pattern outfit"],
    homePlan: "A readable relay-and-gate workshop, not a cluttered electronics room.",
    relationshipPlan:
      "Creates useful tension with Nisan and Schocken: look inside while learning, trust the interface while building.",
    catchphrase: "Start with the wire.",
    recallPrompt:
      "What physical detail does the gate symbol hide from the next layer?",
    pixelArtNotes:
      "Use clean human portrait features; add a small wire or relay motif on clothing, not across the face.",
  },
  {
    id: "nand-mascot",
    name: "NAND",
    district: "Circuit Plaza",
    districtId: "circuit-plaza",
    layerRole: "Universal gate mascot",
    tags: ["nand", "gate", "universal", "mascot"],
    sourceCredits: ["The Elements of Computing Systems, Boolean Logic"],
    platform: "SWITCH",
    gender: "NONBINARY",
    makeup: "FULL",
    bridgeBelow: "Below NAND are Boolean operators and switch behavior.",
    bridgeAbove:
      "Above NAND, every chip can be built from a single universal gate pattern.",
    questHook: {
      id: "nand-universal-gate",
      title: "Build NOT from NAND",
      trigger: "studySession",
      input: "Use one NAND gate with both inputs tied to A.",
      artifactType: "circuit",
      bridgeQuestion: "What output do you get, and why is this a NOT gate?",
      expectedOutput: "A NAND A equals NOT A.",
      correctionHint:
        "If A is 1, NAND sees 1 AND 1 then inverts to 0. If A is 0, it inverts 0 to 1.",
      retryVariant: "Use NAND to express A AND B with a second inversion stage.",
      acceptanceKeywords: ["not", "invert", "a nand a"],
    },
    visualFeatures: {
      other: {
        facePaint:
          "Two input marks merge into one output mark with an inversion dot.",
      },
      height: 48,
      weight: 50,
    },
    catchphrase: "Invert the merge.",
    quirks: ["Turns every problem into one gate repeated carefully"],
    giftPlan: ["Gate-mask face paint", "Black outline outfit", "Logic snack"],
    homePlan: "Circuit Plaza mascot room with two input paths and one inversion dot.",
    relationshipPlan:
      "Unlocks Nisan and Schocken project quests after the user explains why NAND can build NOT.",
    recallPrompt: "Why is NAND enough to build all other gates?",
    pixelArtNotes:
      "Full face-paint concept: two symmetric input cheek marks, central merge, one small output inversion dot.",
  },
  {
    id: "noam-nisan",
    name: "Noam Nisan",
    district: "Circuit Plaza",
    districtId: "circuit-plaza",
    layerRole: "Island-wide systems architect",
    tags: ["nand2tetris", "interface", "implementation", "architecture"],
    sourceCredits: ["The Elements of Computing Systems by Nisan and Schocken"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "NONE",
    bridgeBelow: "Below the architect are verified chip interfaces.",
    bridgeAbove:
      "Above the architect, each project becomes the foundation for the next abstraction.",
    questHook: {
      id: "nisan-interface-contract",
      title: "Interface Contract",
      trigger: "districtBridge",
      input: "A chip passes its truth-table tests.",
      artifactType: "circuit",
      bridgeQuestion:
        "Why should the next project use the chip interface instead of reopening the implementation?",
      expectedOutput:
        "The verified interface lets the next layer compose the chip as a black box.",
      correctionHint:
        "The system scales because each layer trusts a precise contract.",
      retryVariant:
        "Explain why an ALU builder should not care how the lower-level Add16 is wired.",
      acceptanceKeywords: ["interface", "black box", "contract", "compose"],
    },
    visualFeatures: {
      hair: { note: "Simple academic portrait" },
      height: 54,
      weight: 50,
    },
    catchphrase: "Trust the interface.",
    quirks: ["Asks for the interface before the implementation"],
    giftPlan: ["Blueprint outfit", "Project checklist", "Black-box prop"],
    homePlan: "Systems architect office spanning Circuit Plaza through Compiler Grove.",
    relationshipPlan:
      "Acts as an island-wide architect who unlocks cross-district projects after lower interfaces pass.",
    recallPrompt:
      "What does a verified chip interface let the next layer ignore?",
    pixelArtNotes:
      "Use subtle blueprint accents, but keep the face clean for human readability.",
  },
  {
    id: "shimon-schocken",
    name: "Shimon Schocken",
    district: "Circuit Plaza",
    districtId: "circuit-plaza",
    layerRole: "Project sequence architect",
    tags: ["nand2tetris", "projects", "bottom-up", "architecture"],
    sourceCredits: ["The Elements of Computing Systems by Nisan and Schocken"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "NONE",
    bridgeBelow: "Below this resident are completed lower projects.",
    bridgeAbove:
      "Above this resident, completed chips become a CPU, VM, compiler, and game.",
    questHook: {
      id: "schocken-project-ladder",
      title: "Project Ladder",
      trigger: "studySession",
      input: "NAND -> chips -> ALU -> memory -> CPU -> assembler -> VM.",
      artifactType: "program",
      bridgeQuestion:
        "What makes this sequence more than a list of topics?",
      expectedOutput:
        "Each project implements the interface that the next project uses.",
      correctionHint:
        "Do not memorize the order only. Explain the dependency between neighboring layers.",
      retryVariant:
        "Name the lower-layer dependency that lets a VM translator target Hack assembly.",
      acceptanceKeywords: ["implements", "interface", "next"],
    },
    visualFeatures: {
      hair: { note: "Clean academic portrait" },
      height: 54,
      weight: 50,
    },
    catchphrase: "Build the next floor.",
    quirks: ["Turns lessons into projects"],
    giftPlan: ["Layered staircase prop", "Workshop interior"],
    homePlan: "Project-ladder room with visible floors but few distractions.",
    relationshipPlan:
      "Reinforces every dependency by asking which completed project the next layer consumes.",
    recallPrompt: "Which completed interface does the next project consume?",
    pixelArtNotes:
      "Use stair-step or layer badges on clothing rather than busy face symbols.",
  },
  {
    id: "alan-turing",
    name: "Alan Turing",
    district: "Architecture Atrium",
    districtId: "architecture-atrium",
    layerRole: "State-machine and computability resident",
    tags: ["state", "turing-machine", "stored-program", "architecture"],
    sourceCredits: ["Turing machine and computability historical reference"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow:
      "Below Turing are symbols and state transitions implemented by hardware.",
    bridgeAbove:
      "Above Turing, machine execution becomes a model for all programmable systems.",
    questHook: {
      id: "turing-state-machine",
      title: "State plus Symbol",
      trigger: "residentChat",
      input: "Machine is in state S0 reading symbol 1. Rule: S0,1 -> write 0, move R, enter S1.",
      artifactType: "stateTrace",
      bridgeQuestion: "What changes after one machine step?",
      expectedOutput: "The symbol becomes 0, the head moves right, and the state becomes S1.",
      correctionHint:
        "Track all three things: written symbol, head position, and next state.",
      retryVariant:
        "S1,0 -> write 1, move L, enter S0. What changes after that step?",
      acceptanceKeywords: ["0", "right", "s1"],
    },
    visualFeatures: {
      hair: { note: "Short swept hair" },
      eyebrows: { note: "Strong thoughtful brow" },
      other: { facePaint: "Tiny tape/grid motif near one cheek" },
      height: 56,
      weight: 48,
    },
    personality: { note: "Riddle-driven and precise" },
    quirks: ["Gets fascinated by tiny rule changes"],
    giftPlan: ["Tape scarf", "State-machine wallpaper", "Thinking expression"],
    homePlan: "Architecture Atrium room with a tape path and state cards.",
    relationshipPlan:
      "Meets Shannon after switching logic; debates Van Roy only after state bridge prerequisites unlock.",
    catchphrase: "Follow the state.",
    recallPrompt:
      "What must a machine remember to decide its next action?",
    pixelArtNotes:
      "Use a tape/grid accent and strong brow silhouette. Avoid tiny text on the tape.",
  },
  {
    id: "john-von-neumann",
    name: "John von Neumann",
    district: "Architecture Atrium",
    districtId: "architecture-atrium",
    layerRole: "Stored-program architecture resident",
    tags: ["architecture", "stored-program", "memory", "cpu"],
    sourceCredits: ["Stored-program computer historical reference"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "NONE",
    bridgeBelow: "Below this layer are registers, ALUs, memory chips, and control.",
    bridgeAbove:
      "Above this layer, instructions and data share a machine-level execution model.",
    questHook: {
      id: "vonneumann-stored-program",
      title: "Instruction as Data",
      trigger: "districtBridge",
      input: "Memory location 100 stores an instruction, not a number for arithmetic.",
      artifactType: "assembly",
      bridgeQuestion:
        "Why is storing instructions in memory a major abstraction step?",
      expectedOutput:
        "The machine can fetch instructions from memory and treat programs as stored data.",
      correctionHint:
        "The CPU no longer needs to be rewired for each program. It fetches the next instruction.",
      retryVariant:
        "Explain how a program counter depends on this stored-program idea.",
      acceptanceKeywords: ["fetch", "memory", "instruction", "program"],
    },
    visualFeatures: {
      hair: { note: "Formal swept hair" },
      height: 55,
      weight: 50,
    },
    catchphrase: "Store the program.",
    quirks: ["Asks where the next instruction lives"],
    giftPlan: ["Memory-grid rug", "Program-counter clock"],
    homePlan: "Architecture Atrium office with memory cells and a fetch/decode path.",
    relationshipPlan:
      "Connects Turing's abstract machine to the practical CPU and assembly residents.",
    recallPrompt:
      "What does the program counter fetch, and where is it stored?",
    pixelArtNotes:
      "Use a small memory-cell badge. Keep face paint minimal.",
  },
  {
    id: "dennis-ritchie",
    name: "Dennis Ritchie",
    district: "Assembly Avenue",
    districtId: "assembly-avenue",
    layerRole: "Systems-language bridge resident",
    tags: ["c", "unix", "systems", "assembly-bridge"],
    sourceCredits: ["C and Unix historical reference"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "NONE",
    bridgeBelow: "Below Ritchie are assembly, memory addresses, and machine constraints.",
    bridgeAbove:
      "Above Ritchie, portable systems code gives humans leverage over machines.",
    questHook: {
      id: "ritchie-symbol-to-machine",
      title: "Symbolic Machine Step",
      trigger: "residentChat",
      input: "@i followed by M=M+1.",
      artifactType: "assembly",
      bridgeQuestion:
        "What does symbolic assembly make easier for the programmer?",
      expectedOutput:
        "The symbol names a memory target so the programmer avoids raw numeric addresses.",
      correctionHint:
        "The assembler still emits machine instructions, but the human reads names.",
      retryVariant:
        "Explain why a loop label is easier than manually counting jump addresses.",
      acceptanceKeywords: ["symbol", "address", "assembler"],
    },
    visualFeatures: {
      hair: { note: "Bearded systems-programmer silhouette" },
      other: { facePaint: "Optional beard emphasis if the Mii tool needs it" },
      height: 55,
      weight: 52,
    },
    catchphrase: "Name the address.",
    quirks: ["Names everything that would otherwise be a number"],
    giftPlan: ["Terminal shirt", "Label-maker prop", "Systems room"],
    homePlan: "Assembly Avenue room with symbolic labels and a memory map.",
    relationshipPlan:
      "Bridges von Neumann architecture to StackPointer by showing how symbolic assembly targets machine behavior.",
    recallPrompt:
      "What does a symbol table let the assembler replace?",
    pixelArtNotes:
      "Prioritize beard and hair silhouette over tiny code symbols.",
  },
  {
    id: "stackpointer",
    name: "StackPointer",
    district: "VM Village",
    districtId: "vm-village",
    layerRole: "Stack-machine mascot",
    tags: ["vm", "stack", "segments", "mascot"],
    sourceCredits: ["The Elements of Computing Systems, Virtual Machine"],
    platform: "SWITCH",
    gender: "NONBINARY",
    makeup: "FULL",
    bridgeBelow: "Below the VM are target-specific assembly instructions.",
    bridgeAbove:
      "Above the VM, compilers emit portable stack commands instead of hardware-specific code.",
    questHook: {
      id: "stackpointer-vm-trace",
      title: "Trace the Stack",
      trigger: "studySession",
      input: "push constant 7; push constant 3; sub",
      artifactType: "vmTrace",
      bridgeQuestion: "What value is left on top of the stack?",
      expectedOutput: "4",
      correctionHint:
        "The VM pops 3 and 7, computes 7 - 3, then pushes 4.",
      retryVariant: "push constant 2; push constant 5; add. What remains?",
      acceptanceKeywords: ["4"],
    },
    visualFeatures: {
      other: {
        facePaint:
          "Layered block stripes with a small arrow pointing to the top item.",
      },
      height: 44,
      weight: 44,
    },
    catchphrase: "Top value first.",
    quirks: ["Stacks snacks, books, and arguments"],
    giftPlan: ["Block-stack hat", "Arrow badge", "VM elevator interior"],
    homePlan: "VM Village apartment arranged vertically with the top item highlighted.",
    relationshipPlan:
      "Links Ritchie and Backus: compiler output becomes portable stack operations before assembly.",
    recallPrompt:
      "Why does a stack VM make compiler output less hardware-specific?",
    pixelArtNotes:
      "Use stacked blocks and one clear arrow. Do not add many labels.",
  },
  {
    id: "john-backus",
    name: "John Backus",
    district: "Compiler Grove",
    districtId: "compiler-grove",
    layerRole: "High-level language and notation resident",
    tags: ["compiler", "language", "syntax", "translation"],
    sourceCredits: ["FORTRAN and BNF historical references"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "NONE",
    bridgeBelow: "Below Backus are VM commands and assembly targets.",
    bridgeAbove:
      "Above Backus, humans express intent through high-level syntax and grammar.",
    questHook: {
      id: "backus-jack-translation",
      title: "Source to VM",
      trigger: "districtBridge",
      input: "let x = x + 1;",
      artifactType: "program",
      bridgeQuestion:
        "What VM command sequence captures this high-level assignment?",
      expectedOutput:
        "push local 0; push constant 1; add; pop local 0",
      correctionHint:
        "Load x, load 1, add them, then store the result back into x.",
      retryVariant:
        "Translate let y = y - 1; using the same stack pattern.",
      acceptanceKeywords: ["push", "constant 1", "add", "pop"],
    },
    visualFeatures: {
      hair: { note: "Formal programmer portrait" },
      height: 54,
      weight: 50,
    },
    catchphrase: "Give syntax a target.",
    quirks: ["Turns wishes into grammar"],
    giftPlan: ["Grammar-bracket shirt", "Compiler vine room"],
    homePlan: "Compiler Grove room with syntax-tree plants and a VM command desk.",
    relationshipPlan:
      "Starts the translation traversal with StackPointer and Ritchie once VM trace is understood.",
    recallPrompt:
      "What does high-level syntax become after compiler lowering?",
    pixelArtNotes:
      "Use a grammar-bracket motif on clothing; keep the face simple.",
  },
  {
    id: "peter-van-roy",
    name: "Peter Van Roy",
    district: "Oz Oasis",
    districtId: "oz-oasis",
    layerRole: "Computation-model architect",
    tags: ["ctm", "declarative", "state", "concurrency"],
    sourceCredits: ["Concepts, Techniques, and Models of Computer Programming"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow:
      "Below Van Roy are concrete programs whose behavior can be described by a kernel language.",
    bridgeAbove:
      "Above Van Roy, language design becomes a choice of computation model.",
    questHook: {
      id: "vanroy-state-cost",
      title: "Cost of State",
      trigger: "relationshipConflict",
      input: "X = 1; X := 2; another thread reads X.",
      artifactType: "stateTrace",
      bridgeQuestion:
        "Why does explicit mutable state make reasoning harder than declarative binding?",
      expectedOutput:
        "The value depends on observable time, ordering, and possible interleavings.",
      correctionHint:
        "A declarative binding keeps one meaning. Assignment makes the answer depend on when you look.",
      retryVariant:
        "Two threads update the same cell. Explain why the final value may depend on schedule.",
      acceptanceKeywords: ["time", "order", "interleaving", "mutable"],
    },
    visualFeatures: {
      hair: { note: "Calm academic portrait" },
      other: { facePaint: "Minimal model-diagram accent" },
      height: 55,
      weight: 50,
    },
    personality: { note: "Precise, calm, model-first" },
    quirks: ["Asks whether state is really necessary"],
    giftPlan: ["Model-diagram outfit", "Declarative pond interior"],
    homePlan: "Oz Oasis room with simple clean diagrams and no clutter.",
    relationshipPlan:
      "Debates Turing and NAND only after the user contrasts hardware memory with software mutable state.",
    catchphrase: "Choose the model first.",
    recallPrompt:
      "What reasoning property do you lose when explicit state enters the model?",
    pixelArtNotes:
      "Use calm, sparse geometry: one diagram accent, no noisy symbols.",
  },
  {
    id: "seif-haridi",
    name: "Seif Haridi",
    district: "Oz Oasis",
    districtId: "oz-oasis",
    layerRole: "Concurrency and model co-architect",
    tags: ["ctm", "concurrency", "message-passing", "models"],
    sourceCredits: ["Concepts, Techniques, and Models of Computer Programming"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow:
      "Below Haridi are deterministic traces and explicit communication events.",
    bridgeAbove:
      "Above Haridi, different concurrency models trade simplicity for expressiveness.",
    questHook: {
      id: "haridi-concurrency-choice",
      title: "Choose the Communication Model",
      trigger: "studySession",
      input: "Two workers must exchange values without sharing one mutable cell.",
      artifactType: "program",
      bridgeQuestion:
        "Which model avoids shared-state races while still allowing communication?",
      expectedOutput:
        "Use message passing or declarative concurrency instead of shared mutable state.",
      correctionHint:
        "The point is to communicate without both parties mutating the same location.",
      retryVariant:
        "Explain what risk returns when both workers write to the same shared cell.",
      acceptanceKeywords: ["message", "declarative", "shared"],
    },
    visualFeatures: {
      hair: { note: "Academic portrait" },
      other: { facePaint: "Small paired-mailbox motif if readable" },
      height: 55,
      weight: 50,
    },
    catchphrase: "Send, don't scramble.",
    quirks: ["Prefers clean communication over shared messes"],
    giftPlan: ["Mailbox badge", "Concurrency fountain prop"],
    homePlan: "Oz Oasis room with paired message boxes and separate worker zones.",
    relationshipPlan:
      "Pairs with Van Roy for computation-model quests and with StackPointer for communication-vs-storage comparisons.",
    recallPrompt:
      "How can communication happen without shared mutable state?",
    pixelArtNotes:
      "Use paired dots or mailbox blocks. Keep the concept readable, not decorative clutter.",
  },
  {
    id: "alan-perlis",
    name: "Alan J. Perlis",
    district: "Perlis Peak",
    districtId: "perlis-peak",
    layerRole: "Programming-language philosophy resident",
    tags: ["epigrams", "language", "philosophy", "abstraction"],
    sourceCredits: ["Epigrams on Programming historical reference"],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow:
      "Below Perlis are working languages, models, compilers, and machines.",
    bridgeAbove:
      "Above Perlis is the meta-question: how does a language change thought?",
    questHook: {
      id: "perlis-language-thought",
      title: "Language Changes Thought",
      trigger: "residentChat",
      input: "A language gives you first-class functions but hides raw memory.",
      artifactType: "program",
      bridgeQuestion:
        "What does that abstraction make easier to think about, and what does it hide?",
      expectedOutput:
        "It makes behavior and composition easier while hiding machine-level memory detail.",
      correctionHint:
        "Every language feature focuses attention somewhere and removes attention somewhere else.",
      retryVariant:
        "Ask the same question about assembly labels hiding raw addresses.",
      acceptanceKeywords: ["think", "hide", "composition", "memory"],
    },
    visualFeatures: {
      eyebrows: { note: "Sharp expressive brows" },
      other: { facePaint: "Quote-mark cheek motif" },
      height: 53,
      weight: 50,
    },
    personality: { note: "Witty abstraction critic" },
    quirks: ["Drops short epigrams after every unlock"],
    giftPlan: ["Quote-mark face paint", "Summit interior", "Witty expression"],
    homePlan: "Perlis Peak lookout with one quote plaque and a view of every district.",
    relationshipPlan:
      "Final summit resident: asks what each abstraction made easier and what it hid.",
    catchphrase: "What did it make you think?",
    recallPrompt:
      "What did this abstraction make easier, and what did it make invisible?",
    pixelArtNotes:
      "Use quote marks and strong eyebrows. Do not write full epigrams on the face.",
  },
];

export const CROSS_LAYER_INTERACTIONS: ResidentInteraction[] = [
  {
    id: "state-changes-meaning",
    title: "State Changes Meaning",
    residentIds: ["nand-mascot", "alan-turing", "peter-van-roy"],
    requiredQuestIds: ["nand-universal-gate", "turing-state-machine"],
    quest: {
      id: "state-bridge-flipflop-variable",
      title: "Flip-Flop vs Mutable Variable",
      trigger: "relationshipConflict",
      input:
        "Circuit Plaza: D = 1 at clock tick t, register stores 1 at t + 1. Oz Oasis: X = 1; X := 2; another expression reads X.",
      artifactType: "stateTrace",
      bridgeQuestion:
        "Why is state necessary and useful in Circuit Plaza, but dangerous or costly in Oz Oasis?",
      expectedOutput:
        "Hardware state creates memory through feedback and clocking; software mutable state introduces observable time, ordering, aliasing, and nondeterminism.",
      correctionHint:
        "At the hardware layer, state solves memory. At the software-model layer, state creates reasoning over time.",
      retryVariant:
        "Compare a clocked register with two threads writing the same variable.",
      acceptanceKeywords: [
        "memory",
        "clock",
        "time",
        "order",
        "nondeterminism",
      ],
    },
  },
  {
    id: "translation-pipeline",
    title: "Translation Pipeline Traversal",
    residentIds: ["john-backus", "stackpointer", "dennis-ritchie", "alan-turing"],
    requiredQuestIds: ["backus-jack-translation", "stackpointer-vm-trace"],
    quest: {
      id: "translation-source-vm-assembly-cpu",
      title: "Source to CPU",
      trigger: "districtBridge",
      input:
        "Input: x = x + 1. Compiler Grove: let x = x + 1;. VM Village: push local 0; push constant 1; add; pop local 0.",
      artifactType: "vmTrace",
      bridgeQuestion:
        "What does the translation pipeline preserve as it moves from source code to VM to assembly to CPU execution?",
      expectedOutput:
        "It preserves behavior while lowering expressive syntax into VM commands, then assembly, then CPU register and ALU actions.",
      correctionHint:
        "The notation changes at each layer. The intended computation is what must survive.",
      retryVariant:
        "Trace y = y - 1 from high-level assignment to VM stack operations.",
      acceptanceKeywords: ["behavior", "vm", "assembly", "cpu", "alu"],
    },
  },
  {
    id: "symbols-become-state",
    title: "Symbols Become State",
    residentIds: ["claude-shannon", "alan-turing"],
    requiredQuestIds: ["shannon-switching", "boole-truth-table"],
    quest: {
      id: "shannon-turing-symbol-state",
      title: "Switching Logic to Machine Step",
      trigger: "districtBridge",
      input:
        "A circuit computes the next-state bit from current state S and input bit I.",
      artifactType: "stateTrace",
      bridgeQuestion:
        "How does switching logic support a Turing-style state transition?",
      expectedOutput:
        "Logic gates compute the next symbol, movement, and state from the current state and input.",
      correctionHint:
        "The transition rule can be implemented by combinational logic feeding clocked state.",
      retryVariant:
        "Name the hardware pieces needed to remember the next state after the clock tick.",
      acceptanceKeywords: ["next", "state", "logic", "clock"],
    },
  },
  {
    id: "interface-black-box",
    title: "Black Box Dependency",
    residentIds: ["charles-petzold", "noam-nisan", "shimon-schocken"],
    requiredQuestIds: ["petzold-relay-abstraction", "nisan-interface-contract"],
    quest: {
      id: "petzold-n2t-interface",
      title: "Physical Story vs Interface Contract",
      trigger: "relationshipConflict",
      input:
        "Petzold wants to explain the relay inside the gate. Nisan and Schocken want to use the verified gate as a black box.",
      artifactType: "circuit",
      bridgeQuestion:
        "When should you look inside the box, and when should you trust the interface?",
      expectedOutput:
        "Look inside while learning or implementing the layer; trust the interface when composing the next layer.",
      correctionHint:
        "Implementation knowledge builds the box. Interface knowledge lets the system scale.",
      retryVariant:
        "Apply the same rule to an ALU used by a CPU designer.",
      acceptanceKeywords: ["implementing", "interface", "compose", "scale"],
    },
  },
];

export function getDistrictById(id: string): DistrictSpec | undefined {
  return DISTRICTS.find((district) => district.id === id);
}

export function getResidentById(id: string): MiiResidentSpec | undefined {
  return STARTER_RESIDENTS.find((resident) => resident.id === id);
}

export function getResidentsForDistrict(districtId: string): MiiResidentSpec[] {
  return STARTER_RESIDENTS.filter((resident) => resident.districtId === districtId);
}

export function validateStarterResidents(): string[] {
  const errors: string[] = [];
  for (const resident of STARTER_RESIDENTS) {
    const result = validateMiiResidentSpec(resident);
    if (!result.valid) {
      errors.push(`${resident.id}: ${result.errors.join(" ")}`);
    }
  }
  return errors;
}

export function evaluateQuestAnswer(answer: string, quest: QuestHook): boolean {
  const normalizedAnswer = normalizeAnswer(answer);
  if (!normalizedAnswer) return false;

  const expected = normalizeAnswer(quest.expectedOutput);
  if (expected.length <= 16 && normalizedAnswer.includes(expected)) return true;

  const keywords = (quest.acceptanceKeywords ?? []).map(normalizeAnswer);
  if (keywords.length === 0) return normalizedAnswer.includes(expected);

  const hits = keywords.filter((keyword) => normalizedAnswer.includes(keyword));
  return hits.length >= Math.min(2, keywords.length);
}

function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
