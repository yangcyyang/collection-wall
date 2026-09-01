function searchableText(tool) {
  return [tool.name, tool.headline, tool.intro, ...(tool.tags ?? []), ...(tool.capabilities ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesTokens(search, query = "") {
  const keys = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return keys.length === 0 || keys.some((key) => search.includes(key));
}

export function matchesTool(tool, query = "", category = "") {
  const matchesCategory = !category || tool.category === category;
  return matchesCategory && matchesTokens(searchableText(tool), query);
}

export function categoryCounts(tools) {
  const counts = new Map();
  for (const tool of tools) {
    if (!tool.category) continue;
    counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1);
  }
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || (left.category < right.category ? -1 : left.category > right.category ? 1 : 0));
}
