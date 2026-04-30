import { describe, it, expect, vi } from "vitest";
import { log } from "../../src/util/log.js";

describe("log", () => {
  it("writes to stderr, never stdout", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    log.info("hello");
    log.warn("careful");
    log.error("bad");

    expect(out).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(3);
    err.mockRestore();
    out.mockRestore();
  });

  it("prefixes lines with komora:", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log.info("hi");
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/^komora: hi\n$/));
    err.mockRestore();
  });
});
