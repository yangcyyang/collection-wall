import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type KnowledgeItem = {
  unit_id: string;
  type: string;
  title: string;
  summary: string;
  points: string[];
  source: string;
  confidence: string;
  ingested_at: string;
  vault_path: string;
};

export type KnowledgeDay = { date: string; items: KnowledgeItem[] };

export const TYPE_META: Record<string, { label: string; className: string }> = {
  SKL: { label: "技能", className: "t-skl" },
  MTH: { label: "方法论", className: "t-mth" },
  CON: { label: "概念", className: "t-con" },
  SOL: { label: "方案", className: "t-sol" },
  QST: { label: "问题", className: "t-qst" },
  OPI: { label: "观点", className: "t-opi" },
  CAS: { label: "案例", className: "t-cas" },
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: "置信度高",
  medium: "置信度中",
  low: "置信度低",
};

const dataFile = resolve(process.cwd(), "../data/knowledge/recent.json");

export async function getKnowledgeDays(): Promise<{ days: KnowledgeDay[]; pool: number }> {
  let raw: { total_pool?: number; items?: KnowledgeItem[] };
  try {
    raw = JSON.parse(await readFile(dataFile, "utf8"));
  } catch {
    return { days: [], pool: 0 };
  }
  const byDate = new Map<string, KnowledgeItem[]>();
  for (const item of raw.items ?? []) {
    if (!item.ingested_at) continue;
    const list = byDate.get(item.ingested_at) ?? [];
    list.push(item);
    byDate.set(item.ingested_at, list);
  }
  const days = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));
  return { days, pool: raw.total_pool ?? 0 };
}

export function obsidianUrl(vaultPath: string) {
  return `obsidian://open?vault=OrbitOS-CN&file=${encodeURIComponent(vaultPath.replace(/\.md$/, ""))}`;
}
