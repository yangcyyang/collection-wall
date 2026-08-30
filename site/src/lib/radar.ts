import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type RadarStatus =
  | "new"
  | "watching"
  | "strengthening"
  | "weakening"
  | "confirmed_trend"
  | "closed";

export type RadarEvidence = {
  url: string;
  source?: string;
  note?: string;
  date?: string;
};

export type RadarJudgmentChange = {
  date: string;
  change: string;
};

export type RadarSignal = {
  id: string;
  title: string;
  type: string;
  score: number;
  confidence: string;
  status: RadarStatus | string;
  first_detected: string;
  last_updated: string;
  summary: string;
  why_it_matters: string;
  tags: string[];
  evidence: RadarEvidence[];
  watch_next: string[];
  homepage?: boolean;
  judgment_changes?: RadarJudgmentChange[];
};

export type RadarProduct = {
  id: string;
  name: string;
  score: number;
  status: RadarStatus | string;
  first_detected: string;
  last_updated: string;
  summary: string;
  novelty: string;
  urls: Record<string, string>;
  tags: string[];
  homepage?: boolean;
};

export type RadarWatchItem = {
  id: string;
  title: string;
  why: string;
  since: string;
  last_updated: string;
  status: RadarStatus | string;
  related_signals?: string[];
};

export type RadarFeed<T> = {
  source: string;
  title: string;
  updated_at: string;
  count: number;
  items: T[];
};

const radarDirectory = resolve(process.cwd(), "../data/radar");
const defaultSignals = resolve(radarDirectory, "signals.json");
const defaultProducts = resolve(radarDirectory, "products.json");
const defaultWatchlist = resolve(radarDirectory, "watchlist.json");

function emptyFeed<T>(): RadarFeed<T> {
  return { source: "", title: "", updated_at: "", count: 0, items: [] };
}

async function readFeed<T>(file: string): Promise<RadarFeed<T>> {
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as Partial<RadarFeed<T>>;
    const items = Array.isArray(raw.items) ? raw.items : [];
    return {
      source: raw.source ?? "",
      title: raw.title ?? "",
      updated_at: raw.updated_at ?? "",
      count: items.length,
      items,
    };
  } catch {
    return emptyFeed<T>();
  }
}

function byScoreDesc<T extends { score?: number }>(a: T, b: T) {
  return (b.score ?? 0) - (a.score ?? 0);
}

export async function getSignalsFeed(file = defaultSignals) {
  return readFeed<RadarSignal>(file);
}

export async function getProductsFeed(file = defaultProducts) {
  return readFeed<RadarProduct>(file);
}

export async function getWatchlistFeed(file = defaultWatchlist) {
  return readFeed<RadarWatchItem>(file);
}

export async function getSignals(file = defaultSignals) {
  return (await getSignalsFeed(file)).items;
}

export async function getProducts(file = defaultProducts) {
  return (await getProductsFeed(file)).items;
}

export async function getWatchlist(file = defaultWatchlist) {
  return (await getWatchlistFeed(file)).items;
}

export async function getSignalById(id: string, file = defaultSignals) {
  return (await getSignals(file)).find((item) => item.id === id) ?? null;
}

export async function getProductById(id: string, file = defaultProducts) {
  return (await getProducts(file)).find((item) => item.id === id) ?? null;
}

export function homepageSignals<T extends { homepage?: boolean; score?: number }>(items: T[]) {
  return items.filter((item) => item.homepage === true).sort(byScoreDesc);
}

export function homepageProducts<T extends { homepage?: boolean; status?: string; score?: number }>(items: T[]) {
  return items.filter((item) => item.homepage === true || item.status === "new").sort(byScoreDesc);
}

export function emergingSignals<T extends { status?: string }>(items: T[]) {
  return items.filter((item) => item.status === "new" || item.status === "watching");
}

export function sortEvidenceByDate<T extends { date?: string }>(evidence: T[]) {
  return [...evidence].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
}

export function radarStatusClass(status = "") {
  if (status === "new") return "new";
  if (status === "strengthening" || status === "confirmed_trend") return "frequent";
  if (status === "watching") return "common";
  return "occasional";
}

export async function radarStaticPaths() {
  const signals = await getSignals();
  const products = await getProducts();
  const ids = new Map<string, "signal" | "product">();
  for (const item of products) ids.set(item.id, "product");
  for (const item of signals) ids.set(item.id, "signal");
  return [...ids.keys()].map((id) => ({ params: { id } }));
}
