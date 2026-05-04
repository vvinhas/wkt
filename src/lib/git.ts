import { exec, execFile } from "./utils.ts";
import { resolve, join } from "node:path";
import { WKT_DIR } from "./config.ts";

export const REPOS_DIR = join(WKT_DIR, "repos");

export function isGitRepo(cwd?: string): boolean {
  try {
    exec("git rev-parse --git-dir", cwd);
    return true;
  } catch {
    return false;
  }
}

export function getRepoRoot(cwd?: string): string {
  // --git-common-dir resolves to the main repo even inside worktrees
  const commonDir = exec("git rev-parse --git-common-dir", cwd);
  // commonDir is either absolute or relative to cwd
  const resolved = resolve(cwd ?? process.cwd(), commonDir);
  // commonDir points to the .git directory, parent is the repo root
  if (resolved.endsWith(".git")) {
    return resolve(resolved, "..");
  }
  // In some setups, --git-common-dir returns the .git dir path directly
  return resolve(resolved, "..");
}

export function getRemoteName(cwd?: string): string {
  const url = exec("git remote get-url origin", cwd);
  // Strip .git suffix and extract last path component
  const cleaned = url.replace(/\.git$/, "");
  const parts = cleaned.split("/");
  return parts[parts.length - 1] ?? "unknown";
}

export function getCurrentBranch(cwd?: string): string {
  try {
    return exec("git branch --show-current", cwd);
  } catch {
    return "HEAD";
  }
}

export function cloneRepo(url: string, targetDir: string): void {
  execFile("git", ["clone", url, targetDir]);
}

export function fetchOrigin(cwd?: string): void {
  execFile("git", ["fetch", "origin"], cwd);
}

export function pullBranch(branch: string, cwd?: string): void {
  const current = getCurrentBranch(cwd);
  if (current === branch) {
    execFile("git", ["pull", "--ff-only", "origin", branch], cwd);
  } else {
    execFile("git", ["fetch", "origin", `${branch}:${branch}`], cwd);
  }
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  locked: boolean;
}

export function listWorktrees(cwd?: string): WorktreeInfo[] {
  const output = exec("git worktree list --porcelain", cwd);
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};
  let isFirst = true;

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) {
        worktrees.push({ locked: false, ...current } as WorktreeInfo);
      }
      current = { path: line.slice("worktree ".length), isMain: isFirst, locked: false };
      isFirst = false;
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace("refs/heads/", "");
    } else if (line === "bare") {
      current.branch = "(bare)";
    } else if (line === "detached") {
      current.branch = "(detached)";
    } else if (line === "locked" || line.startsWith("locked ")) {
      current.locked = true;
    }
  }

  if (current.path) {
    worktrees.push({ locked: false, ...current } as WorktreeInfo);
  }

  return worktrees;
}

export function createWorktree(repoPath: string, worktreePath: string, branch: string, baseBranch: string): void {
  try {
    // Try creating with a new branch
    execFile("git", ["worktree", "add", "-b", branch, worktreePath, baseBranch], repoPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists")) {
      // Branch already exists, attach to it
      execFile("git", ["worktree", "add", worktreePath, branch], repoPath);
    } else {
      throw e;
    }
  }
}

export function removeWorktree(
  repoPath: string,
  worktreePath: string,
  opts?: { force?: boolean },
): void {
  const args = ["worktree", "remove"];
  if (opts?.force) args.push("--force");
  args.push(worktreePath);
  execFile("git", args, repoPath);
}

export function getWorktreeStatus(worktreePath: string): { dirty: boolean; dirtyCount: number } {
  try {
    const output = exec("git status --porcelain", worktreePath);
    if (output === "") return { dirty: false, dirtyCount: 0 };
    const dirtyCount = output.split("\n").filter((l) => l.length > 0).length;
    return { dirty: true, dirtyCount };
  } catch {
    // Path doesn't exist or isn't a git worktree.
    return { dirty: false, dirtyCount: 0 };
  }
}

export function pruneWorktrees(repoPath: string): void {
  execFile("git", ["worktree", "prune"], repoPath);
}

export interface IntegrationResult {
  ok: boolean;
  conflict: boolean;
  message?: string;
}

export function fetchRemoteBranch(branch: string, cwd: string): void {
  execFile("git", ["fetch", "origin", branch], cwd);
}

function hasUnmergedPaths(cwd: string): boolean {
  const status = exec("git status --porcelain", cwd);
  if (status === "") return false;
  return status.split("\n").some((line) => /^(UU|AA|DD|AU|UA|DU|UD) /.test(line));
}

export function rebaseOnto(ref: string, cwd: string): IntegrationResult {
  try {
    execFile("git", ["rebase", ref], cwd);
    return { ok: true, conflict: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (hasUnmergedPaths(cwd)) {
      try {
        execFile("git", ["rebase", "--abort"], cwd);
      } catch {
        // If abort fails the worktree may be in a bad state, but there is
        // nothing useful we can do here. The caller surfaces the conflict
        // status and the user can clean up manually.
      }
      return { ok: false, conflict: true };
    }
    return { ok: false, conflict: false, message: msg };
  }
}

export function mergeFrom(ref: string, cwd: string): IntegrationResult {
  try {
    execFile("git", ["merge", "--no-edit", ref], cwd);
    return { ok: true, conflict: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (hasUnmergedPaths(cwd)) {
      try {
        execFile("git", ["merge", "--abort"], cwd);
      } catch {
        // See note in rebaseOnto.
      }
      return { ok: false, conflict: true };
    }
    return { ok: false, conflict: false, message: msg };
  }
}
