import { describe, it, expect } from "bun:test";
import { executeSync } from "../../src/commands/sync.ts";

describe("executeSync", () => {
  it("throws when projectPath does not exist on disk", () => {
    expect(() =>
      executeSync({
        worktreePath: "/tmp/wkt-sync-test/worktree",
        projectPath: "/tmp/wkt-sync-test/missing-project-path",
        alias: "api",
        label: "API",
        baseBranch: "main",
        strategy: "rebase",
      })
    ).toThrow("Project path not found");
  });
});
