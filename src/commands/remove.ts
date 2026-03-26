import * as p from "@clack/prompts";
import pc from "picocolors";
import { rmSync } from "node:fs";
import { loadConfig, removeProject } from "../lib/config.ts";
import { REPOS_DIR } from "../lib/git.ts";
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
  if (project.path.startsWith(REPOS_DIR)) {
    rmSync(project.path, { recursive: true, force: true });
  }
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

  const project = config.projects[alias]!;

  const isCloned = project.path.startsWith(REPOS_DIR);
  const confirmMsg = isCloned
    ? `Remove "${project.label}"? This will also delete the cloned repository.`
    : `Remove "${project.label}"? This won't delete the repo or any worktrees.`;

  const confirmed = await p.confirm({
    message: confirmMsg,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  executeRemove({ alias });

  p.outro(`${pc.green("✓")} Removed "${pc.bold(project.label)}"`);
}
