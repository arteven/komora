import { describe, it, expect } from "vitest";
import { composeRecipe } from "../../src/baker/recipe.js";
import type { ResolvedBox } from "../../src/box/types.js";

const r = (overrides: Partial<ResolvedBox["image"]> = {}): ResolvedBox =>
  ({
    image: { base: "debian:12-slim", toolchains: [], agents: [], packages: [], ...overrides },
    box: {
      name: "komora-box",
      resources: {},
      personalLayer: { volume: { name: "p", mount: "/x" } },
      volumes: [],
      mounts: [],
      ports: [],
      network: { policy: "nonlocal" },
      ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "/k" },
      identity: { forwardSshAgent: false },
      features: { docker: false, clipboard: false },
    },
    secrets: { workload: [], identity: [] },
    baseSnapshotName: "komora-base",
    version: 1,
  } as ResolvedBox);

describe("composeRecipe", () => {
  it("starts with apt-get update", () => {
    expect(composeRecipe(r())).toMatch(/^set -euo pipefail[\s\S]*apt-get update/);
  });

  it("installs declared packages", () => {
    expect(composeRecipe(r({ packages: ["tmux", "zsh"] }))).toMatch(/apt-get install -y .*tmux.*zsh/);
  });

  it("invokes each toolchain script", () => {
    const s = composeRecipe(r({ toolchains: [{ node: "22" }, { python: "3.12" }] }));
    expect(s).toMatch(/install\/node.sh.*22/);
    expect(s).toMatch(/install\/python.sh.*3.12/);
  });

  it("invokes each agent script", () => {
    const s = composeRecipe(r({ agents: ["claude", "opencode"] }));
    expect(s).toMatch(/install\/agent-claude.sh/);
    expect(s).toMatch(/install\/agent-opencode.sh/);
  });

  it("installs sshd when ssh.enabled", () => {
    expect(composeRecipe(r())).toMatch(/install\/sshd.sh/);
  });

  it("always installs mise + direnv", () => {
    expect(composeRecipe(r())).toMatch(/install\/mise.sh/);
  });

  it("ends with apt-get clean", () => {
    expect(composeRecipe(r())).toMatch(/apt-get clean[\s\S]*$/);
  });
});
