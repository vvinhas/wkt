import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Config, Project } from "../types.ts";

const CONFIG_PATH = join(homedir(), ".config", "wkt", "config.json");

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    return { projects: {} };
  }
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as Config;
}

export function saveConfig(config: Config): void {
  ensureDir(CONFIG_PATH);
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getProject(alias: string): Project | undefined {
  const config = loadConfig();
  return config.projects[alias];
}

export function addProject(alias: string, project: Project): void {
  const config = loadConfig();
  config.projects[alias] = project;
  saveConfig(config);
}

export function removeProject(alias: string): void {
  const config = loadConfig();
  delete config.projects[alias];
  saveConfig(config);
}

export function updateProject(alias: string, updates: Partial<Project>): void {
  const config = loadConfig();
  const existing = config.projects[alias];
  if (!existing) return;
  config.projects[alias] = { ...existing, ...updates };
  saveConfig(config);
}

export function findProjectByPath(repoPath: string): { alias: string; project: Project } | undefined {
  const config = loadConfig();
  for (const [alias, project] of Object.entries(config.projects)) {
    if (project.path === repoPath) {
      return { alias, project };
    }
  }
  return undefined;
}
