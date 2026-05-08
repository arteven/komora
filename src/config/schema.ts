import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

const mountSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["bind", "volume"] },
    source: { type: "string" },
    name: { type: "string" },
    target: { type: "string" },
  },
  required: ["target"],
  additionalProperties: false,
};

const toolchainEntrySchema = {
  type: "object",
  minProperties: 1,
  maxProperties: 1,
  patternProperties: {
    "^[a-z]+$": { type: "string" },
  },
  additionalProperties: false,
};

const networkSchema = {
  type: "object",
  properties: {
    allowedDomains: { type: "array", items: { type: "string" } },
    serviceDomains: {
      type: "object",
      additionalProperties: { type: "string" },
    },
  },
  additionalProperties: false,
};

const repoConfigSchema = {
  type: "object",
  properties: {
    toolchain: { type: "array", items: toolchainEntrySchema },
    setup: { type: "array", items: { type: "string" } },
    env: { type: "object", additionalProperties: { type: "string" } },
    mounts: { type: "array", items: mountSchema },
    secrets: { type: "array", items: { type: "string" } },
    network: networkSchema,
    raw: { type: "object" },
    profile: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
  },
  additionalProperties: false,
};

const validate = ajv.compile(repoConfigSchema);

export function validateRepoConfig(data: unknown): void {
  if (!validate(data)) {
    const msg = validate.errors!.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
    throw new Error(`invalid komora.config.yaml: ${msg}`);
  }
}
