import { describe, it, expect, beforeEach } from "vitest";
import { configDir, stateDir, manifestFile, baseSnapshotName, lockFile, secretsFile } from "../../src/util/paths.js";

describe("paths", () => {
  beforeEach(() => {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_STATE_HOME;
    process.env.HOME = "/tmp/fake-home";
  });

  it("configDir defaults to ~/.config/komora", () => {
    expect(configDir()).toBe("/tmp/fake-home/.config/komora");
  });

  it("manifestFile is configDir + box.yaml", () => {
    expect(manifestFile()).toBe("/tmp/fake-home/.config/komora/box.yaml");
  });

  it("baseSnapshotName is komora-base", () => {
    expect(baseSnapshotName()).toBe("komora-base");
  });

  it("lockFile composes stateDir + name", () => {
    expect(lockFile("foo")).toBe("/tmp/fake-home/.local/state/komora/locks/foo.lock");
  });

  it("XDG_CONFIG_HOME overrides", () => {
    process.env.XDG_CONFIG_HOME = "/custom";
    expect(configDir()).toBe("/custom/komora");
  });

  it("stateDir defaults to ~/.local/state/komora", () => {
    expect(stateDir()).toBe("/tmp/fake-home/.local/state/komora");
  });

  it("secretsFile is configDir + secrets.json", () => {
    expect(secretsFile()).toBe("/tmp/fake-home/.config/komora/secrets.json");
  });

  it("XDG_STATE_HOME overrides", () => {
    process.env.XDG_STATE_HOME = "/custom-state";
    expect(stateDir()).toBe("/custom-state/komora");
  });
});
