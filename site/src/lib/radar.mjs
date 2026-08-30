import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const radarDirectory = resolve(process.cwd(), "../data/radar");
const defaultSignals = resolve(radarDirectory, "signals.json");
const defaultProducts = resolve(radarDirectory, "products.json");
const defaultWatchlist = resolve(radarDirectory, "watchlist.json");

function emptyFeed() {
  return { source: "", title: "", updated_at: "", count: 0, items: [] };
}

async function readFeed(file) {
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    const items = Array.isArray(raw.items) ? raw.items : [];
    return {
      source: raw.source ?? "",
      title: raw.title ?? "",
      updated_at: raw.updated_at ?? "",
      count: items.length,
      items,
    };
  } catch {
    return emptyFeed();
  }
}

function byScoreDesc(a, b) {
  return (b.score ?? 0) - (a.score ?? 0);
}

export async function getSignalsFeed(file = defaultSignals) {
  return readFeed(file);
}

export async function getProductsFeed(file = defaultProducts) {
  return readFeed(file);
}

export async function getWatchlistFeed(file = defaultWatchlist) {
  return readFeed(file);
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

export async function getSignalById(id, file = defaultSignals) {
  return (await getSignals(file)).find((item) => item.id === id) ?? null;
}

export async function getProductById(id, file = defaultProducts) {
  return (await getProducts(file)).find((item) => item.id === id) ?? null;
}

export function homepageSignals(items) {
  return items.filter((item) => item.homepage === true).sort(byScoreDesc);
}

export function homepageProducts(items) {
  return items.filter((item) => item.homepage === true || item.status === "new").sort(byScoreDesc);
}

export function emergingSignals(items) {
  return items.filter((item) => item.status === "new" || item.status === "watching");
}

export function sortEvidenceByDate(evidence) {
  return [...evidence].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
}

const STATUS_LABELS = {
  new: "新发现",
  watching: "观察中",
  strengthening: "加强中",
  weakening: "减弱中",
  confirmed_trend: "已成趋势",
  closed: "已关闭",
};

const CONFIDENCE_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
};

export function radarStatusClass(status = "") {
  if (status === "new") return "new";
  if (status === "strengthening" || status === "confirmed_trend") return "frequent";
  if (status === "watching") return "common";
  return "occasional";
}

export function radarStatusLabel(status = "") {
  return STATUS_LABELS[status] ?? status;
}

export function radarConfidenceLabel(confidence = "") {
  return CONFIDENCE_LABELS[confidence] ?? confidence;
}

export async function radarStaticPaths() {
  const signals = await getSignals();
  const products = await getProducts();
  const ids = new Map();
  for (const item of products) ids.set(item.id, "product");
  for (const item of signals) ids.set(item.id, "signal");
  return [...ids.keys()].map((id) => ({ params: { id } }));
}
