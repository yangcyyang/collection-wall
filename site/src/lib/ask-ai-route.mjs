import { isLocalStrong, isNaturalLanguage } from "./ask-ai-rank.mjs";

export const ASK_AI_NOTICES = {
  quota: "额度用完，已改关键词搜索",
  missingKey: "未配置 Gemini，已改关键词搜索",
  geminiError: "Gemini 暂时不可用，已改关键词搜索",
};

export function chooseAskAiTier({ query, localHits, canUseGemini }) {
  const strong = isLocalStrong(localHits);
  const natural = isNaturalLanguage(query);
  if (canUseGemini && (natural || !strong)) return "gemini";
  if (strong) return "local";
  return "keyword";
}

export function fallbackNotice({ hasSharedKey, quotaRemaining, geminiFailed }) {
  if (geminiFailed) return ASK_AI_NOTICES.geminiError;
  if (hasSharedKey && quotaRemaining <= 0) return ASK_AI_NOTICES.quota;
  return ASK_AI_NOTICES.missingKey;
}
