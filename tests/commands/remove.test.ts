import { describe, it, expect } from "bun:test";
import { executeRemove } from "../../src/commands/remove.ts";

describe("executeRemove", () => {
  it("throws when alias does not exist", () => {
    expect(() => executeRemove({ alias: "nonexistent" })).toThrow("not found");
  });
});
