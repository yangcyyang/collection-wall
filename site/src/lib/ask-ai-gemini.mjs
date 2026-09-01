export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

export function compactAskCatalog(tools = []) {
  return tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    headline: tool.headline ?? "",
    tags: (tool.tags ?? []).slice(0, 8),
    capabilities: (tool.capabilities ?? []).slice(0, 6),
  }));
}

export function buildGeminiPrompt(query, catalog) {
  const lines = catalog.map((tool) => {
    const tags = (tool.tags ?? []).join("/");
    const caps = (tool.capabilities ?? []).join("/");
    return `${tool.id}\t${tool.name}\t${tool.headline ?? ""}\t${tags}\t${caps}`;
  });
  return [
    "你是收藏墙的检索助手。根据用户正在做的事，从目录里选出最相关的工具。",
    "只返回 JSON：{\"ids\":[\"id\"],\"reasons\":{\"id\":\"不超过16字的中文原因\"}}。",
    "不要编造目录里没有的 id，最多 16 条。",
    `用户：${query}`,
    "目录：",
    lines.join("\n"),
  ].join("\n");
}

export function parseGeminiHits(text, allowedIds) {
  const json = extractJson(text);
  if (!json || !Array.isArray(json.ids)) return null;
  const ids = json.ids.map((id) => String(id)).filter((id) => allowedIds.has(id));
  if (!ids.length) return null;
  const reasons = {};
  for (const id of ids) {
    const reason = json.reasons?.[id];
    if (typeof reason === "string" && reason.trim()) reasons[id] = reason.trim();
  }
  return { ids, reasons };
}

function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function geminiEndpoint(model = DEFAULT_GEMINI_MODEL, apiKey) {
  const safeModel = String(model || DEFAULT_GEMINI_MODEL).replace(/[^\w.-]/g, "") || DEFAULT_GEMINI_MODEL;
  return `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${apiKey}`;
}

export function extractGeminiText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}
