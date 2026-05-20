import { describe, it, expect, vi, beforeEach } from "vitest";

const builder = vi.hoisted(() => ({
  image: vi.fn(() => builder),
  init: vi.fn(() => builder),
  memory: vi.fn(() => builder),
  cpus: vi.fn(() => builder),
  env: vi.fn(() => builder),
  volume: vi.fn(() => builder),
  secret: vi.fn(() => builder),
  secretEnv: vi.fn(() => builder),
  network: vi.fn(() => builder),
  createDetached: vi.fn(async () => ({ name: "stub" })),
}));

vi.mock("microsandbox", () => ({
  Sandbox: { builder: vi.fn(() => builder) },
  Volume: { builder: vi.fn(() => ({ create: vi.fn() })) },
  VolumeAlreadyExistsError: class extends Error {},
  SandboxNotFoundError: class extends Error {},
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { buildSandbox } from "../../../src/box/backend/sdk.js";
import type { ResolvedBox } from "../../../src/box/types.js";

const baseResolved: ResolvedBox = {
  version: 1,
  image: { base: "snap:komora-base", toolchains: [], agents: [], packages: [] },
  box: {
    name: "komora-box",
    resources: { memoryMib: 4096, cpus: 2 },
    personalLayer: { volume: { name: "pl", mount: "/home/k/.local" } },
    volumes: [],
    mounts: [],
    ports: [],
    network: { policy: "nonlocal" },
    ssh: null,
    identity: { forwardSshAgent: false },
    features: { docker: false, clipboard: false },
  },
  secrets: { workload: [], identity: [] },
  baseSnapshotName: "komora-base",
};

describe("buildSandbox", () => {
  it("applies image, memory, cpus", async () => {
    await buildSandbox(baseResolved, { secretArgs: [] });
    expect(builder.image).toHaveBeenCalledWith("snap:komora-base");
    expect(builder.memory).toHaveBeenCalledWith(4096);
    expect(builder.cpus).toHaveBeenCalledWith(2);
  });

  it("mounts the personal layer (volume form)", async () => {
    await buildSandbox(baseResolved, { secretArgs: [] });
    expect(builder.volume).toHaveBeenCalled();
  });

  it("converts secretEnv args into builder.secretEnv calls", async () => {
    await buildSandbox(baseResolved, { secretArgs: ["--secret", "FOO=bar@api.foo.com"] });
    expect(builder.secretEnv).toHaveBeenCalledWith("MSB_FOO", "bar", "api.foo.com");
  });
});
