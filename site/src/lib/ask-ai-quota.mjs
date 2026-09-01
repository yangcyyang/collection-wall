export const ASK_AI_DAILY_LIMIT = 20;
export const ASK_AI_QUOTA_COOKIE = "ask_ai_quota";

export function shanghaiDayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function readQuotaState(payload, now = new Date()) {
  const day = shanghaiDayKey(now);
  if (!payload || payload.d !== day) return { d: day, n: 0 };
  const used = Number(payload.n);
  return { d: day, n: Number.isFinite(used) && used > 0 ? used : 0 };
}

export function remainingQuota(state) {
  return Math.max(0, ASK_AI_DAILY_LIMIT - (state?.n ?? 0));
}

export function consumeQuota(state) {
  return { d: state.d, n: (state?.n ?? 0) + 1 };
}

export function encodeQuotaPayload(state) {
  return JSON.stringify({ d: state.d, n: state.n });
}

export function decodeQuotaPayload(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
