export const AIHOT_SOURCE = "aihot";
export const AIHOT_TITLE = "AIHOT 精选资讯";
export const AIHOT_HOME = "https://aihot.virxact.com/";
export const AIHOT_ITEMS_URL = "https://aihot.virxact.com/api/v1/items?mode=selected&window=24h";
export const AIHOT_DAILIES_URL = "https://aihot.virxact.com/api/v1/dailies?limit=1";
export const AIHOT_USER_AGENT = "Mozilla/5.0 (compatible; collection-wall-news/1.0; +https://wall.yangcyyang.cn/)";

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

export async function collectAihot({ fetchFn = globalThis.fetch, now = new Date() } = {}) {
  const updated_at = now.toISOString();
  try {
    const payload = await readJson(fetchFn, AIHOT_ITEMS_URL);
    const items = (payload.items ?? []).map(mapApiItem);
    let daily;
    try {
      const dailies = await readJson(fetchFn, AIHOT_DAILIES_URL);
      daily = mapDailyIndex(dailies.items?.[0]);
    } catch {
      daily = undefined;
    }
    return buildFeed({ items, updated_at, daily });
  } catch (error) {
    return emptyFeed({
      updated_at,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
