import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const zsxqDirectory = resolve(process.cwd(), "../data/zsxq");
export const ZSXQ_DAY_FILENAME = /^\d{4}-\d{2}-\d{2}\.json$/;

export function isZsxqDayFilename(name) {
  return ZSXQ_DAY_FILENAME.test(name);
}

export function isZsxqDayPayload(data) {
  return Boolean(data) && typeof data === "object" && Array.isArray(data.items);
}

export async function loadZsxqDays(directory = zsxqDirectory) {
  let files = [];
  try {
    files = await readdir(directory);
  } catch {
    return [];
  }

  const parsed = await Promise.all(
    files.filter(isZsxqDayFilename).map(async (file) => {
      const data = JSON.parse(await readFile(resolve(directory, file), "utf8"));
      return isZsxqDayPayload(data) ? data : null;
    }),
  );
  return parsed.filter(Boolean);
}
