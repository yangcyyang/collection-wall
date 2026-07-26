import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type Tweet = {
  rank: number;
  id: string;
  author: string;
  author_bio?: string;
  text: string;
  summary: string;
  title?: string;
  url: string;
  created_at: string;
  likes: number;
  views?: string;
  has_media?: boolean;
  media_urls?: string[];
  score?: number;
  recommend_reason: string;
  tags?: string[];
};

const SHORT_TWEET_THRESHOLD = 200;
const RECENT_DAYS = 7;
const twitterDirectory = resolve(process.cwd(), "../data/twitter");
const tagAliasesPath = resolve(process.cwd(), "../pipeline/tag_aliases.json");

type AliasFile = { map?: Record<string, string> };

let aliasTable: Map<string, string> | null = null;

function compactKey(s: string) {
  return s.toLowerCase().replace(/[\s_\-]+/g, "");
}

async function loadAliasTable() {
  if (aliasTable) return aliasTable;
  const table = new Map<string, string>();
  try {
    const raw = JSON.parse(await readFile(tagAliasesPath, "utf8")) as AliasFile;
    for (const [src, dst] of Object.entries(raw.map ?? {})) {
      const canon = dst.trim();
      if (!canon) continue;
      for (const key of [src, src.trim(), src.toLowerCase(), compactKey(src), canon, canon.toLowerCase(), compactKey(canon)]) {
        if (key) table.set(key, canon);
      }
    }
  } catch {
    // missing aliases file: keep tags as-is
  }
  aliasTable = table;
  return table;
}

export function normalizeTag(tag: string, table: Map<string, string>) {
  const raw = tag.trim();
  if (!raw) return raw;
  return table.get(raw) ?? table.get(raw.toLowerCase()) ?? table.get(compactKey(raw)) ?? raw;
}

export function normalizeTags(tags: string[] | undefined, table: Map<string, string>) {
  if (!tags?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const n = normalizeTag(String(tag), table);
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

export function isShortTweet(item: Tweet) {
  return !item.title || item.text.length <= SHORT_TWEET_THRESHOLD;
}

export type TwitterDay = {
  date: string;
  generated_at?: string;
  items: Tweet[];
};

export async function getTwitterDays(): Promise<TwitterDay[]> {
  let files: string[] = [];
  try {
    files = await readdir(twitterDirectory);
  } catch {
    return [];
  }

  const table = await loadAliasTable();
  const days = await Promise.all(files
    .filter((file) => file.endsWith(".json"))
    .map(async (file) => JSON.parse(await readFile(resolve(twitterDirectory, file), "utf8")) as TwitterDay));

  for (const day of days) {
    for (const item of day.items) {
      item.tags = normalizeTags(item.tags, table);
    }
    day.items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  return days.sort((a, b) => b.date.localeCompare(a.date));
}

export function splitRecentAndArchive(days: TwitterDay[]) {
  return {
    recent: days.slice(0, RECENT_DAYS),
    archive: days.slice(RECENT_DAYS),
  };
}

export function tagCounts(days: TwitterDay[], cats?: TagCategories) {
  const counts = new Map<string, number>();
  for (const day of days) {
    for (const item of day.items) {
      for (const tag of item.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count, category: cats?.map[tag] ?? "other" }));
}

export function formatDayLabel(date: string) {
  const [, month, day] = date.split("-");
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString("zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" });
  return `${Number(month)}月${Number(day)}日 ${weekday}`;
}

export function formatTime(createdAt: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(createdAt));
}

export function avatarUrl(author: string) {
  return `https://unavatar.io/x/${author}`;
}

export type TagCategories = {
  order: string[];
  labels: Record<string, string>;
  map: Record<string, string>;
};

const tagCategoriesPath = resolve(process.cwd(), "../pipeline/tag_categories.json");
let categoryTable: TagCategories | null = null;

export async function getTagCategories(): Promise<TagCategories> {
  if (categoryTable) return categoryTable;
  try {
    categoryTable = JSON.parse(await readFile(tagCategoriesPath, "utf8")) as TagCategories;
  } catch {
    categoryTable = { order: [], labels: {}, map: {} };
  }
  return categoryTable;
}

export function categoryOf(tag: string, cats: TagCategories) {
  return cats.map[tag] ?? "other";
}
