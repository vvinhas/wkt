import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig, removeProject } from "../lib/config.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

const flagSchema: FlagSchema[] = [
  { name: "alias", type: "string", required: true },
];

export function executeRemove(inputs: { alias: string }): string {
  const config = loadConfig();
  const project = config.projects[inputs.alias];
  if (!project) {
    throw new Error(`Project "${inputs.alias}" not found.`);
  }
  removeProject(inputs.alias);
  return project.label;
}

export async function remove(argv: string[] = []) {
  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const label = executeRemove({ alias: flags.alias as string });
      console.log(formatSuccess(`Removed "${label}"`, { alias: flags.alias as string, label }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(formatError(msg, 1));
      process.exit(1);
    }
    return;
  }

  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Remove Project`);

  const config = loadConfig();
  const entries = Object.entries(config.projects);

  if (entries.length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const alias = await p.select({
    message: "Which project do you want to remove?",
    options: entries.map(([key, proj]) => ({
      value: key,
      label: `${proj.label} (${key})`,
    })),
  });
  if (p.isCancel(alias)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const project = config.projects[alias];

  const confirmed = await p.confirm({
    message: `Remove "${project?.label}"? This won't delete the repo or any worktrees.`,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  removeProject(alias);

  p.outro(`${pc.green("✓")} Removed "${pc.bold(project?.label ?? alias)}"`);
}
