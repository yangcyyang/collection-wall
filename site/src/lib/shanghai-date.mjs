const SHANGHAI = "Asia/Shanghai";

function hasExplicitZone(value) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function shanghaiKeyFromInstant(instant) {
  if (!Number.isFinite(instant)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

/** Calendar YYYY-MM-DD in Asia/Shanghai. Naive timestamps are treated as UTC+8. */
export function shanghaiDateKey(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const addedAt = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(addedAt)) return addedAt;
  const instant = hasExplicitZone(addedAt) ? Date.parse(addedAt) : Date.parse(`${addedAt}+08:00`);
  return shanghaiKeyFromInstant(instant);
}

export function todayShanghaiDateKey(now = new Date()) {
  return shanghaiKeyFromInstant(now.getTime());
}

export function countAddedOnShanghaiDate(tools, dateKey = todayShanghaiDateKey()) {
  if (!dateKey) return 0;
  return tools.reduce((count, tool) => count + (shanghaiDateKey(tool?.added_at) === dateKey ? 1 : 0), 0);
}

export function toolSearchBlob(tool) {
  return [
    tool?.name,
    tool?.headline,
    ...(tool?.tags ?? []),
    ...(tool?.capabilities ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesIntent(searchBlob, keywords) {
  if (!keywords?.length) return true;
  const haystack = searchBlob ?? "";
  return keywords.some((keyword) => haystack.includes(keyword));
}
