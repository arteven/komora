import { describe, it, expect, beforeEach } from "vitest";
import { resolveManifest } from "../../src/box/resolve.js";
import type { BoxManifest } from "../../src/box/types.js";

beforeEach(() => {
  process.env.HOME = "/home/u";
});

const base: BoxManifest = {
  version: 1,
  image: { base: "debian:12-slim" },
  box: {
    name: "komora-box",
    personalLayer: { volume: { name: "personal-layer", mount: "/home/komora/.local" } },
  },
};

describe("resolveManifest", () => {
  it("fills defaults for image arrays", () => {
    const r = resolveManifest(base);
    expect(r.image.toolchains).toEqual([]);
    expect(r.image.agents).toEqual([]);
    expect(r.image.packages).toEqual([]);
  });

  it("defaults box.network to nonlocal policy", () => {
    const r = resolveManifest(base);
    expect(r.box.network).toEqual({ policy: "nonlocal" });
  });

  it("defaults identity.forwardSshAgent to false when absent", () => {
    const r = resolveManifest(base);
    expect(r.box.identity).toEqual({ forwardSshAgent: false });
  });

  it("defaults features to all-false", () => {
    const r = resolveManifest(base);
    expect(r.box.features).toEqual({ docker: false, clipboard: false });
  });

  it("expands ~ in mount.host paths", () => {
    const m: BoxManifest = {
      ...base,
      box: { ...base.box, mounts: [{ host: "~/Projects", guest: "/x" }] },
    };
    expect(resolveManifest(m).box.mounts[0].host).toBe("/home/u/Projects");
  });

  it("expands ~ in personalLayer.mount.host", () => {
    const m: BoxManifest = {
      ...base,
      box: { ...base.box, personalLayer: { mount: { host: "~/dot", guest: "/home/komora/.local" } } },
    };
    const r = resolveManifest(m);
    if ("mount" in r.box.personalLayer) {
      expect(r.box.personalLayer.mount.host).toBe("/home/u/dot");
    }
  });

  it("expands ~ in ssh.authorizedKeysFromHost", () => {
    const m: BoxManifest = {
      ...base,
      box: { ...base.box, ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "~/.ssh/id_ed25519.pub" } },
    };
    expect(resolveManifest(m).box.ssh!.authorizedKeysFromHost).toBe("/home/u/.ssh/id_ed25519.pub");
  });

  it("sets baseSnapshotName", () => {
    expect(resolveManifest(base).baseSnapshotName).toBe("komora-base");
  });

  it("preserves workload secrets verbatim", () => {
    const m: BoxManifest = {
      ...base,
      secrets: { workload: [{ name: "FOO", domain: "api.foo.com" }] },
    };
    expect(resolveManifest(m).secrets.workload).toEqual([{ name: "FOO", domain: "api.foo.com" }]);
  });

  it("defaults secrets sections to empty arrays", () => {
    expect(resolveManifest(base).secrets).toEqual({ workload: [], identity: [] });
  });

  it("sets ssh to null when section absent", () => {
    expect(resolveManifest(base).box.ssh).toBeNull();
  });
});
