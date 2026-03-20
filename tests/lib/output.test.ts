import { describe, it, expect, beforeEach } from "bun:test";
import { formatSuccess, formatError, setJsonMode, isJsonMode } from "../../src/lib/output.ts";

describe("output", () => {
  beforeEach(() => {
    setJsonMode(false);
  });

  describe("formatSuccess", () => {
    it("returns JSON string when json mode is on", () => {
      setJsonMode(true);
      const result = formatSuccess("Done!", { worktrees: ["a", "b"] });
      expect(JSON.parse(result)).toEqual({ success: true, data: { worktrees: ["a", "b"] } });
    });

    it("returns plain message when json mode is off", () => {
      const result = formatSuccess("All good");
      expect(result).toBe("All good");
    });

    it("returns plain message even when data is provided", () => {
      const result = formatSuccess("Done!", { worktrees: ["a"] });
      expect(result).toBe("Done!");
    });
  });

  describe("formatError", () => {
    it("returns JSON string with code when json mode is on", () => {
      setJsonMode(true);
      const result = formatError("Not found", 1);
      expect(JSON.parse(result)).toEqual({ success: false, error: "Not found", code: 1 });
    });

    it("returns plain error string when json mode is off", () => {
      const result = formatError("Not found", 1);
      expect(result).toBe("Error: Not found");
    });

    it("uses exit code 2 for operation errors", () => {
      setJsonMode(true);
      const result = formatError("Git failed", 2);
      expect(JSON.parse(result)).toEqual({ success: false, error: "Git failed", code: 2 });
    });
  });

  describe("isJsonMode", () => {
    it("returns false by default", () => {
      expect(isJsonMode()).toBe(false);
    });

    it("returns true after setJsonMode(true)", () => {
      setJsonMode(true);
      expect(isJsonMode()).toBe(true);
    });
  });
});
