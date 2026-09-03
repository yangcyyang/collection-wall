import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultDemands = resolve(process.cwd(), "../data/xianyu/demands.json");

function emptySummary() {
  return { top_demands: [], price_bands: [], gaps: [], trend_highlights: [], hot_highlights: [] };
}

function emptyFeed() {
  return { source: "", title: "", updated_at: "", count: 0, summary: emptySummary(), items: [] };
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSummary(raw) {
  const summary = raw && typeof raw === "object" ? raw : {};
  return {
    top_demands: asList(summary.top_demands),
    price_bands: asList(summary.price_bands),
    gaps: asList(summary.gaps),
    trend_highlights: asList(summary.trend_highlights),
    hot_highlights: asList(summary.hot_highlights),
  };
}

export async function getDemandsFeed(file = defaultDemands) {
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    const items = asList(raw.items);
    return {
      source: raw.source ?? "",
      title: raw.title ?? "",
      updated_at: raw.updated_at ?? "",
      count: items.length,
      summary: normalizeSummary(raw.summary),
      items,
    };
  } catch {
    return emptyFeed();
  }
}

export async function getDemands(file = defaultDemands) {
  return (await getDemandsFeed(file)).items;
}

export async function getDemandById(id, file = defaultDemands) {
  return (await getDemands(file)).find((item) => item.id === id) ?? null;
}

const STATUS_LABELS = {
  emerging: "新兴",
  hot: "热门",
  stable: "稳定",
  cooling: "降温",
};

const CONFIDENCE_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
};

const KIND_LABELS = {
  want: "求购",
  service: "服务",
  account: "账号",
  course: "课程",
  goods: "商品",
  other: "其他",
};

export function xianyuStatusClass(status = "") {
  if (status === "emerging") return "new";
  if (status === "hot") return "frequent";
  if (status === "stable") return "common";
  return "occasional";
}

export function xianyuStatusLabel(status = "") {
  return STATUS_LABELS[status] ?? status;
}

export function xianyuConfidenceLabel(confidence = "") {
  return CONFIDENCE_LABELS[confidence] ?? confidence;
}

export function xianyuKindLabel(kind = "") {
  return KIND_LABELS[kind] ?? kind;
}

export function xianyuLane(item = {}) {
  if (item.lane === "hot" || item.lane === "trend") return item.lane;
  if (item.status === "emerging" || item.kind === "want") return "trend";
  if (item.status === "hot") return "hot";
  return "trend";
}

export function xianyuLaneLabel(lane = "") {
  if (lane === "trend") return "趋势";
  if (lane === "hot") return "热门";
  return lane;
}

export function demandsByLane(items, lane) {
  return asList(items).filter((item) => xianyuLane(item) === lane);
}
