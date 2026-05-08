import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WKT_MARKETPLACE_NAME,
  PLUGIN_ASSET_DIRS,
  detectClaudeAssets,
  buildMarketplaceManifest,
  buildPluginManifest,
  addPluginToManifest,
  removePluginFromManifest,
  relativeAssetSymlinkTarget,
  type MarketplaceManifest,
  type PluginEntry,
} from "../../src/lib/claude-plugins.ts";

describe("constants", () => {
  it("exports the marketplace name", () => {
    expect(WKT_MARKETPLACE_NAME).toBe("wkt");
  });

  it("exports the four asset dir names in stable order", () => {
    expect(PLUGIN_ASSET_DIRS).toEqual(["agents", "skills", "commands", "hooks"]);
  });
});

describe("detectClaudeAssets", () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "wkt-claude-plugins-"));
    mkdirSync(join(tmp, "full", ".claude", "agents"), { recursive: true });
    mkdirSync(join(tmp, "full", ".claude", "skills"), { recursive: true });
    mkdirSync(join(tmp, "full", ".claude", "commands"), { recursive: true });
    mkdirSync(join(tmp, "full", ".claude", "hooks"), { recursive: true });
    mkdirSync(join(tmp, "partial", ".claude", "agents"), { recursive: true });
    mkdirSync(join(tmp, "partial", ".claude", "skills"), { recursive: true });
    mkdirSync(join(tmp, "no-claude"), { recursive: true });
    mkdirSync(join(tmp, "empty-claude", ".claude"), { recursive: true });
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns all four asset dirs when all exist", () => {
    expect(detectClaudeAssets(join(tmp, "full"))).toEqual(["agents", "skills", "commands", "hooks"]);
  });

  it("returns only the asset dirs that exist", () => {
    expect(detectClaudeAssets(join(tmp, "partial"))).toEqual(["agents", "skills"]);
  });

  it("returns an empty array when .claude/ is missing", () => {
    expect(detectClaudeAssets(join(tmp, "no-claude"))).toEqual([]);
  });

  it("returns an empty array when .claude/ exists but is empty", () => {
    expect(detectClaudeAssets(join(tmp, "empty-claude"))).toEqual([]);
  });

  it("returns an empty array when the worktree path itself does not exist", () => {
    expect(detectClaudeAssets(join(tmp, "does-not-exist"))).toEqual([]);
  });
});

describe("buildMarketplaceManifest", () => {
  it("produces the schema accepted by `claude plugin validate`", () => {
    const manifest = buildMarketplaceManifest([]);
    expect(manifest.name).toBe("wkt");
    expect(manifest.owner).toEqual({ name: "wkt" });
    expect(Array.isArray(manifest.plugins)).toBe(true);
    expect(manifest.plugins).toEqual([]);
  });

  it("includes the plugins array passed in", () => {
    const entry: PluginEntry = {
      name: "api",
      source: "./plugins/api",
      description: "api .claude assets (wkt worktree)",
      version: "0.0.1",
    };
    const manifest = buildMarketplaceManifest([entry]);
    expect(manifest.plugins).toEqual([entry]);
  });
});

describe("buildPluginManifest", () => {
  it("uses the alias as the plugin name and includes a wkt author", () => {
    const manifest = buildPluginManifest("server_pray");
    expect(manifest.name).toBe("server_pray");
    expect(manifest.version).toBe("0.0.1");
    expect(manifest.author).toEqual({ name: "wkt" });
    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(0);
  });
});

describe("addPluginToManifest", () => {
  const base: MarketplaceManifest = {
    name: "wkt",
    owner: { name: "wkt" },
    plugins: [],
  };
  const apiEntry: PluginEntry = {
    name: "api",
    source: "./plugins/api",
    description: "api .claude assets (wkt worktree)",
    version: "0.0.1",
  };
  const serverEntry: PluginEntry = {
    name: "server",
    source: "./plugins/server",
    description: "server .claude assets (wkt worktree)",
    version: "0.0.1",
  };

  it("appends a new entry to an empty manifest", () => {
    const result = addPluginToManifest(base, apiEntry);
    expect(result.plugins).toEqual([apiEntry]);
  });

  it("appends a new entry to a non-empty manifest preserving existing entries", () => {
    const m = { ...base, plugins: [apiEntry] };
    const result = addPluginToManifest(m, serverEntry);
    expect(result.plugins).toEqual([apiEntry, serverEntry]);
  });

  it("is idempotent when called twice with the same entry (no duplicate)", () => {
    const once = addPluginToManifest(base, apiEntry);
    const twice = addPluginToManifest(once, apiEntry);
    expect(twice.plugins).toEqual([apiEntry]);
  });

  it("does not mutate the input manifest", () => {
    const input = { ...base, plugins: [...base.plugins] };
    addPluginToManifest(input, apiEntry);
    expect(input.plugins).toEqual([]);
  });
});

describe("removePluginFromManifest", () => {
  const base: MarketplaceManifest = {
    name: "wkt",
    owner: { name: "wkt" },
    plugins: [
      { name: "api", source: "./plugins/api", description: "x", version: "0.0.1" },
      { name: "server", source: "./plugins/server", description: "y", version: "0.0.1" },
    ],
  };

  it("removes the matching entry by name", () => {
    const result = removePluginFromManifest(base, "api");
    expect(result.plugins.map((p) => p.name)).toEqual(["server"]);
  });

  it("returns an empty plugins array when removing the last entry", () => {
    const single: MarketplaceManifest = { ...base, plugins: [base.plugins[0]!] };
    const result = removePluginFromManifest(single, "api");
    expect(result.plugins).toEqual([]);
  });

  it("is a no-op when the name is not present", () => {
    const result = removePluginFromManifest(base, "nope");
    expect(result.plugins).toEqual(base.plugins);
  });

  it("does not mutate the input manifest", () => {
    const input: MarketplaceManifest = { ...base, plugins: [...base.plugins] };
    removePluginFromManifest(input, "api");
    expect(input.plugins.map((p) => p.name)).toEqual(["api", "server"]);
  });
});

describe("relativeAssetSymlinkTarget", () => {
  it("returns a path with five `..` segments and the alias plus .claude/<asset>", () => {
    expect(relativeAssetSymlinkTarget("api", "agents")).toBe("../../../../../api/.claude/agents");
  });

  it("works for each of the four asset dirs", () => {
    expect(relativeAssetSymlinkTarget("server_pray", "skills")).toBe(
      "../../../../../server_pray/.claude/skills",
    );
    expect(relativeAssetSymlinkTarget("server_pray", "commands")).toBe(
      "../../../../../server_pray/.claude/commands",
    );
    expect(relativeAssetSymlinkTarget("server_pray", "hooks")).toBe(
      "../../../../../server_pray/.claude/hooks",
    );
  });
});
