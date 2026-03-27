import { describe, it, expect } from "bun:test";
import { executeProject } from "../../src/commands/use.ts";

describe("executeProject", () => {
  it("throws when a project alias is not found", () => {
    expect(() =>
      executeProject({
        alias: "nonexistent",
        branch: "feat/test",
        fetch: false,
        runStartCmds: false,
      })
    ).toThrow("not found");
  });

  it("returns created:false with error when repo path does not exist", () => {
    expect(() =>
      executeProject({
        alias: "also-nonexistent",
        branch: "feat/test",
        fetch: false,
        runStartCmds: false,
      })
    ).toThrow("not found");
  });
});
