import * as p from "@clack/prompts";
import pc from "picocolors";
import { isGitRepo, getRepoRoot, getRemoteName } from "../lib/git.ts";
import { addProject, findProjectByPath } from "../lib/config.ts";

export async function add() {
  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Add Project`);

  if (!isGitRepo()) {
    p.cancel("Not a git repository. Run this from inside a git repo.");
    process.exit(1);
  }

  const repoRoot = getRepoRoot();

  const existing = findProjectByPath(repoRoot);
  if (existing) {
    p.cancel(`This repo is already registered as "${existing.alias}" (${existing.project.label}).`);
    process.exit(1);
  }

  let defaultName: string;
  try {
    defaultName = getRemoteName();
  } catch {
    p.cancel("No 'origin' remote found. Add one with: git remote add origin <url>");
    process.exit(1);
  }

  p.log.info(`Detected: ${pc.bold(defaultName)} (${pc.dim(repoRoot)})`);

  const label = await p.text({
    message: "What should we call this project?",
    initialValue: defaultName,
    validate: (v) => {
      if (!v?.trim()) return "Label cannot be empty";
    },
  });
  if (p.isCancel(label)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const alias = await p.text({
    message: "Alias (used as folder name in worktrees)?",
    initialValue: defaultName,
    validate: (v) => {
      if (!v?.trim()) return "Alias cannot be empty";
      if (/[^a-zA-Z0-9_-]/.test(v!)) return "Only letters, numbers, hyphens, and underscores";
    },
  });
  if (p.isCancel(alias)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const cmdsInput = await p.text({
    message: "Commands to run when creating a worktree (comma-separated, blank to skip):",
    initialValue: "",
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

  addProject(alias, { path: repoRoot, label, startCommands });

  p.outro(`${pc.green("✓")} Project "${pc.bold(label)}" added as ${pc.dim(alias)}`);
}
