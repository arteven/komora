import { describe, it, expect, vi, beforeEach } from "vitest";

const { destroyMock, buildMock, statusMock, collectMock, missingMock, sshProbeMock } = vi.hoisted(() => ({
  destroyMock: vi.fn(),
  buildMock: vi.fn(),
  statusMock: vi.fn(),
  collectMock: vi.fn(async () => ({})),
  missingMock: vi.fn(async () => []),
  sshProbeMock: vi.fn(async () => true),
}));

vi.mock("../../../src/box/backend/lifecycle.js", () => ({ destroy: destroyMock }));
vi.mock("../../../src/box/backend/sdk.js", () => ({ buildSandbox: buildMock }));
vi.mock("../../../src/box/backend/status.js", () => ({ boxStatus: statusMock }));
vi.mock("../../../src/box/backend/ssh.js", () => ({ waitForSshd: sshProbeMock }));
vi.mock("../../../src/secrets/inject.js", () => ({
  collectWorkloadValues: collectMock,
  missingWorkload: missingMock,
  buildSecretEnvArgs: () => [],
}));

import { rebuild } from "../../../src/box/backend/rebuild.js";
import type { ResolvedBox } from "../../../src/box/types.js";

const r: ResolvedBox = {
  version: 1,
  image: { base: "snap:komora-base", toolchains: [], agents: [], packages: [] },
  box: {
    name: "komora-box",
    resources: {},
    personalLayer: { volume: { name: "pl", mount: "/x" } },
    volumes: [], mounts: [],
    ports: [{ host: 2222, guest: 22 }],
    network: { policy: "nonlocal" },
    ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "/k" },
    identity: { forwardSshAgent: false },
    features: { docker: false, clipboard: false },
  },
  secrets: { workload: [], identity: [] },
  baseSnapshotName: "komora-base",
};

beforeEach(() => { vi.clearAllMocks(); });

describe("rebuild", () => {
  it("destroys existing VM before recreating", async () => {
    statusMock.mockResolvedValue("running");
    await rebuild(r);
    expect(destroyMock).toHaveBeenCalledWith("komora-box");
    expect(buildMock).toHaveBeenCalled();
  });

  it("skips destroy when VM missing", async () => {
    statusMock.mockResolvedValue("missing");
    await rebuild(r);
    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("waits for sshd when ssh.enabled", async () => {
    statusMock.mockResolvedValue("missing");
    await rebuild(r);
    expect(sshProbeMock).toHaveBeenCalledWith(2222, expect.any(Number));
  });

  it("skips sshd wait when ssh disabled", async () => {
    statusMock.mockResolvedValue("missing");
    await rebuild({ ...r, box: { ...r.box, ssh: null } });
    expect(sshProbeMock).not.toHaveBeenCalled();
  });
});
