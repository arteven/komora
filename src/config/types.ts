export interface Mount {
  type: "bind" | "volume";
  source?: string;        // bind only
  name?: string;          // volume only
  target: string;
}

export interface SecretAllowance {
  name: string;
  hosts?: string[];
  requireTls?: boolean;
  onViolation?: "error";
}

export interface NetworkBlock {
  allowedDomains?: string[];
  serviceDomains?: Record<string, string>;
}

export interface Profile {
  name: string;
  image: string;
  env?: Record<string, string>;
  mounts?: Mount[];
  secrets?: { allowed?: SecretAllowance[] };
  startup?: string[];
  network?: NetworkBlock;  // V1 ignores with warning, reserved for V2 kit-compat
  digest?: string;         // V1 ignores with warning
}

export interface RepoConfig {
  agent: string;
  profile: string;
  env?: Record<string, string>;
  mounts?: Mount[];
  secrets?: { allow?: string[] };
  network?: NetworkBlock;  // V1 ignores with warning
  raw?: Record<string, unknown>;
}

export interface ResolvedConfig {
  agent: string;
  profile: Profile;        // post-merge: env, mounts, secrets, startup all applied
  raw: Record<string, unknown>;
  /** Repo-opted-in subset of profile.secrets.allowed names (preserves repo `allow` order). */
  secretsAllow: string[];
  workspaceDir: string;
  workspaceSlug: string;
  sandboxName: string;
}
