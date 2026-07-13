function timestamp(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function visitCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * 精华区排序：先看真实使用频率，再选较新收录项，最后以 id 固定并列顺序。
 */
export function compareFeaturedTools(left, right) {
  const visitDifference = visitCount(right.visit_count) - visitCount(left.visit_count);
  if (visitDifference !== 0) return visitDifference;

  const addedDifference = timestamp(right.added_at) - timestamp(left.added_at);
  if (addedDifference !== 0) return addedDifference;

  return left.id.localeCompare(right.id);
}

/**
 * 最近收藏排序：无效或缺失时间视为最早收录；同一时间按 id 固定顺序。
 */
export function compareRecentTools(left, right) {
  const addedDifference = timestamp(right.added_at) - timestamp(left.added_at);
  if (addedDifference !== 0) return addedDifference;

  return left.id.localeCompare(right.id);
}

export function selectFeaturedTools(tools, limit = 12) {
  return [...tools].sort(compareFeaturedTools).slice(0, limit);
}
