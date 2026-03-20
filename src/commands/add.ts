import * as p from "@clack/prompts";
import pc from "picocolors";
import { isGitRepo, getRepoRoot, getRemoteName } from "../lib/git.ts";
import { addProject, findProjectByPath } from "../lib/config.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

export interface AddInputs {
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
  if (!/^[a-zA-Z0-9_-]+$/.test(inputs.alias)) {
    throw new Error(`Alias "${inputs.alias}" contains invalid characters. Only letters, numbers, hyphens, and underscores are allowed.`);
  }

  if (!isGitRepo(inputs.path)) {
    throw new Error("Not a git repository. The specified path is not inside a git repo.");
  }

  const repoRoot = getRepoRoot(inputs.path);

  const existing = findProjectByPath(repoRoot);
  if (existing) {
    throw new Error(`This repo is already registered as "${existing.alias}" (${existing.project.label}).`);
  }

  addProject(inputs.alias, { path: repoRoot, label: inputs.label, startCommands: inputs.startCommands });
}

export async function add(argv: string[] = []) {
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
        alias: inputs.alias, label: inputs.label,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(formatError(msg, 1));
      process.exit(1);
    }
    return;
  }

  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Add Project`);

  if (!isGitRepo()) {
    p.cancel("Not a git repository. Run this from inside a git repo.");
    process.exit(1);
  }

  const repoRoot = getRepoRoot();

  const existing = findProjectByPath(repoRoot);
  if (existing) {
    p.cancel(`This repo is already registered as "${existing.alias}" (${existing.project.label}).`);
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

  const inputs: AddInputs = { alias, label, path: repoRoot, startCommands };
  executeAdd(inputs);

  p.outro(`${pc.green("✓")} Project "${pc.bold(label)}" added as ${pc.dim(alias)}`);
}
