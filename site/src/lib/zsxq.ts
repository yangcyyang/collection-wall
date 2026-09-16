import { loadZsxqDays, zsxqDirectory } from "./zsxq-days.mjs";

export type ZsxqItem = {
  id: string;
  date: string;
  question: string;
  answer_summary: string;
  tags?: string[];
  url: string;
  rank: number;
};

export type ZsxqDay = {
  schema_version?: number;
  source?: string;
  title?: string;
  planet?: string;
  group_url?: string;
  date: string;
  updated_at?: string;
  count?: number;
  items: ZsxqItem[];
};

const RECENT_DAYS = 7;

export async function getZsxqDays(directory = zsxqDirectory): Promise<ZsxqDay[]> {
  const days = (await loadZsxqDays(directory)) as ZsxqDay[];

  for (const day of days) {
    day.items = Array.isArray(day.items) ? day.items.slice() : [];
    day.items.sort((left, right) => {
      const a = typeof left.rank === "number" ? left.rank : Number.POSITIVE_INFINITY;
      const b = typeof right.rank === "number" ? right.rank : Number.POSITIVE_INFINITY;
      return a - b;
    });
  }

  return days.sort((a, b) => b.date.localeCompare(a.date));
}

export function splitRecentAndArchive(days: ZsxqDay[]) {
  return {
    recent: days.slice(0, RECENT_DAYS),
    archive: days.slice(RECENT_DAYS),
  };
}
