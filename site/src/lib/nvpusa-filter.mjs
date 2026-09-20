export const FILTERS = [
  { id: "all", label: "全部" },
  { id: "hot", label: "热门" },
  { id: "verified", label: "认证" },
  { id: "top", label: "50万+" },
  { id: "100k", label: "10万+" },
  { id: "recent", label: "最近" },
  { id: "lost", label: "流失" },
];

export function isLost(item) {
  return item?.is_suspended === 1 || item?.is_suspended === 2;
}

export function isAlive(item) {
  return !isLost(item);
}

export function isVerified(item) {
  return Boolean(item?.verified);
}

export function matchesSearch(item, query = "") {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  return [item?.screen_name, item?.name, item?.description]
    .some((value) => String(value ?? "").toLowerCase().includes(needle));
}

export function matchesFilter(item, filter = "all") {
  switch (filter) {
    case "hot":
      return isAlive(item);
    case "verified":
      return isVerified(item);
    case "top":
      return Number(item?.followers_count) >= 500000;
    case "100k":
      return Number(item?.followers_count) >= 100000;
    case "recent":
      return true;
    case "lost":
      return isLost(item);
    case "all":
    default:
      return isAlive(item);
  }
}

export function defaultSortForFilter(filter) {
  if (filter === "hot") return "clicks";
  if (filter === "recent") return "recent";
  return "followers";
}

export function sortItems(items, sort = "followers") {
  const list = [...items];
  const numeric = (key) => (left, right) => (Number(right?.[key]) || 0) - (Number(left?.[key]) || 0);
  if (sort === "clicks") return list.sort(numeric("total_clicks"));
  if (sort === "recent") {
    return list.sort((left, right) => String(right?.backed_up_at ?? "").localeCompare(String(left?.backed_up_at ?? "")));
  }
  if (sort === "name") {
    return list.sort((left, right) => String(left?.name ?? "").localeCompare(String(right?.name ?? ""), "zh"));
  }
  return list.sort(numeric("followers_count"));
}

export function filterArchive(items, { filter = "all", query = "", sort } = {}) {
  const resolvedSort = sort ?? defaultSortForFilter(filter);
  return sortItems(
    items.filter((item) => matchesFilter(item, filter) && matchesSearch(item, query)),
    resolvedSort,
  );
}

export function filterCounts(items) {
  return FILTERS.map((item) => ({
    ...item,
    count: items.filter((entry) => matchesFilter(entry, item.id)).length,
  }));
}

export function isLocalMedia(url) {
  return typeof url === "string" && url.startsWith("/nvpusa/");
}

export function coverSrc(item) {
  return isLocalMedia(item?.cover_url) ? item.cover_url : "";
}

export function avatarSrc(item) {
  return isLocalMedia(item?.avatar_url) ? item.avatar_url : "";
}

export function profileUrl(item) {
  const handle = String(item?.screen_name ?? "").trim();
  return handle ? `https://x.com/${handle}` : "";
}

export function formatFollowers(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return "0";
  if (count >= 10000) {
    const wan = count / 10000;
    return `${Number(wan.toFixed(wan >= 10 ? 0 : 1))}万`;
  }
  return String(Math.round(count));
}

export function snippet(text, max = 72) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function itemFromCard(card) {
  return {
    screen_name: card.getAttribute("data-screen-name") ?? "",
    name: card.getAttribute("data-name") ?? "",
    description: card.getAttribute("data-description") ?? "",
    followers_count: Number(card.getAttribute("data-followers") ?? 0),
    total_clicks: Number(card.getAttribute("data-clicks") ?? 0),
    backed_up_at: card.getAttribute("data-backed-up") ?? "",
    verified: Number(card.getAttribute("data-verified") ?? 0),
    is_suspended: Number(card.getAttribute("data-suspended") ?? 0),
  };
}
