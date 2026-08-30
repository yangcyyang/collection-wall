/** Chip order on /prompts/. Hide a type if it would match 0 cards. */
export const PROMPT_TYPE_CHIPS = ["海报", "插画", "人像", "字体", "品牌", "信息图", "UI", "场景", "未分类"];

const MERGED_TO_UNCATEGORIZED = new Set(["静物", "风景", "产品", "其他"]);

/** When a heading hits two types, pick the stronger format word first. */
const MATCH_PRIORITY = ["海报", "信息图", "UI", "品牌", "字体", "插画", "人像", "场景", "静物", "风景"];

const TITLE_KEYWORDS = {
  海报: ["海报", "poster", "邀约", "邀请", "宣传", "封面海报", "大字报", "广告海报"],
  信息图: ["信息图", "infographic", "资讯图"],
  UI: ["ui", "界面", "app icon", "appicon"],
  品牌: ["logo", "品牌", "字标", "identity", "包装"],
  字体: ["巨字", "排版", "typography", "字体", "lettering", "留白冷静信息", "大字", "字压", "字云"],
  插画: ["插画", "illustration", "连环画", "版画", "手绘", "民间", "涂鸦", "graffiti", "水彩", "转绘", "手账", "厚涂", "剪纸", "pixel", "像素", "线稿", "角色"],
  人像: ["人像", "人物", "portrait", "群像", "影像", "立绘", "头像", "肖像", "巨像"],
  场景: ["场景", "scene"],
  静物: ["静物", "still life", "饮料", "食物", "花卉", "干花", "product", "物件", "早餐", "苹果", "beverage"],
  风景: ["风景", "landscape", "庭院", "花园", "沙漠", "城市景", "旅行", "窗景"],
};

/** Long prompt bodies repeat 人物/排版/品牌广告; keep this set strict. */
const BODY_KEYWORDS = {
  海报: ["海报", "poster"],
  信息图: ["信息图", "infographic"],
  UI: [" ui ", "界面"],
  品牌: ["logo", "字标", "包装"],
  字体: ["巨字", "typography", "lettering", "字体设计"],
  插画: ["插画", "illustration", "连环画"],
  人像: ["人像", "portrait", "群像", "头像", "肖像"],
  场景: ["场景"],
  静物: ["静物", "still life", "饮料"],
  风景: ["风景", "landscape"],
};

function decodeUrl(url = "") {
  try {
    return decodeURIComponent(String(url));
  } catch {
    return String(url);
  }
}

function headingBlob(text = "", url = "") {
  const firstLine = String(text).split(/\r?\n/).find((line) => line.trim()) ?? "";
  return `${firstLine.slice(0, 100)}\n${decodeUrl(url)}`;
}

function firstHit(blob, table) {
  const hay = blob.toLowerCase();
  for (const type of MATCH_PRIORITY) {
    if ((table[type] ?? []).some((keyword) => hay.includes(keyword.toLowerCase()))) {
      return type;
    }
  }
  return "";
}

export function inferPromptType(text = "", prompt = "", url = "") {
  const raw = firstHit(headingBlob(text, url), TITLE_KEYWORDS)
    || firstHit(String(prompt), BODY_KEYWORDS)
    || "未分类";
  return MERGED_TO_UNCATEGORIZED.has(raw) ? "未分类" : raw;
}

const SOURCE_LABELS = {
  xiaoxiaodong01: "小小东",
  "xiaoxiaodong-newsletter": "小小东",
  aiartdaily: "AI Art Daily",
  meigen: "美根",
};

export function promptFacets(set) {
  const facets = [];
  const source = SOURCE_LABELS[set.source] ?? "";
  if (source) facets.push(source);
  if ((set.images?.length ?? 0) > 1) facets.push("多图");
  return facets;
}

export function promptFacetFilters(sets) {
  const counts = new Map();
  for (const set of sets) {
    for (const facet of promptFacets(set)) {
      counts.set(facet, (counts.get(facet) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .map(([facet, count]) => ({ facet, count }));
}

export function promptTypeFilters(sets) {
  const counts = new Map();
  for (const set of sets) {
    const type = set.type || "其他";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return PROMPT_TYPE_CHIPS
    .filter((type) => (counts.get(type) ?? 0) > 0)
    .map((type) => ({ type, count: counts.get(type) }));
}

export function sourceLinkLabel(url = "") {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      return "原推";
    }
  } catch {
    // keep 原文
  }
  return "原文";
}
