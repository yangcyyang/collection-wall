import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const thinkingDirectory = resolve(process.cwd(), "../data/thinking");

function emptyFeed() {
  return {
    source: "",
    title: "",
    description: "",
    updated_at: "",
    count: 0,
    categories: [],
    items: [],
  };
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function asFeed(raw) {
  if (!Array.isArray(raw?.items)) return emptyFeed();
  const items = raw.items.filter((item) => item && typeof item === "object");
  const categories = asList(raw.categories).filter(Boolean);
  return {
    source: raw.source ?? "",
    title: raw.title ?? "",
    description: raw.description ?? "",
    updated_at: raw.updated_at ?? "",
    count: items.length,
    categories,
    items,
  };
}

async function readTarget(target) {
  try {
    return asFeed(JSON.parse(await readFile(target, "utf8")));
  } catch {
    return emptyFeed();
  }
}

export async function getThinkingFeed(target = thinkingDirectory) {
  const file = target.endsWith(".json") ? target : resolve(target, "catalog.json");
  return readTarget(file);
}

export async function getThinkingMethods(target = thinkingDirectory) {
  return (await getThinkingFeed(target)).items;
}

export function thinkingSearchBlob(item) {
  return [
    item?.name,
    item?.name_en,
    item?.one_liner,
    item?.how,
    item?.example,
    ...(item?.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesThinking(item, query = "", category = "") {
  const categoryOk = !category || item?.category === category;
  const keys = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const search = thinkingSearchBlob(item);
  const searchOk = keys.length === 0 || keys.some((key) => search.includes(key));
  return categoryOk && searchOk;
}

export function categoryFilters(items, categories = []) {
  const counts = new Map();
  for (const item of items ?? []) {
    if (!item?.category) continue;
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  const order = asList(categories).filter(Boolean);
  const extras = [...counts.keys()].filter((key) => !order.includes(key));
  const keys = order.length ? [...order, ...extras] : extras;
  return keys
    .map((category) => ({ category, count: counts.get(category) ?? 0 }))
    .filter((item) => item.count > 0);
}
