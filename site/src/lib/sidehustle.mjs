import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultFile = resolve(process.cwd(), "../data/sidehustle/ideas.json");

function emptySummary() {
  return { top_plays: [], price_bands: [], gaps: [] };
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
    top_plays: asList(summary.top_plays),
    price_bands: asList(summary.price_bands),
    gaps: asList(summary.gaps),
  };
}

export async function getIdeasFeed(file = defaultFile) {
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

export async function getIdeas(file = defaultFile) {
  return (await getIdeasFeed(file)).items;
}

const STATUS_LABELS = {
  emerging: "新兴",
  hot: "热门",
  stable: "稳定",
  cooling: "降温",
};

const CONFIDENCE_LABELS = { high: "高", medium: "中", low: "低" };

const KIND_LABELS = {
  gig: "兼职",
  course: "课程",
  goods: "资料",
  playbook: "项目",
  service: "服务",
  other: "其他",
};

export function sidehustleStatusClass(status = "") {
  if (status === "emerging") return "new";
  if (status === "hot") return "frequent";
  if (status === "stable") return "common";
  return "occasional";
}

export function sidehustleStatusLabel(status = "") {
  return STATUS_LABELS[status] || status;
}

export function sidehustleConfidenceLabel(value = "") {
  return CONFIDENCE_LABELS[value] || value;
}

export function sidehustleKindLabel(kind = "") {
  return KIND_LABELS[kind] || kind;
}
