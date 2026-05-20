import { describe, it, expectTypeOf } from "vitest";
import type {
  BoxManifest,
  ResolvedBox,
  Mount,
  VolumeDecl,
  WorkloadSecret,
  IdentitySecret,
  NetworkPolicy,
  Toolchain,
  Feature,
  PersonalLayer,
} from "../../src/box/types.js";

describe("box types", () => {
  it("BoxManifest shape matches spec", () => {
    const m: BoxManifest = {
      version: 1,
      image: { base: "debian:12-slim", toolchains: [{ node: "22" }], agents: ["claude"], packages: ["tmux"] },
      box: {
        name: "komora-box",
        resources: { memoryMib: 8192, cpus: 4, diskGib: 64 },
        personalLayer: { volume: { name: "personal-layer", mount: "/home/komora/.local" } },
        volumes: [{ name: "claude-home", mount: "/home/komora/.claude" }],
        mounts: [{ host: "~/Projects", guest: "/home/komora/Projects" }],
        ports: [{ host: 2222, guest: 22 }],
        network: { policy: "nonlocal" },
        ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "~/.ssh/id_ed25519.pub" },
        identity: { forwardSshAgent: true },
        features: { docker: false, clipboard: true },
      },
      secrets: {
        workload: [{ name: "ANTHROPIC_API_KEY", domain: "api.anthropic.com" }],
        identity: ["ssh-agent"],
      },
    };
    expectTypeOf(m).toMatchTypeOf<BoxManifest>();
  });

  it("ResolvedBox resolves ~ in paths", () => {
    expectTypeOf<ResolvedBox["mounts"][number]>().toMatchTypeOf<{ host: string; guest: string; readonly?: boolean }>();
  });

  it("PersonalLayer is volume OR mount, not both", () => {
    expectTypeOf<PersonalLayer>().toMatchTypeOf<
      | { volume: VolumeDecl; mount?: never }
      | { mount: Mount; volume?: never }
    >();
  });
});
