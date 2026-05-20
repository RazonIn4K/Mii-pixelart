export type QuestTrigger =
  | "residentChat"
  | "districtBridge"
  | "relationshipConflict"
  | "studySession";

export type QuestArtifactType =
  | "truthTable"
  | "circuit"
  | "assembly"
  | "vmTrace"
  | "program"
  | "stateTrace";

export type MiiPlatform = "SWITCH" | "THREE_DS";
export type MiiGender = "MALE" | "FEMALE" | "NONBINARY";
export type MiiMakeup = "NONE" | "PARTIAL" | "FULL";

export interface QuestHook {
  id: string;
  title: string;
  trigger: QuestTrigger;
  input: string;
  artifactType: QuestArtifactType;
  bridgeQuestion: string;
  expectedOutput: string;
  correctionHint: string;
  retryVariant: string;
  acceptanceKeywords?: string[];
}

export interface MiiResidentVisualFeatures {
  hair?: Record<string, unknown>;
  head?: Record<string, unknown>;
  eyebrows?: Record<string, unknown>;
  eyes?: Record<string, unknown>;
  nose?: Record<string, unknown>;
  lips?: Record<string, unknown>;
  glasses?: Record<string, unknown>;
  other?: Record<string, unknown>;
  height?: number;
  weight?: number;
}

export interface MiiResidentSpec {
  id: string;
  name: string;
  district: string;
  districtId: string;
  layerRole: string;
  tags: string[];
  sourceCredits: string[];
  platform: MiiPlatform;
  gender: MiiGender;
  makeup: MiiMakeup;
  bridgeBelow: string;
  bridgeAbove: string;
  questHook: QuestHook;
  visualFeatures: MiiResidentVisualFeatures;
  voice?: Record<string, unknown>;
  personality?: Record<string, unknown>;
  quirks?: string[];
  giftPlan?: string[];
  homePlan?: string;
  relationshipPlan?: string;
  catchphrase: string;
  recallPrompt: string;
  pixelArtNotes: string;
}

export interface ResidentValidationResult {
  errors: string[];
  spec: MiiResidentSpec | null;
  valid: boolean;
}

export interface IslandDistrict {
  id: string;
  name: string;
  layerRole: string;
  purpose: string;
  residents: string[];
  unlocksAfter?: string[];
}

export interface IslandGrowthStage {
  id: string;
  title: string;
  unlocks: string[];
  studyGoal: string;
}

export interface IslandFacilityPlan {
  id: string;
  name: string;
  purpose: string;
  unlocksAfter: string;
}

export interface ResidentCreationStep {
  id: string;
  title: string;
  output: string;
}

export interface CrossLayerInteraction {
  id: string;
  title: string;
  fromDistrict: string;
  toDistrict: string;
  prerequisiteQuestIds: string[];
  quest: QuestHook;
}

const QUEST_TRIGGERS: QuestTrigger[] = [
  "residentChat",
  "districtBridge",
  "relationshipConflict",
  "studySession",
];

const ARTIFACT_TYPES: QuestArtifactType[] = [
  "truthTable",
  "circuit",
  "assembly",
  "vmTrace",
  "program",
  "stateTrace",
];

const PLATFORMS: MiiPlatform[] = ["SWITCH", "THREE_DS"];
const GENDERS: MiiGender[] = ["MALE", "FEMALE", "NONBINARY"];
const MAKEUP_TIERS: MiiMakeup[] = ["NONE", "PARTIAL", "FULL"];

const COMMON_SOURCE_CREDITS = [
  "Fan-made educational resident spec for Tomodachi Life: Living the Dream.",
  "Unaffiliated with Nintendo, Tomodachi Life, and the cited authors/publishers.",
];

export const DISTRICTS: IslandDistrict[] = [
  {
    id: "silicon-beach",
    name: "Silicon Beach",
    layerRole: "Physical invention layer",
    purpose:
      "Ground the island in physical devices, chips, and the fact that computation starts as engineered matter.",
    residents: ["Jack Kilby"],
  },
  {
    id: "boolean-boardwalk",
    name: "Boolean Boardwalk",
    layerRole: "Logic and truth-table layer",
    purpose:
      "Turn physical switches and relays into Boolean functions, bits, and repeatable logic.",
    residents: ["George Boole", "Claude Shannon", "Charles Petzold"],
    unlocksAfter: ["silicon-beach"],
  },
  {
    id: "circuit-plaza",
    name: "Circuit Plaza",
    layerRole: "NAND, combinational, and sequential circuit layer",
    purpose:
      "Build chips, ALUs, memory, and flip-flops from the logic layer below.",
    residents: ["NAND Mascot", "Noam Nisan", "Shimon Schocken"],
    unlocksAfter: ["boolean-boardwalk"],
  },
  {
    id: "architecture-atrium",
    name: "Architecture Atrium",
    layerRole: "CPU, stored-program, and machine model layer",
    purpose:
      "Connect clocked hardware state to programmable machines, instruction execution, and stored programs.",
    residents: ["Alan Turing", "John von Neumann"],
    unlocksAfter: ["circuit-plaza"],
  },
  {
    id: "assembly-avenue",
    name: "Assembly Avenue",
    layerRole: "Machine language and assembler layer",
    purpose:
      "Translate human-readable symbols into exact machine instructions without pretending the hardware disappeared.",
    residents: ["Dennis Ritchie"],
    unlocksAfter: ["architecture-atrium"],
  },
  {
    id: "vm-village",
    name: "VM Village",
    layerRole: "Stack VM and hardware-independence layer",
    purpose:
      "Use stack commands, memory segments, and function calls as a portable interface above assembly.",
    residents: ["StackPointer Mascot"],
    unlocksAfter: ["assembly-avenue"],
  },
  {
    id: "compiler-grove",
    name: "Compiler Grove",
    layerRole: "Language, syntax, parsing, and compilation layer",
    purpose:
      "Turn high-level Jack-like source into VM commands while preserving behavior across layers.",
    residents: ["John Backus"],
    unlocksAfter: ["vm-village"],
  },
  {
    id: "oz-oasis",
    name: "Oz Oasis",
    layerRole: "Computation model and concurrency layer",
    purpose:
      "Compare declarative, stateful, concurrent, and message-passing models as choices with reasoning costs.",
    residents: ["Peter Van Roy", "Seif Haridi"],
    unlocksAfter: ["compiler-grove", "architecture-atrium"],
  },
  {
    id: "perlis-peak",
    name: "Perlis Peak",
    layerRole: "Programming philosophy and language-thought layer",
    purpose:
      "Use epigrams and debates to ask what abstractions do to the way programmers think.",
    residents: ["Alan J. Perlis"],
    unlocksAfter: ["oz-oasis"],
  },
];

export const STARTER_RESIDENTS: MiiResidentSpec[] = [
  {
    id: "jack-kilby-physical-chip",
    name: "Jack Kilby",
    district: "Silicon Beach",
    districtId: "silicon-beach",
    layerRole: "Physical invention resident for integrated circuits",
    tags: ["physical-layer", "integrated-circuit", "hardware"],
    sourceCredits: COMMON_SOURCE_CREDITS,
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow:
      "Physical materials, wires, and components must be engineered before logic can become reliable.",
    bridgeAbove:
      "Integrated circuits make Boolean and circuit abstractions small enough to compose.",
    questHook: {
      id: "kilby-chip-composition",
      title: "Many Parts, One Chip",
      trigger: "residentChat",
      input:
        "A circuit needs repeated wires, resistors, and switching parts to act like one reliable unit.",
      artifactType: "circuit",
      bridgeQuestion:
        "What does integration make easier for the next abstraction layer?",
      expectedOutput:
        "Integration packages many physical parts so higher layers can reuse a stable circuit block.",
      correctionHint:
        "At this layer, abstraction is built by making physical complexity reliable and repeatable.",
      retryVariant:
        "If one circuit block can be reused ten times, what problem did the physical layer reduce?",
      acceptanceKeywords: ["physical", "reliable", "reuse"],
    },
    visualFeatures: {
      other: { facePaint: "Tiny chip-trace cheek marks" },
      height: 54,
      weight: 46,
    },
    personality: { note: "Builder mindset, quiet and practical" },
    quirks: ["Talks about tiny parts becoming reusable blocks"],
    giftPlan: ["Circuit shirt", "Workbench interior"],
    homePlan: "Beach workshop with chip-trace floor tiles.",
    relationshipPlan:
      "Unlocks Boole and Shannon logic conversations after the physical-block quest.",
    catchphrase: "Make it real.",
    recallPrompt:
      "Why does physical integration matter before Boolean logic becomes scalable?",
    pixelArtNotes: "Use a chip-trace motif; keep the face readable at 64x64.",
  },
  {
    id: "george-boole-truth-table",
    name: "George Boole",
    district: "Boolean Boardwalk",
    districtId: "boolean-boardwalk",
    layerRole: "Boolean algebra resident",
    tags: ["boolean", "truth-table", "logic"],
    sourceCredits: COMMON_SOURCE_CREDITS,
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow: "Physical switches become abstract true/false values.",
    bridgeAbove: "Boolean functions become gates and composable circuits.",
    questHook: {
      id: "boole-and-or-evaluation",
      title: "Boardwalk Truth Table",
      trigger: "residentChat",
      input: "A = 1, B = 0, C = 1. Evaluate (A AND B) OR C.",
      artifactType: "truthTable",
      bridgeQuestion: "What is the output?",
      expectedOutput: "(1 AND 0) OR 1 becomes 0 OR 1, so the output is 1.",
      correctionHint:
        "Evaluate the inner AND first, then feed that result into OR.",
      retryVariant: "A = 1, B = 1, C = 0. Evaluate (A AND B) OR C.",
      acceptanceKeywords: ["1"],
    },
    visualFeatures: {
      eyebrows: { note: "Calm mathematical expression" },
      other: { facePaint: "Small 1/0 cheek marks" },
      height: 55,
      weight: 47,
    },
    personality: { note: "Formal and patient" },
    quirks: ["Asks every islander to define their variables"],
    giftPlan: ["Logic notebook", "Truth-table wallpaper"],
    homePlan: "Boardwalk room with 1/0 tiles and simple gate posters.",
    relationshipPlan:
      "Pairs with Shannon once truth tables can be mapped to switches.",
    catchphrase: "Name the values.",
    recallPrompt: "How does a truth table define a logic function?",
    pixelArtNotes: "Use high-contrast binary marks; avoid tiny equations.",
  },
  {
    id: "claude-shannon-switching-logic",
    name: "Claude Shannon",
    district: "Boolean Boardwalk",
    districtId: "boolean-boardwalk",
    layerRole: "Switching logic bridge resident",
    tags: ["switching", "bits", "logic"],
    sourceCredits: COMMON_SOURCE_CREDITS,
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow: "Electrical switch positions can represent Boolean values.",
    bridgeAbove:
      "Boolean formulas can be implemented as physical switching circuits.",
    questHook: {
      id: "shannon-switch-to-bit",
      title: "Switch Becomes Bit",
      trigger: "districtBridge",
      input: "Two switches in series are closed/open: 1 and 0.",
      artifactType: "circuit",
      bridgeQuestion:
        "Which Boolean operation does this model, and what is the output?",
      expectedOutput:
        "Series switches model AND. Because one switch is open, the output is 0.",
      correctionHint:
        "Series requires every path segment to conduct, which matches AND.",
      retryVariant:
        "Two parallel switches are closed/open: 1 and 0. What operation and output?",
      acceptanceKeywords: ["AND", "0"],
    },
    visualFeatures: {
      other: { facePaint: "Split switch and bit motif" },
      height: 57,
      weight: 48,
    },
    personality: { note: "Translator between engineering and symbols" },
    quirks: ["Turns every light switch into a logic demonstration"],
    giftPlan: ["Switch lamp", "Binary rug"],
    homePlan: "Boardwalk lab with lamp circuits and bit labels.",
    relationshipPlan: "Connects Boole to Petzold and Circuit Plaza.",
    catchphrase: "Switch the symbol.",
    recallPrompt: "Why can switching circuits implement Boolean algebra?",
    pixelArtNotes: "Use a clear on/off contrast and one switch-shaped accent.",
  },
  {
    id: "charles-petzold-code-chronicler",
    name: "Charles Petzold",
    district: "Boolean Boardwalk",
    districtId: "boolean-boardwalk",
    layerRole: "Concrete-to-abstract code chronicler",
    tags: ["code", "relays", "gates", "explanation"],
    sourceCredits: [
      ...COMMON_SOURCE_CREDITS,
      "Inspired by Code by Charles Petzold.",
    ],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow: "Relays, wires, and signals are concrete mechanisms.",
    bridgeAbove:
      "Gate symbols and diagrams hide physical details while preserving behavior.",
    questHook: {
      id: "petzold-relay-to-gate",
      title: "Relay Box",
      trigger: "residentChat",
      input:
        "A relay circuit behaves exactly like an AND gate for every input row.",
      artifactType: "truthTable",
      bridgeQuestion:
        "When can the island use the gate symbol instead of the relay drawing?",
      expectedOutput:
        "When the relay implementation matches the interface/truth table for every input row.",
      correctionHint:
        "The symbol is safe only because the physical behavior has already been checked.",
      retryVariant:
        "If a relay NOT circuit matches the NOT truth table, what can the next layer ignore?",
      acceptanceKeywords: ["truth table", "interface", "behavior"],
    },
    visualFeatures: {
      glasses: { note: "Readable rectangular glasses" },
      other: { facePaint: "Small relay-to-gate arrow accent" },
      height: 56,
      weight: 50,
    },
    personality: { note: "Storyteller who explains from first principles" },
    quirks: ["Starts explanations with a simple physical example"],
    giftPlan: ["Flashlight", "Relay poster"],
    homePlan: "Cozy code-study room with diagrams on the wall.",
    relationshipPlan:
      "Mentors the bridge from Silicon Beach to Boolean Boardwalk.",
    catchphrase: "Show the wiring.",
    recallPrompt:
      "How does a physical relay circuit become a gate abstraction?",
    pixelArtNotes:
      "Use glasses and a tiny wire/gate accent; keep text out of the face paint.",
  },
  {
    id: "nand-mascot-universal-gate",
    name: "NAND Mascot",
    district: "Circuit Plaza",
    districtId: "circuit-plaza",
    layerRole: "Universal gate mascot",
    tags: ["nand", "circuit", "universal-gate"],
    sourceCredits: [
      ...COMMON_SOURCE_CREDITS,
      "Inspired by The Elements of Computing Systems.",
    ],
    platform: "SWITCH",
    gender: "NONBINARY",
    makeup: "FULL",
    bridgeBelow: "Boolean logic supplies the truth-table behavior.",
    bridgeAbove: "Universal NAND composition builds all higher chips.",
    questHook: {
      id: "nand-not-from-nand",
      title: "Inverted Output",
      trigger: "studySession",
      input: "Use one NAND gate with both inputs tied to A.",
      artifactType: "circuit",
      bridgeQuestion: "What function does it compute?",
      expectedOutput:
        "NAND(A, A) computes NOT A because A AND A is A, then NAND inverts it.",
      correctionHint:
        "NAND means NOT AND. Tie both inputs together, then invert the same value.",
      retryVariant: "If A = 0, what is NAND(A, A)?",
      acceptanceKeywords: ["NOT", "A"],
    },
    visualFeatures: {
      other: {
        facePaint: "Two input marks merging into an inverted output dot",
      },
      height: 48,
      weight: 42,
    },
    personality: { note: "Playful but precise mascot" },
    quirks: ["Insists every chip can start from one primitive"],
    giftPlan: ["Gate hoodie", "Circuit Plaza flag"],
    homePlan: "Small mascot room with two-input wall art.",
    relationshipPlan:
      "Unlocks ALU and memory quests after basic NAND composition.",
    catchphrase: "Invert the merge.",
    recallPrompt: "Why is NAND enough to build other gates?",
    pixelArtNotes:
      "Full makeup should visually show two inputs, one merge, and one inverted output.",
  },
  {
    id: "alan-turing-state-machine",
    name: "Alan Turing",
    district: "Architecture Atrium",
    districtId: "architecture-atrium",
    layerRole: "State-machine and computability resident",
    tags: ["state", "turing-machine", "computability"],
    sourceCredits: COMMON_SOURCE_CREDITS,
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow: "Clocked hardware can preserve symbols and state.",
    bridgeAbove: "Machine steps become a model for programmable computation.",
    questHook: {
      id: "turing-state-step",
      title: "State plus Symbol",
      trigger: "residentChat",
      input:
        "Machine is in state S0 reading symbol 1. Rule: S0,1 -> write 0, move R, enter S1.",
      artifactType: "stateTrace",
      bridgeQuestion: "What changes after one machine step?",
      expectedOutput:
        "The symbol becomes 0, the head moves right, and the state becomes S1.",
      correctionHint:
        "Track all three things: written symbol, head position, and next state.",
      retryVariant:
        "S1,0 -> write 1, move L, enter S0. What changes after that step?",
      acceptanceKeywords: ["0", "right", "S1"],
    },
    visualFeatures: {
      eyebrows: { note: "Strong thoughtful brow" },
      other: { facePaint: "Small tape/grid accent" },
      height: 56,
      weight: 48,
    },
    personality: { note: "Riddle-driven and precise" },
    quirks: ["Gets fascinated by tiny rule changes"],
    giftPlan: ["Tape scarf", "State-machine wallpaper"],
    homePlan: "Architecture room with a tape path and state cards.",
    relationshipPlan:
      "Debates software state only after lower hardware-state quests are understood.",
    catchphrase: "Follow the state.",
    recallPrompt: "What must a machine remember to decide its next action?",
    pixelArtNotes:
      "Use a tape/grid accent and strong brow silhouette; avoid tiny text.",
  },
  {
    id: "john-von-neumann-stored-program",
    name: "John von Neumann",
    district: "Architecture Atrium",
    districtId: "architecture-atrium",
    layerRole: "Stored-program architecture resident",
    tags: ["stored-program", "memory", "cpu"],
    sourceCredits: COMMON_SOURCE_CREDITS,
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow:
      "Registers, memory, and ALU behavior make instruction execution possible.",
    bridgeAbove:
      "Programs can live in memory alongside data and be executed step by step.",
    questHook: {
      id: "von-neumann-program-in-memory",
      title: "Stored Program Room",
      trigger: "districtBridge",
      input:
        "Memory address 100 holds an instruction; memory address 101 holds data.",
      artifactType: "stateTrace",
      bridgeQuestion: "What is the key architectural idea?",
      expectedOutput:
        "Instructions and data are both stored in memory, and the CPU fetches instructions to execute them.",
      correctionHint:
        "Do not treat the program as external wiring. It is represented in memory.",
      retryVariant:
        "If the program counter points at 100, what should the CPU fetch first?",
      acceptanceKeywords: ["instructions", "data", "memory"],
    },
    visualFeatures: {
      other: { facePaint: "Small memory-cell grid" },
      height: 58,
      weight: 50,
    },
    personality: { note: "Architectural and systematic" },
    quirks: ["Organizes rooms by address"],
    giftPlan: ["Memory map poster", "CPU tower interior"],
    homePlan: "Atrium apartment with address labels and bus-line decor.",
    relationshipPlan: "Bridges Turing's machine model to assembly execution.",
    catchphrase: "Fetch the next one.",
    recallPrompt: "What changes when programs are stored in memory?",
    pixelArtNotes: "Use a memory-grid motif, not tiny address numbers.",
  },
  {
    id: "dennis-ritchie-systems-bridge",
    name: "Dennis Ritchie",
    district: "Assembly Avenue",
    districtId: "assembly-avenue",
    layerRole: "Systems language bridge resident",
    tags: ["systems", "c", "unix", "assembly"],
    sourceCredits: COMMON_SOURCE_CREDITS,
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow:
      "Assembly exposes opcodes, registers, memory, and machine-specific operations.",
    bridgeAbove:
      "Systems languages express portable intent while still respecting machine costs.",
    questHook: {
      id: "ritchie-symbol-to-machine",
      title: "Symbols to System",
      trigger: "residentChat",
      input:
        "A symbolic instruction names a register and operation instead of writing raw numeric opcodes.",
      artifactType: "assembly",
      bridgeQuestion: "What does the assembler preserve?",
      expectedOutput:
        "It preserves the exact machine operation while replacing raw numbers with human-readable symbols.",
      correctionHint:
        "Assembly is still machine language; it is easier to write because the names are symbolic.",
      retryVariant:
        "If R0 is a symbol for a register, what does the assembler eventually emit?",
      acceptanceKeywords: ["machine", "symbols", "operation"],
    },
    visualFeatures: {
      other: { facePaint: "Subtle terminal cursor accent" },
      height: 57,
      weight: 49,
    },
    personality: { note: "Quiet systems pragmatist" },
    quirks: ["Prefers small tools that compose"],
    giftPlan: ["Terminal shirt", "Unix room divider"],
    homePlan: "Assembly Avenue workshop with register labels.",
    relationshipPlan: "Connects CPU execution to VM and compiler discussions.",
    catchphrase: "Keep it close.",
    recallPrompt:
      "How does assembly make machine language more usable without hiding the machine?",
    pixelArtNotes: "Use a terminal-cursor motif with restrained contrast.",
  },
  {
    id: "john-backus-compiler-grove",
    name: "John Backus",
    district: "Compiler Grove",
    districtId: "compiler-grove",
    layerRole: "Language and compiler resident",
    tags: ["compiler", "language", "syntax"],
    sourceCredits: COMMON_SOURCE_CREDITS,
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow: "VM commands and assembly give compilers a target behavior.",
    bridgeAbove:
      "Language syntax gives people a higher-level way to express programs.",
    questHook: {
      id: "backus-source-to-vm",
      title: "Compiler Grove Translation",
      trigger: "studySession",
      input: "let x = x + 1;",
      artifactType: "program",
      bridgeQuestion: "What VM behavior should this source preserve?",
      expectedOutput:
        "It should read x, push constant 1, add, and store the result back into x.",
      correctionHint:
        "Compilation changes representation, not the intended behavior.",
      retryVariant: "let y = y - 1; What stack operations should appear?",
      acceptanceKeywords: ["read", "add", "store"],
    },
    visualFeatures: {
      other: { facePaint: "Syntax-tree branch accent" },
      height: 56,
      weight: 48,
    },
    personality: { note: "Language designer with structured habits" },
    quirks: ["Turns sentences into grammar rules"],
    giftPlan: ["Parser notebook", "Syntax-tree wallpaper"],
    homePlan: "Compiler Grove cabin with branch-like grammar diagrams.",
    relationshipPlan:
      "Unlocks Van Roy model debates after source-to-VM translation is understood.",
    catchphrase: "Preserve behavior.",
    recallPrompt:
      "What does a compiler preserve while changing representations?",
    pixelArtNotes: "Use a branch/tree motif around the brow or cheek.",
  },
  {
    id: "peter-van-roy-model-architect",
    name: "Peter Van Roy",
    district: "Oz Oasis",
    districtId: "oz-oasis",
    layerRole: "Computation model architect",
    tags: ["declarative", "state", "concurrency", "models"],
    sourceCredits: [
      ...COMMON_SOURCE_CREDITS,
      "Inspired by Concepts, Techniques, and Models of Computer Programming.",
    ],
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow: "Programs can be translated into smaller semantic kernels.",
    bridgeAbove:
      "Choosing a computation model changes how easy programs are to reason about.",
    questHook: {
      id: "van-roy-state-cost",
      title: "Model Before Mutation",
      trigger: "relationshipConflict",
      input: "X = 1, then X := 2 in a shared-state model.",
      artifactType: "stateTrace",
      bridgeQuestion:
        "Why does this make reasoning harder than a declarative binding?",
      expectedOutput:
        "The meaning now depends on time, order, and who can observe or alias the mutable cell.",
      correctionHint:
        "In a declarative model a name keeps one meaning; explicit state adds observable time.",
      retryVariant: "If two threads can write X, what new risk appears?",
      acceptanceKeywords: ["time", "order", "mutable"],
    },
    visualFeatures: {
      other: { facePaint: "Minimal model-diagram accent" },
      height: 55,
      weight: 47,
    },
    personality: { note: "Calm, precise, model-first" },
    quirks: ["Asks for the simplest model that works"],
    giftPlan: ["Model diagram", "Oz Oasis fountain"],
    homePlan: "Quiet oasis room with clean dataflow diagrams.",
    relationshipPlan:
      "Debates Turing only after the state bridge quest is complete.",
    catchphrase: "Choose the model.",
    recallPrompt: "Why does explicit mutable state add reasoning cost?",
    pixelArtNotes: "Use calm minimal marks and one clean diagram accent.",
  },
  {
    id: "alan-perlis-epigram-peak",
    name: "Alan J. Perlis",
    district: "Perlis Peak",
    districtId: "perlis-peak",
    layerRole: "Programming philosophy resident",
    tags: ["languages", "philosophy", "epigrams"],
    sourceCredits: COMMON_SOURCE_CREDITS,
    platform: "SWITCH",
    gender: "MALE",
    makeup: "PARTIAL",
    bridgeBelow:
      "Computation models and languages shape what programmers can express.",
    bridgeAbove:
      "Programming language choices reshape how people think about problems.",
    questHook: {
      id: "perlis-language-thinking",
      title: "Peak Epigram",
      trigger: "residentChat",
      input:
        "Two languages can compute the same result but make the programmer notice different things.",
      artifactType: "program",
      bridgeQuestion: "What is the philosophical lesson for abstraction?",
      expectedOutput:
        "Abstractions preserve behavior, but language design also changes how programmers think and reason.",
      correctionHint:
        "Do not ask only what the language can compute. Ask what habits it encourages.",
      retryVariant:
        "If two notations are equivalent, why might one still be better for learning?",
      acceptanceKeywords: ["behavior", "think", "reason"],
    },
    visualFeatures: {
      eyebrows: { note: "Sharp expressive eyebrows" },
      other: { facePaint: "Quote-mark cheek motif" },
      height: 55,
      weight: 46,
    },
    personality: { note: "Witty and provocative" },
    quirks: ["Turns every bug into a one-line lesson"],
    giftPlan: ["Quote plaque", "Peak lookout interior"],
    homePlan: "Mountain room with quote plaques and language posters.",
    relationshipPlan:
      "Hosts summit debates after lower model quests are cleared.",
    catchphrase: "Think differently.",
    recallPrompt: "How can a language change the way a programmer thinks?",
    pixelArtNotes:
      "Use quote-mark motif and strong eyebrows; avoid literal text.",
  },
];

export const CROSS_LAYER_INTERACTIONS: CrossLayerInteraction[] = [
  {
    id: "state-changes-meaning",
    title: "State Changes Meaning",
    fromDistrict: "circuit-plaza",
    toDistrict: "oz-oasis",
    prerequisiteQuestIds: ["nand-not-from-nand", "turing-state-step"],
    quest: {
      id: "state-changes-meaning-bridge",
      title: "Flip-Flop vs Mutable Variable",
      trigger: "districtBridge",
      input:
        "Circuit Plaza: D = 1 at clock tick t, register stores 1 at t + 1. Oz Oasis: X = 1, then X := 2.",
      artifactType: "stateTrace",
      bridgeQuestion:
        "Why is state necessary and useful in Circuit Plaza, but dangerous or costly in Oz Oasis?",
      expectedOutput:
        "Hardware state is hard-won memory: feedback plus clocking preserves bits across time. Architectural state makes registers, RAM, and CPUs possible. Software mutable state introduces observable time, ordering, aliasing, and possible nondeterminism. Declarative models avoid explicit state when possible because referential transparency makes reasoning easier.",
      correctionHint:
        "At the hardware layer, state solves the problem of memory. At the software-model layer, state creates the problem of reasoning over time.",
      retryVariant:
        "Compare a clocked register storing 0 with a shared variable that two threads can update.",
      acceptanceKeywords: [
        "Hardware state",
        "memory",
        "software mutable state",
        "time",
      ],
    },
  },
  {
    id: "translation-pipeline",
    title: "Translation Pipeline",
    fromDistrict: "compiler-grove",
    toDistrict: "architecture-atrium",
    prerequisiteQuestIds: ["backus-source-to-vm", "ritchie-symbol-to-machine"],
    quest: {
      id: "translation-pipeline-traversal",
      title: "Source to CPU",
      trigger: "studySession",
      input: "Input: x = x + 1. Compiler Grove: let x = x + 1;",
      artifactType: "vmTrace",
      bridgeQuestion:
        "How does the same behavior move through source, VM, assembly, and CPU execution?",
      expectedOutput:
        "The source statement becomes VM commands like push local 0, push constant 1, add, and pop local 0. The VM translator lowers stack operations into assembly. The CPU executes instructions through registers and the ALU. Each layer changes representation while preserving behavior.",
      correctionHint:
        "Follow the same signal through every layer. Do not collapse all software into one block.",
      retryVariant:
        "Trace y = y - 1 through source, VM stack commands, assembly, and CPU execution.",
      acceptanceKeywords: ["VM commands", "assembly", "CPU", "behavior"],
    },
  },
];

export const ISLAND_GROWTH_STAGES: IslandGrowthStage[] = [
  {
    id: "welcome-edition",
    title: "Welcome Edition",
    unlocks: ["silicon-beach"],
    studyGoal:
      "Create the first physical-layer resident and explain why reliable hardware matters.",
  },
  {
    id: "first-neighborhood",
    title: "First Neighborhood",
    unlocks: ["boolean-boardwalk"],
    studyGoal:
      "Translate physical switches into Boolean values and truth tables.",
  },
  {
    id: "machine-town",
    title: "Machine Town",
    unlocks: ["circuit-plaza", "architecture-atrium"],
    studyGoal:
      "Build gates, memory, state machines, and stored-program execution.",
  },
  {
    id: "translation-district",
    title: "Translation District",
    unlocks: ["assembly-avenue", "vm-village", "compiler-grove"],
    studyGoal:
      "Trace the same behavior through source, VM, assembly, and CPU execution.",
  },
  {
    id: "model-oasis",
    title: "Model Oasis",
    unlocks: ["oz-oasis", "perlis-peak"],
    studyGoal:
      "Compare computation models, state, concurrency, and programming philosophy.",
  },
];

export const ISLAND_FACILITY_PLANS: IslandFacilityPlan[] = [
  {
    id: "palette-house",
    name: "Palette House",
    purpose:
      "Store face-paint guides, palette sheets, and repaint notes for each resident.",
    unlocksAfter: "welcome-edition",
  },
  {
    id: "abstraction-elevator",
    name: "Abstraction Elevator",
    purpose:
      "Move from one district to the next only after clearing lower-layer recall quests.",
    unlocksAfter: "first-neighborhood",
  },
  {
    id: "logic-festival",
    name: "Logic Festival",
    purpose: "Run truth-table and gate mini sessions.",
    unlocksAfter: "first-neighborhood",
  },
  {
    id: "translation-station",
    name: "Translation Station",
    purpose: "Practice source-to-VM-to-assembly traversal quests.",
    unlocksAfter: "translation-district",
  },
  {
    id: "state-court",
    name: "State Court",
    purpose:
      "Host debates comparing flip-flops, registers, variables, and shared state.",
    unlocksAfter: "machine-town",
  },
  {
    id: "perlis-summit",
    name: "Perlis Summit",
    purpose: "Weekly cross-layer recall challenge with all unlocked residents.",
    unlocksAfter: "model-oasis",
  },
];

export const RESIDENT_CREATION_STEPS: ResidentCreationStep[] = [
  {
    id: "choose-layer",
    title: "Choose Layer",
    output: "Select district, layerRole, bridgeBelow, and bridgeAbove.",
  },
  {
    id: "write-quest",
    title: "Write Quest Hook",
    output:
      "Create trigger, input, artifactType, expectedOutput, correctionHint, and retryVariant.",
  },
  {
    id: "design-mii",
    title: "Design Mii Features",
    output:
      "Specify hair, face, eyes, accessories, voice, personality, and growth notes.",
  },
  {
    id: "encode-pixel-art",
    title: "Encode Pixel Art",
    output:
      "Make the face-paint motif represent the concept instead of only decorating.",
  },
  {
    id: "add-study-loop",
    title: "Add Study Loop",
    output:
      "Define prediction, correction, retry, and dependency gate behavior.",
  },
  {
    id: "export-pack",
    title: "Export Resident Pack",
    output:
      "Include JSON, HTML feature sheet, face-paint guide, palette sheet, credits, and fan-made note.",
  },
];

export function validateStarterResidents(): string[] {
  const errors: string[] = [];
  const districtIds = new Set(DISTRICTS.map((district) => district.id));
  const residentIds = new Set<string>();

  for (const resident of STARTER_RESIDENTS) {
    const result = validateMiiResidentSpec(resident);
    errors.push(...result.errors.map((error) => `${resident.id}: ${error}`));

    if (!districtIds.has(resident.districtId)) {
      errors.push(
        `${resident.id}: districtId does not match a known district.`,
      );
    }

    if (residentIds.has(resident.id)) {
      errors.push(`${resident.id}: duplicate resident id.`);
    }
    residentIds.add(resident.id);
  }

  return errors;
}

export function evaluateQuestAnswer(answer: string, quest: QuestHook): boolean {
  const normalizedAnswer = answer.toLowerCase();
  const keywords = quest.acceptanceKeywords?.length
    ? quest.acceptanceKeywords
    : quest.expectedOutput
        .split(/\W+/)
        .filter((word) => word.length >= 5)
        .slice(0, 4);

  return keywords.every((keyword) =>
    normalizedAnswer.includes(keyword.toLowerCase()),
  );
}

export function validateMiiResidentSpec(
  value: unknown,
): ResidentValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      errors: ["Resident spec must be a JSON object."],
      spec: null,
      valid: false,
    };
  }

  requireString(value, "id", errors);
  requireString(value, "name", errors);
  requireString(value, "district", errors);
  requireString(value, "districtId", errors);
  requireString(value, "layerRole", errors);
  requireStringArray(value, "tags", errors);
  requireStringArray(value, "sourceCredits", errors);
  requireEnum(value, "platform", PLATFORMS, errors);
  requireEnum(value, "gender", GENDERS, errors);
  requireEnum(value, "makeup", MAKEUP_TIERS, errors);
  requireString(value, "bridgeBelow", errors);
  requireString(value, "bridgeAbove", errors);
  requireString(value, "catchphrase", errors);
  requireString(value, "recallPrompt", errors);
  requireString(value, "pixelArtNotes", errors);

  if (!isRecord(value.visualFeatures)) {
    errors.push("visualFeatures must be an object.");
  } else {
    for (const numericKey of ["height", "weight"]) {
      const numericValue = value.visualFeatures[numericKey];
      if (
        numericValue !== undefined &&
        (typeof numericValue !== "number" || !Number.isFinite(numericValue))
      ) {
        errors.push(`visualFeatures.${numericKey} must be a finite number.`);
      }
    }
  }

  validateQuestHook(value.questHook, errors);

  if (value.voice !== undefined && !isRecord(value.voice)) {
    errors.push("voice must be an object when provided.");
  }
  if (value.personality !== undefined && !isRecord(value.personality)) {
    errors.push("personality must be an object when provided.");
  }
  if (value.quirks !== undefined && !isStringArray(value.quirks)) {
    errors.push("quirks must be an array of strings when provided.");
  }
  if (value.giftPlan !== undefined && !isStringArray(value.giftPlan)) {
    errors.push("giftPlan must be an array of strings when provided.");
  }
  if (value.homePlan !== undefined && typeof value.homePlan !== "string") {
    errors.push("homePlan must be a string when provided.");
  }
  if (
    value.relationshipPlan !== undefined &&
    typeof value.relationshipPlan !== "string"
  ) {
    errors.push("relationshipPlan must be a string when provided.");
  }

  return {
    errors,
    spec: errors.length === 0 ? (value as unknown as MiiResidentSpec) : null,
    valid: errors.length === 0,
  };
}

export function buildResidentDesignerPrompt(): string {
  return [
    "You are an expert Tomodachi Life: Living the Dream Mii feature designer, CS abstraction tutor, and repaintable pixel-art director.",
    "Create one strict JSON object matching the MiiResidentSpec interface.",
    "The resident must belong to the Layers of Abstraction island and must include bridgeBelow, bridgeAbove, and a structured questHook.",
    "Include quirks, giftPlan, homePlan, and relationshipPlan when they help make the resident feel like a Living the Dream islander.",
    "The quest must use the loop: present input, ask prediction, correct wrong answers using the layer below, then give a retry variant.",
    "Pixel art must encode the concept, not just decorate the face.",
    "Use sourceCredits for book/site references and include fan-made/unaffiliated wording when relevant.",
    "Do not return markdown. Return JSON only.",
  ].join(" ");
}

function validateQuestHook(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("questHook must be an object.");
    return;
  }

  requireString(value, "id", errors, "questHook");
  requireString(value, "title", errors, "questHook");
  requireEnum(value, "trigger", QUEST_TRIGGERS, errors, "questHook");
  requireString(value, "input", errors, "questHook");
  requireEnum(value, "artifactType", ARTIFACT_TYPES, errors, "questHook");
  requireString(value, "bridgeQuestion", errors, "questHook");
  requireString(value, "expectedOutput", errors, "questHook");
  requireString(value, "correctionHint", errors, "questHook");
  requireString(value, "retryVariant", errors, "questHook");
  if (
    value.acceptanceKeywords !== undefined &&
    !isStringArray(value.acceptanceKeywords)
  ) {
    errors.push("questHook.acceptanceKeywords must be an array of strings.");
  }
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
  prefix?: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(
      `${prefix ? `${prefix}.` : ""}${key} must be a non-empty string.`,
    );
  }
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
): void {
  if (!isStringArray(record[key])) {
    errors.push(`${key} must be an array of strings.`);
  }
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: T[],
  errors: string[],
  prefix?: string,
): void {
  if (!allowed.includes(record[key] as T)) {
    errors.push(
      `${prefix ? `${prefix}.` : ""}${key} must be one of ${allowed.join(", ")}.`,
    );
  }
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
