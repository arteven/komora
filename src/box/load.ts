import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { validateBoxManifest } from "./schema.js";
import type { BoxManifest } from "./types.js";

export async function loadManifest(filePath: string): Promise<BoxManifest> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      throw new Error(`box.yaml not found: ${filePath}`);
    }
    throw e;
  }

  let data: unknown;
  try {
    data = yaml.load(text);
  } catch (e: any) {
    throw new Error(`failed to parse ${filePath}: ${e?.message ?? e}`);
  }

  validateBoxManifest(data);
  return data as BoxManifest;
}
