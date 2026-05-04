import { existsSync } from "node:fs";
import {
  fetchRemoteBranch,
  getWorktreeStatus,
  mergeFrom,
  rebaseOnto,
} from "../lib/git.ts";

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
