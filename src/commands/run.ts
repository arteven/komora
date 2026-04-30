import { loadResolvedConfig } from "../config/index.js";
import { ensureSandbox } from "../sandbox/lifecycle.js";
import { runAgent } from "../sandbox/agent.js";

export interface RunOpts {
  agent?: string;
  profile?: string;
  name?: string;
  argv: string[];
  workspaceDir: string;
}

export async function run(opts: RunOpts): Promise<number> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agentOverride: opts.agent,
    profileOverride: opts.profile,
    nameOverride: opts.name,
  });
  await ensureSandbox(cfg);
  return runAgent({ name: cfg.sandboxName, agent: cfg.agent, argv: opts.argv });
}
