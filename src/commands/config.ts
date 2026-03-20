import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig, updateProject } from "../lib/config.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

interface ConfigInputs {
  alias: string;
  label?: string;
  startCommands?: string[];
}

const flagSchema: FlagSchema[] = [
  { name: "alias", type: "string", required: true },
  { name: "label", type: "string", required: false },
  { name: "start-cmds", type: "string[]", required: false },
];

export function executeConfig(inputs: ConfigInputs): string {
  const cfg = loadConfig();
  const project = cfg.projects[inputs.alias];
  if (!project) {
    throw new Error(`Project "${inputs.alias}" not found.`);
  }
  if (inputs.label === undefined && inputs.startCommands === undefined) {
    throw new Error("At least one of --label or --start-cmds is required.");
  }
  const updates: Partial<typeof project> = {};
  if (inputs.label !== undefined) updates.label = inputs.label;
  if (inputs.startCommands !== undefined) updates.startCommands = inputs.startCommands;
  updateProject(inputs.alias, updates);
  return inputs.label ?? project.label;
}

export async function config(argv: string[] = []) {
  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const resultLabel = executeConfig({
        alias: flags.alias as string,
        label: flags.label as string | undefined,
        startCommands: flags["start-cmds"] as string[] | undefined,
      });
      console.log(formatSuccess(`Updated "${resultLabel}"`));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(formatError(msg, 1));
      process.exit(1);
    }
    return;
  }

  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Configure Project`);

  const cfg = loadConfig();
  const entries = Object.entries(cfg.projects);

  if (entries.length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const alias = await p.select({
    message: "Which project do you want to configure?",
    options: entries.map(([key, proj]) => ({
      value: key,
      label: `${proj.label} (${key})`,
    })),
  });
  if (p.isCancel(alias)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const project = cfg.projects[alias];
  if (!project) {
    p.cancel("Project not found.");
    process.exit(1);
  }

  const field = await p.select({
    message: "What do you want to update?",
    options: [
      { value: "label" as const, label: "Label" },
      { value: "startCommands" as const, label: "Start commands" },
    ],
  });
  if (p.isCancel(field)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  if (field === "label") {
    const newLabel = await p.text({
      message: "New label:",
      initialValue: project.label,
      validate: (v) => {
        if (!v?.trim()) return "Label cannot be empty";
      },
    });
    if (p.isCancel(newLabel)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    updateProject(alias, { label: newLabel });
    p.outro(`${pc.green("✓")} Updated "${pc.bold(newLabel)}"`);
  } else {
    const cmdsInput = await p.text({
      message: "Commands to run when creating a worktree (comma-separated):",
      initialValue: project.startCommands.join(", "),
      placeholder: "e.g. npm install, npm run build",
    });
    if (p.isCancel(cmdsInput)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    const startCommands = cmdsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    updateProject(alias, { startCommands });
    p.outro(`${pc.green("✓")} Updated "${pc.bold(project.label)}"`);
  }
}
