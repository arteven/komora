import type { AgentDefinition } from "../config/types.js";

export const opencode: AgentDefinition = {
  template: "docker/sandbox-templates:opencode-docker",
  command: "opencode",
  defaultArgs: [],
  authVolumes: [{ type: "volume", name: "opencode-auth", target: "/home/agent/.opencode" }],
  defaultSecrets: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
  defaultDomains: ["api.anthropic.com", "api.openai.com"],
};
