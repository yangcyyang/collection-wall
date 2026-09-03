import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultDir = resolve(process.cwd(), "../data/sidehustle");
const defaultRadar = resolve(defaultDir, "radar.json");
const DATE_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

export const SECTION_KEYS = [
  "opportunities",
  "new_demands",
  "pay_signals",
  "ai_leverage",
  "digital_products",
  "services",
  "content",
  "to_validate",
];

export const SECTION_LABELS = {
  opportunities: "今日副业机会",
  new_demands: "新增需求",
  pay_signals: "付费信号",
  ai_leverage: "AI 可提效的传统服务",
  digital_products: "数字产品",
  services: "接单服务",
  content: "内容账号",
  to_validate: "值得验证",
};

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function asIndex(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return "";
}

function emptySummary() {
  return { today_judgement: [], top_signals: [] };
}

function emptySections() {
  return Object.fromEntries(SECTION_KEYS.map((key) => [key, []]));
}

function emptyFeed() {
  return {
    source: "",
    title: "",
    date: "",
    updated_at: "",
    count: 0,
    summary: emptySummary(),
    sections: emptySections(),
  };
}

function normalizeEvidence(raw) {
  return asList(raw).map((entry) => {
    if (typeof entry === "string") {
      return { url: "", title: "", note: entry };
    }
    const row = entry && typeof entry === "object" ? entry : {};
    return {
      url: asText(row.url),
      title: asText(row.title),
      note: asText(row.note),
    };
  });
}

function normalizeItem(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    id: asText(item.id),
    title: asText(item.title),
    summary: asText(item.summary),
    why: asText(item.why),
    audience: asText(item.audience),
    result: asText(item.result),
    offer: asText(item.offer),
    model: asText(item.model),
    ai_help: asText(item.ai_help),
    start_cost: asText(item.start_cost),
    delivery: asText(item.delivery),
    competition: asText(item.competition),
    index: asIndex(item.index),
    tags: asList(item.tags).map((tag) => asText(tag)).filter(Boolean),
    signal_strength: asText(item.signal_strength),
    evidence: normalizeEvidence(item.evidence),
    first_detected: asText(item.first_detected),
    last_updated: asText(item.last_updated),
  };
}

function normalizeSummary(raw) {
  const summary = raw && typeof raw === "object" ? raw : {};
  return {
    today_judgement: asList(summary.today_judgement).map((line) => asText(line)).filter(Boolean),
    top_signals: asList(summary.top_signals).map((line) => asText(line)).filter(Boolean),
  };
}

function normalizeSections(raw) {
  const sections = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(
    SECTION_KEYS.map((key) => [key, asList(sections[key]).map(normalizeItem)]),
  );
}

export async function getSidehustleFeed(file = defaultRadar) {
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    const sections = normalizeSections(raw.sections);
    const count = SECTION_KEYS.reduce((sum, key) => sum + sections[key].length, 0);
    return {
      source: asText(raw.source),
      title: asText(raw.title),
      date: asText(raw.date),
      updated_at: asText(raw.updated_at),
      count,
      summary: normalizeSummary(raw.summary),
      sections,
    };
  } catch {
    return emptyFeed();
  }
}

export async function getSectionItems(key, file = defaultRadar) {
  const sections = (await getSidehustleFeed(file)).sections;
  return sections[key] ?? [];
}

export async function getSidehustleItemById(id, file = defaultRadar) {
  const feed = await getSidehustleFeed(file);
  for (const key of SECTION_KEYS) {
    const found = feed.sections[key].find((item) => item.id === id);
    if (found) return found;
  }
  return null;
}

export function flattenSectionItems(feed) {
  const out = [];
  for (const key of SECTION_KEYS) {
    feed.sections[key].forEach((item, index) => {
      out.push({ ...item, section: key, key: `${key}:${item.id || index}` });
    });
  }
  return out;
}

export function hasReportContent(feed) {
  if (SECTION_KEYS.some((key) => feed.sections[key].length > 0)) return true;
  return feed.summary.today_judgement.length + feed.summary.top_signals.length > 0;
}

export async function getRecentReportDates(dir = defaultDir) {
  try {
    const names = await readdir(dir);
    return names.filter((name) => DATE_FILE.test(name)).map((name) => name.slice(0, 10)).sort().reverse();
  } catch {
    return [];
  }
}

const MODEL_LABELS = {
  service: "卖服务",
  digital: "卖数字产品",
  traffic: "做流量",
};

const LEVEL_LABELS = {
  low: "低",
  mid: "中",
  high: "高",
};

const SIGNAL_LABELS = {
  strong: "强",
  mid: "中",
  weak: "弱",
};

export function sidehustleModelClass(model = "") {
  if (model === "service") return "frequent";
  if (model === "digital") return "common";
  if (model === "traffic") return "new";
  return "occasional";
}

export function sidehustleModelLabel(model = "") {
  return MODEL_LABELS[model] ?? model;
}

export function sidehustleLevelClass(level = "") {
  if (level === "high") return "frequent";
  if (level === "mid") return "common";
  return "occasional";
}

export function sidehustleLevelLabel(level = "") {
  return LEVEL_LABELS[level] ?? level;
}

export function sidehustleSignalClass(strength = "") {
  if (strength === "strong") return "frequent";
  if (strength === "mid") return "common";
  return "occasional";
}

export function sidehustleSignalLabel(strength = "") {
  return SIGNAL_LABELS[strength] ?? strength;
}

export function sidehustleIndexLabel(index) {
  if (typeof index !== "number" || !Number.isFinite(index) || index <= 0) return "";
  return `副业机会指数 ${index}`;
}
