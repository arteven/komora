import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

const volumeName = { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" };

const volumeDecl = {
  type: "object",
  properties: {
    name: volumeName,
    mount: { type: "string" },
  },
  required: ["name", "mount"],
  additionalProperties: false,
};

const mount = {
  type: "object",
  properties: {
    host: { type: "string" },
    guest: { type: "string" },
    readonly: { type: "boolean" },
  },
  required: ["host", "guest"],
  additionalProperties: false,
};

const portForward = {
  type: "object",
  properties: {
    host: { type: "integer", minimum: 1, maximum: 65535 },
    guest: { type: "integer", minimum: 1, maximum: 65535 },
  },
  required: ["host", "guest"],
  additionalProperties: false,
};

const toolchainEntry = {
  type: "object",
  minProperties: 1,
  maxProperties: 1,
  patternProperties: { "^[a-z]+$": { type: "string" } },
  additionalProperties: false,
};

const personalLayer = {
  type: "object",
  oneOf: [
    { properties: { volume: volumeDecl }, required: ["volume"], additionalProperties: false },
    { properties: { mount: mount }, required: ["mount"], additionalProperties: false },
  ],
};

const workloadSecret = {
  type: "object",
  properties: {
    name: { type: "string", pattern: "^[A-Z_][A-Z0-9_]*$" },
    domain: { type: "string", minLength: 1 },
  },
  required: ["name", "domain"],
  additionalProperties: false,
};

const network = {
  type: "object",
  properties: {
    policy: { type: "string", enum: ["none", "public-only", "nonlocal", "allow-all"] },
    denyDomainSuffix: { type: "array", items: { type: "string" } },
    tlsIntercept: { type: "boolean" },
  },
  required: ["policy"],
  additionalProperties: false,
};

const ssh = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    user: { type: "string", pattern: "^[a-z_][a-z0-9_-]*$" },
    authorizedKeysFromHost: { type: "string" },
  },
  required: ["enabled", "user", "authorizedKeysFromHost"],
  additionalProperties: false,
};

const manifestSchema = {
  type: "object",
  properties: {
    version: { const: 1 },
    image: {
      type: "object",
      properties: {
        base: { type: "string", minLength: 1 },
        toolchains: { type: "array", items: toolchainEntry },
        agents: { type: "array", items: { type: "string", pattern: "^[a-z][a-z0-9-]*$" } },
        packages: { type: "array", items: { type: "string" } },
      },
      required: ["base"],
      additionalProperties: false,
    },
    box: {
      type: "object",
      properties: {
        name: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
        resources: {
          type: "object",
          properties: {
            memoryMib: { type: "integer", minimum: 256 },
            cpus: { type: "integer", minimum: 1 },
            diskGib: { type: "integer", minimum: 1 },
          },
          additionalProperties: false,
        },
        personalLayer,
        volumes: { type: "array", items: volumeDecl },
        mounts: { type: "array", items: mount },
        ports: { type: "array", items: portForward },
        network,
        ssh,
        identity: {
          type: "object",
          properties: { forwardSshAgent: { type: "boolean" } },
          required: ["forwardSshAgent"],
          additionalProperties: false,
        },
        features: {
          type: "object",
          properties: { docker: { type: "boolean" }, clipboard: { type: "boolean" } },
          additionalProperties: false,
        },
      },
      required: ["name", "personalLayer"],
      additionalProperties: false,
    },
    secrets: {
      type: "object",
      properties: {
        workload: { type: "array", items: workloadSecret },
        identity: { type: "array", items: { const: "ssh-agent" } },
      },
      additionalProperties: false,
    },
  },
  required: ["version", "image", "box"],
  additionalProperties: false,
};

const validate = ajv.compile(manifestSchema);

export function validateBoxManifest(data: unknown): void {
  if (!validate(data)) {
    const msg = validate.errors!.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
    throw new Error(`invalid box.yaml: ${msg}`);
  }
}
