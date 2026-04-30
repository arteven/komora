import { loadResolvedConfig } from "../config/index.js";
import { ensureSandbox } from "../sandbox/lifecycle.js";

export interface CreateOpts {
  agent?: string;
  profile?: string;
  name?: string;
  workspaceDir: string;
}

export async function create(opts: CreateOpts): Promise<void> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agentOverride: opts.agent,
    profileOverride: opts.profile,
    nameOverride: opts.name,
  });
  await ensureSandbox(cfg);
}
