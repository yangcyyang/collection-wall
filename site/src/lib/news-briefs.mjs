import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function asBrief(key, raw) {
  if (!DATE_KEY.test(key) || !raw || typeof raw !== "object") return null;
  const date = String(raw.date ?? "").trim();
  const watch = String(raw.watch ?? "").trim();
  const body = String(raw.body ?? "").trim();
  if (date !== key || !watch || !body) return null;
  return { date, watch, body };
}

export function parseNewsBriefs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const briefs = {};
  for (const [key, value] of Object.entries(raw)) {
    const brief = asBrief(key, value);
    if (brief) briefs[key] = brief;
  }
  return briefs;
}

export function briefForDate(briefs, date) {
  if (!date || !briefs || typeof briefs !== "object") return undefined;
  return briefs[date];
}

export async function getNewsBriefs(file = resolve(process.cwd(), "../data/news/briefs.json")) {
  try {
    return parseNewsBriefs(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return {};
  }
}
