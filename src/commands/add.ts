import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { cloneRepo, REPOS_DIR } from "../lib/git.ts";
import { addProject, findProjectByUrl } from "../lib/config.ts";
import { parseRepoNameFromUrl } from "../lib/utils.ts";
import { hasFlags, parseFlags, type FlagSchema } from "../lib/flags.ts";
import { formatSuccess, formatError } from "../lib/output.ts";

export interface AddInputs {
  url: string;
  alias: string;
  label: string;
  startCommands: string[];
}

const flagSchema: FlagSchema[] = [
  { name: "url", type: "string", required: true },
  { name: "alias", type: "string", required: false },
  { name: "label", type: "string", required: false },
  { name: "start-cmds", type: "string[]", required: false },
];

export function executeAdd(inputs: AddInputs): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(inputs.alias)) {
    throw new Error(`Alias "${inputs.alias}" contains invalid characters. Only letters, numbers, hyphens, and underscores are allowed.`);
  }

  const existing = findProjectByUrl(inputs.url);
  if (existing) {
    throw new Error(`This repo is already registered as "${existing.alias}" (${existing.project.label}).`);
  }

  const clonePath = join(REPOS_DIR, inputs.alias);

  if (existsSync(clonePath)) {
    throw new Error(`Directory already exists at ${clonePath}.`);
  }

  mkdirSync(REPOS_DIR, { recursive: true });

  try {
    cloneRepo(inputs.url, clonePath);
  } catch (e) {
    if (existsSync(clonePath)) {
      rmSync(clonePath, { recursive: true, force: true });
    }
    throw e;
  }

  addProject(inputs.alias, {
    path: clonePath,
    label: inputs.label,
    startCommands: inputs.startCommands,
    url: inputs.url,
  });
}

export async function add(argv: string[] = []) {
  if (hasFlags(argv)) {
    try {
      const flags = parseFlags(argv, flagSchema);
      const url = flags.url as string;
      const defaultName = parseRepoNameFromUrl(url);
      const inputs: AddInputs = {
        url,
        alias: (flags.alias as string) ?? defaultName,
        label: (flags.label as string) ?? defaultName,
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

  const url = await p.text({
    message: "Repository URL:",
    placeholder: "https://github.com/user/repo.git",
    validate: (v) => {
      if (!v?.trim()) return "URL cannot be empty";
      if (!/^https?:\/\/.+\/.+/.test(v) && !/^git@.+:.+\/.+/.test(v)) {
        return "Enter a valid git URL (HTTPS or SSH)";
      }
    },
  });
  if (p.isCancel(url)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const defaultName = parseRepoNameFromUrl(url);

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
    message: "Alias (used as folder name)?",
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

  const s = p.spinner();
  s.start("Cloning repository...");

  try {
    executeAdd({ url, alias, label, startCommands });
    s.stop("Repository cloned.");
  } catch (e) {
    s.stop("Clone failed.");
    const msg = e instanceof Error ? e.message : String(e);
    p.cancel(msg);
    process.exit(1);
  }

  p.outro(`${pc.green("✓")} Project "${pc.bold(label)}" added as ${pc.dim(alias)}`);
}
