/** Chip order on /prompts/. Hide a type if it would match 0 cards. */
export const PROMPT_TYPE_CHIPS = [
  "海报", "插画", "人像", "静物", "风景", "字体", "品牌",
  "信息图", "UI", "产品", "场景", "其他",
];

/** When a heading hits two types, pick the stronger format word first. */
const MATCH_PRIORITY = [
  "海报", "品牌", "字体", "插画", "人像",
  "信息图", "UI", "产品", "静物", "风景", "场景",
];

const TITLE_KEYWORDS = {
  海报: ["海报", "poster", "邀约", "邀请", "宣传", "封面海报", "大字报", "广告海报"],
  品牌: ["logo", "品牌", "字标", "identity", "包装"],
  字体: ["巨字", "排版", "typography", "字体", "lettering", "留白冷静信息", "大字", "字压", "字云"],
  插画: ["插画", "illustration", "连环画", "版画", "手绘", "民间", "涂鸦", "graffiti", "水彩", "转绘", "手账", "厚涂", "剪纸", "pixel", "像素", "线稿", "角色", "重绘"],
  人像: ["人像", "人物", "portrait", "群像", "影像", "立绘", "头像", "肖像", "巨像", "写真"],
  信息图: ["信息图", "infographic", "可视化", "爆炸拆解", "拆解图", "时间轴", "详解图", "示意图", "图谱"],
  UI: ["ui", "app 图标", "app图标", "app icon", "界面", "网页视觉", "详情页", "直播间", "个人资料", "样机图", "截图"],
  产品: ["电商", "产品展示", "产品广告", "商品", "香水", "美妆", "product"],
  静物: ["静物", "still life", "饮料", "食物", "花卉", "干花", "物件", "早餐", "苹果", "beverage"],
  风景: ["风景", "landscape", "庭院", "花园", "沙漠", "城市景", "旅行", "窗景"],
  场景: ["场景图", "storyboard", "分镜", "便利店", "自拍"],
};

/** Long prompt bodies repeat 人物/排版/品牌广告; keep this set strict. */
const BODY_KEYWORDS = {
  海报: ["海报", "poster"],
  品牌: ["logo", "字标", "包装"],
  字体: ["巨字", "typography", "lettering", "字体设计"],
  插画: ["插画", "illustration", "连环画"],
  人像: ["人像", "portrait", "群像", "头像", "肖像"],
  信息图: ["infographic", "exploded view", "信息图"],
  UI: ["user interface", "app icon", "ui mockup", "interface design", "界面设计"],
  产品: ["product photography", "product shot", "ecommerce", "电商"],
  静物: ["静物", "still life", "饮料"],
  风景: ["风景", "landscape"],
  场景: ["storyboard"],
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
  return firstHit(headingBlob(text, url), TITLE_KEYWORDS)
    || firstHit(String(prompt), BODY_KEYWORDS)
    || "其他";
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
