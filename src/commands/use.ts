import * as p from "@clack/prompts";
import pc from "picocolors";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadConfig } from "../lib/config.ts";
import { getCurrentBranch, pullBranch, createWorktree } from "../lib/git.ts";
import { generateBranchName } from "../lib/utils.ts";
import { hasFlags, parseFlags, extractGlobalFlags, type FlagSchema, type GlobalFlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError, isJsonMode } from "../lib/output.ts";
import {
  bundlePlugin,
  detectClaudeAssets,
  ensureClaudeCliAvailable,
  installPlugin,
  registerMarketplaceIfMissing,
} from "../lib/claude-plugins.ts";

/**
 * Bundles + installs the worktree's .claude/ as a project-scoped plugin.
 * Returns null on success (or silent skip), an error message on failure.
 */
function linkClaudeForWorktree(
  workspacePath: string,
  alias: string,
  worktreePath: string,
): string | null {
  try {
    const assets = detectClaudeAssets(worktreePath);
    if (assets.length === 0) return null;
    ensureClaudeCliAvailable();
    bundlePlugin(workspacePath, alias, worktreePath);
    registerMarketplaceIfMissing(workspacePath);
    installPlugin(workspacePath, alias);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export interface ProjectSetupInput {
  alias: string;
  branch: string;
  baseBranch?: string;
  fetch: boolean;
  dir?: string;
}

export interface ProjectSetupResult {
  alias: string;
  label: string;
  worktreePath: string;
  startCommands: string[];
  created: boolean;
  errors: string[];
}

export interface WorkspaceDirInput {
  cwd: string;
  dirFlag?: string;
  createFolder?: { name: string };
}

/**
 * Resolves the final workspace dir. Precedence: dirFlag > createFolder > cwd.
 * Pure: no filesystem touches, no prompts. Caller is responsible for any mkdir.
 */
export function resolveWorkspaceDir(input: WorkspaceDirInput): string {
  if (input.dirFlag) return resolve(input.dirFlag);
  if (input.createFolder) return join(input.cwd, input.createFolder.name);
  return input.cwd;
}

/**
 * Runs a project's start commands inside the worktree. Streams output to the
 * parent terminal so the user can see progress (yarn install, etc.) and any
 * failures live. Returns null on success or an error message on failure.
 */
export function runStartCommands(worktreePath: string, startCommands: string[]): string | null {
  if (startCommands.length === 0) return null;
  const shell = process.env.SHELL || "/bin/sh";
  const rcFile = shell.includes("zsh") ? "$HOME/.zshrc" : "$HOME/.bashrc";
  const cmds = startCommands.join(" && ");
  try {
    execSync(`${shell} -l -c '. ${rcFile} 2>/dev/null; ${cmds}'`, {
      cwd: worktreePath,
      stdio: "inherit",
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const globalSchema: GlobalFlagSchema[] = [
  { name: "dir", type: "string" },
  { name: "branch", type: "string" },
  { name: "base-branch", type: "string" },
  { name: "fetch", type: "boolean" },
  { name: "run-start-cmds", type: "boolean" },
  { name: "link-claude", type: "boolean" },
];

const flagSchema: FlagSchema[] = [
  { name: "project", type: "string", required: true },
];

/** Throws if alias is not in config. Returns errors for runtime failures (missing path, pull, etc). */
export function executeProject(input: ProjectSetupInput): ProjectSetupResult {
  const config = loadConfig();
  const project = config.projects[input.alias];

  if (!project) {
    throw new Error(`Project alias "${input.alias}" not found in config.`);
  }

  const baseDir = input.dir ? resolve(input.dir) : process.cwd();
  if (input.dir && !existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
  const worktreePath = join(baseDir, input.alias);
  const errors: string[] = [];
  const startCommands = project.startCommands;
  let created = false;

  if (!existsSync(project.path)) {
    errors.push(`${project.label}: repo path not found (${project.path})`);
    return { alias: input.alias, label: project.label, worktreePath, startCommands, created, errors };
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
    return { alias: input.alias, label: project.label, worktreePath, startCommands, created, errors };
  }

  try {
    createWorktree(project.path, worktreePath, input.branch, baseBranch);
    created = true;
  } catch (e) {
    errors.push(`${project.label}: ${e instanceof Error ? e.message : String(e)}`);
    return { alias: input.alias, label: project.label, worktreePath, startCommands, created, errors };
  }

  return { alias: input.alias, label: project.label, worktreePath, startCommands, created, errors };
}

export async function use(argv: string[] = []) {
  const { values: globals, rest } = extractGlobalFlags(argv, globalSchema);

  const dir = globals.dir as string | undefined;
  const branch = globals.branch as string | undefined;
  const baseBranch = globals["base-branch"] as string | undefined;
  const fetch = globals.fetch as boolean | undefined;
  const runStartCmds = globals["run-start-cmds"] as boolean | undefined;
  const linkClaude = globals["link-claude"] as boolean | undefined;

  if (hasFlags(rest)) {
    try {
      const flags = parseFlags(rest, flagSchema);
      if (!branch) throw new Error("Missing required flag: --branch");

      const result = executeProject({
        alias: flags.project as string,
        branch,
        baseBranch,
        fetch: fetch ?? false,
        dir,
      });

      if (!result.created) {
        console.error(formatError(result.errors.join("; "), 2));
        process.exit(2);
      }

      if (runStartCmds && result.startCommands.length > 0) {
        const startErr = runStartCommands(result.worktreePath, result.startCommands);
        if (startErr) result.errors.push(`${result.label} (start commands): ${startErr}`);
      }

      if (linkClaude && result.created) {
        const workspacePath = dir ? resolve(dir) : process.cwd();
        const linkErr = linkClaudeForWorktree(workspacePath, flags.project as string, result.worktreePath);
        if (linkErr) result.errors.push(`${result.label} (link-claude): ${linkErr}`);
      }

      const msg = "Worktree created";
      console.log(formatSuccess(
        result.errors.length > 0 ? `${msg} (with ${result.errors.length} warning(s))` : msg,
        { created: result.alias, worktreePath: result.worktreePath, errors: result.errors.length > 0 ? result.errors : undefined },
      ));
      if (!isJsonMode()) {
        for (const err of result.errors) {
          console.error(`  ! ${err}`);
        }
      }
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

  let createFolder: { name: string } | undefined;
  if (!dir) {
    const wantFolder = await p.confirm({
      message: "Create a folder for this workspace?",
      initialValue: false,
    });
    if (p.isCancel(wantFolder)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    if (wantFolder) {
      const name = await p.text({
        message: "Folder name?",
        validate: (v) => {
          const trimmed = v?.trim();
          if (!trimmed) return "Folder name cannot be empty";
          if (trimmed.includes("/") || trimmed.includes("\\")) {
            return "Folder name cannot contain path separators";
          }
        },
      });
      if (p.isCancel(name)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      createFolder = { name: name.trim() };
    }
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

  const cwd = resolveWorkspaceDir({
    cwd: process.cwd(),
    dirFlag: dir,
    createFolder,
  });
  const dirName = basename(cwd);
  const defaultBranch = branch ?? generateBranchName(dirName);

  const results: ProjectSetupResult[] = [];
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

    let selectedBaseBranch: string;
    if (baseBranch) {
      selectedBaseBranch = baseBranch;
    } else {
      const input = await p.text({
        message: "Base branch?",
        initialValue: currentBranch,
      });
      if (p.isCancel(input)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      selectedBaseBranch = input;
    }

    let doFetch: boolean;
    if (fetch !== undefined) {
      doFetch = fetch;
    } else {
      const input = await p.confirm({
        message: "Pull latest from origin first?",
        initialValue: false,
      });
      if (p.isCancel(input)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      doFetch = input;
    }

    if (doFetch) {
      const fetchSpinner = p.spinner();
      fetchSpinner.start(`Pulling "${selectedBaseBranch}" from origin for ${project.label}...`);
      try {
        pullBranch(selectedBaseBranch, project.path);
        fetchSpinner.stop(`Pulled "${selectedBaseBranch}" for ${project.label}`);
      } catch (e) {
        fetchSpinner.stop(`${pc.red("✗")} Failed to pull "${selectedBaseBranch}" for ${project.label}`);
        p.cancel(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    }

    let branchName: string;
    if (branch) {
      branchName = branch;
    } else {
      const input = await p.text({
        message: "Branch name for the worktree?",
        initialValue: previousBranch,
        validate: (v) => {
          if (!v?.trim()) return "Branch name cannot be empty";
        },
      });
      if (p.isCancel(input)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      branchName = input;
      previousBranch = branchName;
    }

    let selectedRunStartCmds = false;
    if (project.startCommands.length > 0) {
      if (runStartCmds !== undefined) {
        selectedRunStartCmds = runStartCmds;
      } else {
        const input = await p.confirm({
          message: `Run start commands? (${pc.dim(project.startCommands.join(", "))})`,
          initialValue: true,
        });
        if (p.isCancel(input)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        selectedRunStartCmds = input;
      }
    }

    const s = p.spinner();
    s.start(`Creating worktree for ${project.label}...`);

    const result = executeProject({
      alias,
      branch: branchName,
      baseBranch: selectedBaseBranch,
      fetch: false, // handled above with dedicated spinner
      dir: cwd,
    });

    if (result.created) {
      s.stop(`${pc.green("✓")} Created worktree for ${project.label}`);
    } else {
      s.stop(`${pc.red("✗")} Failed to create worktree for ${project.label}`);
    }

    if (result.created && selectedRunStartCmds && result.startCommands.length > 0) {
      // Stream output directly so the user sees progress (yarn install, etc.)
      // and can spot real errors as they happen. Don't wrap in a spinner — its
      // ticks collide with the child process's stdout.
      p.log.step(`Running start commands for ${project.label}...`);
      const startErr = runStartCommands(result.worktreePath, result.startCommands);
      if (startErr) {
        result.errors.push(`${result.label} (start commands): ${startErr}`);
        p.log.error(`${pc.red("✗")} Start commands failed for ${project.label}`);
      } else {
        p.log.success(`${pc.green("✓")} Start commands completed for ${project.label}`);
      }
    }

    if (result.created) {
      const detectedAssets = detectClaudeAssets(result.worktreePath);
      if (detectedAssets.length > 0) {
        let shouldLink: boolean;
        if (linkClaude !== undefined) {
          shouldLink = linkClaude;
        } else {
          const input = await p.confirm({
            message: `Bundle ${pc.bold(project.label)}'s .claude/ as a Claude plugin in this workspace?`,
            initialValue: false,
          });
          if (p.isCancel(input)) {
            p.cancel("Cancelled.");
            process.exit(0);
          }
          shouldLink = input;
        }
        if (shouldLink) {
          const linkSpinner = p.spinner();
          linkSpinner.start(`Linking ${project.label}'s .claude/ as a plugin...`);
          const linkErr = linkClaudeForWorktree(cwd, alias, result.worktreePath);
          if (linkErr) {
            linkSpinner.stop(`${pc.red("✗")} Failed to link plugin for ${project.label}`);
            result.errors.push(`${result.label} (link-claude): ${linkErr}`);
          } else {
            linkSpinner.stop(`${pc.green("✓")} Linked ${project.label}'s .claude/ (${detectedAssets.join(", ")})`);
          }
        }
      }
    }

    results.push(result);
  }

  const createdResults = results.filter((r) => r.created);
  const allErrors = results.flatMap((r) => r.errors);

  if (createdResults.length === 0) {
    p.cancel("No worktrees were created.");
    process.exit(0);
  }

  // Offer to create/update a VS Code workspace
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

    const existingPaths = new Set(workspace.folders.map((f) => f.path));
    if (!existingPaths.has(".")) {
      workspace.folders.unshift({ name: "Root", path: "." });
    }

    for (const r of createdResults) {
      if (!existingPaths.has(r.alias)) {
        workspace.folders.push({ name: r.label, path: r.alias });
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
    for (const r of createdResults) {
      filesExclude[r.alias] = true;
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

  if (allErrors.length > 0) {
    p.log.warning("Some issues occurred:");
    for (const err of allErrors) {
      p.log.error(`  ${err}`);
    }
  }

  const createdCount = createdResults.length;
  p.outro(`Done! ${createdCount} worktree${createdCount !== 1 ? "s" : ""} created in ${pc.dim(cwd)}`);
}
