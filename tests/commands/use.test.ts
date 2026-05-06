import { describe, it, expect } from "bun:test";
import { resolve, join } from "node:path";
import { executeProject, resolveWorkspaceDir } from "../../src/commands/use.ts";

describe("executeProject", () => {
  it("throws when a project alias is not found", () => {
    expect(() =>
      executeProject({
        alias: "nonexistent",
        branch: "feat/test",
        fetch: false,
      })
    ).toThrow("not found");
  });

  it("throws for any unknown alias", () => {
    expect(() =>
      executeProject({
        alias: "also-nonexistent",
        branch: "feat/test",
        fetch: false,
      })
    ).toThrow("not found");
  });
});

describe("resolveWorkspaceDir", () => {
  it("returns resolved dirFlag when present, ignoring createFolder", () => {
    const result = resolveWorkspaceDir({
      cwd: "/home/user/projects",
      dirFlag: "~/features/login",
      createFolder: { name: "ignored" },
    });
    expect(result).toBe(resolve("~/features/login"));
  });

  it("returns cwd joined with folder name when no dirFlag and createFolder is set", () => {
    const result = resolveWorkspaceDir({
      cwd: "/home/user/projects",
      createFolder: { name: "login-redesign" },
    });
    expect(result).toBe(join("/home/user/projects", "login-redesign"));
  });

  it("returns cwd unchanged when neither dirFlag nor createFolder is provided", () => {
    const result = resolveWorkspaceDir({
      cwd: "/home/user/projects",
    });
    expect(result).toBe("/home/user/projects");
  });
});
