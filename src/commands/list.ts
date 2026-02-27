import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig } from "../lib/config.ts";
import { listWorktrees, removeWorktree } from "../lib/git.ts";

export async function list() {
  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Worktrees`);

  const config = loadConfig();
  const entries = Object.entries(config.projects);

  if (entries.length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const alias = await p.select({
    message: "Which project?",
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
  if (!project) {
    p.cancel("Project not found.");
    process.exit(1);
  }

  const worktrees = listWorktrees(project.path).filter((wt) => !wt.isMain);

  if (worktrees.length === 0) {
    p.outro(`No active worktrees for ${pc.bold(project.label)}.`);
    return;
  }

  p.log.info(`Active worktrees for ${pc.bold(project.label)}:\n`);
  for (const wt of worktrees) {
    p.log.message(`  ${pc.cyan(wt.path)}\n    Branch: ${pc.dim(wt.branch)}\n`);
  }

  const DONE = "__done__";

  const toRemove = await p.select({
    message: "Remove a worktree?",
    options: [
      ...worktrees.map((wt) => {
        const shortPath = wt.path.replace(/^.*\/\.\.\.\//, "");
        return {
          value: wt.path,
          label: `${shortPath} (${wt.branch})`,
        };
      }),
      { value: DONE, label: "No, I'm done" },
    ],
  });
  if (p.isCancel(toRemove)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  if (toRemove === DONE) {
    p.outro("Done");
    return;
  }

  const confirmed = await p.confirm({
    message: `Remove worktree at ${toRemove}?`,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const s = p.spinner();
  s.start("Removing worktree...");
  try {
    removeWorktree(project.path, toRemove);
    s.stop(`${pc.green("✓")} Worktree removed`);
  } catch (e) {
    s.stop(`${pc.red("✗")} Failed to remove worktree`);
    p.log.error(e instanceof Error ? e.message : String(e));
  }

  p.outro("Done");
}
