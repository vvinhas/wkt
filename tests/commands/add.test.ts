import { describe, it, expect } from "bun:test";
import { executeAdd } from "../../src/commands/add.ts";

describe("executeAdd", () => {
  it("rejects alias with invalid characters", () => {
    expect(() =>
      executeAdd({ url: "https://github.com/user/repo.git", alias: "my/app", label: "My App", startCommands: [] })
    ).toThrow("invalid characters");
  });

  it("accepts a valid alias format", () => {
    // Will fail on clone or similar, but should NOT fail on alias validation
    expect(() =>
      executeAdd({ url: "https://github.com/user/repo.git", alias: "my-app_1", label: "Test", startCommands: [] })
    ).not.toThrow("invalid characters");
  });
});
