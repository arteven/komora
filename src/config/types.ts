export interface Mount {
  type: "bind" | "volume";
  source?: string;
  name?: string;
  target: string;
}

export interface AgentDefinition {
  template: string;
  command: string;
  authVolumes: Mount[];
  defaultSecrets: string[];
  defaultDomains: string[];
}

export interface NetworkConfig {
  allowedDomains?: string[];
  serviceDomains?: Record<string, string>;
}

export interface RepoConfig {
  toolchain?: Record<string, string>[];
  setup?: string[];
  env?: Record<string, string>;
  mounts?: Mount[];
  secrets?: string[];
  network?: NetworkConfig;
  raw?: Record<string, unknown>;
}

export interface ResolvedConfig {
  agent: string;
  agentDef: AgentDefinition;
  image: string;
  command: string;
  env: Record<string, string>;
  mounts: Mount[];
  secrets: string[];
  domains: string[];
  toolchain: Record<string, string>[];
  setup: string[];
  raw: Record<string, unknown>;
  bare: boolean;
  workspaceDir: string;
  workspaceSlug: string;
  sandboxName: string;
}
