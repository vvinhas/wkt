import { describe, it, expect } from "bun:test";
import { executeSync } from "../../src/commands/sync.ts";

describe("executeSync", () => {
  it("returns skipped with reason 'repo missing' when projectPath does not exist on disk", () => {
    const result = executeSync({
      worktreePath: "/tmp/wkt-sync-test/worktree",
      projectPath: "/tmp/wkt-sync-test/missing-project-path",
      alias: "api",
      label: "API",
      baseBranch: "main",
      strategy: "rebase",
    });
    expect(result).toEqual({
      alias: "api",
      label: "API",
      worktreePath: "/tmp/wkt-sync-test/worktree",
      baseBranch: "main",
      strategy: "rebase",
      status: "skipped",
      reason: "repo missing",
    });
  });
});
