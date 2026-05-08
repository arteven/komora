import path from "node:path";
import type { AgentDefinition, RepoConfig, ResolvedConfig } from "./types.js";
import { sandboxName } from "../sandbox/naming.js";

const RAW_CONFLICT_KEYS = new Set(["env", "mounts", "secrets", "image", "name"]);

export interface ResolveInput {
  agent: string;
  agentDef: AgentDefinition;
  repoConfig: RepoConfig;
  workspaceDir: string;
  workspaceSlug: string;
  nameOverride?: string;
  bare?: boolean;
  profile?: string;
}

function resolveSource(source: string, workspaceDir: string): string {
  const substituted = source.replace(/\$\{WORKSPACE\}/g, workspaceDir);
  if (substituted.startsWith("./") || substituted.startsWith("../")) {
    return path.resolve(workspaceDir, substituted);
  }
  return substituted;
}

export function resolveConfig(input: ResolveInput): ResolvedConfig {
  const { agent, agentDef, repoConfig, workspaceDir, workspaceSlug, nameOverride, bare, profile } = input;

  const raw = repoConfig.raw ?? {};
  for (const key of Object.keys(raw)) {
    if (RAW_CONFLICT_KEYS.has(key)) {
      throw new Error(`raw.${key}: conflicts with komora-modeled field; remove it or use the typed field`);
    }
  }

  const workspaceBind = { type: "bind" as const, source: workspaceDir, target: workspaceDir };
  const agentAuthVolumes = bare ? [] : agentDef.authVolumes.map((v) =>
    profile && v.name ? { ...v, name: `${v.name}-${profile}` } : v,
  );
  const repoMounts = (repoConfig.mounts ?? []).map((m) =>
    m.source ? { ...m, source: resolveSource(m.source, workspaceDir) } : m,
  );
  const mounts = [workspaceBind, ...agentAuthVolumes, ...repoMounts];

  const agentSecrets = bare ? [] : agentDef.defaultSecrets;
  const repoSecrets = repoConfig.secrets ?? [];
  const serviceSecrets = Object.values(repoConfig.network?.serviceDomains ?? {});
  const allSecrets = [...new Set([...agentSecrets, ...repoSecrets, ...serviceSecrets])];

  const agentDomains = bare ? [] : agentDef.defaultDomains;
  const repoDomains = repoConfig.network?.allowedDomains ?? [];
  const serviceDomainKeys = Object.keys(repoConfig.network?.serviceDomains ?? {});
  const allDomains = [...new Set([...agentDomains, ...repoDomains, ...serviceDomainKeys])];

  return {
    agent,
    agentDef,
    image: agentDef.template,
    command: agentDef.command,
    env: repoConfig.env ?? {},
    mounts,
    secrets: allSecrets,
    domains: allDomains,
    toolchain: repoConfig.toolchain ?? [],
    setup: repoConfig.setup ?? [],
    raw,
    bare: !!bare,
    workspaceDir,
    workspaceSlug,
    sandboxName: sandboxName({ workspaceSlug, agent, profile, override: nameOverride }),
    profile,
  };
}
