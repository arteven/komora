import fs from "node:fs/promises";
import path from "node:path";
import { parseRepoConfig } from "./load.js";
import { resolveConfig } from "./resolve.js";
import { getAgent } from "../agents/registry.js";
import { workspaceSlug } from "../util/workspace.js";
import type { ResolvedConfig, RepoConfig } from "./types.js";

export interface LoadOptions {
  workspaceDir: string;
  agent?: string;
  nameOverride?: string;
  bare?: boolean;
  profile?: string;
}

async function readIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function loadResolvedConfig(opts: LoadOptions): Promise<ResolvedConfig> {
  if (!opts.agent) {
    throw new Error("agent is required — pass it as `komora run <agent>`");
  }

  const repoYaml = await readIfExists(path.join(opts.workspaceDir, "komora.config.yaml"));
  const repoConfig: RepoConfig = repoYaml ? parseRepoConfig(repoYaml) : {};

  const agentDef = await getAgent(opts.agent);

  const profile = opts.profile ?? repoConfig.profile;

  return resolveConfig({
    agent: opts.agent,
    agentDef,
    repoConfig,
    workspaceDir: opts.workspaceDir,
    workspaceSlug: workspaceSlug(opts.workspaceDir),
    nameOverride: opts.nameOverride,
    bare: opts.bare,
    profile,
  });
}
