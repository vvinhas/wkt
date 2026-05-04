import * as p from "@clack/prompts";
import pc from "picocolors";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { findWorkspace } from "../lib/cleanup.ts";
import { loadConfig } from "../lib/config.ts";
import {
  fetchRemoteBranch,
  getCurrentBranch,
  getWorktreeStatus,
  mergeFrom,
  rebaseOnto,
} from "../lib/git.ts";
import { execFile, generateBranchName } from "../lib/utils.ts";
import {
  extractGlobalFlags,
  hasFlags,
  parseFlags,
  type FlagSchema,
  type GlobalFlagSchema,
} from "../lib/flags.ts";
import { formatError, formatSuccess } from "../lib/output.ts";

export type SyncStrategy = "rebase" | "merge";
export type SyncStatus = "synced" | "skipped" | "conflict" | "failed";

export interface SyncProjectInput {
  worktreePath: string;
  projectPath: string;
  alias: string;
  label: string;
  baseBranch: string;
  strategy: SyncStrategy;
}

export interface SyncProjectResult {
  alias: string;
  label: string;
  worktreePath: string;
  baseBranch: string;
  strategy: SyncStrategy;
  status: SyncStatus;
  reason?: string;
}

export function executeSync(input: SyncProjectInput): SyncProjectResult {
  const base = {
    alias: input.alias,
    label: input.label,
    worktreePath: input.worktreePath,
    baseBranch: input.baseBranch,
    strategy: input.strategy,
  };

  if (!existsSync(input.projectPath)) {
    return { ...base, status: "skipped", reason: "repo missing" };
  }

  if (!existsSync(input.worktreePath)) {
    return { ...base, status: "skipped", reason: "worktree path missing" };
  }

  const status = getWorktreeStatus(input.worktreePath);
  if (status.dirty) {
    return { ...base, status: "skipped", reason: "dirty" };
  }

  try {
    fetchRemoteBranch(input.baseBranch, input.worktreePath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...base, status: "failed", reason: msg };
  }

  const ref = `origin/${input.baseBranch}`;
  const result =
    input.strategy === "rebase"
      ? rebaseOnto(ref, input.worktreePath)
      : mergeFrom(ref, input.worktreePath);

  if (result.ok) return { ...base, status: "synced" };
  if (result.conflict) return { ...base, status: "conflict" };
  return { ...base, status: "failed", reason: result.message };
}

export interface NewBranchInput {
  worktreePath: string;
  alias: string;
  branch: string;
  baseBranch: string;
}

export interface NewBranchResult {
  alias: string;
  ok: boolean;
  message?: string;
}

export function createNewBranchInWorktree(input: NewBranchInput): NewBranchResult {
  try {
    execFile(
      "git",
      ["checkout", "-b", input.branch, `origin/${input.baseBranch}`],
      input.worktreePath,
    );
    return { alias: input.alias, ok: true };
  } catch (e) {
    return {
      alias: input.alias,
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

const globalSchema: GlobalFlagSchema[] = [
  { name: "dir", type: "string" },
  { name: "strategy", type: "string" },
  { name: "base-branch", type: "string" },
  { name: "new-branch", type: "string" },
];

const flagSchema: FlagSchema[] = [];

interface SyncSummary {
  workspaceDir: string;
  results: SyncProjectResult[];
  newBranch?: { name: string; createdIn: string[] };
}

interface JsonResultEntry {
  alias: string;
  baseBranch: string;
  strategy: SyncStrategy;
  status: SyncStatus;
  reason?: string;
}

function toJsonResults(results: SyncProjectResult[]): JsonResultEntry[] {
  return results.map((r) => ({
    alias: r.alias,
    baseBranch: r.baseBranch,
    strategy: r.strategy,
    status: r.status,
    ...(r.reason ? { reason: r.reason } : {}),
  }));
}

function summarize(results: SyncProjectResult[]): { synced: number; skipped: number; conflict: number; failed: number } {
  return {
    synced: results.filter((r) => r.status === "synced").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    conflict: results.filter((r) => r.status === "conflict").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}

export async function sync(argv: string[] = []) {
  const { values: globals, rest } = extractGlobalFlags(argv, globalSchema);
  const dir = (globals.dir as string | undefined) ?? process.cwd();
  const strategyFlag = globals["strategy"] as string | undefined;
  const baseBranchFlag = globals["base-branch"] as string | undefined;
  const newBranchFlag = globals["new-branch"] as string | undefined;

  const flagsPresent = hasFlags(rest) || strategyFlag !== undefined || baseBranchFlag !== undefined || newBranchFlag !== undefined;

  if (flagsPresent) {
    try {
      // Reject any unknown positional args / flags in `rest`.
      parseFlags(rest, flagSchema);

      if (!strategyFlag) throw new Error("Missing required flag: --strategy");
      if (strategyFlag !== "rebase" && strategyFlag !== "merge") {
        throw new Error('Flag --strategy must be "rebase" or "merge"');
      }
      if (!baseBranchFlag) throw new Error("Missing required flag: --base-branch");

      const summary = runNonInteractive({
        dir,
        strategy: strategyFlag as SyncStrategy,
        baseBranch: baseBranchFlag,
        newBranch: newBranchFlag,
      });

      const counts = summarize(summary.results);
      const allUnsuccessful = counts.synced === 0;
      const message = `Synced ${counts.synced} · skipped ${counts.skipped} · conflicts ${counts.conflict} · failed ${counts.failed}`;

      const data = {
        workspaceDir: summary.workspaceDir,
        results: toJsonResults(summary.results),
        ...(summary.newBranch ? { newBranch: summary.newBranch } : {}),
      };

      if (allUnsuccessful) {
        console.log(formatSuccess(message, data));
        process.exit(1);
      }

      console.log(formatSuccess(message, data));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes("No worktrees found") ? 2 : 2;
      console.error(formatError(msg, code));
      process.exit(code);
    }
    return;
  }

  // Interactive path — implemented in Task 9.
  await runInteractive({ dir });
}

interface NonInteractiveInputs {
  dir: string;
  strategy: SyncStrategy;
  baseBranch: string;
  newBranch?: string;
}

function runNonInteractive(inputs: NonInteractiveInputs): SyncSummary {
  const absDir = resolve(inputs.dir);
  const matches = findWorkspace({ dir: absDir });
  if (matches.length === 0) {
    throw new Error(`No worktrees found in directory "${absDir}"`);
  }
  const workspace = matches[0]!;

  const results: SyncProjectResult[] = [];
  for (const wt of workspace.worktrees) {
    results.push(
      executeSync({
        worktreePath: wt.path,
        projectPath: wt.projectPath,
        alias: wt.alias,
        label: wt.projectLabel,
        baseBranch: inputs.baseBranch,
        strategy: inputs.strategy,
      }),
    );
  }

  let newBranch: SyncSummary["newBranch"] | undefined;
  if (inputs.newBranch) {
    const synced = results.filter((r) => r.status === "synced");
    const createdIn: string[] = [];
    for (const r of synced) {
      const out = createNewBranchInWorktree({
        worktreePath: r.worktreePath,
        alias: r.alias,
        branch: inputs.newBranch,
        baseBranch: r.baseBranch,
      });
      if (out.ok) createdIn.push(out.alias);
    }
    newBranch = { name: inputs.newBranch, createdIn };
  }

  return { workspaceDir: workspace.workspaceDir, results, newBranch };
}

async function runInteractive(inputs: { dir: string }): Promise<void> {
  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Sync Workspace`);

  const config = loadConfig();
  if (Object.keys(config.projects).length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const absDir = resolve(inputs.dir);
  const matches = findWorkspace({ dir: absDir });
  if (matches.length === 0) {
    p.cancel(`No worktrees found in directory "${absDir}"`);
    process.exit(1);
  }
  const workspace = matches[0]!;

  p.log.info(`${pc.dim("workspace")}  ${pc.dim(workspace.workspaceDir)}`);
  p.log.message(
    `${workspace.worktrees.length} worktree${workspace.worktrees.length !== 1 ? "s" : ""} in this workspace:\n` +
      workspace.worktrees
        .map((wt) => `  - ${pc.bold(wt.alias)}  (${pc.dim(wt.branch)})  ${pc.dim(wt.path)}`)
        .join("\n"),
  );

  const results: SyncProjectResult[] = [];

  for (const wt of workspace.worktrees) {
    p.log.step(`${pc.bold(`── Syncing: ${wt.projectLabel} ──`)}`);

    if (!existsSync(wt.path)) {
      p.log.warning(`Worktree path missing (${wt.path}). Skipping.`);
      results.push({
        alias: wt.alias,
        label: wt.projectLabel,
        worktreePath: wt.path,
        baseBranch: "",
        strategy: "rebase",
        status: "skipped",
        reason: "worktree path missing",
      });
      continue;
    }

    const status = getWorktreeStatus(wt.path);
    if (status.dirty) {
      p.log.warning(
        `${wt.projectLabel} is dirty (${status.dirtyCount} change${status.dirtyCount !== 1 ? "s" : ""}). Skipping.`,
      );
      results.push({
        alias: wt.alias,
        label: wt.projectLabel,
        worktreePath: wt.path,
        baseBranch: "",
        strategy: "rebase",
        status: "skipped",
        reason: "dirty",
      });
      continue;
    }

    const baseDefault = getCurrentBranch(wt.projectPath);
    const baseInput = await p.text({
      message: "Base branch?",
      initialValue: baseDefault,
      validate: (v) => {
        if (!v?.trim()) return "Base branch cannot be empty";
      },
    });
    if (p.isCancel(baseInput)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    const baseBranch = baseInput;

    const strategyInput = await p.select({
      message: "Strategy?",
      options: [
        { value: "rebase", label: "rebase" },
        { value: "merge", label: "merge" },
      ],
    });
    if (p.isCancel(strategyInput)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    const strategy = strategyInput as SyncStrategy;

    const fetchSpinner = p.spinner();
    fetchSpinner.start(`Fetching origin/${baseBranch} for ${wt.projectLabel}...`);
    try {
      fetchRemoteBranch(baseBranch, wt.path);
      fetchSpinner.stop(`Fetched origin/${baseBranch} for ${wt.projectLabel}`);
    } catch (e) {
      fetchSpinner.stop(`${pc.red("✗")} Failed to fetch origin/${baseBranch} for ${wt.projectLabel}`);
      const msg = e instanceof Error ? e.message : String(e);
      p.log.error(msg);
      results.push({
        alias: wt.alias,
        label: wt.projectLabel,
        worktreePath: wt.path,
        baseBranch,
        strategy,
        status: "failed",
        reason: msg,
      });
      continue;
    }

    const opSpinner = p.spinner();
    opSpinner.start(`Running ${strategy} against origin/${baseBranch}...`);
    const ref = `origin/${baseBranch}`;
    const opResult = strategy === "rebase" ? rebaseOnto(ref, wt.path) : mergeFrom(ref, wt.path);

    if (opResult.ok) {
      opSpinner.stop(`${pc.green("✓")} ${strategy} succeeded for ${wt.projectLabel}`);
      results.push({
        alias: wt.alias,
        label: wt.projectLabel,
        worktreePath: wt.path,
        baseBranch,
        strategy,
        status: "synced",
      });
    } else if (opResult.conflict) {
      opSpinner.stop(`${pc.yellow("!")} ${strategy} conflict in ${wt.projectLabel} (aborted)`);
      p.log.warning(`Resolve manually: ${pc.cyan(`cd ${wt.path} && git ${strategy} ${ref}`)}`);
      results.push({
        alias: wt.alias,
        label: wt.projectLabel,
        worktreePath: wt.path,
        baseBranch,
        strategy,
        status: "conflict",
      });
    } else {
      opSpinner.stop(`${pc.red("✗")} ${strategy} failed for ${wt.projectLabel}`);
      p.log.error(opResult.message ?? "unknown failure");
      results.push({
        alias: wt.alias,
        label: wt.projectLabel,
        worktreePath: wt.path,
        baseBranch,
        strategy,
        status: "failed",
        reason: opResult.message,
      });
    }
  }

  // Post-sync new branch step.
  const synced = results.filter((r) => r.status === "synced");
  let newBranch: { name: string; createdIn: string[] } | undefined;

  if (synced.length > 0) {
    const wantNew = await p.confirm({
      message: "Create a new branch from the just-fetched base?",
      initialValue: false,
    });
    if (p.isCancel(wantNew)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (wantNew) {
      const defaultName = generateBranchName(basename(workspace.workspaceDir));
      const nameInput = await p.text({
        message: "Branch name?",
        initialValue: defaultName,
        validate: (v) => {
          if (!v?.trim()) return "Branch name cannot be empty";
        },
      });
      if (p.isCancel(nameInput)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      const branchName = nameInput;

      const createSpinner = p.spinner();
      createSpinner.start(`Creating ${branchName} in ${synced.length} worktree${synced.length !== 1 ? "s" : ""}...`);
      const createdIn: string[] = [];
      const failures: { alias: string; message: string }[] = [];
      for (const r of synced) {
        const out = createNewBranchInWorktree({
          worktreePath: r.worktreePath,
          alias: r.alias,
          branch: branchName,
          baseBranch: r.baseBranch,
        });
        if (out.ok) createdIn.push(out.alias);
        else failures.push({ alias: out.alias, message: out.message ?? "unknown failure" });
      }
      if (failures.length === 0) {
        createSpinner.stop(`${pc.green("✓")} Created ${branchName} in ${createdIn.length} worktree${createdIn.length !== 1 ? "s" : ""}`);
      } else {
        createSpinner.stop(`${pc.yellow("!")} Created ${branchName} in ${createdIn.length}/${synced.length}`);
        for (const f of failures) {
          p.log.error(`  ${f.alias}: ${f.message}`);
        }
      }
      newBranch = { name: branchName, createdIn };
    }
  }

  const counts = summarize(results);
  const newBranchTail = newBranch ? ` · new branch in ${newBranch.createdIn.length}` : "";
  p.outro(
    `Synced ${counts.synced} · skipped ${counts.skipped} · conflicts ${counts.conflict} · failed ${counts.failed}${newBranchTail}`,
  );
}
