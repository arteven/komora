import path from "node:path";
import os from "node:os";

function home(): string {
  return process.env.HOME ?? os.homedir();
}

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME ?? path.join(home(), ".config");
  return path.join(base, "komora");
}

export function stateDir(): string {
  const base = process.env.XDG_STATE_HOME ?? path.join(home(), ".local", "state");
  return path.join(base, "komora");
}

export function secretsFile(): string {
  return path.join(configDir(), "secrets.json");
}

export function userProfilesDir(): string {
  return path.join(configDir(), "profiles");
}

export function lockFile(sandboxName: string): string {
  return path.join(stateDir(), "locks", `${sandboxName}.lock`);
}
