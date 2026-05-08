import yaml from "js-yaml";
import { validateRepoConfig } from "./schema.js";
import type { RepoConfig } from "./types.js";

export function parseRepoConfig(src: string): RepoConfig {
  const data = yaml.load(src) ?? {};
  validateRepoConfig(data);
  return data as RepoConfig;
}
