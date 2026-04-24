import * as p from "@clack/prompts";
import pc from "picocolors";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  getWorktreeStatus,
  pruneWorktrees,
  removeWorktree,
} from "../lib/git.ts";
import {
  discoverWorkspaces,
  findWorkspace,
  type WorkspaceEntry,
  type WorkspaceWorktree,
} from "../lib/cleanup.ts";
import {
  extractGlobalFlags,
  hasFlags,
  parseFlags,
  type FlagSchema,
  type GlobalFlagSchema,
} from "../lib/flags.ts";
import { formatError, formatSuccess } from "../lib/output.ts";

export interface CleanupInputs {
  dir: string;
  force: boolean;
  deleteWorkspace: boolean;
}

export interface RemovedWorktreeRecord {
  alias: string;
  path: string;
  branch: string;
  forced: boolean;
}

export interface CleanupResult {
  workspaceDir: string;
  removedWorktrees: RemovedWorktreeRecord[];
  workspaceDeleted: boolean;
}

type Classification = "clean" | "dirty" | "locked" | "missing";

interface ClassifiedWorktree {
  worktree: WorkspaceWorktree;
  classification: Classification;
  dirtyCount: number;
}

function classifyWorktrees(worktrees: WorkspaceWorktree[]): ClassifiedWorktree[] {
  return worktrees.map((wt) => {
    if (!existsSync(wt.path)) {
      return { worktree: wt, classification: "missing" as const, dirtyCount: 0 };
    }
    if (wt.locked) {
      return { worktree: wt, classification: "locked" as const, dirtyCount: 0 };
    }
    const status = getWorktreeStatus(wt.path);
    if (status.dirty) {
      return { worktree: wt, classification: "dirty" as const, dirtyCount: status.dirtyCount };
    }
    return { worktree: wt, classification: "clean" as const, dirtyCount: 0 };
  });
}

/**
 * Non-interactive core.
 * Throws for user/config errors (no match, dirty-without-force).
 * Throws for operation errors (git remove failures, fs failures).
 */
export function executeCleanup(inputs: CleanupInputs): CleanupResult {
  const absDir = resolve(inputs.dir);
  const matches = findWorkspace({ dir: absDir });

  if (matches.length === 0) {
    throw new Error(`No worktrees found in directory "${absDir}"`);
  }

  const workspace = matches[0]!;
  const classified = classifyWorktrees(workspace.worktrees);

  const unclean = classified.filter(
    (c) => c.classification === "dirty" || c.classification === "locked",
  );
  if (unclean.length > 0 && !inputs.force) {
    const list = unclean
      .map((c) => `${c.worktree.alias} (${c.classification})`)
      .join(", ");
    throw new Error(
      `Cannot remove dirty/locked worktrees: ${list}. Re-run with --force.`,
    );
  }

  const removed: RemovedWorktreeRecord[] = [];
  const projectsWithMissing = new Set<string>();

  for (const c of classified) {
    if (c.classification === "missing") {
      projectsWithMissing.add(c.worktree.projectPath);
      continue;
    }
    const forced = c.classification === "dirty" || c.classification === "locked";
    removeWorktree(c.worktree.projectPath, c.worktree.path, { force: forced });
    removed.push({
      alias: c.worktree.alias,
      path: c.worktree.path,
      branch: c.worktree.branch,
      forced,
    });
  }

  for (const projectPath of projectsWithMissing) {
    pruneWorktrees(projectPath);
  }

  let workspaceDeleted = false;
  if (inputs.deleteWorkspace) {
    if (existsSync(workspace.workspaceDir)) {
      rmSync(workspace.workspaceDir, { recursive: true, force: true });
    }
    workspaceDeleted = true;
  }

  return { workspaceDir: workspace.workspaceDir, removedWorktrees: removed, workspaceDeleted };
}
