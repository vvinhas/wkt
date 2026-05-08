import * as p from "@clack/prompts";
import pc from "picocolors";
import { resolve } from "node:path";
import {
  discoverWorkspaces,
  findWorkspace,
  type WorkspaceWorktree,
} from "../lib/workspace.ts";
import {
  ensureClaudeCliAvailable,
  unbundlePlugin,
  uninstallPlugin,
  unregisterMarketplaceAndRemoveDir,
} from "../lib/claude-plugins.ts";
import {
  hasFlags,
  parseFlags,
  extractGlobalFlags,
  type FlagSchema,
  type GlobalFlagSchema,
} from "../lib/flags.ts";
import { formatError, formatSuccess, isJsonMode } from "../lib/output.ts";

export interface UnlinkResult {
  alias: string;
  status: "unlinked" | "failed";
  error?: string;
}

interface UnlinkBatchOutcome {
  results: UnlinkResult[];
  marketplaceEmpty: boolean;
}

function unlinkBatch(workspacePath: string, targets: WorkspaceWorktree[]): UnlinkBatchOutcome {
  const results: UnlinkResult[] = [];
  let marketplaceEmpty = false;
  for (const wt of targets) {
    try {
      uninstallPlugin(workspacePath, wt.alias);
    } catch (e) {
      // The plugin may not be installed; log as part of the unlink attempt but keep going to clean up the wrapper.
      results.push({
        alias: wt.alias,
        status: "failed",
        error: `uninstall: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    try {
      const { marketplaceEmpty: empty } = unbundlePlugin(workspacePath, wt.alias);
      if (empty) marketplaceEmpty = true;
      results.push({ alias: wt.alias, status: "unlinked" });
    } catch (e) {
      results.push({
        alias: wt.alias,
        status: "failed",
        error: `unbundle: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return { results, marketplaceEmpty };
}

const globalSchema: GlobalFlagSchema[] = [
  { name: "dir", type: "string" },
];

const flagSchema: FlagSchema[] = [
  { name: "project", type: "string", required: false },
  { name: "all", type: "boolean", required: false },
];

export async function unlinkClaude(argv: string[] = []) {
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

      const { results, marketplaceEmpty } = unlinkBatch(workspacePath, targets);
      if (marketplaceEmpty) {
        try {
          unregisterMarketplaceAndRemoveDir(workspacePath);
        } catch (e) {
          results.push({
            alias: "(marketplace)",
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const failed = results.filter((r) => r.status === "failed");
      console.log(
        formatSuccess(
          `Unlinked ${results.filter((r) => r.status === "unlinked").length} of ${targets.length} worktree(s)`,
          { workspaceDir: workspacePath, results, marketplaceRemoved: marketplaceEmpty },
        ),
      );
      if (!isJsonMode()) {
        for (const r of results) {
          if (r.status === "unlinked") {
            console.log(`  ${pc.green("✓")} ${r.alias}`);
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

  p.intro(`${pc.bgCyan(pc.black(" wkt "))} Unlink Claude Plugins`);

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
    p.cancel("No worktrees to unlink.");
    process.exit(0);
  }

  const selected = await p.multiselect({
    message: "Which worktrees do you want to unlink?",
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

  const targets = workspace.worktrees.filter((w) => selected.includes(w.alias));
  const s = p.spinner();
  s.start(`Unlinking ${targets.length} plugin(s)...`);
  const { results, marketplaceEmpty } = unlinkBatch(workspacePath, targets);
  s.stop(`${pc.green("✓")} Unlinked ${results.filter((r) => r.status === "unlinked").length} plugin(s)`);

  if (marketplaceEmpty) {
    try {
      unregisterMarketplaceAndRemoveDir(workspacePath);
      p.log.success(`${pc.green("✓")} Removed empty wkt marketplace`);
    } catch (e) {
      p.log.warning(
        `Failed to unregister marketplace — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  for (const r of results) {
    if (r.status === "failed") {
      p.log.error(`${r.alias}: ${r.error}`);
    }
  }

  p.outro("Done");
}
