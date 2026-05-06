import type { AgentDefinition } from "../config/types.js";

export const shell: AgentDefinition = {
  template: "docker/sandbox-templates:shell-docker",
  command: "bash",
  authVolumes: [],
  defaultSecrets: [],
  defaultDomains: [],
};
