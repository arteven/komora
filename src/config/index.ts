import fs from "node:fs/promises";
import path from "node:path";
import { parseProfile, parseRepoConfig } from "./load.js";
import { findProfile } from "../profiles/discovery.js";
import { resolveConfig } from "./resolve.js";
import { workspaceSlug } from "../util/workspace.js";
import type { ResolvedConfig, RepoConfig } from "./types.js";

export interface LoadOptions {
  workspaceDir: string;
  agentOverride?: string;
  profileOverride?: string;
  nameOverride?: string;
}

async function readIfExists(p: string): Promise<string | null> {
  try { return await fs.readFile(p, "utf8"); } catch { return null; }
}

export async function loadResolvedConfig(opts: LoadOptions): Promise<ResolvedConfig> {
  const repoYaml = await readIfExists(path.join(opts.workspaceDir, "komora.config.yaml"));
  let repoConfig: RepoConfig;
  if (repoYaml) {
    repoConfig = parseRepoConfig(repoYaml);
    if (opts.agentOverride) repoConfig = { ...repoConfig, agent: opts.agentOverride };
    if (opts.profileOverride) repoConfig = { ...repoConfig, profile: opts.profileOverride };
  } else {
    if (!opts.agentOverride || !opts.profileOverride) {
      throw new Error("no komora.config.yaml found and --agent / --profile not provided");
    }
    repoConfig = { agent: opts.agentOverride, profile: opts.profileOverride };
  }

  const found = await findProfile(repoConfig.profile, { workspaceDir: opts.workspaceDir });
  const profile = parseProfile(await fs.readFile(found.path, "utf8"));

  return resolveConfig({
    profile,
    repoConfig,
    workspaceDir: opts.workspaceDir,
    workspaceSlug: workspaceSlug(opts.workspaceDir),
    nameOverride: opts.nameOverride,
  });
}
