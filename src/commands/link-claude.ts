import * as p from "@clack/prompts";
import pc from "picocolors";
import { resolve } from "node:path";
import {
  discoverWorkspaces,
  findWorkspace,
  type WorkspaceWorktree,
} from "../lib/workspace.ts";
import {
  bundlePlugin,
  detectClaudeAssets,
  ensureClaudeCliAvailable,
  installPlugin,
  registerMarketplaceIfMissing,
} from "../lib/claude-plugins.ts";
import {
  hasFlags,
  parseFlags,
  extractGlobalFlags,
  type FlagSchema,
  type GlobalFlagSchema,
} from "../lib/flags.ts";
import { formatError, formatSuccess, isJsonMode } from "../lib/output.ts";

export interface LinkResult {
  alias: string;
  status: "linked" | "skipped-no-assets" | "failed";
  detectedAssets: string[];
  error?: string;
}

function linkOne(workspacePath: string, wt: WorkspaceWorktree): LinkResult {
  const detected = detectClaudeAssets(wt.path);
  if (detected.length === 0) {
    return { alias: wt.alias, status: "skipped-no-assets", detectedAssets: [] };
  }
  try {
    bundlePlugin(workspacePath, wt.alias, wt.path);
    registerMarketplaceIfMissing(workspacePath);
    installPlugin(workspacePath, wt.alias);
    return { alias: wt.alias, status: "linked", detectedAssets: detected };
  } catch (e) {
    return {
      alias: wt.alias,
      status: "failed",
      detectedAssets: detected,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const globalSchema: GlobalFlagSchema[] = [
  { name: "dir", type: "string" },
];

const flagSchema: FlagSchema[] = [
  { name: "project", type: "string", required: false },
  { name: "all", type: "boolean", required: false },
];

export async function linkClaude(argv: string[] = []) {
  const { values: globals, rest } = extractGlobalFlags(argv, globalSchema);
  const dir = globals.dir as string | undefined;

  if (hasFlags(rest)) {
    try {
      const flags = parseFlags(rest, flagSchema);
      const project = flags.project as string | undefined;
      const all = (flags.all as boolean) ?? false;
      if (!project && !all) throw new Error("Provide --project <alias> or --all");
      if (project && all) throw new Error("--project and --all are mutually exclusive");

      ensureClaudeCliAvailable();

      const workspacePath = dir ? resolve(dir) : process.cwd();
      const matches = findWorkspace({ dir: workspacePath });
      if (matches.length === 0) {
        throw new Error(`No worktrees found in directory "${workspacePath}"`);
      }
      const workspace = matches[0]!;

      let targets: WorkspaceWorktree[];
      if (all) {
        targets = workspace.worktrees;
      } else {
        const target = workspace.worktrees.find((w) => w.alias === project);
        if (!target) throw new Error(`No worktree for project "${project}" in ${workspacePath}`);
        targets = [target];
      }

      const results = targets.map((wt) => linkOne(workspacePath, wt));
      const failed = results.filter((r) => r.status === "failed");
      console.log(
        formatSuccess(
          `Linked ${results.filter((r) => r.status === "linked").length} of ${results.length} worktree(s)`,
          { workspaceDir: workspacePath, results },
        ),
      );
      if (!isJsonMode()) {
        for (const r of results) {
          if (r.status === "linked") {
            console.log(`  ${pc.green("✓")} ${r.alias} (${r.detectedAssets.join(", ")})`);
          } else if (r.status === "skipped-no-assets") {
            console.log(`  ${pc.dim("·")} ${r.alias} (no .claude/ assets, skipped)`);
          } else {
            console.error(`  ${pc.red("✗")} ${r.alias}: ${r.error}`);
          }
        }
      }
      if (failed.length > 0) process.exit(2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(formatError(msg, 2));
      process.exit(2);
    }
    return;
  }

  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Link Claude Plugins`);

  try {
    ensureClaudeCliAvailable();
  } catch (e) {
    p.cancel(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const workspacePath = dir ? resolve(dir) : process.cwd();
  const matches = findWorkspace({ dir: workspacePath }, discoverWorkspaces());
  if (matches.length === 0) {
    p.cancel(`No wkt worktrees found in ${workspacePath}.`);
    process.exit(1);
  }
  const workspace = matches[0]!;

  if (workspace.worktrees.length === 0) {
    p.cancel("No worktrees to link.");
    process.exit(0);
  }

  const selected = await p.multiselect({
    message: "Which worktrees do you want to link?",
    options: workspace.worktrees.map((wt) => ({
      value: wt.alias,
      label: `${wt.projectLabel} (${wt.alias})`,
    })),
    required: true,
  });
  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  for (const alias of selected) {
    const wt = workspace.worktrees.find((w) => w.alias === alias);
    if (!wt) continue;
    const s = p.spinner();
    s.start(`Linking ${wt.projectLabel}...`);
    const result = linkOne(workspacePath, wt);
    if (result.status === "linked") {
      s.stop(`${pc.green("✓")} ${wt.projectLabel} (${result.detectedAssets.join(", ")})`);
    } else if (result.status === "skipped-no-assets") {
      s.stop(`${pc.dim("·")} ${wt.projectLabel} skipped (no .claude/ assets)`);
    } else {
      s.stop(`${pc.red("✗")} ${wt.projectLabel}: ${result.error}`);
    }
  }

  p.outro("Done");
}
