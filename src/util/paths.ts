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

export function manifestFile(): string {
  return path.join(configDir(), "box.yaml");
}

export function secretsFile(): string {
  return path.join(configDir(), "secrets.json");
}

export function baseSnapshotName(): string {
  return "komora-base";
}

export function lockFile(name: string): string {
  return path.join(stateDir(), "locks", `${name}.lock`);
}

export function boxStateFile(name: string): string {
  return path.join(stateDir(), `${name}.state`);
}
