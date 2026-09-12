import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const twitterDirectory = resolve(process.cwd(), "../data/twitter");
export const TWITTER_DAY_FILENAME = /^\d{4}-\d{2}-\d{2}\.json$/;

export function isTwitterDayFilename(name) {
  return TWITTER_DAY_FILENAME.test(name);
}

export function isTwitterDayPayload(data) {
  return Boolean(data) && typeof data === "object" && Array.isArray(data.items);
}

export async function loadTwitterDays(directory = twitterDirectory) {
  let files = [];
  try {
    files = await readdir(directory);
  } catch {
    return [];
  }

  const parsed = await Promise.all(
    files.filter(isTwitterDayFilename).map(async (file) => {
      const data = JSON.parse(await readFile(resolve(directory, file), "utf8"));
      return isTwitterDayPayload(data) ? data : null;
    }),
  );
  return parsed.filter(Boolean);
}
