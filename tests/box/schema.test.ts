import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { validateBoxManifest } from "../../src/box/schema.js";

const load = (name: string) => yaml.load(readFileSync(`tests/fixtures/box/${name}`, "utf8"));

describe("box schema", () => {
  it("accepts minimal manifest", () => {
    expect(() => validateBoxManifest(load("minimal.yaml"))).not.toThrow();
  });

  it("accepts full manifest", () => {
    expect(() => validateBoxManifest(load("full.yaml"))).not.toThrow();
  });

  it("rejects unknown top-level key", () => {
    expect(() => validateBoxManifest(load("invalid-extra-key.yaml"))).toThrow(/unknownField|additional/);
  });

  it("rejects workload secret without domain", () => {
    expect(() => validateBoxManifest(load("invalid-workload-no-domain.yaml"))).toThrow(/domain/);
  });

  it("rejects personalLayer with both volume and mount", () => {
    expect(() => validateBoxManifest(load("invalid-both-personal.yaml"))).toThrow(/oneOf|exactly one|matching/);
  });

  it("rejects missing version", () => {
    expect(() => validateBoxManifest({ image: { base: "x" }, box: { name: "y", personalLayer: { volume: { name: "p", mount: "/x" } } } })).toThrow(/version/);
  });

  it("rejects volume name with uppercase", () => {
    const data = load("minimal.yaml") as any;
    data.box.personalLayer.volume.name = "BadName";
    expect(() => validateBoxManifest(data)).toThrow(/pattern|name/);
  });
});
