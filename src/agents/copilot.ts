import type { AgentDefinition } from "../config/types.js";

export const copilot: AgentDefinition = {
  template: "docker/sandbox-templates:copilot-docker",
  command: "copilot",
  defaultArgs: [],
  authVolumes: [{ type: "volume", name: "copilot-auth", target: "/home/agent/.copilot" }],
  defaultSecrets: ["GITHUB_TOKEN"],
  defaultDomains: ["api.github.com", "github.com", "copilot-proxy.githubusercontent.com"],
};
