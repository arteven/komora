import fs from "node:fs";
import { Sandbox } from "microsandbox";
import { boxStateFile } from "../../util/paths.js";

export type BoxState = "missing" | "running" | "stopped" | "paused";

export async function boxStatus(name: string): Promise<BoxState> {
  const handles = await Sandbox.list();
  const found = handles.find((h: any) => h.name === name);
  if (!found) return "missing";
  if (found.status === "running") return "running";
  try {
    const state = fs.readFileSync(boxStateFile(name), "utf8").trim();
    if (state === "paused") return "paused";
  } catch { /* file absent = not paused */ }
  return "stopped";
}
