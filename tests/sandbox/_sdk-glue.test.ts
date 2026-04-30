import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SDK-glue tests for src/sandbox/_sdk.ts. We mock the `microsandbox` package
 * with a chainable builder spy and a static `Sandbox.list / .start / .remove`
 * surface, then assert call sequence and arguments.
 */

type Call = { method: string; args: unknown[] };

const { calls, builderSpy, mountBuilder, secretBuilder, sandboxStatic } =
  vi.hoisted(() => {
    const calls: Array<{ method: string; args: unknown[] }> = [];

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
      create: vi.fn(async () => {
        calls.push({ method: "create", args: [] });
        return {};
      }),
    };

    const sandboxStatic = {
      builder: vi.fn((name: string) => {
        calls.push({ method: "builder", args: [name] });
        return builderSpy;
      }),
      start: vi.fn(async (name: string) => {
        calls.push({ method: "Sandbox.start", args: [name] });
        return {};
      }),
      list: vi.fn(async () => [] as Array<{
        name: string;
        status: string;
        stop: () => Promise<void>;
      }>),
      remove: vi.fn(async (name: string) => {
        calls.push({ method: "Sandbox.remove", args: [name] });
      }),
    };

    return { calls, builderSpy, mountBuilder, secretBuilder, sandboxStatic };
  });

vi.mock("microsandbox", () => ({
  Sandbox: sandboxStatic,
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
    builderSpy.create,
    mountBuilder.bind,
    mountBuilder.named,
    secretBuilder.env,
    secretBuilder.value,
    secretBuilder.allowHost,
    sandboxStatic.builder,
    sandboxStatic.start,
    sandboxStatic.list,
    sandboxStatic.remove,
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
      raw: {},
    });

    expect(got).toEqual({ id: "name" });

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
      'secret([])',
      'secret.env(["MSB_BAZ"])',
      'secret.value(["qux"])',
      'secret.allowHost(["example.com"])',
      'create([])',
    ]);
  });

  it("does not call allowHost for hostless secrets", async () => {
    await sdk.create({
      name: "n",
      image: "i",
      mounts: [],
      env: {},
      secretArgs: ["--secret", "X=y"],
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
        raw: {},
      }),
    ).rejects.toThrow(/volume mount missing name/);
  });
});

describe("sdk.start", () => {
  it("forwards to Sandbox.start", async () => {
    await sdk.start("x");
    expect(sandboxStatic.start).toHaveBeenCalledWith("x");
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
  it("calls stop() on the matching handle", async () => {
    const stopFn = vi.fn(async () => {});
    sandboxStatic.list.mockResolvedValue([
      { name: "a", status: "running", stop: stopFn },
    ] as never);
    await sdk.stop("a");
    expect(stopFn).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the name is not in list() (does NOT throw)", async () => {
    sandboxStatic.list.mockResolvedValue([] as never);
    await expect(sdk.stop("ghost")).resolves.toBeUndefined();
  });

  it("treats a 'not found'-shaped error from handle.stop() as success (race window)", async () => {
    const stopFn = vi.fn(async () => {
      throw new Error("sandbox not found: a");
    });
    sandboxStatic.list.mockResolvedValue([
      { name: "a", status: "running", stop: stopFn },
    ] as never);
    await expect(sdk.stop("a")).resolves.toBeUndefined();
    expect(stopFn).toHaveBeenCalled();
  });

  it("rethrows other errors from handle.stop()", async () => {
    const stopFn = vi.fn(async () => {
      throw new Error("kvm refused");
    });
    sandboxStatic.list.mockResolvedValue([
      { name: "a", status: "running", stop: stopFn },
    ] as never);
    await expect(sdk.stop("a")).rejects.toThrow(/kvm refused/);
  });
});

// `Call` is exported via shape only to keep the type alive for grep.
export type _Call = Call;
