import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { userProfilesDir } from "../util/paths.js";

export interface FoundProfile {
  source: "repo" | "user" | "builtin";
  path: string;
}

export interface FindOptions {
  workspaceDir: string;
  builtinDir?: string;
}

const defaultBuiltinDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "builtin");

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function findProfile(name: string, opts: FindOptions): Promise<FoundProfile> {
  const candidates: Array<{ source: FoundProfile["source"]; path: string }> = [
    { source: "repo", path: path.join(opts.workspaceDir, ".komora", "profiles", `${name}.yaml`) },
    { source: "user", path: path.join(userProfilesDir(), `${name}.yaml`) },
    { source: "builtin", path: path.join(opts.builtinDir ?? defaultBuiltinDir, `${name}.yaml`) },
  ];
  for (const c of candidates) {
    if (await exists(c.path)) return c;
  }
  throw new Error(`profile '${name}' not found in repo, user, or built-in locations`);
}
