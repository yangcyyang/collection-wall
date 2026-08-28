import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { emptyFeed } from "./news.mjs";

export {
  categoryFilters,
  categoryLabel,
  formatBeijingDateTime,
} from "./news.mjs";

export type NewsLinks = {
  aihot: string;
  original: string;
};

export type NewsItem = {
  id: string;
  title: string;
  category: string;
  source: string;
  published_at: string;
  discovered_at: string;
  summary: string;
  reason: string;
  links: NewsLinks;
};

export type NewsDaily = {
  date: string;
  title: string;
  url: string;
};

export type NewsFeed = {
  source: string;
  title: string;
  updated_at: string;
  count: number;
  items: NewsItem[];
  daily?: NewsDaily;
  error?: string;
};

const dataFile = resolve(process.cwd(), "../data/news/aihot.json");

export async function getNewsFeed(): Promise<NewsFeed> {
  try {
    const raw = JSON.parse(await readFile(dataFile, "utf8")) as NewsFeed;
    if (!raw || !Array.isArray(raw.items)) {
      return emptyFeed({ error: "资讯数据格式无效" }) as NewsFeed;
    }
    return raw;
  } catch {
    return emptyFeed({ error: "尚未采集到 AIHOT 资讯" }) as NewsFeed;
  }
}
