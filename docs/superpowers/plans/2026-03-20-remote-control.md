# Remote Control Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-interactive flag-driven CLI support to all `wkt` commands so AI agents and automation scripts can drive the tool without keyboard input.

**Architecture:** Each command gains a branching point: if CLI flags are detected, inputs are parsed from flags via a shared `parseFlags` utility; otherwise the existing `@clack/prompts` interactive flow runs. Both paths produce the same inputs object, which feeds into shared execution logic. Output is handled by a utility that switches between plain text and JSON based on `--json`.

**Tech Stack:** Bun, TypeScript, no new dependencies

**Spec:** `docs/superpowers/specs/2026-03-20-remote-control-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/flags.ts` | Create | `parseFlags` utility — schema-based argv parsing |
| `src/lib/output.ts` | Create | `output` utility — JSON vs plain text formatting |
| `tests/lib/flags.test.ts` | Create | Tests for flag parsing |
| `tests/lib/output.test.ts` | Create | Tests for output formatting |
| `tests/commands/add.test.ts` | Create | Tests for `wkt add` flag-driven path |
| `tests/commands/remove.test.ts` | Create | Tests for `wkt remove` flag-driven path |
| `tests/commands/use.test.ts` | Create | Tests for `wkt use` flag-driven path |
| `tests/commands/config.test.ts` | Create | Tests for `wkt config` flag-driven path |
| `tests/commands/list.test.ts` | Create | Tests for `wkt list` flag-driven path |
| `src/commands/add.ts` | Modify | Refactor into input-gathering + execution; add flag path |
| `src/commands/remove.ts` | Modify | Refactor into input-gathering + execution; add flag path |
| `src/commands/use.ts` | Modify | Refactor into input-gathering + execution; add flag path |
| `src/commands/config.ts` | Modify | Refactor into input-gathering + execution; add flag path |
| `src/commands/list.ts` | Modify | Refactor into input-gathering + execution; add flag path |
| `src/commands/help.ts` | Modify | Add flag documentation to help output |
| `src/index.ts` | Modify | Extract `--json` from argv, pass to output module |

---

## Chunk 1: Foundation (flags.ts, output.ts, index.ts)

### Task 1: `parseFlags` utility

**Files:**
- Create: `src/lib/flags.ts`
- Create: `tests/lib/flags.test.ts`

- [ ] **Step 1: Write failing tests for `parseFlags`**

Create `tests/lib/flags.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/lib/flags.test.ts`
Expected: FAIL — module `src/lib/flags.ts` does not exist

- [ ] **Step 3: Implement `parseFlags` and `hasFlags`**

Create `src/lib/flags.ts`:

```typescript
export interface FlagSchema {
  name: string;
  type: "string" | "boolean" | "string[]";
  required: boolean;
}

export type ParsedFlags = Record<string, string | boolean | string[] | undefined>;

const IGNORED_FLAGS = new Set(["--json", "--help"]);

export function parseFlags(argv: string[], schema: FlagSchema[]): ParsedFlags {
  const result: ParsedFlags = {};
  const schemaMap = new Map(schema.map((s) => [s.name, s]));

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (IGNORED_FLAGS.has(arg)) {
      i++;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const eqIdx = arg.indexOf("=");
    let key: string;
    let inlineValue: string | undefined;

    if (eqIdx !== -1) {
      key = arg.slice(2, eqIdx);
      inlineValue = arg.slice(eqIdx + 1);
    } else {
      key = arg.slice(2);
    }

    const def = schemaMap.get(key);
    if (!def) throw new Error(`Unknown flag: --${key}`);

    if (def.type === "boolean") {
      result[key] = true;
      i++;
    } else {
      let value: string;
      if (inlineValue !== undefined) {
        value = inlineValue;
        i++;
      } else {
        i++;
        const next = argv[i];
        if (next === undefined || next.startsWith("--")) {
          throw new Error(`Flag --${key} requires a value`);
        }
        value = next;
        i++;
      }

      if (def.type === "string[]") {
        result[key] = value.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        result[key] = value;
      }
    }
  }

  // Check required flags
  for (const def of schema) {
    if (result[def.name] === undefined) {
      if (def.required) throw new Error(`Missing required flag: --${def.name}`);
      if (def.type === "boolean") result[def.name] = false;
      // string and string[] remain undefined when absent
    }
  }

  return result;
}

export function hasFlags(argv: string[]): boolean {
  return argv.some((a) => a.startsWith("--") && !IGNORED_FLAGS.has(a));
}
```

Key design notes:
- `--json` and `--help` are silently ignored inside `parseFlags`, so callers never need to filter them out
- Optional `string` and `string[]` flags remain `undefined` when absent (distinguishes "not provided" from "provided empty")
- No pre-increment side effects — loop index is advanced explicitly

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/lib/flags.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/flags.ts tests/lib/flags.test.ts
git commit -m "feat: add parseFlags and hasFlags utilities"
```

---

### Task 2: Output utility

**Files:**
- Create: `src/lib/output.ts`
- Create: `tests/lib/output.test.ts`

- [ ] **Step 1: Write failing tests for output utility**

Create `tests/lib/output.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/lib/output.test.ts`
Expected: FAIL — module `src/lib/output.ts` does not exist

- [ ] **Step 3: Implement output utility**

Create `src/lib/output.ts`:

```typescript
let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function formatSuccess(message: string, data?: Record<string, unknown>): string {
  if (jsonMode) {
    return JSON.stringify({ success: true, data: data ?? {} });
  }
  return message;
}

export function formatError(message: string, code: number): string {
  if (jsonMode) {
    return JSON.stringify({ success: false, error: message, code });
  }
  return `Error: ${message}`;
}
```

Key design notes:
- `formatSuccess` always takes a human-readable `message` as first arg, with optional `data` for JSON mode
- No `process.exit` in this module — commands handle exit at their top level
- `formatError` is a pure formatter; callers decide whether to exit and with what code

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/lib/output.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/output.ts tests/lib/output.test.ts
git commit -m "feat: add output formatting utility"
```

---

### Task 3: Wire `--json` detection in `index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update `src/index.ts` to detect `--json` and set output mode**

```typescript
import { add } from "./commands/add.ts";
import { remove } from "./commands/remove.ts";
import { use } from "./commands/use.ts";
import { config } from "./commands/config.ts";
import { list } from "./commands/list.ts";
import { help } from "./commands/help.ts";
import { setJsonMode } from "./lib/output.ts";

if (process.argv.includes("--json")) {
  setJsonMode(true);
}

const command = process.argv[2];

switch (command) {
  case "add":
    await add();
    break;
  case "remove":
    await remove();
    break;
  case "use":
    await use();
    break;
  case "config":
    await config();
    break;
  case "list":
    await list();
    break;
  case "help":
  case "--help":
  case "-h":
    help();
    break;
  default:
    if (command) {
      console.error(`Unknown command: ${command}\n`);
    }
    help();
    break;
}
```

- [ ] **Step 2: Verify no regressions**

Run: `bun run src/index.ts help`
Expected: Help text prints normally

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire --json detection in CLI entry point"
```

---

## Chunk 2: Command Refactors (add, remove, config, list, use)

Each command is refactored to:
1. Extract shared execution logic into an `execute*` function that takes a typed inputs object
2. Add a flag-driven input path using `hasFlags` + `parseFlags`
3. Keep the existing interactive flow, but have it call the same `execute*` function
4. Handle errors at the top level with proper exit codes (1 = input error, 2 = operation error)

### Task 4: Refactor `wkt add` for flag-driven mode

**Files:**
- Modify: `src/commands/add.ts`
- Create: `tests/commands/add.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/add.test.ts`:

```typescript
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
    // This will still fail (not a git repo) but should NOT fail on alias validation
    expect(() =>
      executeAdd({ alias: "my-app_1", label: "Test", path: "/tmp", startCommands: [] })
    ).toThrow("Not a git repository");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/commands/add.test.ts`
Expected: FAIL — `executeAdd` is not exported

- [ ] **Step 3: Refactor `src/commands/add.ts`**

```typescript
import * as p from "@clack/prompts";
import pc from "picocolors";
import { isGitRepo, getRepoRoot, getRemoteName } from "../lib/git.ts";
import { addProject, findProjectByPath } from "../lib/config.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError, isJsonMode } from "../lib/output.ts";

interface AddInputs {
  alias: string;
  label: string;
  path: string;
  startCommands: string[];
}

const flagSchema: FlagSchema[] = [
  { name: "alias", type: "string", required: true },
  { name: "label", type: "string", required: true },
  { name: "path", type: "string", required: false },
  { name: "start-cmds", type: "string[]", required: false },
];

export function executeAdd(inputs: AddInputs): void {
  const { alias, label, path, startCommands } = inputs;

  if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
    throw new Error("Alias contains invalid characters. Only letters, numbers, hyphens, and underscores allowed.");
  }

  if (!isGitRepo(path)) {
    throw new Error(`Not a git repository: ${path}`);
  }

  const repoRoot = getRepoRoot(path);

  const existing = findProjectByPath(repoRoot);
  if (existing) {
    throw new Error(`Repo already registered as "${existing.alias}" (${existing.project.label}).`);
  }

  addProject(alias, { path: repoRoot, label, startCommands });
}

export async function add() {
  const argv = process.argv.slice(3);

  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const inputs: AddInputs = {
        alias: flags.alias as string,
        label: flags.label as string,
        path: (flags.path as string) ?? process.cwd(),
        startCommands: (flags["start-cmds"] as string[]) ?? [],
      };
      executeAdd(inputs);
      console.log(formatSuccess(`Project "${inputs.label}" added as ${inputs.alias}`, {
        alias: inputs.alias,
        label: inputs.label,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(formatError(msg, 1));
      process.exit(1);
    }
    return;
  }

  // Interactive flow
  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Add Project`);

  const cwd = process.cwd();

  if (!isGitRepo()) {
    p.cancel("Not a git repository. Run this from inside a git repo.");
    process.exit(1);
  }

  const repoRoot = getRepoRoot();

  const existingCheck = findProjectByPath(repoRoot);
  if (existingCheck) {
    p.cancel(`This repo is already registered as "${existingCheck.alias}" (${existingCheck.project.label}).`);
    process.exit(1);
  }

  let defaultName: string;
  try {
    defaultName = getRemoteName();
  } catch {
    p.cancel("No 'origin' remote found. Add one with: git remote add origin <url>");
    process.exit(1);
  }

  p.log.info(`Detected: ${pc.bold(defaultName)} (${pc.dim(repoRoot)})`);

  const label = await p.text({
    message: "What should we call this project?",
    initialValue: defaultName,
    validate: (v) => {
      if (!v?.trim()) return "Label cannot be empty";
    },
  });
  if (p.isCancel(label)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const alias = await p.text({
    message: "Alias (used as folder name in worktrees)?",
    initialValue: defaultName,
    validate: (v) => {
      if (!v?.trim()) return "Alias cannot be empty";
      if (/[^a-zA-Z0-9_-]/.test(v!)) return "Only letters, numbers, hyphens, and underscores";
    },
  });
  if (p.isCancel(alias)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const cmdsInput = await p.text({
    message: "Commands to run when creating a worktree (comma-separated, blank to skip):",
    initialValue: "",
    placeholder: "e.g. npm install, npm run build",
  });
  if (p.isCancel(cmdsInput)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const startCommands = cmdsInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Both paths use executeAdd for the actual operation
  executeAdd({ alias, label, path: repoRoot, startCommands });

  p.outro(`${pc.green("✓")} Project "${pc.bold(label)}" added as ${pc.dim(alias)}`);
}
```

Key design notes:
- Both interactive and flag paths call `executeAdd()` — no logic duplication
- Interactive path pre-validates for UX but `executeAdd` is the single source of truth
- `process.exit` only at the command's top level, never in utilities

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/commands/add.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/add.ts tests/commands/add.test.ts
git commit -m "feat: add flag-driven mode to wkt add"
```

---

### Task 5: Refactor `wkt remove` for flag-driven mode

**Files:**
- Modify: `src/commands/remove.ts`
- Create: `tests/commands/remove.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/commands/remove.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { executeRemove } from "../../src/commands/remove.ts";

describe("executeRemove", () => {
  it("throws when alias does not exist", () => {
    expect(() => executeRemove({ alias: "nonexistent" })).toThrow("not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/commands/remove.test.ts`
Expected: FAIL — `executeRemove` is not exported

- [ ] **Step 3: Refactor `src/commands/remove.ts`**

```typescript
import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig, removeProject } from "../lib/config.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

interface RemoveInputs {
  alias: string;
}

const flagSchema: FlagSchema[] = [
  { name: "alias", type: "string", required: true },
];

export function executeRemove(inputs: RemoveInputs): string {
  const config = loadConfig();
  const project = config.projects[inputs.alias];
  if (!project) {
    throw new Error(`Project "${inputs.alias}" not found.`);
  }
  removeProject(inputs.alias);
  return project.label;
}

export async function remove() {
  const argv = process.argv.slice(3);

  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const label = executeRemove({ alias: flags.alias as string });
      console.log(formatSuccess(`Removed "${label}"`, { alias: flags.alias as string, label }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(formatError(msg, 1));
      process.exit(1);
    }
    return;
  }

  // Interactive flow
  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Remove Project`);

  const config = loadConfig();
  const entries = Object.entries(config.projects);

  if (entries.length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const alias = await p.select({
    message: "Which project do you want to remove?",
    options: entries.map(([key, proj]) => ({
      value: key,
      label: `${proj.label} (${key})`,
    })),
  });
  if (p.isCancel(alias)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const project = config.projects[alias];

  const confirmed = await p.confirm({
    message: `Remove "${project?.label}"? This won't delete the repo or any worktrees.`,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const label = executeRemove({ alias });
  p.outro(`${pc.green("✓")} Removed "${pc.bold(label)}"`);
}
```

Key design notes:
- `--yes` flag removed from schema — flag mode always proceeds without confirmation (spec says it defaults to true)
- Both paths call `executeRemove`

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/commands/remove.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/remove.ts tests/commands/remove.test.ts
git commit -m "feat: add flag-driven mode to wkt remove"
```

---

### Task 6: Refactor `wkt config` for flag-driven mode

**Files:**
- Modify: `src/commands/config.ts`
- Create: `tests/commands/config.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/config.test.ts`:

```typescript
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
    expect(result).toBe("Test"); // returns the label
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/commands/config.test.ts`
Expected: FAIL — `executeConfig` is not exported

- [ ] **Step 3: Refactor `src/commands/config.ts`**

```typescript
import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig, updateProject } from "../lib/config.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

interface ConfigInputs {
  alias: string;
  label?: string;
  startCommands?: string[];
}

const flagSchema: FlagSchema[] = [
  { name: "alias", type: "string", required: true },
  { name: "label", type: "string", required: false },
  { name: "start-cmds", type: "string[]", required: false },
];

export function executeConfig(inputs: ConfigInputs): string {
  const cfg = loadConfig();
  const project = cfg.projects[inputs.alias];
  if (!project) {
    throw new Error(`Project "${inputs.alias}" not found.`);
  }

  if (inputs.label === undefined && inputs.startCommands === undefined) {
    throw new Error("At least one of --label or --start-cmds is required.");
  }

  const updates: Partial<typeof project> = {};
  if (inputs.label !== undefined) updates.label = inputs.label;
  if (inputs.startCommands !== undefined) updates.startCommands = inputs.startCommands;

  updateProject(inputs.alias, updates);
  return inputs.label ?? project.label;
}

export async function config() {
  const argv = process.argv.slice(3);

  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      // parseFlags leaves optional string[] as undefined when absent
      const resultLabel = executeConfig({
        alias: flags.alias as string,
        label: flags.label as string | undefined,
        startCommands: flags["start-cmds"] as string[] | undefined,
      });
      console.log(formatSuccess(`Updated "${resultLabel}"`));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(formatError(msg, 1));
      process.exit(1);
    }
    return;
  }

  // Interactive flow
  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Configure Project`);

  const cfg = loadConfig();
  const entries = Object.entries(cfg.projects);

  if (entries.length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const alias = await p.select({
    message: "Which project do you want to configure?",
    options: entries.map(([key, proj]) => ({
      value: key,
      label: `${proj.label} (${key})`,
    })),
  });
  if (p.isCancel(alias)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const project = cfg.projects[alias];
  if (!project) {
    p.cancel("Project not found.");
    process.exit(1);
  }

  const field = await p.select({
    message: "What do you want to update?",
    options: [
      { value: "label" as const, label: "Label" },
      { value: "startCommands" as const, label: "Start commands" },
    ],
  });
  if (p.isCancel(field)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  if (field === "label") {
    const newLabel = await p.text({
      message: "New label:",
      initialValue: project.label,
      validate: (v) => {
        if (!v?.trim()) return "Label cannot be empty";
      },
    });
    if (p.isCancel(newLabel)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    executeConfig({ alias, label: newLabel });
    p.outro(`${pc.green("✓")} Updated "${pc.bold(newLabel)}"`);
  } else {
    const cmdsInput = await p.text({
      message: "Commands to run when creating a worktree (comma-separated):",
      initialValue: project.startCommands.join(", "),
      placeholder: "e.g. npm install, npm run build",
    });
    if (p.isCancel(cmdsInput)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    const startCommands = cmdsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    executeConfig({ alias, startCommands });
    p.outro(`${pc.green("✓")} Updated "${pc.bold(project.label)}"`);
  }
}
```

Key design notes:
- `parseFlags` leaves absent `string[]` as `undefined` — no fragile `argv.some(startsWith)` hack needed
- Both paths call `executeConfig`
- Tests use real config operations with setup/teardown

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/commands/config.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/config.ts tests/commands/config.test.ts
git commit -m "feat: add flag-driven mode to wkt config"
```

---

### Task 7: Refactor `wkt list` for flag-driven mode

**Files:**
- Modify: `src/commands/list.ts`
- Create: `tests/commands/list.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/commands/list.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { executeList } from "../../src/commands/list.ts";

describe("executeList", () => {
  it("throws when alias does not exist", () => {
    expect(() => executeList({ alias: "nonexistent" })).toThrow("not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/commands/list.test.ts`
Expected: FAIL — `executeList` is not exported

- [ ] **Step 3: Refactor `src/commands/list.ts`**

```typescript
import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig } from "../lib/config.ts";
import { listWorktrees, removeWorktree } from "../lib/git.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

interface ListInputs {
  alias: string;
  removePath?: string;
}

interface ListResult {
  worktrees: { path: string; branch: string }[];
}

interface RemoveResult {
  removed: string;
}

const flagSchema: FlagSchema[] = [
  { name: "alias", type: "string", required: true },
  { name: "remove", type: "string", required: false },
  { name: "yes", type: "boolean", required: false },
];

export function executeList(inputs: ListInputs): ListResult | RemoveResult {
  const config = loadConfig();
  const project = config.projects[inputs.alias];
  if (!project) {
    throw new Error(`Project "${inputs.alias}" not found.`);
  }

  if (inputs.removePath) {
    removeWorktree(project.path, inputs.removePath);
    return { removed: inputs.removePath };
  }

  const worktrees = listWorktrees(project.path)
    .filter((wt) => !wt.isMain)
    .map((wt) => ({ path: wt.path, branch: wt.branch }));

  return { worktrees };
}

export async function list() {
  const argv = process.argv.slice(3);

  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const removePath = flags.remove as string | undefined;
      const result = executeList({ alias: flags.alias as string, removePath });

      if ("removed" in result) {
        console.log(formatSuccess(`Worktree removed: ${result.removed}`, result as Record<string, unknown>));
      } else {
        console.log(formatSuccess(
          result.worktrees.length > 0
            ? result.worktrees.map((wt) => `${wt.path} (${wt.branch})`).join("\n")
            : "No active worktrees.",
          result as Record<string, unknown>,
        ));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes("not found") ? 1 : 2;
      console.error(formatError(msg, code));
      process.exit(code);
    }
    return;
  }

  // Interactive flow
  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Worktrees`);

  const config = loadConfig();
  const entries = Object.entries(config.projects);

  if (entries.length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const alias = await p.select({
    message: "Which project?",
    options: entries.map(([key, proj]) => ({
      value: key,
      label: `${proj.label} (${key})`,
    })),
  });
  if (p.isCancel(alias)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const project = config.projects[alias];
  if (!project) {
    p.cancel("Project not found.");
    process.exit(1);
  }

  const worktrees = listWorktrees(project.path).filter((wt) => !wt.isMain);

  if (worktrees.length === 0) {
    p.outro(`No active worktrees for ${pc.bold(project.label)}.`);
    return;
  }

  p.log.info(`Active worktrees for ${pc.bold(project.label)}:\n`);
  for (const wt of worktrees) {
    p.log.message(`  ${pc.cyan(wt.path)}\n    Branch: ${pc.dim(wt.branch)}\n`);
  }

  const DONE = "__done__";

  const toRemove = await p.select({
    message: "Remove a worktree?",
    options: [
      ...worktrees.map((wt) => {
        const shortPath = wt.path.replace(/^.*\/\.\.\.\//, "");
        return {
          value: wt.path,
          label: `${shortPath} (${wt.branch})`,
        };
      }),
      { value: DONE, label: "No, I'm done" },
    ],
  });
  if (p.isCancel(toRemove)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  if (toRemove === DONE) {
    p.outro("Done");
    return;
  }

  const confirmed = await p.confirm({
    message: `Remove worktree at ${toRemove}?`,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const s = p.spinner();
  s.start("Removing worktree...");
  try {
    removeWorktree(project.path, toRemove);
    s.stop(`${pc.green("✓")} Worktree removed`);
  } catch (e) {
    s.stop(`${pc.red("✗")} Failed to remove worktree`);
    p.log.error(e instanceof Error ? e.message : String(e));
  }

  p.outro("Done");
}
```

Key design notes:
- Exit codes: 1 for "not found" (input error), 2 for operation errors
- Plain-text output provides human-readable messages for both list and remove results
- JSON output uses proper `data` schemas per spec

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/commands/list.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/list.ts tests/commands/list.test.ts
git commit -m "feat: add flag-driven mode to wkt list"
```

---

### Task 8: Refactor `wkt use` for flag-driven mode

**Files:**
- Modify: `src/commands/use.ts`
- Create: `tests/commands/use.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/commands/use.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/commands/use.test.ts`
Expected: FAIL — `executeUse` is not exported

- [ ] **Step 3: Refactor `src/commands/use.ts`**

```typescript
import * as p from "@clack/prompts";
import pc from "picocolors";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { execSync } from "node:child_process";
import { loadConfig } from "../lib/config.ts";
import { getCurrentBranch, fetchOrigin, createWorktree } from "../lib/git.ts";
import { generateBranchName } from "../lib/utils.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

interface UseInputs {
  projects: string[];
  branch: string;
  baseBranch?: string;
  fetch: boolean;
  runStartCmds: boolean;
  workspace: boolean;
  open: boolean;
}

interface WorktreeSetup {
  alias: string;
  label: string;
  repoPath: string;
  baseBranch: string;
  branchName: string;
  worktreePath: string;
  runStartCmds: boolean;
  startCommands: string[];
}

interface UseResult {
  created: { alias: string; label: string; path: string; branch: string }[];
  errors: string[];
}

const flagSchema: FlagSchema[] = [
  { name: "projects", type: "string[]", required: true },
  { name: "branch", type: "string", required: true },
  { name: "base-branch", type: "string", required: false },
  { name: "fetch", type: "boolean", required: false },
  { name: "run-start-cmds", type: "boolean", required: false },
  { name: "workspace", type: "boolean", required: false },
  { name: "open", type: "boolean", required: false },
];

export function executeUse(inputs: UseInputs): UseResult {
  const config = loadConfig();
  const cwd = process.cwd();
  const errors: string[] = [];
  const setups: WorktreeSetup[] = [];

  // --open implies --workspace
  const doWorkspace = inputs.workspace || inputs.open;

  // Validate and build setups
  for (const alias of inputs.projects) {
    const project = config.projects[alias];
    if (!project) {
      throw new Error(`Project "${alias}" not found in config.`);
    }

    if (!existsSync(project.path)) {
      errors.push(`${project.label}: repo path not found (${project.path})`);
      continue;
    }

    const baseBranch = inputs.baseBranch ?? getCurrentBranch(project.path);

    if (inputs.fetch) {
      try {
        fetchOrigin(project.path);
      } catch (e) {
        errors.push(`${project.label}: fetch failed — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    setups.push({
      alias,
      label: project.label,
      repoPath: project.path,
      baseBranch,
      branchName: inputs.branch,
      worktreePath: join(cwd, alias),
      runStartCmds: inputs.runStartCmds && project.startCommands.length > 0,
      startCommands: project.startCommands,
    });
  }

  // Create worktrees
  const created: UseResult["created"] = [];

  for (const setup of setups) {
    if (existsSync(setup.worktreePath)) {
      errors.push(`${setup.label}: directory already exists at ${setup.worktreePath}`);
      continue;
    }

    try {
      createWorktree(setup.repoPath, setup.worktreePath, setup.branchName, setup.baseBranch);
      created.push({ alias: setup.alias, label: setup.label, path: setup.worktreePath, branch: setup.branchName });
    } catch (e) {
      errors.push(`${setup.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Run start commands
  for (const setup of setups) {
    if (!setup.runStartCmds || setup.startCommands.length === 0) continue;
    if (!existsSync(setup.worktreePath)) continue;

    try {
      const shell = process.env.SHELL || "/bin/sh";
      const cmds = setup.startCommands.join(" && ");
      execSync(`${shell} -i -c '${cmds}'`, { cwd: setup.worktreePath, stdio: "pipe" });
    } catch (e) {
      errors.push(`${setup.label} (start commands): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // VS Code workspace
  if (doWorkspace && created.length > 0) {
    const dirName = basename(cwd);
    const workspaceFile = join(cwd, `${dirName}.code-workspace`);
    const workspaceExists = existsSync(workspaceFile);

    let workspace: { folders: { name: string; path: string }[]; settings: Record<string, unknown> };

    if (workspaceExists) {
      try {
        workspace = JSON.parse(readFileSync(workspaceFile, "utf-8"));
        if (!Array.isArray(workspace.folders)) workspace.folders = [];
      } catch {
        workspace = { folders: [], settings: {} };
      }
    } else {
      workspace = { folders: [], settings: {} };
    }

    const existingPaths = new Set(workspace.folders.map((f) => f.path));
    if (!existingPaths.has(".")) {
      workspace.folders.unshift({ name: "Root", path: "." });
    }

    for (const c of created) {
      if (!existingPaths.has(c.alias)) {
        workspace.folders.push({ name: c.label, path: c.alias });
      }
    }

    writeFileSync(workspaceFile, JSON.stringify(workspace, null, 2) + "\n");

    // Hide worktree folders from root's file explorer
    const vscodeDir = join(cwd, ".vscode");
    const settingsFile = join(vscodeDir, "settings.json");

    let settings: Record<string, unknown> = {};
    if (existsSync(settingsFile)) {
      try {
        settings = JSON.parse(readFileSync(settingsFile, "utf-8"));
      } catch {
        settings = {};
      }
    }

    const filesExclude = (settings["files.exclude"] ?? {}) as Record<string, boolean>;
    for (const c of created) {
      filesExclude[c.alias] = true;
    }
    settings["files.exclude"] = filesExclude;

    if (!existsSync(vscodeDir)) mkdirSync(vscodeDir);
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");

    if (inputs.open) {
      try {
        execSync(`code "${workspaceFile}"`, { stdio: "ignore" });
      } catch {
        errors.push("Could not open VS Code. You can open the workspace manually.");
      }
    }
  }

  if (created.length === 0 && errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  return { created, errors };
}

export async function use() {
  const argv = process.argv.slice(3);

  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const result = executeUse({
        projects: flags.projects as string[],
        branch: flags.branch as string,
        baseBranch: flags["base-branch"] as string | undefined,
        fetch: flags.fetch as boolean,
        runStartCmds: flags["run-start-cmds"] as boolean,
        workspace: flags.workspace as boolean,
        open: flags.open as boolean,
      });
      const msg = `${result.created.length} worktree(s) created`;
      console.log(formatSuccess(
        result.errors.length > 0 ? `${msg} (with ${result.errors.length} warning(s))` : msg,
        { created: result.created, errors: result.errors.length > 0 ? result.errors : undefined },
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(formatError(msg, 2));
      process.exit(2);
    }
    return;
  }

  // Interactive flow
  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Create Worktrees`);

  const config = loadConfig();
  const entries = Object.entries(config.projects);

  if (entries.length === 0) {
    p.cancel("No projects registered. Use `wkt add` to add one.");
    process.exit(1);
  }

  const selected = await p.multiselect({
    message: "Which projects do you need?",
    options: entries.map(([key, proj]) => ({
      value: key,
      label: `${proj.label} (${key})`,
    })),
    required: true,
  });
  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const cwd = process.cwd();
  const dirName = basename(cwd);
  const defaultBranch = generateBranchName(dirName);

  const setups: WorktreeSetup[] = [];
  let previousBranch = defaultBranch;

  for (const alias of selected) {
    const project = config.projects[alias];
    if (!project) continue;

    if (!existsSync(project.path)) {
      p.log.error(`${pc.bold(project.label)}: repo path not found (${project.path}). Skipping.`);
      continue;
    }

    p.log.step(`${pc.bold(`── Configuring: ${project.label} ──`)}`);

    const currentBranch = getCurrentBranch(project.path);

    const baseBranch = await p.text({
      message: "Base branch?",
      initialValue: currentBranch,
    });
    if (p.isCancel(baseBranch)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    const doFetch = await p.confirm({
      message: "Fetch latest from origin first?",
      initialValue: false,
    });
    if (p.isCancel(doFetch)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (doFetch) {
      const s = p.spinner();
      s.start(`Fetching origin for ${project.label}...`);
      try {
        fetchOrigin(project.path);
        s.stop(`Fetched origin for ${project.label}`);
      } catch (e) {
        s.stop(`Failed to fetch origin for ${project.label}`);
        p.log.warning(e instanceof Error ? e.message : String(e));
      }
    }

    const branchName = await p.text({
      message: "Branch name for the worktree?",
      initialValue: previousBranch,
      validate: (v) => {
        if (!v?.trim()) return "Branch name cannot be empty";
      },
    });
    if (p.isCancel(branchName)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    previousBranch = branchName;

    const worktreePath = join(cwd, alias);

    let runStartCmds = false;
    if (project.startCommands.length > 0) {
      const run = await p.confirm({
        message: `Run start commands? (${pc.dim(project.startCommands.join(", "))})`,
        initialValue: true,
      });
      if (p.isCancel(run)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      runStartCmds = run;
    }

    setups.push({
      alias,
      label: project.label,
      repoPath: project.path,
      baseBranch,
      branchName,
      worktreePath,
      runStartCmds,
      startCommands: project.startCommands,
    });
  }

  if (setups.length === 0) {
    p.cancel("No projects to set up.");
    process.exit(0);
  }

  // Create worktrees
  const errors: string[] = [];

  for (const setup of setups) {
    const s = p.spinner();
    s.start(`Creating worktree for ${setup.label}...`);

    if (existsSync(setup.worktreePath)) {
      s.stop(`${pc.red("✗")} ${setup.label}: target directory already exists (${setup.worktreePath})`);
      errors.push(`${setup.label}: directory already exists at ${setup.worktreePath}`);
      continue;
    }

    try {
      createWorktree(setup.repoPath, setup.worktreePath, setup.branchName, setup.baseBranch);
      s.stop(`${pc.green("✓")} Created worktree for ${setup.label}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      s.stop(`${pc.red("✗")} Failed to create worktree for ${setup.label}`);
      errors.push(`${setup.label}: ${msg}`);
    }
  }

  // Run start commands
  for (const setup of setups) {
    if (!setup.runStartCmds || setup.startCommands.length === 0) continue;
    if (!existsSync(setup.worktreePath)) continue;

    const s = p.spinner();
    const cmds = setup.startCommands.join(" && ");
    s.start(`Running start commands for ${setup.label}...`);
    try {
      const shell = process.env.SHELL || "/bin/sh";
      execSync(`${shell} -i -c '${cmds}'`, { cwd: setup.worktreePath, stdio: "pipe" });
      s.stop(`${pc.green("✓")} Start commands completed for ${setup.label}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      s.stop(`${pc.red("✗")} Start commands failed for ${setup.label}`);
      errors.push(`${setup.label} (start commands): ${msg}`);
    }
  }

  // Offer to create/update a VS Code workspace
  const createdSetups = setups.filter((s) => existsSync(s.worktreePath));

  if (createdSetups.length > 0) {
    const workspaceFile = join(cwd, `${dirName}.code-workspace`);
    const workspaceExists = existsSync(workspaceFile);

    const shouldUpdate = await p.confirm({
      message: workspaceExists
        ? `Update VS Code workspace with the new worktrees? (${pc.dim(workspaceFile)})`
        : "Create a VS Code workspace for these worktrees?",
      initialValue: false,
    });
    if (p.isCancel(shouldUpdate)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (shouldUpdate) {
      let workspace: { folders: { name: string; path: string }[]; settings: Record<string, unknown> };

      if (workspaceExists) {
        try {
          workspace = JSON.parse(readFileSync(workspaceFile, "utf-8"));
          if (!Array.isArray(workspace.folders)) workspace.folders = [];
        } catch {
          workspace = { folders: [], settings: {} };
        }
      } else {
        workspace = { folders: [], settings: {} };
      }

      const existingPaths = new Set(workspace.folders.map((f) => f.path));
      if (!existingPaths.has(".")) {
        workspace.folders.unshift({ name: "Root", path: "." });
      }

      for (const s of createdSetups) {
        if (!existingPaths.has(s.alias)) {
          workspace.folders.push({ name: s.label, path: s.alias });
        }
      }

      writeFileSync(workspaceFile, JSON.stringify(workspace, null, 2) + "\n");

      const vscodeDir = join(cwd, ".vscode");
      const settingsFile = join(vscodeDir, "settings.json");

      let settings: Record<string, unknown> = {};
      if (existsSync(settingsFile)) {
        try {
          settings = JSON.parse(readFileSync(settingsFile, "utf-8"));
        } catch {
          settings = {};
        }
      }

      const filesExclude = (settings["files.exclude"] ?? {}) as Record<string, boolean>;
      for (const s of createdSetups) {
        filesExclude[s.alias] = true;
      }
      settings["files.exclude"] = filesExclude;

      if (!existsSync(vscodeDir)) mkdirSync(vscodeDir);
      writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");

      p.log.success(`${workspaceExists ? "Updated" : "Created"} workspace: ${pc.dim(workspaceFile)}`);

      const openNow = await p.confirm({
        message: "Open it in VS Code now?",
        initialValue: true,
      });
      if (!p.isCancel(openNow) && openNow) {
        try {
          execSync(`code "${workspaceFile}"`, { stdio: "ignore" });
        } catch {
          p.log.warning("Could not open VS Code. You can open the workspace manually.");
        }
      }
    }
  }

  if (errors.length > 0) {
    p.log.warning("Some issues occurred:");
    for (const err of errors) {
      p.log.error(`  ${err}`);
    }
  }

  const created = createdSetups.length;
  p.outro(`Done! ${created} worktree${created !== 1 ? "s" : ""} created in ${pc.dim(cwd)}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/commands/use.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run all tests**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/commands/use.ts tests/commands/use.test.ts
git commit -m "feat: add flag-driven mode to wkt use"
```

---

## Chunk 3: Help Update and Final Verification

### Task 9: Update help output with flag documentation

**Files:**
- Modify: `src/commands/help.ts`

- [ ] **Step 1: Update `src/commands/help.ts`**

```typescript
import pc from "picocolors";

export function help() {
  console.log(`
${pc.bgCyan(pc.black(" wkt "))} Interactive Git Worktree Manager

${pc.bold("Usage:")} wkt <command> [flags]

${pc.bold("Commands:")}
  ${pc.cyan("add")}      Register current repo as a project
  ${pc.cyan("remove")}   Remove a saved project
  ${pc.cyan("use")}      Select projects, configure branches, create worktrees
  ${pc.cyan("config")}   Update a project's label or start commands
  ${pc.cyan("list")}     View or destroy worktrees for a project
  ${pc.cyan("help")}     Show this help message

${pc.bold("Getting started:")}
  1. ${pc.dim("cd")} into a git repo and run ${pc.cyan("wkt add")} to register it
  2. ${pc.dim("cd")} to your initiative directory and run ${pc.cyan("wkt use")}
  3. Use ${pc.cyan("wkt list")} to manage existing worktrees

${pc.bold("Non-interactive mode:")}
  Pass flags to skip interactive prompts (for scripts/agents).
  Add ${pc.cyan("--json")} for structured JSON output.

  ${pc.cyan("wkt add")}    --alias <name> --label <name> [--path <dir>] [--start-cmds <cmds>]
  ${pc.cyan("wkt remove")} --alias <name>
  ${pc.cyan("wkt use")}    --projects <a,b> --branch <name> [--base-branch <name>]
               [--fetch] [--run-start-cmds] [--workspace] [--open]
  ${pc.cyan("wkt config")} --alias <name> [--label <name>] [--start-cmds <cmds>]
  ${pc.cyan("wkt list")}   --alias <name> [--remove <path>] [--yes]
`);
}
```

- [ ] **Step 2: Verify help output**

Run: `bun run src/index.ts help`
Expected: Help text with the new "Non-interactive mode" section

- [ ] **Step 3: Commit**

```bash
git add src/commands/help.ts
git commit -m "feat: add flag documentation to help output"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 2: Smoke test interactive flow (manual)**

Run: `bun run src/index.ts add` (then cancel with Ctrl+C)
Expected: Interactive prompts still work as before

- [ ] **Step 3: Smoke test flag-driven error path**

Run: `bun run src/index.ts list --alias nonexistent --json`
Expected: `{"success":false,"error":"Project \"nonexistent\" not found.","code":1}`

- [ ] **Step 4: Smoke test flag-driven success path**

This requires a registered project. Use an existing one or temporarily register one:

```bash
# Register a temp project (run from inside a git repo)
cd /tmp && git init smoke-test-repo && cd smoke-test-repo
bun run /path/to/wkt/src/index.ts add --alias smoketest --label "Smoke Test"

# Verify JSON success output
bun run /path/to/wkt/src/index.ts list --alias smoketest --json
# Expected: {"success":true,"data":{"worktrees":[]}}

# Clean up
bun run /path/to/wkt/src/index.ts remove --alias smoketest --json
# Expected: {"success":true,"data":{"alias":"smoketest","label":"Smoke Test"}}

rm -rf /tmp/smoke-test-repo
```

- [ ] **Step 5: Commit any remaining changes**

```bash
git status
# If clean, nothing to commit. Otherwise commit remaining files.
```
