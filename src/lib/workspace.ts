import { dirname, basename, resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { listWorktrees } from "./git.ts";

export interface WorkspaceWorktree {
  alias: string;
  projectLabel: string;
  projectPath: string;
  path: string;
  branch: string;
  locked: boolean;
}

export interface WorkspaceEntry {
  workspaceDir: string;
  worktrees: WorkspaceWorktree[];
}

/** Scans every project's worktrees, groups by parent directory. Sorted by workspaceDir for determinism. */
export function discoverWorkspaces(): WorkspaceEntry[] {
  const config = loadConfig();
  const byDir = new Map<string, WorkspaceWorktree[]>();

  for (const [alias, project] of Object.entries(config.projects)) {
    let worktrees;
    try {
      worktrees = listWorktrees(project.path);
    } catch {
      // Repo path missing or not a git repo — skip.
      continue;
    }
    for (const wt of worktrees) {
      if (wt.isMain) continue;
      const workspaceDir = dirname(wt.path);
      const entry: WorkspaceWorktree = {
        alias,
        projectLabel: project.label,
        projectPath: project.path,
        path: wt.path,
        branch: wt.branch,
        locked: wt.locked,
      };
      const existing = byDir.get(workspaceDir);
      if (existing) {
        existing.push(entry);
      } else {
        byDir.set(workspaceDir, [entry]);
      }
    }
  }

  return Array.from(byDir.entries())
    .map(([workspaceDir, worktrees]) => ({ workspaceDir, worktrees }))
    .sort((a, b) => a.workspaceDir.localeCompare(b.workspaceDir));
}

export type FindWorkspaceInput = { name: string } | { dir: string };

/** Returns workspaces matching the input. 0, 1, or many; callers decide how to handle. */
export function findWorkspace(
  input: FindWorkspaceInput,
  workspaces?: WorkspaceEntry[],
): WorkspaceEntry[] {
  const all = workspaces ?? discoverWorkspaces();
  if ("name" in input) {
    return all.filter((w) => basename(w.workspaceDir) === input.name);
  }
  const abs = resolve(input.dir);
  return all.filter((w) => w.workspaceDir === abs);
}
