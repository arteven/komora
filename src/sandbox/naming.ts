export interface NameInput {
  workspaceSlug: string;
  agent: string;
  profile: string;
  override?: string;
}

export function sandboxName(input: NameInput): string {
  if (input.override !== undefined) {
    if (input.override.length === 0) throw new Error("--name override must not be empty");
    return input.override;
  }
  return `${input.workspaceSlug}-${input.agent}-${input.profile}`;
}
