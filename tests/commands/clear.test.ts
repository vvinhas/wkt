import { describe, it, expect } from "bun:test";
import { executeClear } from "../../src/commands/clear.ts";

describe("executeClear", () => {
  it("throws when alias does not exist", () => {
    expect(() => executeClear({ alias: "nonexistent", worktreePath: "/tmp/wt" })).toThrow("not found");
  });
});
