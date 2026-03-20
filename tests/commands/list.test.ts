import { describe, it, expect } from "bun:test";
import { executeList } from "../../src/commands/list.ts";

describe("executeList", () => {
  it("throws when alias does not exist", () => {
    expect(() => executeList({ alias: "nonexistent" })).toThrow("not found");
  });
});
