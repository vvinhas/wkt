import { describe, it, expect } from "bun:test";
import { parseFlags, hasFlags, type FlagSchema } from "../../src/lib/flags.ts";

describe("parseFlags", () => {
  const schema: FlagSchema[] = [
    { name: "alias", type: "string", required: true },
    { name: "label", type: "string", required: false },
    { name: "fetch", type: "boolean", required: false },
    { name: "projects", type: "string[]", required: false },
  ];

  it("parses --flag value syntax", () => {
    const result = parseFlags(["--alias", "myapp"], schema);
    expect(result.alias).toBe("myapp");
  });

  it("parses --flag=value syntax for string", () => {
    const result = parseFlags(["--alias=myapp"], schema);
    expect(result.alias).toBe("myapp");
  });

  it("parses --flag=value syntax for string[]", () => {
    const result = parseFlags(["--alias", "x", "--projects=server,client"], schema);
    expect(result.projects).toEqual(["server", "client"]);
  });

  it("parses boolean flags (presence = true)", () => {
    const result = parseFlags(["--alias", "x", "--fetch"], schema);
    expect(result.fetch).toBe(true);
  });

  it("defaults boolean flags to false when absent", () => {
    const result = parseFlags(["--alias", "x"], schema);
    expect(result.fetch).toBe(false);
  });

  it("parses comma-separated string[] values", () => {
    const result = parseFlags(["--alias", "x", "--projects", "server,client"], schema);
    expect(result.projects).toEqual(["server", "client"]);
  });

  it("returns undefined for absent optional string[] flags", () => {
    const result = parseFlags(["--alias", "x"], schema);
    expect(result.projects).toBeUndefined();
  });

  it("throws on missing required flag", () => {
    expect(() => parseFlags([], schema)).toThrow("Missing required flag: --alias");
  });

  it("throws on unknown flag", () => {
    expect(() => parseFlags(["--alias", "x", "--unknown", "y"], schema)).toThrow("Unknown flag: --unknown");
  });

  it("returns undefined for absent optional string flags", () => {
    const result = parseFlags(["--alias", "x"], schema);
    expect(result.label).toBeUndefined();
  });

  it("ignores --json and --help in argv", () => {
    const result = parseFlags(["--alias", "x", "--json", "--help"], schema);
    expect(result.alias).toBe("x");
  });

  it("throws when string flag value looks like another flag", () => {
    expect(() => parseFlags(["--alias", "--fetch"], schema)).toThrow("requires a value");
  });

  it("last value wins for duplicate flags", () => {
    const result = parseFlags(["--alias", "first", "--alias", "second"], schema);
    expect(result.alias).toBe("second");
  });
});

describe("hasFlags", () => {
  it("returns true when command-specific flags exist", () => {
    expect(hasFlags(["--alias", "x"])).toBe(true);
  });

  it("returns false for empty argv", () => {
    expect(hasFlags([])).toBe(false);
  });

  it("returns false when only --help is present", () => {
    expect(hasFlags(["--help"])).toBe(false);
  });

  it("returns false when only --json is present", () => {
    expect(hasFlags(["--json"])).toBe(false);
  });

  it("returns true when --json is present with other flags", () => {
    expect(hasFlags(["--json", "--alias", "x"])).toBe(true);
  });
});
