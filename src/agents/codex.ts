import type { AgentDefinition } from "../config/types.js";

export const codex: AgentDefinition = {
  template: "docker/sandbox-templates:codex-docker",
  command: "codex",
  authVolumes: [{ type: "volume", name: "codex-auth", target: "/home/agent/.codex" }],
  defaultSecrets: ["OPENAI_API_KEY"],
  defaultDomains: ["api.openai.com"],
};
