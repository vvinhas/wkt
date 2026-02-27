import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig, removeProject } from "../lib/config.ts";

export async function remove() {
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
