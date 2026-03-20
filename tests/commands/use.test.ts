import { describe, it, expect } from "bun:test";
import { executeUse } from "../../src/commands/use.ts";

describe("executeUse", () => {
  it("throws when a project alias is not found", () => {
    expect(() =>
      executeUse({
        projects: ["nonexistent"],
        branch: "feat/test",
        fetch: false,
        runStartCmds: false,
        workspace: false,
        open: false,
      })
    ).toThrow("not found");
  });
});
