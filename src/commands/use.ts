import * as p from "@clack/prompts";
import pc from "picocolors";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { execSync } from "node:child_process";
import { loadConfig } from "../lib/config.ts";
import { getCurrentBranch, pullBranch, createWorktree } from "../lib/git.ts";
import { generateBranchName } from "../lib/utils.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

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

export interface UseInputs {
  projects: string[];
  branch: string;
  baseBranch?: string;
  fetch: boolean;
  runStartCmds: boolean;
  workspace: boolean;
  open: boolean;
}

export interface ProjectSetupInput {
  alias: string;
  branch: string;
  baseBranch?: string;
  fetch: boolean;
  runStartCmds: boolean;
}

export interface ProjectSetupResult {
  alias: string;
  label: string;
  worktreePath: string;
  created: boolean;
  errors: string[];
}

const flagSchema: FlagSchema[] = [
  { name: "project", type: "string", required: true },
  { name: "branch", type: "string", required: true },
  { name: "base-branch", type: "string", required: false },
  { name: "fetch", type: "boolean", required: false },
  { name: "run-start-cmds", type: "boolean", required: false },
];

/** Throws if alias is not in config. Returns errors for runtime failures (missing path, pull, etc). */
export function executeProject(input: ProjectSetupInput): ProjectSetupResult {
  const config = loadConfig();
  const project = config.projects[input.alias];

  if (!project) {
    throw new Error(`Project alias "${input.alias}" not found in config.`);
  }

  const cwd = process.cwd();
  const worktreePath = join(cwd, input.alias);
  const errors: string[] = [];
  let created = false;

  if (!existsSync(project.path)) {
    errors.push(`${project.label}: repo path not found (${project.path})`);
    return { alias: input.alias, label: project.label, worktreePath, created, errors };
  }

  const baseBranch = input.baseBranch ?? getCurrentBranch(project.path);

  if (input.fetch) {
    try {
      pullBranch(baseBranch, project.path);
    } catch (e) {
      errors.push(`${project.label}: failed to pull "${baseBranch}" from origin - ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (existsSync(worktreePath)) {
    errors.push(`${project.label}: directory already exists at ${worktreePath}`);
    return { alias: input.alias, label: project.label, worktreePath, created, errors };
  }

  try {
    createWorktree(project.path, worktreePath, input.branch, baseBranch);
    created = true;
  } catch (e) {
    errors.push(`${project.label}: ${e instanceof Error ? e.message : String(e)}`);
    return { alias: input.alias, label: project.label, worktreePath, created, errors };
  }

  if (input.runStartCmds && project.startCommands.length > 0) {
    try {
      const shell = process.env.SHELL || "/bin/sh";
      const cmds = project.startCommands.join(" && ");
      execSync(`${shell} -i -c '${cmds}'`, { cwd: worktreePath, stdio: "pipe" });
    } catch (e) {
      errors.push(`${project.label} (start commands): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { alias: input.alias, label: project.label, worktreePath, created, errors };
}

export function executeUse(inputs: UseInputs): { created: string[]; errors: string[] } {
  const config = loadConfig();
  const cwd = process.cwd();
  const dirName = basename(cwd);

  // Validate all project aliases exist
  for (const alias of inputs.projects) {
    if (!config.projects[alias]) {
      throw new Error(`Project alias "${alias}" not found in config.`);
    }
  }

  const created: string[] = [];
  const errors: string[] = [];

  // Build setups
  const setups: WorktreeSetup[] = [];
  for (const alias of inputs.projects) {
    const project = config.projects[alias];

    if (!existsSync(project.path)) {
      errors.push(`${project.label}: repo path not found (${project.path})`);
      continue;
    }

    const baseBranch = inputs.baseBranch ?? getCurrentBranch(project.path);

    if (inputs.fetch) {
      try {
        pullBranch(baseBranch, project.path);
      } catch (e) {
        errors.push(`${project.label}: failed to pull "${baseBranch}" from origin - ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    setups.push({
      alias,
      label: project.label,
      repoPath: project.path,
      baseBranch,
      branchName: inputs.branch,
      worktreePath: join(cwd, alias),
      runStartCmds: inputs.runStartCmds && project.startCommands.length > 0,
      startCommands: project.startCommands,
    });
  }

  // Create worktrees
  for (const setup of setups) {
    if (existsSync(setup.worktreePath)) {
      errors.push(`${setup.label}: directory already exists at ${setup.worktreePath}`);
      continue;
    }

    try {
      createWorktree(setup.repoPath, setup.worktreePath, setup.branchName, setup.baseBranch);
      created.push(setup.alias);
    } catch (e) {
      errors.push(`${setup.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Run start commands
  for (const setup of setups) {
    if (!setup.runStartCmds || setup.startCommands.length === 0) continue;
    if (!existsSync(setup.worktreePath)) continue;

    try {
      const shell = process.env.SHELL || "/bin/sh";
      const cmds = setup.startCommands.join(" && ");
      execSync(`${shell} -i -c '${cmds}'`, { cwd: setup.worktreePath, stdio: "pipe" });
    } catch (e) {
      errors.push(`${setup.label} (start commands): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Create/update VS Code workspace if requested (--open implies --workspace)
  const shouldWorkspace = inputs.workspace || inputs.open;
  const createdSetups = setups.filter((s) => existsSync(s.worktreePath));

  if (shouldWorkspace && createdSetups.length > 0) {
    const workspaceFile = join(cwd, `${dirName}.code-workspace`);
    const workspaceExists = existsSync(workspaceFile);

    let workspace: { folders: { name: string; path: string }[]; settings: Record<string, unknown> };

    if (workspaceExists) {
      try {
        workspace = JSON.parse(readFileSync(workspaceFile, "utf-8"));
        if (!Array.isArray(workspace.folders)) workspace.folders = [];
      } catch {
        workspace = { folders: [], settings: {} };
      }
    } else {
      workspace = { folders: [], settings: {} };
    }

    const existingPaths = new Set(workspace.folders.map((f) => f.path));
    if (!existingPaths.has(".")) {
      workspace.folders.unshift({ name: "Root", path: "." });
    }

    for (const s of createdSetups) {
      if (!existingPaths.has(s.alias)) {
        workspace.folders.push({ name: s.label, path: s.alias });
      }
    }

    writeFileSync(workspaceFile, JSON.stringify(workspace, null, 2) + "\n");

    // Hide worktree folders from root's file explorer
    const vscodeDir = join(cwd, ".vscode");
    const settingsFile = join(vscodeDir, "settings.json");

    let settings: Record<string, unknown> = {};
    if (existsSync(settingsFile)) {
      try {
        settings = JSON.parse(readFileSync(settingsFile, "utf-8"));
      } catch {
        settings = {};
      }
    }

    const filesExclude = (settings["files.exclude"] ?? {}) as Record<string, boolean>;
    for (const s of createdSetups) {
      filesExclude[s.alias] = true;
    }
    settings["files.exclude"] = filesExclude;

    if (!existsSync(vscodeDir)) mkdirSync(vscodeDir);
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");

    if (inputs.open) {
      try {
        execSync(`code "${workspaceFile}"`, { stdio: "ignore" });
      } catch {
        // silently ignore - caller can handle
      }
    }
  }

  if (created.length === 0 && errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  return { created, errors };
}

export async function use(argv: string[] = []) {
  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const result = executeProject({
        alias: flags.project as string,
        branch: flags.branch as string,
        baseBranch: flags["base-branch"] as string | undefined,
        fetch: flags.fetch as boolean,
        runStartCmds: flags["run-start-cmds"] as boolean,
      });

      if (!result.created) {
        console.error(formatError(result.errors.join("; "), 2));
        process.exit(2);
      }

      const msg = "Worktree created";
      console.log(formatSuccess(
        result.errors.length > 0 ? `${msg} (with ${result.errors.length} warning(s))` : msg,
        { created: result.alias, worktreePath: result.worktreePath, errors: result.errors.length > 0 ? result.errors : undefined },
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(formatError(msg, 2));
      process.exit(2);
    }
    return;
  }

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
      message: "Pull latest from origin first?",
      initialValue: false,
    });
    if (p.isCancel(doFetch)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (doFetch) {
      const s = p.spinner();
      s.start(`Pulling "${baseBranch}" from origin for ${project.label}...`);
      try {
        pullBranch(baseBranch, project.path);
        s.stop(`Pulled "${baseBranch}" for ${project.label}`);
      } catch (e) {
        s.stop(`${pc.red("✗")} Failed to pull "${baseBranch}" for ${project.label}`);
        p.cancel(e instanceof Error ? e.message : String(e));
        process.exit(1);
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
      const shell = process.env.SHELL || "/bin/sh";
      execSync(`${shell} -i -c '${cmds}'`, { cwd: setup.worktreePath, stdio: "pipe" });
      s.stop(`${pc.green("✓")} Start commands completed for ${setup.label}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      s.stop(`${pc.red("✗")} Start commands failed for ${setup.label}`);
      errors.push(`${setup.label} (start commands): ${msg}`);
    }
  }

  // Offer to create/update a VS Code workspace
  const createdSetups = setups.filter((s) => existsSync(s.worktreePath));

  if (createdSetups.length > 0) {
    const workspaceFile = join(cwd, `${dirName}.code-workspace`);
    const workspaceExists = existsSync(workspaceFile);

    const shouldUpdate = await p.confirm({
      message: workspaceExists
        ? `Update VS Code workspace with the new worktrees? (${pc.dim(workspaceFile)})`
        : "Create a VS Code workspace for these worktrees?",
      initialValue: false,
    });
    if (p.isCancel(shouldUpdate)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (shouldUpdate) {
      let workspace: { folders: { name: string; path: string }[]; settings: Record<string, unknown> };

      if (workspaceExists) {
        try {
          workspace = JSON.parse(readFileSync(workspaceFile, "utf-8"));
          if (!Array.isArray(workspace.folders)) workspace.folders = [];
        } catch {
          workspace = { folders: [], settings: {} };
        }
      } else {
        workspace = { folders: [], settings: {} };
      }

      // Ensure root folder is always first
      const existingPaths = new Set(workspace.folders.map((f) => f.path));
      if (!existingPaths.has(".")) {
        workspace.folders.unshift({ name: "Root", path: "." });
      }

      for (const s of createdSetups) {
        if (!existingPaths.has(s.alias)) {
          workspace.folders.push({ name: s.label, path: s.alias });
        }
      }

      writeFileSync(workspaceFile, JSON.stringify(workspace, null, 2) + "\n");

      // Hide worktree folders from root's file explorer
      const vscodeDir = join(cwd, ".vscode");
      const settingsFile = join(vscodeDir, "settings.json");

      let settings: Record<string, unknown> = {};
      if (existsSync(settingsFile)) {
        try {
          settings = JSON.parse(readFileSync(settingsFile, "utf-8"));
        } catch {
          settings = {};
        }
      }

      const filesExclude = (settings["files.exclude"] ?? {}) as Record<string, boolean>;
      for (const s of createdSetups) {
        filesExclude[s.alias] = true;
      }
      settings["files.exclude"] = filesExclude;

      if (!existsSync(vscodeDir)) mkdirSync(vscodeDir);
      writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");

      p.log.success(`${workspaceExists ? "Updated" : "Created"} workspace: ${pc.dim(workspaceFile)}`);

      const openNow = await p.confirm({
        message: "Open it in VS Code now?",
        initialValue: true,
      });
      if (!p.isCancel(openNow) && openNow) {
        try {
          execSync(`code "${workspaceFile}"`, { stdio: "ignore" });
        } catch {
          p.log.warning("Could not open VS Code. You can open the workspace manually.");
        }
      }
    }
  }

  if (errors.length > 0) {
    p.log.warning("Some issues occurred:");
    for (const err of errors) {
      p.log.error(`  ${err}`);
    }
  }

  const created = createdSetups.length;
  p.outro(`Done! ${created} worktree${created !== 1 ? "s" : ""} created in ${pc.dim(cwd)}`);
}
