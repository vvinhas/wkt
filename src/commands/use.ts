import * as p from "@clack/prompts";
import pc from "picocolors";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { execSync } from "node:child_process";
import { loadConfig } from "../lib/config.ts";
import { getCurrentBranch, fetchOrigin, createWorktree } from "../lib/git.ts";
import { generateBranchName } from "../lib/utils.ts";

interface WorktreeSetup {
  alias: string;
  label: string;
  repoPath: string;
  baseBranch: string;
  branchName: string;
  worktreePath: string;
  runStartCmds: boolean;
  startCommands: string[];
}

export async function use() {
  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Create Worktrees`);

  const config = loadConfig();
  const entries = Object.entries(config.projects);

  if (entries.length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const selected = await p.multiselect({
    message: "Which projects do you need?",
    options: entries.map(([key, proj]) => ({
      value: key,
      label: `${proj.label} (${key})`,
    })),
    required: true,
  });
  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const cwd = process.cwd();
  const dirName = basename(cwd);
  const defaultBranch = generateBranchName(dirName);

  const setups: WorktreeSetup[] = [];
  let previousBranch = defaultBranch;

  for (const alias of selected) {
    const project = config.projects[alias];
    if (!project) continue;

    if (!existsSync(project.path)) {
      p.log.error(`${pc.bold(project.label)}: repo path not found (${project.path}). Skipping.`);
      continue;
    }

    p.log.step(`${pc.bold(`── Configuring: ${project.label} ──`)}`);

    const currentBranch = getCurrentBranch(project.path);

    const baseBranch = await p.text({
      message: "Base branch?",
      initialValue: currentBranch,
    });
    if (p.isCancel(baseBranch)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    const doFetch = await p.confirm({
      message: "Fetch latest from origin first?",
      initialValue: false,
    });
    if (p.isCancel(doFetch)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (doFetch) {
      const s = p.spinner();
      s.start(`Fetching origin for ${project.label}...`);
      try {
        fetchOrigin(project.path);
        s.stop(`Fetched origin for ${project.label}`);
      } catch (e) {
        s.stop(`Failed to fetch origin for ${project.label}`);
        p.log.warning(e instanceof Error ? e.message : String(e));
      }
    }

    const branchName = await p.text({
      message: "Branch name for the worktree?",
      initialValue: previousBranch,
      validate: (v) => {
        if (!v?.trim()) return "Branch name cannot be empty";
      },
    });
    if (p.isCancel(branchName)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    previousBranch = branchName;

    const worktreePath = join(cwd, alias);

    let runStartCmds = false;
    if (project.startCommands.length > 0) {
      const run = await p.confirm({
        message: `Run start commands? (${pc.dim(project.startCommands.join(", "))})`,
        initialValue: true,
      });
      if (p.isCancel(run)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      runStartCmds = run;
    }

    setups.push({
      alias,
      label: project.label,
      repoPath: project.path,
      baseBranch,
      branchName,
      worktreePath,
      runStartCmds,
      startCommands: project.startCommands,
    });
  }

  if (setups.length === 0) {
    p.cancel("No projects to set up.");
    process.exit(0);
  }

  // Create worktrees
  const errors: string[] = [];

  for (const setup of setups) {
    const s = p.spinner();
    s.start(`Creating worktree for ${setup.label}...`);

    if (existsSync(setup.worktreePath)) {
      s.stop(`${pc.red("✗")} ${setup.label}: target directory already exists (${setup.worktreePath})`);
      errors.push(`${setup.label}: directory already exists at ${setup.worktreePath}`);
      continue;
    }

    try {
      createWorktree(setup.repoPath, setup.worktreePath, setup.branchName, setup.baseBranch);
      s.stop(`${pc.green("✓")} Created worktree for ${setup.label}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      s.stop(`${pc.red("✗")} Failed to create worktree for ${setup.label}`);
      errors.push(`${setup.label}: ${msg}`);
    }
  }

  // Run start commands
  for (const setup of setups) {
    if (!setup.runStartCmds || setup.startCommands.length === 0) continue;
    if (!existsSync(setup.worktreePath)) continue;

    const s = p.spinner();
    const cmds = setup.startCommands.join(" && ");
    s.start(`Running start commands for ${setup.label}...`);
    try {
      execSync(cmds, { cwd: setup.worktreePath, stdio: "pipe" });
      s.stop(`${pc.green("✓")} Start commands completed for ${setup.label}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      s.stop(`${pc.red("✗")} Start commands failed for ${setup.label}`);
      errors.push(`${setup.label} (start commands): ${msg}`);
    }
  }

  if (errors.length > 0) {
    p.log.warning("Some issues occurred:");
    for (const err of errors) {
      p.log.error(`  ${err}`);
    }
  }

  const created = setups.filter((s) => existsSync(s.worktreePath)).length;
  p.outro(`Done! ${created} worktree${created !== 1 ? "s" : ""} created in ${pc.dim(cwd)}`);
}
