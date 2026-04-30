import type { Profile } from "../config/types.js";

export interface ResolveInput {
  profile: Profile;
  values: Record<string, string>;
}

export function resolveSecretArgs(input: ResolveInput): string[] {
  const out: string[] = [];
  for (const allow of input.profile.secrets?.allowed ?? []) {
    const value = input.values[allow.name];
    if (value === undefined) continue;
    if (allow.hosts && allow.hosts.length > 0) {
      for (const host of allow.hosts) {
        out.push("--secret", `${allow.name}=${value}@${host}`);
      }
    } else {
      out.push("--secret", `${allow.name}=${value}`);
    }
  }
  return out;
}
