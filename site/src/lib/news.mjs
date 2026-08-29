import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { shanghaiDateKey } from "./shanghai-date.mjs";

export const AIHOT_SOURCE = "aihot";
export const AIHOT_TITLE = "AIHOT 精选资讯";
export const AIHOT_HOME = "https://aihot.virxact.com/";
export const AIHOT_ITEMS_URL = "https://aihot.virxact.com/api/v1/items?mode=selected&window=7d";
export const AIHOT_DAILIES_URL = "https://aihot.virxact.com/api/v1/dailies?limit=1";
export const AIHOT_USER_AGENT = "Mozilla/5.0 (compatible; collection-wall-news/1.0; +https://wall.yangcyyang.cn/)";

export function aihotItemsUrl(cursor) {
  if (!cursor) return AIHOT_ITEMS_URL;
  const url = new URL(AIHOT_ITEMS_URL);
  url.searchParams.set("cursor", cursor);
  return url.href;
}

export const CATEGORY_LABELS = {
  paper: "论文",
  "ai-models": "模型",
  "ai-products": "产品",
  tip: "技巧",
  industry: "行业",
};

export function mapApiItem(raw) {
  const id = String(raw?.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    title: raw.title ?? "",
    category: raw.category ?? "",
    source: raw.source?.name ?? "",
    published_at: raw.publishedAt ?? "",
    discovered_at: raw.discoveredAt ?? "",
    summary: raw.summary ?? "",
    reason: raw.reason ?? "",
    links: {
      aihot: raw.links?.aihot ?? "",
      original: raw.links?.original ?? "",
    },
  };
}

export function dedupItems(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function mergeNewsItems(incoming = [], existing = []) {
  return dedupItems([...incoming, ...existing].filter(Boolean));
}

export function buildFeed({ items = [], updated_at, daily, error } = {}) {
  const uniq = dedupItems(items.filter(Boolean));
  const feed = {
    source: AIHOT_SOURCE,
    title: AIHOT_TITLE,
    updated_at: updated_at ?? new Date().toISOString(),
    count: uniq.length,
    items: uniq,
  };
  if (daily) feed.daily = daily;
  if (error) feed.error = String(error);
  return feed;
}

export function emptyFeed({ updated_at, error } = {}) {
  return buildFeed({ items: [], updated_at, error });
}

export function itemTimestamp(item) {
  return item?.published_at || item?.discovered_at || "";
}

export function formatBeijingClock(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(instant));
}

export function formatNewsDayLabel(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [, month, day] = date.split("-");
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString("zh-CN", {
    weekday: "short",
    timeZone: "Asia/Shanghai",
  });
  return `${Number(month)}月${Number(day)}日 ${weekday}`;
}

export function groupNewsDays(items = []) {
  const byDate = new Map();
  for (const item of items) {
    const date = shanghaiDateKey(itemTimestamp(item));
    if (!date) continue;
    const list = byDate.get(date) ?? [];
    list.push(item);
    byDate.set(date, list);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayItems]) => ({
      date,
      items: [...dayItems].sort((a, b) => {
        const time = Date.parse(itemTimestamp(b)) - Date.parse(itemTimestamp(a));
        return time !== 0 ? time : String(b.id ?? "").localeCompare(String(a.id ?? ""));
      }),
    }));
}

export function formatBeijingDateTime(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return "";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(instant));
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour").padStart(2, "0");
  const minute = get("minute").padStart(2, "0");
  return `${get("year")}年${Number(get("month"))}月${Number(get("day"))}日 ${hour}:${minute}`;
}

export function categoryLabel(category = "") {
  return CATEGORY_LABELS[category] ?? category;
}

export function categoryFilters(items = []) {
  const counts = new Map();
  for (const item of items) {
    const category = item?.category;
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([category, count]) => ({
    category,
    label: categoryLabel(category),
    count,
  }));
}

async function readJson(fetchFn, url) {
  const response = await fetchFn(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": AIHOT_USER_AGENT,
    },
  });
  if (!response?.ok) {
    throw new Error(`AIHOT ${url} HTTP ${response?.status ?? "error"}`);
  }
  return response.json();
}

function mapDailyIndex(raw) {
  const date = raw?.date ?? "";
  if (!date) return undefined;
  return {
    date,
    title: raw.leadTitle ?? "",
    url: raw.links?.aihot ?? `${AIHOT_HOME}daily/${date}`,
  };
}

export function parseNewsFeed(raw) {
  if (!raw || !Array.isArray(raw.items)) {
    return emptyFeed({ error: "资讯数据格式无效" });
  }
  return raw;
}

export async function getNewsFeed(file = resolve(process.cwd(), "../data/news/aihot.json")) {
  try {
    return parseNewsFeed(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return emptyFeed({ error: "尚未采集到 AIHOT 资讯" });
  }
}

async function fetchSelectedItems(fetchFn) {
  const items = [];
  const seenCursors = new Set();
  let cursor;
  try {
    while (true) {
      if (cursor) {
        if (seenCursors.has(cursor)) break;
        seenCursors.add(cursor);
      }
      const payload = await readJson(fetchFn, aihotItemsUrl(cursor));
      items.push(...(payload.items ?? []).map(mapApiItem).filter(Boolean));
      const next = payload.page?.hasMore ? payload.page.nextCursor : "";
      if (!next) break;
      cursor = next;
    }
    return { items };
  } catch (error) {
    if (items.length === 0) throw error;
    return { items, error };
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : error ? String(error) : undefined;
}

export async function collectAihot({ fetchFn = globalThis.fetch, now = new Date(), previous } = {}) {
  const updated_at = now.toISOString();
  const existing = Array.isArray(previous?.items) ? previous.items : [];
  try {
    const fetched = await fetchSelectedItems(fetchFn);
    let daily;
    try {
      daily = mapDailyIndex((await readJson(fetchFn, AIHOT_DAILIES_URL)).items?.[0]);
    } catch {
      daily = previous?.daily;
    }
    return buildFeed({
      items: mergeNewsItems(fetched.items, existing),
      updated_at,
      daily,
      error: errorMessage(fetched.error),
    });
  } catch (error) {
    const message = errorMessage(error);
    if (existing.length > 0) {
      return buildFeed({
        items: existing,
        updated_at,
        daily: previous?.daily,
        error: message,
      });
    }
    return emptyFeed({ updated_at, error: message });
  }
}
