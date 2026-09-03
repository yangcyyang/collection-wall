import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultDir = resolve(process.cwd(), "../data/xiaohongshu");
const defaultRadar = resolve(defaultDir, "radar.json");
const DATE_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

export const SECTION_KEYS = [
  "hot",
  "trends",
  "needs",
  "pains",
  "scenarios",
  "products",
  "content_opps",
  "product_opps",
  "biz_opps",
  "quotes",
];

export const SECTION_LABELS = {
  hot: "热门",
  trends: "趋势",
  needs: "用户需求",
  pains: "用户痛点",
  scenarios: "使用场景",
  products: "AI 产品",
  content_opps: "内容机会",
  product_opps: "产品机会",
  biz_opps: "商业机会",
  quotes: "用户原话",
};

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function emptySummary() {
  return { today_judgement: [], top_signals: [] };
}

function emptyAwareness() {
  return { dominant_level: "", fastest_growing: "", note: "" };
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
    awareness: emptyAwareness(),
  };
}

function normalizeEvidence(raw) {
  return asList(raw).map((entry) => {
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
    direction: asText(item.direction),
    price: asText(item.price),
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

function normalizeAwareness(raw) {
  const awareness = raw && typeof raw === "object" ? raw : {};
  return {
    dominant_level: asText(awareness.dominant_level),
    fastest_growing: asText(awareness.fastest_growing),
    note: asText(awareness.note),
  };
}

function normalizeSections(raw) {
  const sections = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(
    SECTION_KEYS.map((key) => [key, asList(sections[key]).map(normalizeItem)]),
  );
}

export async function getRadarFeed(file = defaultRadar) {
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
      awareness: normalizeAwareness(raw.awareness),
    };
  } catch {
    return emptyFeed();
  }
}

export async function getSectionItems(key, file = defaultRadar) {
  const sections = (await getRadarFeed(file)).sections;
  return sections[key] ?? [];
}

export async function getXiaohongshuItemById(id, file = defaultRadar) {
  const feed = await getRadarFeed(file);
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
  if (feed.summary.today_judgement.length + feed.summary.top_signals.length > 0) return true;
  return Boolean(feed.awareness.dominant_level || feed.awareness.fastest_growing || feed.awareness.note);
}

export async function getRecentReportDates(dir = defaultDir) {
  try {
    const names = await readdir(dir);
    return names.filter((name) => DATE_FILE.test(name)).map((name) => name.slice(0, 10)).sort().reverse();
  } catch {
    return [];
  }
}

const DIRECTION_LABELS = {
  up_fast: "快速上升",
  up: "缓慢上升",
  flat: "稳定",
  down: "下降",
  new: "新出现",
};

const SIGNAL_LABELS = {
  strong: "强",
  mid: "中",
  weak: "弱",
};

export function xiaohongshuDirectionClass(direction = "") {
  if (direction === "up_fast") return "frequent";
  if (direction === "up" || direction === "new") return "new";
  if (direction === "flat") return "common";
  return "occasional";
}

export function xiaohongshuDirectionLabel(direction = "") {
  return DIRECTION_LABELS[direction] ?? direction;
}

export function xiaohongshuSignalClass(strength = "") {
  if (strength === "strong") return "frequent";
  if (strength === "mid") return "common";
  return "occasional";
}

export function xiaohongshuSignalLabel(strength = "") {
  return SIGNAL_LABELS[strength] ?? strength;
}
