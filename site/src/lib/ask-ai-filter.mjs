import { matchesTokens } from "./tool-filter.mjs";

export function cardMatchesWallFilters({
  searchBlob,
  cardCategory,
  cardId,
  category = "",
  intent = "",
  query = "",
  askIds = null,
}) {
  if (category && cardCategory !== category) return false;
  if (intent && !matchesTokens(searchBlob, intent)) return false;
  if (askIds) return askIds.has(cardId);
  return matchesTokens(searchBlob, query);
}
