import type { Profile, RepoConfig, ResolvedConfig } from "./types.js";
import { sandboxName } from "../sandbox/naming.js";
import { log } from "../util/log.js";

const RAW_CONFLICT_KEYS = new Set(["env", "mounts", "secrets", "image", "name", "startup"]);

export interface ResolveInput {
  profile: Profile;
  repoConfig: RepoConfig;
  workspaceDir: string;
  workspaceSlug: string;
  nameOverride?: string;
}

function substituteWorkspace(s: string, workspaceDir: string): string {
  return s.replace(/\$\{WORKSPACE\}/g, workspaceDir);
}

export function resolveConfig(input: ResolveInput): ResolvedConfig {
  const { profile, repoConfig, workspaceDir, workspaceSlug, nameOverride } = input;

  if (profile.digest) {
    log.warn(`profile '${profile.name}': 'digest' field is reserved for V2 and is ignored`);
  }

  const profileNetNonEmpty =
    !!profile.network && (
      (profile.network.allowedDomains?.length ?? 0) > 0 ||
      Object.keys(profile.network.serviceDomains ?? {}).length > 0
    );
  const repoNetNonEmpty =
    !!repoConfig.network && (
      (repoConfig.network.allowedDomains?.length ?? 0) > 0 ||
      Object.keys(repoConfig.network.serviceDomains ?? {}).length > 0
    );
  if (profileNetNonEmpty || repoNetNonEmpty) {
    log.warn(`'network' block is reserved for V2 (kit-compat) and is ignored`);
  }

  const env = { ...(profile.env ?? {}), ...(repoConfig.env ?? {}) };

  const profileMounts = (profile.mounts ?? []).map((m) =>
    m.source ? { ...m, source: substituteWorkspace(m.source, workspaceDir) } : m,
  );
  const mounts = [...profileMounts, ...(repoConfig.mounts ?? [])];

  const declared = new Set((profile.secrets?.allowed ?? []).map((s) => s.name));
  for (const name of repoConfig.secrets?.allow ?? []) {
    if (!declared.has(name)) {
      throw new Error(`repo config secrets.allow: '${name}' is not declared in profile '${profile.name}'`);
    }
  }
  const secretsAllow = [...(repoConfig.secrets?.allow ?? [])];

  const raw = repoConfig.raw ?? {};
  for (const key of Object.keys(raw)) {
    if (RAW_CONFLICT_KEYS.has(key)) {
      throw new Error(`raw.${key}: conflicts with komora-modeled field; remove it or use the typed field`);
    }
  }

  const merged: Profile = { ...profile, env, mounts };
  return {
    agent: repoConfig.agent,
    profile: merged,
    raw,
    secretsAllow,
    workspaceDir,
    workspaceSlug,
    sandboxName: sandboxName({ workspaceSlug, agent: repoConfig.agent, profile: profile.name, override: nameOverride }),
  };
}
