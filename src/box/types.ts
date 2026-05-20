export interface Toolchain {
  [name: string]: string;
}

export interface VolumeDecl {
  name: string;
  mount: string;
}

export interface Mount {
  host: string;
  guest: string;
  readonly?: boolean;
}

export interface PortForward {
  host: number;
  guest: number;
}

export interface NetworkPolicy {
  policy: "none" | "public-only" | "nonlocal" | "allow-all";
  denyDomainSuffix?: string[];
  tlsIntercept?: boolean;
}

export interface SshConfig {
  enabled: boolean;
  user: string;
  authorizedKeysFromHost: string;
}

export interface IdentityConfig {
  forwardSshAgent: boolean;
}

export interface FeatureFlags {
  docker?: boolean;
  clipboard?: boolean;
}

export interface Feature {
  name: string;
  enabled: boolean;
}

export interface Resources {
  memoryMib?: number;
  cpus?: number;
  diskGib?: number;
}

export interface ImageSection {
  base: string;
  toolchains?: Toolchain[];
  agents?: string[];
  packages?: string[];
}

export type PersonalLayer =
  | { volume: VolumeDecl; mount?: never }
  | { mount: Mount; volume?: never };

export interface BoxSection {
  name: string;
  resources?: Resources;
  personalLayer: PersonalLayer;
  volumes?: VolumeDecl[];
  mounts?: Mount[];
  ports?: PortForward[];
  network?: NetworkPolicy;
  ssh?: SshConfig;
  identity?: IdentityConfig;
  features?: FeatureFlags;
}

export interface WorkloadSecret {
  name: string;
  domain: string;
}

export type IdentitySecret = "ssh-agent";

export interface SecretsSection {
  workload?: WorkloadSecret[];
  identity?: IdentitySecret[];
}

export interface BoxManifest {
  version: 1;
  image: ImageSection;
  box: BoxSection;
  secrets?: SecretsSection;
}

export interface ResolvedBox {
  version: 1;
  image: Required<Pick<ImageSection, "base">> & {
    toolchains: Toolchain[];
    agents: string[];
    packages: string[];
  };
  box: {
    name: string;
    resources: Resources;
    personalLayer: PersonalLayer;
    volumes: VolumeDecl[];
    mounts: Mount[];
    ports: PortForward[];
    network: NetworkPolicy;
    ssh: SshConfig | null;
    identity: IdentityConfig;
    features: Required<FeatureFlags>;
  };
  secrets: {
    workload: WorkloadSecret[];
    identity: IdentitySecret[];
  };
  baseSnapshotName: string;
}
