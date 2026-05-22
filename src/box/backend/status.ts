import { Sandbox } from "microsandbox";

export type BoxState = "missing" | "running" | "stopped" | "crashed";

export async function boxStatus(name: string): Promise<BoxState> {
  const handles = await Sandbox.list();
  const found = handles.find((h: any) => h.name === name);
  if (!found) return "missing";
  if (found.status === "running") return "running";
  if (found.status === "crashed") return "crashed";
  return "stopped";
}
