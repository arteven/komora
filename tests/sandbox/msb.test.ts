import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSdk } = vi.hoisted(() => ({
  mockSdk: {
    create: vi.fn(),
    start: vi.fn(),
    connect: vi.fn(),
    stop: vi.fn(),
    rm: vi.fn(),
    list: vi.fn(),
    volumeList: vi.fn(),
    volumeRemove: vi.fn(),
  },
}));
vi.mock("../../src/sandbox/_sdk.js", () => ({ sdk: mockSdk }));

import { msb } from "../../src/sandbox/msb.js";

describe("msb adapter", () => {
  beforeEach(() => {
    Object.values(mockSdk).forEach((fn) => fn.mockReset?.());
  });

  it("create() forwards name, image, mounts, env, secret args", async () => {
    mockSdk.create.mockResolvedValue({ id: "sb-1" });
    await msb.create({
      name: "foo-claude-nodejs",
      image: "img:t",
      mounts: [{ type: "bind", source: "/h", target: "/c" }],
      env: { A: "1" },
      secretArgs: ["--secret", "T=v"],
      raw: { cpus: 4 },
    });
    expect(mockSdk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "foo-claude-nodejs",
        image: "img:t",
      }),
    );
  });

  it("list() returns names and statuses", async () => {
    mockSdk.list.mockResolvedValue([
      { name: "a", status: "running" },
      { name: "b", status: "stopped" },
    ]);
    const got = await msb.list();
    expect(got).toEqual([
      { name: "a", status: "running" },
      { name: "b", status: "stopped" },
    ]);
  });

  it("status() returns 'missing' when list lacks the name", async () => {
    mockSdk.list.mockResolvedValue([]);
    expect(await msb.status("ghost")).toBe("missing");
  });

  it.each([
    ["start", "start"],
    ["connect", "connect"],
    ["stop", "stop"],
    ["rm", "rm"],
  ] as const)("%s() forwards the name to sdk.%s", async (method, sdkMethod) => {
    mockSdk[sdkMethod].mockResolvedValue(undefined);
    await msb[method]("box-1");
    expect(mockSdk[sdkMethod]).toHaveBeenCalledTimes(1);
    expect(mockSdk[sdkMethod]).toHaveBeenCalledWith("box-1");
  });

  it("volumeList() forwards to sdk.volumeList", async () => {
    mockSdk.volumeList.mockResolvedValue([{ name: "v1" }]);
    const result = await msb.volumeList();
    expect(result).toEqual([{ name: "v1" }]);
  });

  it("volumeRemove() forwards name to sdk.volumeRemove", async () => {
    mockSdk.volumeRemove.mockResolvedValue(undefined);
    await msb.volumeRemove("vol-1");
    expect(mockSdk.volumeRemove).toHaveBeenCalledWith("vol-1");
  });
});
