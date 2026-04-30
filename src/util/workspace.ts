import path from "node:path";

export function workspaceSlug(cwd: string): string {
  const last = path.basename(path.resolve(cwd));
  const slug = last.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "workspace";
}
