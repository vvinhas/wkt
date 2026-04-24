import { describe, it, expect } from "bun:test";
import { executeCleanup } from "../../src/commands/cleanup.ts";

describe("executeCleanup", () => {
  it("throws when dir does not match any discovered workspace", () => {
    expect(() =>
      executeCleanup({
        dir: "/tmp/this-path-does-not-exist-in-wkt",
        force: false,
        deleteWorkspace: false,
      })
    ).toThrow("No worktrees found");
  });
});
