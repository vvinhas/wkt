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

/** Throws if `projectPath` doesn't exist (programmer error / config drift).
 *  Returns a result for normal operational failures (dirty / fetch error / conflict). */
export function executeSync(input: SyncProjectInput): SyncProjectResult {
  if (!existsSync(input.projectPath)) {
    throw new Error(`Project path not found: ${input.projectPath}`);
  }

  const base = {
    alias: input.alias,
    label: input.label,
    worktreePath: input.worktreePath,
    baseBranch: input.baseBranch,
    strategy: input.strategy,
  };

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

async function runInteractive(_inputs: { dir: string }): Promise<void> {
  // Implemented in Task 9.
  throw new Error("interactive sync not yet implemented");
}
