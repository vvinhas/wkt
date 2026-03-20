import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { executeConfig } from "../../src/commands/config.ts";
import { addProject, removeProject } from "../../src/lib/config.ts";

describe("executeConfig", () => {
  const testAlias = "__test_config__";

  beforeEach(() => {
    addProject(testAlias, { path: "/tmp/test", label: "Test", startCommands: [] });
  });

  afterEach(() => {
    try { removeProject(testAlias); } catch {}
  });

  it("throws when alias does not exist", () => {
    expect(() => executeConfig({ alias: "nonexistent" })).toThrow("not found");
  });

  it("throws when neither label nor startCommands provided", () => {
    expect(() => executeConfig({ alias: testAlias })).toThrow("At least one");
  });

  it("updates label when provided", () => {
    const result = executeConfig({ alias: testAlias, label: "New Label" });
    expect(result).toBe("New Label");
  });

  it("updates startCommands when provided", () => {
    const result = executeConfig({ alias: testAlias, startCommands: ["npm install"] });
    expect(result).toBe("Test");
  });
});
