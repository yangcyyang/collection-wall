import { expandQueryTokens, isNaturalLanguage } from "./ask-ai-text.mjs";

export { isNaturalLanguage };

const STRONG_SCORE = 4;
const FIELDS = [
  ["name", 5],
  ["tags", 4],
  ["capabilities", 4],
  ["search_keywords", 2],
  ["headline", 2],
  ["intro", 1],
];

function fieldText(tool, key) {
  const value = tool?.[key];
  if (Array.isArray(value)) return value.join(" ").toLowerCase();
  return String(value ?? "").toLowerCase();
}

function tokenWeight(token) {
  if (/^[a-z0-9]{3,}$/.test(token)) return 1.4;
  if (token.length >= 2) return 1.2;
  return 0.35;
}

export function scoreTool(queryTokens, tool) {
  let score = 0;
  const matched = [];
  for (const token of queryTokens) {
    for (const [key, weight] of FIELDS) {
      const hay = fieldText(tool, key);
      if (!hay || !hay.includes(token)) continue;
      score += weight * tokenWeight(token);
      matched.push({ token, key });
      break;
    }
  }
  return { score, matched };
}

export function bestReason(matched, tool) {
  const hit = matched.find((item) => item.key === "tags" || item.key === "capabilities") ?? matched[0];
  if (!hit) return tool?.headline || tool?.name || "";
  if (hit.key === "tags") return `匹配标签 ${hit.token}`;
  if (hit.key === "capabilities") return `匹配能力 ${hit.token}`;
  if (hit.key === "name") return `名称含 ${tool.name}`;
  return tool.headline || `匹配 ${hit.token}`;
}

export function rankTools(query, tools = []) {
  const tokens = expandQueryTokens(query);
  if (!tokens.length) return [];
  return tools
    .map((tool) => {
      const { score, matched } = scoreTool(tokens, tool);
      return { id: tool.id, score, reason: bestReason(matched, tool), matched };
    })
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : 1));
}

export function isLocalStrong(hits = []) {
  return Boolean(hits[0] && hits[0].score >= STRONG_SCORE);
}

export function keywordHits(query, tools = []) {
  const keys = expandQueryTokens(query).filter((token) => token.length >= 2);
  if (!keys.length) {
    const fallback = String(query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!fallback.length) return [];
    return tools
      .filter((tool) => fieldBlob(tool).split(/\s+/).some((part) => fallback.some((key) => part.includes(key) || key.includes(part))))
      .map((tool) => ({ id: tool.id, score: 1, reason: "关键词匹配" }));
  }
  return tools
    .filter((tool) => keys.some((key) => fieldBlob(tool).includes(key)))
    .map((tool) => ({ id: tool.id, score: 1, reason: "关键词匹配" }));
}

function fieldBlob(tool) {
  return [
    tool.name,
    tool.headline,
    tool.intro,
    ...(tool.tags ?? []),
    ...(tool.capabilities ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
}
