import { execSync } from "node:child_process";

export function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

export function generateHex(length = 4): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function generateBranchName(dirName: string): string {
  return `wkt/${dirName}-${generateHex(4)}`;
}
