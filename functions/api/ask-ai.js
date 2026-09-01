import { compactAskCatalog, buildGeminiPrompt, DEFAULT_GEMINI_MODEL, extractGeminiText, geminiEndpoint, parseGeminiHits } from "../../site/src/lib/ask-ai-gemini.mjs";
import { ASK_AI_QUOTA_COOKIE, consumeQuota, decodeQuotaPayload, encodeQuotaPayload, readQuotaState, remainingQuota } from "../../site/src/lib/ask-ai-quota.mjs";
import { fallbackNotice } from "../../site/src/lib/ask-ai-route.mjs";

export async function onRequest(context) {
  return handleAskAi(context);
}

export async function handleAskAi({ request, env = {}, fetchImpl = fetch, now = new Date() }) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const query = String(body?.query ?? "").trim();
  if (!query) return json({ error: "empty_query" }, 400);

  const clientKey = typeof body.clientKey === "string" ? body.clientKey.trim() : "";
  const catalog = compactAskCatalog(Array.isArray(body.catalog) ? body.catalog : []);
  const sharedKey = String(env.GEMINI_API_KEY ?? "").trim();
  const apiKey = clientKey || sharedKey;
  const quota = initialQuota(request, env, now);
  const quotaLeft = remainingQuota(quota);
  const canUseGemini = Boolean(clientKey) || Boolean(sharedKey && quotaLeft > 0);

  if (!canUseGemini) {
    return json({
      tier: "keyword",
      notice: fallbackNotice({ hasSharedKey: Boolean(sharedKey), quotaRemaining: quotaLeft }),
    });
  }

  try {
    const hits = await requestGemini({
      query,
      catalog,
      apiKey,
      model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      fetchImpl,
    });
    if (!hits) {
      return json({
        tier: "keyword",
        notice: fallbackNotice({ hasSharedKey: Boolean(sharedKey), quotaRemaining: quotaLeft, geminiFailed: true }),
      });
    }

    const headers = {};
    if (!clientKey) {
      headers["Set-Cookie"] = quotaCookie(consumeQuota(quota));
    }
    return json({ tier: "gemini", ids: hits.ids, reasons: hits.reasons }, 200, headers);
  } catch {
    return json({
      tier: "keyword",
      notice: fallbackNotice({ hasSharedKey: Boolean(sharedKey), quotaRemaining: quotaLeft, geminiFailed: true }),
    });
  }
}

async function requestGemini({ query, catalog, apiKey, model, fetchImpl }) {
  const response = await fetchImpl(geminiEndpoint(model, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildGeminiPrompt(query, catalog) }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return parseGeminiHits(extractGeminiText(payload), new Set(catalog.map((tool) => tool.id)));
}

function initialQuota(request, env, now) {
  if (typeof env.ASK_AI_QUOTA_USED === "number") {
    return readQuotaState({ d: env.ASK_AI_QUOTA_DAY || undefined, n: env.ASK_AI_QUOTA_USED }, now);
  }
  return readQuotaState(decodeQuotaPayload(readCookie(request, ASK_AI_QUOTA_COOKIE)), now);
}

function quotaCookie(state) {
  return `${ASK_AI_QUOTA_COOKIE}=${encodeURIComponent(encodeQuotaPayload(state))}; Path=/; SameSite=Lax; Max-Age=172800`;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return "";
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
