import { describe, it, expect } from "bun:test";
import { executeAdd } from "../../src/commands/add.ts";

describe("executeAdd", () => {
  it("rejects alias with invalid characters", () => {
    expect(() =>
      executeAdd({ alias: "my/app", label: "My App", path: "/tmp", startCommands: [] })
    ).toThrow("invalid characters");
  });

  it("rejects path that is not a git repo", () => {
    expect(() =>
      executeAdd({ alias: "myapp", label: "My App", path: "/tmp", startCommands: [] })
    ).toThrow("Not a git repository");
  });

  it("accepts a valid alias format", () => {
    // Will fail on "Not a git repo" but should NOT fail on alias validation
    expect(() =>
      executeAdd({ alias: "my-app_1", label: "Test", path: "/tmp", startCommands: [] })
    ).toThrow("Not a git repository");
  });
});
