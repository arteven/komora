import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SDK-glue tests for src/sandbox/_sdk.ts. We mock the `microsandbox` package
 * with a chainable builder spy and a static `Sandbox.list / .start / .remove`
 * surface, then assert call sequence and arguments.
 */

type Call = { method: string; args: unknown[] };

const { calls, builderSpy, mountBuilder, secretBuilder, sandboxStatic, liveHandle, volumeStatic, volumeBuilderSpy, mockSandbox } =
  vi.hoisted(() => {
    const calls: Array<{ method: string; args: unknown[] }> = [];

    const mockSandbox = {
      exec: vi.fn(),
      shell: vi.fn(),
      attach: vi.fn(),
      stop: vi.fn(),
    };

    // Mount sub-builder passed into `volume(target, fn)`.
    const mountBuilder = {
      bind: vi.fn((host: string) => {
        calls.push({ method: "mount.bind", args: [host] });
        return mountBuilder;
      }),
      named: vi.fn((name: string) => {
        calls.push({ method: "mount.named", args: [name] });
        return mountBuilder;
      }),
    };

    // Secret sub-builder passed into `secret(fn)`.
    const secretBuilder = {
      env: vi.fn((v: string) => {
        calls.push({ method: "secret.env", args: [v] });
        return secretBuilder;
      }),
      value: vi.fn((v: string) => {
        calls.push({ method: "secret.value", args: [v] });
        return secretBuilder;
      }),
      allowHost: vi.fn((h: string) => {
        calls.push({ method: "secret.allowHost", args: [h] });
        return secretBuilder;
      }),
    };

    type BuilderSpy = {
      image: ReturnType<typeof vi.fn>;
      env: ReturnType<typeof vi.fn>;
      volume: ReturnType<typeof vi.fn>;
      secret: ReturnType<typeof vi.fn>;
      secretEnv: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    const builderSpy: BuilderSpy = {
      image: vi.fn((s: string) => {
        calls.push({ method: "image", args: [s] });
        return builderSpy;
      }),
      env: vi.fn((k: string, v: string) => {
        calls.push({ method: "env", args: [k, v] });
        return builderSpy;
      }),
      volume: vi.fn(
        (target: string, configure: (m: typeof mountBuilder) => unknown) => {
          calls.push({ method: "volume", args: [target] });
          configure(mountBuilder);
          return builderSpy;
        },
      ),
      secret: vi.fn(
        (configure: (s: typeof secretBuilder) => unknown) => {
          calls.push({ method: "secret", args: [] });
          configure(secretBuilder);
          return builderSpy;
        },
      ),
      secretEnv: vi.fn((envVar: string, value: string, host: string) => {
        calls.push({ method: "secretEnv", args: [envVar, value, host] });
        return builderSpy;
      }),
      create: vi.fn(async () => {
        calls.push({ method: "create", args: [] });
        return mockSandbox;
      }),
    };

    const liveHandle = {
      stop: vi.fn(async () => {}),
      connect: vi.fn(async () => mockSandbox),
    };

    const sandboxStatic = {
      builder: vi.fn((name: string) => {
        calls.push({ method: "builder", args: [name] });
        return builderSpy;
      }),
      start: vi.fn(async (name: string) => {
        calls.push({ method: "Sandbox.start", args: [name] });
        return mockSandbox;
      }),
      get: vi.fn(async (_name: string) => liveHandle),
      list: vi.fn(async () => [] as Array<{
        name: string;
        status: string;
      }>),
      remove: vi.fn(async (name: string) => {
        calls.push({ method: "Sandbox.remove", args: [name] });
      }),
    };

    const volumeBuilderSpy = {
      create: vi.fn(async () => ({})),
    };

    const volumeStatic = {
      builder: vi.fn((_name: string) => volumeBuilderSpy),
    };

    return { calls, builderSpy, mountBuilder, secretBuilder, sandboxStatic, liveHandle, volumeStatic, volumeBuilderSpy, mockSandbox };
  });

vi.mock("microsandbox", () => ({
  Sandbox: sandboxStatic,
  Volume: volumeStatic,
  VolumeAlreadyExistsError: class VolumeAlreadyExistsError extends Error {},
  SandboxNotFoundError: class SandboxNotFoundError extends Error {},
}));

import { sdk } from "../../src/sandbox/_sdk.js";

beforeEach(() => {
  calls.length = 0;
  // Reset all the mocks so call counts don't leak across tests.
  [
    builderSpy.image,
    builderSpy.env,
    builderSpy.volume,
    builderSpy.secret,
    builderSpy.secretEnv,
    builderSpy.create,
    mountBuilder.bind,
    mountBuilder.named,
    secretBuilder.env,
    secretBuilder.value,
    secretBuilder.allowHost,
    sandboxStatic.builder,
    sandboxStatic.start,
    sandboxStatic.get,
    sandboxStatic.list,
    sandboxStatic.remove,
    liveHandle.stop,
    liveHandle.connect,
    volumeStatic.builder,
    volumeBuilderSpy.create,
    mockSandbox.exec,
    mockSandbox.shell,
    mockSandbox.attach,
    mockSandbox.stop,
  ].forEach((m) => m.mockClear());
  // Restore default list resolution.
  sandboxStatic.list.mockResolvedValue([] as never);
});

describe("sdk.create", () => {
  it("translates input into the builder call sequence", async () => {
    const got = await sdk.create({
      name: "name",
      image: "img:t",
      mounts: [
        { type: "bind", source: "/h1", target: "/c1" },
        { type: "volume", name: "v2", target: "/c2" },
      ],
      env: { A: "1", B: "2" },
      secretArgs: [
        "--secret",
        "FOO=bar",
        "--secret",
        "BAZ=qux@example.com",
      ],
      domains: [],
      raw: {},
    });

    expect(got).toBe(mockSandbox);

    // Filter to just the high-level builder ops for a stable assertion.
    const seq = calls.map((c) => `${c.method}(${JSON.stringify(c.args)})`);
    expect(seq).toEqual([
      'builder(["name"])',
      'image(["img:t"])',
      'env(["A","1"])',
      'env(["B","2"])',
      'volume(["/c1"])',
      'mount.bind(["/h1"])',
      'volume(["/c2"])',
      'mount.named(["v2"])',
      'secret([])',
      'secret.env(["MSB_FOO"])',
      'secret.value(["bar"])',
      'secretEnv(["MSB_BAZ","qux","example.com"])',
      'create([])',
    ]);
    expect(volumeStatic.builder).toHaveBeenCalledWith("v2");
  });

  it("does not call allowHost for hostless secrets", async () => {
    await sdk.create({
      name: "n",
      image: "i",
      mounts: [],
      env: {},
      secretArgs: ["--secret", "X=y"],
      domains: [],
      raw: {},
    });
    expect(secretBuilder.allowHost).not.toHaveBeenCalled();
  });

  it("throws on a bind mount missing source", async () => {
    await expect(
      sdk.create({
        name: "n",
        image: "i",
        mounts: [{ type: "bind", target: "/c" }],
        env: {},
        secretArgs: [],
        domains: [],
        raw: {},
      }),
    ).rejects.toThrow(/bind mount missing source/);
  });

  it("throws on a volume mount missing name", async () => {
    await expect(
      sdk.create({
        name: "n",
        image: "i",
        mounts: [{ type: "volume", target: "/c" }],
        env: {},
        secretArgs: [],
        domains: [],
        raw: {},
      }),
    ).rejects.toThrow(/volume mount missing name/);
  });
});

describe("sdk.start", () => {
  it("forwards to Sandbox.start and returns the Sandbox", async () => {
    const result = await sdk.start("x");
    expect(sandboxStatic.start).toHaveBeenCalledWith("x");
    expect(result).toBe(mockSandbox);
  });
});

describe("sdk.rm", () => {
  it("forwards to Sandbox.remove", async () => {
    await sdk.rm("x");
    expect(sandboxStatic.remove).toHaveBeenCalledWith("x");
  });
});

describe("sdk.list", () => {
  it("maps SDK status (including crashed/draining) through mapSdkStatus", async () => {
    sandboxStatic.list.mockResolvedValue([
      { name: "a", status: "running", stop: vi.fn() },
      { name: "b", status: "crashed", stop: vi.fn() },
      { name: "c", status: "draining", stop: vi.fn() },
      { name: "d", status: "stopped", stop: vi.fn() },
    ] as never);
    expect(await sdk.list()).toEqual([
      { name: "a", status: "running" },
      { name: "b", status: "stopped" },
      { name: "c", status: "stopped" },
      { name: "d", status: "stopped" },
    ]);
  });
});

describe("sdk.stop", () => {
  it("calls stop() on the live handle from Sandbox.get()", async () => {
    await sdk.stop("a");
    expect(sandboxStatic.get).toHaveBeenCalledWith("a");
    expect(liveHandle.stop).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when sandbox is not found", async () => {
    const { SandboxNotFoundError } = await import("microsandbox");
    sandboxStatic.get.mockRejectedValueOnce(new SandboxNotFoundError("sandbox not found: ghost"));
    await expect(sdk.stop("ghost")).resolves.toBeUndefined();
  });

  it("treats SandboxNotFoundError from handle.stop() as success (race window)", async () => {
    const { SandboxNotFoundError } = await import("microsandbox");
    liveHandle.stop.mockRejectedValueOnce(new SandboxNotFoundError("sandbox not found: a"));
    await expect(sdk.stop("a")).resolves.toBeUndefined();
    expect(liveHandle.stop).toHaveBeenCalled();
  });

  it("rethrows other errors from handle.stop()", async () => {
    liveHandle.stop.mockRejectedValueOnce(new Error("kvm refused"));
    await expect(sdk.stop("a")).rejects.toThrow(/kvm refused/);
  });
});

// `Call` is exported via shape only to keep the type alive for grep.
export type _Call = Call;
