import { describe, it, expect, vi, beforeEach } from "vitest";

const { shell, create, builder } = vi.hoisted(() => {
  const shell = vi.fn(async () => ({ success: true, code: 0, stdout: () => "", stderr: () => "" }));
  const create = vi.fn(async () => ({
    shell,
    stop: vi.fn(),
    remove: vi.fn(),
  }));
  const builder = {
    image: vi.fn(() => builder),
    memory: vi.fn(() => builder),
    cpus: vi.fn(() => builder),
    volume: vi.fn(() => builder),
    create,
  };
  return { shell, create, builder };
});

vi.mock("microsandbox", () => ({
  Sandbox: { builder: vi.fn(() => builder), remove: vi.fn(), get: vi.fn() },
  Volume: { builder: vi.fn(() => ({ create: vi.fn() })) },
  VolumeAlreadyExistsError: class extends Error {},
  SandboxNotFoundError: class extends Error {},
}));

const runMsbMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../../src/box/backend/msb.js", () => ({ runMsb: runMsbMock }));

import { bake } from "../../../src/box/backend/image.js";
import type { ResolvedBox } from "../../../src/box/types.js";

const r: ResolvedBox = {
  version: 1,
  image: { base: "docker.io/library/debian:12-slim", toolchains: [{ node: "22" }], agents: ["claude"], packages: ["tmux"] },
  box: {
    name: "komora-box",
    resources: {},
    personalLayer: { volume: { name: "pl", mount: "/x" } },
    volumes: [], mounts: [], ports: [],
    network: { policy: "nonlocal" },
    ssh: null,
    identity: { forwardSshAgent: false },
    features: { docker: false, clipboard: false },
  },
  secrets: { workload: [], identity: [] },
  baseSnapshotName: "komora-base",
};

beforeEach(() => { vi.clearAllMocks(); });

describe("bake", () => {
  it("builds throwaway sandbox from manifest base image", async () => {
    await bake(r);
    expect(builder.image).toHaveBeenCalledWith("docker.io/library/debian:12-slim");
  });

  it("runs install recipe via shell()", async () => {
    await bake(r);
    expect(shell).toHaveBeenCalled();
  });

  it("snapshots under baseSnapshotName via msb snapshot create", async () => {
    await bake(r);
    expect(runMsbMock).toHaveBeenCalledWith(
      expect.arrayContaining(["snapshot", "create", "komora-base"]),
      expect.anything(),
    );
  });

  it("removes throwaway sandbox after snapshot", async () => {
    await bake(r);
    expect(runMsbMock).toHaveBeenCalledWith(
      expect.arrayContaining(["remove", "komora-bake"]),
      expect.anything(),
    );
  });

  it("mounts the install scripts directory at /opt/komora/install", async () => {
    await bake(r);
    const calls = (builder.volume.mock.calls as any[]).map((c) => c[0]);
    expect(calls).toContain("/opt/komora/install");
  });
});
