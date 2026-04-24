import { describe, it, expect } from "bun:test";
import { findWorkspace, type WorkspaceEntry } from "../../src/lib/cleanup.ts";

const fixtures: WorkspaceEntry[] = [
  {
    workspaceDir: "/Users/me/features/login",
    worktrees: [
      { alias: "api", projectLabel: "API", projectPath: "/repos/api", path: "/Users/me/features/login/api", branch: "feat/login", locked: false },
    ],
  },
  {
    workspaceDir: "/Users/me/work/login",
    worktrees: [
      { alias: "api", projectLabel: "API", projectPath: "/repos/api", path: "/Users/me/work/login/api", branch: "feat/x", locked: false },
    ],
  },
  {
    workspaceDir: "/Users/me/features/billing",
    worktrees: [
      { alias: "api", projectLabel: "API", projectPath: "/repos/api", path: "/Users/me/features/billing/api", branch: "feat/billing", locked: false },
    ],
  },
];

describe("findWorkspace", () => {
  it("matches by exact name and returns all matches", () => {
    const result = findWorkspace({ name: "login" }, fixtures);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.workspaceDir).sort()).toEqual([
      "/Users/me/features/login",
      "/Users/me/work/login",
    ]);
  });

  it("returns empty array when name does not match", () => {
    const result = findWorkspace({ name: "nonexistent" }, fixtures);
    expect(result).toEqual([]);
  });

  it("does not match by prefix or substring", () => {
    // "log" should NOT match "login"
    const result = findWorkspace({ name: "log" }, fixtures);
    expect(result).toEqual([]);
  });

  it("matches by absolute dir path", () => {
    const result = findWorkspace({ dir: "/Users/me/features/login" }, fixtures);
    expect(result).toHaveLength(1);
    expect(result[0]?.workspaceDir).toBe("/Users/me/features/login");
  });

  it("returns empty array when dir does not match any workspace", () => {
    const result = findWorkspace({ dir: "/tmp/nowhere" }, fixtures);
    expect(result).toEqual([]);
  });
});
