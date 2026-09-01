const STOP = new Set([
  "做", "一", "份", "给", "的", "看", "我", "想", "要", "有", "没", "吗", "怎么", "如何",
  "帮", "推荐", "适合", "找", "一个", "一下", "请", "能", "可以", "用", "来", "在", "什么",
  "工具", "帮我", "一下", "这个", "那个", "一些", "一下", "需要", "有没有",
]);

const SYNONYMS = {
  ppt: ["ppt", "pptx", "演示", "幻灯片", "slides", "deck", "presentation"],
  演示: ["ppt", "pptx", "演示", "幻灯片", "slides"],
  提示词: ["提示词", "prompt", "prompts"],
  prompt: ["提示词", "prompt", "prompts"],
  视频: ["视频", "video", "剪辑", "文生视频", "ai视频"],
  video: ["视频", "video", "剪辑"],
  api: ["api", "代理", "中转", "gateway", "openrouter"],
  代理: ["api", "代理", "中转"],
  中转: ["api", "代理", "中转"],
};

const NL_HINT = /怎么|如何|我想|帮我|需要|有没有|适合|推荐|做一份|用来|找一个|有什么/;

export function tokenize(text = "") {
  const lower = String(text).toLowerCase();
  const latin = lower.match(/[a-z0-9]+/g) ?? [];
  const cjkChars = [...lower].filter((ch) => /[\u4e00-\u9fff]/.test(ch));
  const bigrams = [];
  for (let i = 0; i < cjkChars.length - 1; i += 1) bigrams.push(cjkChars[i] + cjkChars[i + 1]);
  return [...latin, ...cjkChars.filter((ch) => ch.length >= 1), ...bigrams]
    .filter((token) => token && !STOP.has(token));
}

export function expandQueryTokens(query) {
  const raw = tokenize(query);
  const expanded = new Set(raw);
  for (const token of raw) {
    for (const extra of SYNONYMS[token] ?? []) expanded.add(extra);
  }
  return [...expanded];
}

export function isNaturalLanguage(query = "") {
  const text = query.trim();
  if (!text) return false;
  if (NL_HINT.test(text)) return true;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = text.split(/\s+/).filter(Boolean);
  return cjk >= 8 || words.length >= 4;
}
