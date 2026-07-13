import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compareRecentTools } from "./tool-order.mjs";

export type Tool = {
  id: string;
  url: string;
  name: string;
  headline?: string;
  category?: string;
  tags?: string[];
  cover?: string | null;
  status?: string;
  visit_count?: number;
  added_at?: string;
  capture_status?: string;
  source?: string;
};

const toolsDirectory = resolve(process.cwd(), "../data/tools");

export async function getTools(): Promise<Tool[]> {
  const files = await readdir(toolsDirectory);
  const records = await Promise.all(files
    .filter((file) => file.endsWith(".json"))
    .map(async (file) => JSON.parse(await readFile(resolve(toolsDirectory, file), "utf8")) as Tool));

  return records.sort(compareRecentTools);
}
