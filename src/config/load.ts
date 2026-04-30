import yaml from "js-yaml";
import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { profileSchema } from "./profile-schema.js";
import { repoConfigSchema } from "./schema.js";
import type { Profile, RepoConfig } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validateProfile = ajv.compile<Profile>(profileSchema);
const validateRepoConfig = ajv.compile<RepoConfig>(repoConfigSchema);

function formatErrors(errs: ErrorObject[] | null | undefined): string {
  if (!errs?.length) return "validation failed";
  return errs.map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()).join("; ");
}

export function parseProfile(src: string): Profile {
  const parsed = yaml.load(src);
  if (!validateProfile(parsed)) throw new Error(`profile invalid: ${formatErrors(validateProfile.errors)}`);
  return parsed as Profile;
}

export function parseRepoConfig(src: string): RepoConfig {
  const parsed = yaml.load(src);
  if (!validateRepoConfig(parsed)) throw new Error(`komora.config.yaml invalid: ${formatErrors(validateRepoConfig.errors)}`);
  return parsed as RepoConfig;
}
