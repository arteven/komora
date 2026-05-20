import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock runMsb to capture the CLI args passed to `msb create`
vi.mock("../../../src/box/backend/msb.js", () => ({
  runMsb: vi.fn(async () => {}),
}));

// Volume.builder is still used for ensureVolume
vi.mock("microsandbox", () => ({
  Volume: { builder: vi.fn(() => ({ create: vi.fn() })) },
  VolumeAlreadyExistsError: class extends Error {},
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { buildSandbox } from "../../../src/box/backend/sdk.js";
import { runMsb } from "../../../src/box/backend/msb.js";
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
  it("passes image, memory, cpus to msb create", async () => {
    await buildSandbox(baseResolved, { secretArgs: [] });
    const [args] = vi.mocked(runMsb).mock.calls[0];
    expect(args).toContain("snap:komora-base");
    expect(args).toContain("-m");
    expect(args).toContain("4096M");
    expect(args).toContain("-c");
    expect(args).toContain("2");
  });

  it("mounts the personal layer (volume form)", async () => {
    await buildSandbox(baseResolved, { secretArgs: [] });
    const [args] = vi.mocked(runMsb).mock.calls[0];
    expect(args).toContain("-v");
    expect(args.join(" ")).toContain("pl:/home/k/.local");
  });

  it("converts secretEnv args into --secret CLI flags", async () => {
    await buildSandbox(baseResolved, { secretArgs: ["--secret", "FOO=bar@api.foo.com"] });
    const [args] = vi.mocked(runMsb).mock.calls[0];
    expect(args).toContain("--secret");
    expect(args).toContain("FOO=bar@api.foo.com");
  });
});
