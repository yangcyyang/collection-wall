function searchableText(tool) {
  return [tool.name, tool.headline, ...(tool.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesTool(tool, query = "", category = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const matchesCategory = !category || tool.category === category;
  return matchesCategory && (!normalizedQuery || searchableText(tool).includes(normalizedQuery));
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
