import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type Tweet = {
  rank: number;
  id: string;
  author: string;
  author_bio?: string;
  text: string;
  summary: string;
  url: string;
  created_at: string;
  likes: number;
  views?: string;
  has_media?: boolean;
  media_urls?: string[];
  score: number;
  recommend_reason: string;
  tags?: string[];
};

export type TwitterDay = {
  date: string;
  generated_at?: string;
  items: Tweet[];
};

const RECENT_DAYS = 7;
const twitterDirectory = resolve(process.cwd(), "../data/twitter");

export async function getTwitterDays(): Promise<TwitterDay[]> {
  let files: string[] = [];
  try {
    files = await readdir(twitterDirectory);
  } catch {
    return [];
  }

  const days = await Promise.all(files
    .filter((file) => file.endsWith(".json"))
    .map(async (file) => JSON.parse(await readFile(resolve(twitterDirectory, file), "utf8")) as TwitterDay));

  for (const day of days) {
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

export function tagCounts(days: TwitterDay[]) {
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
    .map(([tag, count]) => ({ tag, count }));
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
