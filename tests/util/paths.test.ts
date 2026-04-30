import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { configDir, stateDir, secretsFile, lockFile, userProfilesDir } from "../../src/util/paths.js";

describe("paths", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it("uses XDG_CONFIG_HOME when set", () => {
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-config";
    expect(configDir()).toBe("/tmp/xdg-config/komora");
    expect(secretsFile()).toBe("/tmp/xdg-config/komora/secrets.json");
    expect(userProfilesDir()).toBe("/tmp/xdg-config/komora/profiles");
  });

  it("falls back to $HOME/.config when XDG unset", () => {
    delete process.env.XDG_CONFIG_HOME;
    process.env.HOME = "/home/u";
    expect(configDir()).toBe("/home/u/.config/komora");
  });

  it("uses XDG_STATE_HOME when set", () => {
    process.env.XDG_STATE_HOME = "/tmp/xdg-state";
    expect(stateDir()).toBe("/tmp/xdg-state/komora");
  });

  it("falls back to $HOME/.local/state when XDG_STATE_HOME unset", () => {
    delete process.env.XDG_STATE_HOME;
    process.env.HOME = "/home/u";
    expect(stateDir()).toBe("/home/u/.local/state/komora");
  });

  it("builds lock file paths under stateDir/locks/", () => {
    process.env.XDG_STATE_HOME = "/tmp/xdg-state";
    expect(lockFile("foo-claude-nodejs")).toBe(path.join("/tmp/xdg-state/komora/locks", "foo-claude-nodejs.lock"));
  });
});
