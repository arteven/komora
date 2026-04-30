import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/sandbox/msb.js", () => ({
  msb: {
    create: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    rm: vi.fn(),
    status: vi.fn(),
  },
}));
vi.mock("../../src/secrets/store.js", () => ({
  getSecret: vi.fn(async () => undefined),
}));

import { msb } from "../../src/sandbox/msb.js";
import { getSecret } from "../../src/secrets/store.js";
import { ensureSandbox, stopSandbox, removeSandbox } from "../../src/sandbox/lifecycle.js";
import type { ResolvedConfig } from "../../src/config/types.js";

const cfg: ResolvedConfig = {
  agent: "claude",
  profile: { name: "nodejs", image: "img:t", mounts: [], env: {}, secrets: { allowed: [] } },
  raw: {},
  secretsAllow: [],
  workspaceDir: "/tmp/foo",
  workspaceSlug: "foo",
  sandboxName: "foo-claude-nodejs",
};

beforeEach(() => {
  Object.values(msb).forEach((fn) => (fn as { mockReset?: () => void }).mockReset?.());
  (getSecret as ReturnType<typeof vi.fn>).mockReset();
  (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe("ensureSandbox", () => {
  it("creates and starts when status is missing", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("missing");
    await ensureSandbox(cfg);
    expect(msb.create).toHaveBeenCalledOnce();
    expect(msb.start).toHaveBeenCalledWith("foo-claude-nodejs");
  });

  it("starts when status is stopped", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("stopped");
    await ensureSandbox(cfg);
    expect(msb.create).not.toHaveBeenCalled();
    expect(msb.start).toHaveBeenCalledWith("foo-claude-nodejs");
  });

  it("does nothing when already running", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("running");
    await ensureSandbox(cfg);
    expect(msb.create).not.toHaveBeenCalled();
    expect(msb.start).not.toHaveBeenCalled();
  });
});

describe("ensureSandbox secret gating", () => {
  const cfgWithSecret = (secretsAllow: string[]): ResolvedConfig => ({
    ...cfg,
    profile: { ...cfg.profile, secrets: { allowed: [{ name: "TOKEN" }] } },
    secretsAllow,
  });

  it("injects secrets that are in profile.allowed AND cfg.secretsAllow", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("missing");
    (getSecret as ReturnType<typeof vi.fn>).mockResolvedValueOnce("hunter2");
    await ensureSandbox(cfgWithSecret(["TOKEN"]));
    expect(getSecret).toHaveBeenCalledWith("TOKEN");
    expect(msb.create).toHaveBeenCalledOnce();
    const arg = (msb.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.secretArgs).toEqual(["--secret", "TOKEN=hunter2"]);
  });

  it("omits secrets declared in profile.allowed but NOT in cfg.secretsAllow", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("missing");
    (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue("hunter2");
    await ensureSandbox(cfgWithSecret([]));
    expect(getSecret).not.toHaveBeenCalled();
    expect(msb.create).toHaveBeenCalledOnce();
    const arg = (msb.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.secretArgs).toEqual([]);
  });
});

describe("stopSandbox", () => {
  it("calls msb.stop", async () => {
    await stopSandbox("foo-claude-nodejs");
    expect(msb.stop).toHaveBeenCalledWith("foo-claude-nodejs");
  });
});

describe("removeSandbox", () => {
  it("auto-stops a running sandbox before rm", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("running");
    await removeSandbox("foo-claude-nodejs");
    expect(msb.stop).toHaveBeenCalledWith("foo-claude-nodejs");
    expect(msb.rm).toHaveBeenCalledWith("foo-claude-nodejs");
  });

  it("does not stop when status is stopped", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("stopped");
    await removeSandbox("foo-claude-nodejs");
    expect(msb.stop).not.toHaveBeenCalled();
    expect(msb.rm).toHaveBeenCalledWith("foo-claude-nodejs");
  });

  it("is a no-op when missing", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("missing");
    await removeSandbox("ghost");
    expect(msb.rm).not.toHaveBeenCalled();
  });
});
