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
export function executeSync(_input: SyncProjectInput): SyncProjectResult {
  throw new Error("not implemented");
}
