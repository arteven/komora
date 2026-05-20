import { describe, it, expect } from "vitest";
import { classify, hasWorkload, hasSshAgent } from "../../src/secrets/tiers.js";
import type { ResolvedBox } from "../../src/box/types.js";

const make = (workload: any[] = [], identity: any[] = []): ResolvedBox =>
  ({
    secrets: { workload, identity },
  } as unknown as ResolvedBox);

describe("tiers", () => {
  it("classify returns separate workload and identity arrays", () => {
    const r = classify(make([{ name: "A", domain: "api.a.com" }], ["ssh-agent"]));
    expect(r.workload).toEqual([{ name: "A", domain: "api.a.com" }]);
    expect(r.identity).toEqual(["ssh-agent"]);
  });

  it("hasWorkload reports presence", () => {
    expect(hasWorkload(make([], []))).toBe(false);
    expect(hasWorkload(make([{ name: "A", domain: "x" }]))).toBe(true);
  });

  it("hasSshAgent reports ssh-agent forwarding need", () => {
    expect(hasSshAgent(make([], []))).toBe(false);
    expect(hasSshAgent(make([], ["ssh-agent"]))).toBe(true);
  });
});
