import type { AgentDefinition } from "../config/types.js";

export const claude: AgentDefinition = {
  template: "docker/sandbox-templates:claude-code-docker",
  command: "claude",
  defaultArgs: ["--dangerously-skip-permissions"],
  authVolumes: [{ type: "volume", name: "claude-auth", target: "/home/agent/.claude" }],
  defaultSecrets: ["ANTHROPIC_API_KEY"],
  defaultDomains: ["api.anthropic.com", "auth.anthropic.com"],
};
