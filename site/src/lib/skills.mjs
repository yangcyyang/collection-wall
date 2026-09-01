import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { MARKETPLACE_CATEGORIES } from "./colaskill.mjs";

const skillsDirectory = resolve(process.cwd(), "../data/skills");

function emptyFeed() {
  return { source: "", title: "", updated_at: "", count: 0, items: [] };
}

function asFeed(raw) {
  if (Array.isArray(raw?.items)) {
    return {
      source: raw.source ?? "",
      title: raw.title ?? "",
      updated_at: raw.updated_at ?? "",
      count: raw.items.length,
      items: raw.items,
    };
  }
  if (raw?.slug || raw?.id) {
    return { source: raw.source ?? "", title: raw.title ?? "", updated_at: "", count: 1, items: [raw] };
  }
  return emptyFeed();
}

async function readTarget(target) {
  try {
    return asFeed(JSON.parse(await readFile(target, "utf8")));
  } catch {
    return emptyFeed();
  }
}

export async function getSkillsFeed(target = skillsDirectory) {
  if (target.endsWith(".json")) return readTarget(target);
  let files = [];
  try {
    files = (await readdir(target)).filter((file) => file.endsWith(".json"));
  } catch {
    return emptyFeed();
  }
  const feeds = await Promise.all(files.map((file) => readTarget(resolve(target, file))));
  const items = feeds.flatMap((feed) => feed.items);
  const latest = feeds.map((feed) => feed.updated_at).filter(Boolean).sort().at(-1) ?? "";
  return {
    source: feeds.find((feed) => feed.source)?.source ?? "",
    title: feeds.find((feed) => feed.title)?.title ?? "",
    updated_at: latest,
    count: items.length,
    items,
  };
}

export async function getSkills(target = skillsDirectory) {
  return (await getSkillsFeed(target)).items;
}

export function formatGithubStars(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return "";
  return String(value);
}

export function skillSearchBlob(skill) {
  return [skill?.title, skill?.headline, skill?.author, skill?.slug, ...(skill?.categories ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesSkill(skill, query = "", category = "") {
  const categoryOk = !category || (skill.categories ?? []).includes(category);
  const keys = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const search = skillSearchBlob(skill);
  const searchOk = keys.length === 0 || keys.some((key) => search.includes(key));
  return categoryOk && searchOk;
}

export function categoryFilters(skills) {
  const counts = new Map();
  for (const skill of skills) {
    for (const category of skill.categories ?? []) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return MARKETPLACE_CATEGORIES
    .map(({ zh }) => ({ category: zh, count: counts.get(zh) ?? 0 }))
    .filter((item) => item.count > 0);
}

export { MARKETPLACE_CATEGORIES };
