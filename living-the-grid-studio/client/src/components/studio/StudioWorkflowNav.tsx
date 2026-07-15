import {
  Download,
  ImageUp,
  ListChecks,
  Palette,
  PencilRuler,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export type StudioPanel =
  "import" | "create" | "palette" | "optimize" | "ai" | "copy" | "export";

const WORKFLOW_GROUPS = [
  {
    label: "Start",
    tools: [{ icon: ImageUp, label: "Import", value: "import" }],
  },
  {
    label: "Edit",
    tools: [
      { icon: PencilRuler, label: "Create", value: "create" },
      { icon: Palette, label: "Palette", value: "palette" },
    ],
  },
  {
    label: "Improve",
    tools: [
      { icon: WandSparkles, label: "Optimize", value: "optimize" },
      { icon: Sparkles, label: "AI", value: "ai" },
    ],
  },
  {
    label: "Finish",
    tools: [
      { icon: ListChecks, label: "Copy Guide", value: "copy" },
      { icon: Download, label: "Export", value: "export" },
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  tools: ReadonlyArray<{
    icon: typeof ImageUp;
    label: string;
    value: StudioPanel;
  }>;
}>;

/**
 * A task-oriented tab list for the Studio inspector. The groups wrap into two
 * columns on small screens instead of turning the six tools into a horizontal
 * scroller, while each tool remains a real keyboard-operable tab.
 */
export function StudioWorkflowNav() {
  return (
    <TabsList
      aria-label="Studio workflow"
      className="grid h-auto w-full grid-cols-2 items-stretch gap-px overflow-visible rounded-none bg-border p-0"
    >
      {WORKFLOW_GROUPS.map((group) => (
        <div
          key={group.label}
          className="min-w-0 bg-background px-2 pb-2 pt-2.5"
          role="presentation"
        >
          <p className="mb-1.5 px-1 text-[0.62rem] font-black uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
          </p>
          <div className="grid min-w-0 grid-cols-1 gap-1" role="presentation">
            {group.tools.map(({ icon: Icon, label, value }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-8 min-w-0 justify-start rounded-md border border-transparent px-2 text-[0.7rem] font-bold data-[state=active]:border-border data-[state=active]:bg-accent data-[state=active]:shadow-none"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{label}</span>
              </TabsTrigger>
            ))}
          </div>
        </div>
      ))}
    </TabsList>
  );
}
