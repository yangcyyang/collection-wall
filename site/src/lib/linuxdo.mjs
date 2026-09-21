import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultDir = resolve(process.cwd(), "../data/linuxdo");
const defaultDigest = resolve(defaultDir, "digest.json");
const DATE_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function asId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function asCount(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asGroup(value, fallback = "") {
  return value === "hot" || value === "share" ? value : fallback;
}

function emptyFeed() {
  return {
    source: "",
    title: "",
    date: "",
    updated_at: "",
    count: 0,
    hot: [],
    share: [],
    items: [],
  };
}

function normalizeItem(raw, fallbackGroup = "") {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    id: asId(item.id),
    group: asGroup(item.group, fallbackGroup),
    title: asText(item.title),
    likes: asCount(item.likes),
    views: asCount(item.views),
    why: asText(item.why),
    url: asText(item.url),
  };
}

function collectItems(raw) {
  const fromItems = asList(raw.items).map((item) => normalizeItem(item)).filter((item) => item.id);
  if (fromItems.length) {
    return {
      items: fromItems,
      hot: fromItems.filter((item) => item.group === "hot"),
      share: fromItems.filter((item) => item.group === "share"),
    };
  }
  const hot = asList(raw.hot).map((item) => normalizeItem(item, "hot")).filter((item) => item.id);
  const share = asList(raw.share).map((item) => normalizeItem(item, "share")).filter((item) => item.id);
  return { items: [...hot, ...share], hot, share };
}

export async function getDigestFeed(file = defaultDigest) {
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    const grouped = collectItems(raw);
    return {
      source: asText(raw.source),
      title: asText(raw.title),
      date: asText(raw.date),
      updated_at: asText(raw.updated_at),
      count: grouped.items.length,
      ...grouped,
    };
  } catch {
    return emptyFeed();
  }
}

export async function getItems(file = defaultDigest) {
  return (await getDigestFeed(file)).items;
}

export async function getItemById(id, file = defaultDigest) {
  const key = asId(id);
  return (await getItems(file)).find((item) => item.id === key) ?? null;
}

export function hasDigestContent(feed) {
  return asList(feed?.items).length > 0;
}

export async function getRecentReportDates(dir = defaultDir) {
  try {
    const names = await readdir(dir);
    return names.filter((name) => DATE_FILE.test(name)).map((name) => name.slice(0, 10)).sort().reverse();
  } catch {
    return [];
  }
}

export function linuxdoLikesLabel(likes) {
  if (typeof likes !== "number" || !Number.isFinite(likes)) return "";
  return `${likes} 赞`;
}

export function linuxdoViewsLabel(views) {
  if (typeof views !== "number" || !Number.isFinite(views)) return "";
  return `${views} 浏览`;
}

export function itemsByGroup(items) {
  const list = asList(items);
  return {
    hot: list.filter((item) => item.group === "hot"),
    share: list.filter((item) => item.group === "share"),
  };
}
