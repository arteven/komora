import { describe, it, expect, vi } from "vitest";
import {
  parseSecretArgs,
  mapSdkStatus,
  warnUnmappedRaw,
} from "../../src/sandbox/_sdk.js";

describe("parseSecretArgs", () => {
  it("parses a simple NAME=VALUE pair", () => {
    expect(parseSecretArgs(["--secret", "T=v"])).toEqual([
      { name: "T", value: "v" },
    ]);
  });

  it("parses NAME=VALUE@HOST", () => {
    expect(parseSecretArgs(["--secret", "T=v@api.example.com"])).toEqual([
      { name: "T", value: "v", host: "api.example.com" },
    ]);
  });

  it("parses multiple entries (e.g. fan-out per host)", () => {
    expect(
      parseSecretArgs([
        "--secret",
        "T=v@a.com",
        "--secret",
        "T=v@b.com",
        "--secret",
        "X=z",
      ]),
    ).toEqual([
      { name: "T", value: "v", host: "a.com" },
      { name: "T", value: "v", host: "b.com" },
      { name: "X", value: "z" },
    ]);
  });

  it("returns [] for an empty arg list", () => {
    expect(parseSecretArgs([])).toEqual([]);
  });

  it("treats only the first '@' as the host separator (host may contain '@')", () => {
    expect(parseSecretArgs(["--secret", "T=v@host@weird"])).toEqual([
      { name: "T", value: "v", host: "host@weird" },
    ]);
  });

  it("throws on a trailing --secret with no value", () => {
    expect(() => parseSecretArgs(["--secret"])).toThrow(/malformed/);
  });

  it("throws on a payload missing '='", () => {
    expect(() => parseSecretArgs(["--secret", "novalue"])).toThrow(
      /missing '='/,
    );
  });
});

describe("mapSdkStatus", () => {
  it("passes 'running' through", () => {
    expect(mapSdkStatus("running")).toBe("running");
  });

  it("passes 'stopped' through", () => {
    expect(mapSdkStatus("stopped")).toBe("stopped");
  });

  it("collapses 'crashed' to 'stopped'", () => {
    expect(mapSdkStatus("crashed")).toBe("stopped");
  });

  it("collapses 'draining' to 'stopped'", () => {
    expect(mapSdkStatus("draining")).toBe("stopped");
  });
});

describe("warnUnmappedRaw", () => {
  it("does not warn when raw is empty", () => {
    const warn = vi.fn();
    warnUnmappedRaw({}, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once with all keys when raw is non-empty", () => {
    const warn = vi.fn();
    warnUnmappedRaw({ cpus: 4, memory: "2g" }, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/cpus/);
    expect(warn.mock.calls[0][0]).toMatch(/memory/);
  });
});
