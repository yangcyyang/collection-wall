import { cardMatchesWallFilters } from "./ask-ai-filter.mjs";
import { compactAskCatalog } from "./ask-ai-gemini.mjs";
import { keywordHits, rankTools } from "./ask-ai-rank.mjs";
import { ASK_AI_NOTICES, chooseAskAiTier } from "./ask-ai-route.mjs";

export { keywordHits };
export const GEMINI_KEY_STORAGE = "collection-wall.geminiApiKey";

export function shouldFocusSearchOnSlash(event) {
  if (event?.key !== "/") return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (target?.isContentEditable) return false;
  return true;
}

export function loadClientGeminiKey(storage) {
  return String(storage?.getItem(GEMINI_KEY_STORAGE) ?? "").trim();
}

export function saveClientGeminiKey(value, storage) {
  const key = String(value ?? "").trim();
  if (!key) storage.removeItem(GEMINI_KEY_STORAGE);
  else storage.setItem(GEMINI_KEY_STORAGE, key);
}

export async function runAskAi({ query, catalog, clientKey = "", fetchAskAi }) {
  const localHits = rankTools(query, catalog);
  const tier = chooseAskAiTier({ query, localHits, canUseGemini: true });
  if (tier === "local") return { tier: "local", hits: localHits, notice: "" };

  try {
    const result = await fetchAskAi({
      query,
      clientKey,
      catalog: compactAskCatalog(catalog),
    });
    if (result?.tier === "gemini" && result.ids?.length) {
      return {
        tier: "gemini",
        hits: result.ids.map((id) => ({
          id,
          score: 1,
          reason: result.reasons?.[id] ?? "",
        })),
        notice: "",
      };
    }
    return {
      tier: "keyword",
      hits: keywordHits(query, catalog),
      notice: result?.notice || ASK_AI_NOTICES.geminiError,
    };
  } catch {
    return {
      tier: "keyword",
      hits: keywordHits(query, catalog),
      notice: ASK_AI_NOTICES.geminiError,
    };
  }
}

export async function postAskAi({ query, clientKey, catalog }, fetchImpl = fetch) {
  const response = await fetchImpl("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, catalog, ...(clientKey ? { clientKey } : {}) }),
  });
  if (response.status === 401 || response.status === 302) {
    return { tier: "keyword", notice: ASK_AI_NOTICES.geminiError };
  }
  return response.json();
}

export function bindWallPage(root, options = {}) {
  const documentRef = root.ownerDocument ?? root;
  const searchInput = root.querySelector("[data-tool-search]");
  const cards = [...root.querySelectorAll("[data-tool]")];
  const sections = [...root.querySelectorAll("[data-section]")];
  const matchCount = root.querySelector("[data-match-count]");
  const filterEmpty = root.querySelector("[data-filter-empty]");
  const emptyMessage = root.querySelector("[data-filter-empty-message]");
  const statusEl = root.querySelector("[data-ask-status]");
  const askInput = root.querySelector("[data-ask-query]");
  const storage = options.storage ?? globalThis.localStorage;
  const catalog = options.catalog ?? readCatalog(root);
  let category = "";
  let intent = "";
  let askIds = null;
  let reasons = new Map();

  function refreshCards() {
    const query = searchInput?.value.trim() ?? "";
    let visibleCount = 0;
    cards.forEach((card) => {
      const visible = cardMatchesWallFilters({
        searchBlob: card.dataset.search ?? "",
        cardCategory: card.dataset.category ?? "",
        cardId: card.dataset.toolId ?? "",
        category,
        intent,
        query,
        askIds,
      });
      card.hidden = !visible;
      card.classList.toggle("is-ask-hit", Boolean(visible && askIds));
      const reasonEl = card.querySelector("[data-ask-reason]");
      if (reasonEl) {
        const reason = askIds ? (reasons.get(card.dataset.toolId) ?? "") : "";
        reasonEl.textContent = reason;
        reasonEl.hidden = !reason;
      }
      if (visible) visibleCount += 1;
    });
    sections.forEach((section) => {
      section.hidden = !section.querySelector("[data-tool]:not([hidden])");
    });
    if (matchCount) matchCount.textContent = String(visibleCount);
    if (filterEmpty) {
      filterEmpty.hidden = visibleCount > 0;
      if (visibleCount === 0 && emptyMessage) {
        emptyMessage.textContent = query || askIds
          ? `没有找到 “${query || askInput?.value.trim() || "这次询问"}”。`
          : "这个分类下没有匹配，查看全部工具";
      }
      const clearSearch = root.querySelector("[data-clear-search]");
      if (clearSearch) clearSearch.hidden = !query && !askIds;
    }
  }

  function clearAsk() {
    askIds = null;
    reasons = new Map();
    if (statusEl) statusEl.textContent = "";
  }

  root.querySelectorAll("[data-category-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.categoryFilter ?? "";
      category = category === next ? "" : next;
      root.querySelectorAll("[data-category-filter]").forEach((item) => {
        const selected = (item.dataset.categoryFilter ?? "") === category;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      refreshCards();
    });
  });

  root.querySelectorAll("[data-intent-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.intentFilter ?? "";
      intent = intent === next ? "" : next;
      root.querySelectorAll("[data-intent-filter]").forEach((item) => {
        const selected = intent !== "" && (item.dataset.intentFilter ?? "") === intent;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      refreshCards();
    });
  });

  searchInput?.addEventListener("input", () => {
    clearAsk();
    refreshCards();
  });
  root.querySelector("[data-clear-search]")?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (askInput) askInput.value = "";
    clearAsk();
    refreshCards();
    searchInput?.focus();
  });
  root.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    category = "";
    intent = "";
    if (searchInput) searchInput.value = "";
    if (askInput) askInput.value = "";
    root.querySelectorAll("[data-category-filter]").forEach((item) => {
      const selected = (item.dataset.categoryFilter ?? "") === "";
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    root.querySelectorAll("[data-intent-filter]").forEach((item) => {
      item.classList.remove("is-selected");
      item.setAttribute("aria-pressed", "false");
    });
    clearAsk();
    refreshCards();
  });

  documentRef.addEventListener("keydown", (event) => {
    if (!shouldFocusSearchOnSlash(event)) return;
    event.preventDefault();
    searchInput?.focus();
  });

  bindSettings(root, storage);
  root.querySelector("[data-ask-submit]")?.addEventListener("click", () => submitAsk());
  root.querySelectorAll("[data-ask-example]").forEach((button) => {
    button.addEventListener("click", () => {
      if (askInput) askInput.value = button.dataset.askExample ?? button.textContent ?? "";
      submitAsk();
    });
  });

  async function submitAsk() {
    const query = askInput?.value.trim() ?? "";
    if (!query) return;
    if (statusEl) statusEl.textContent = "正在检索…";
    const result = await runAskAi({
      query,
      catalog,
      clientKey: loadClientGeminiKey(storage),
      fetchAskAi: options.fetchAskAi ?? postAskAi,
    });
    askIds = new Set(result.hits.map((hit) => hit.id));
    reasons = new Map(result.hits.map((hit) => [hit.id, hit.reason ?? ""]));
    if (statusEl) {
      const label = result.tier === "local" ? "本地语义" : result.tier === "gemini" ? "Gemini" : "关键词搜索";
      statusEl.textContent = result.notice || `${label} · ${result.hits.length} 条`;
    }
    refreshCards();
  }

  root.querySelectorAll("[data-retry], [data-sync-notice]").forEach((button) => {
    button.addEventListener("click", () => {
      globalThis.alert("首版为静态站，请在本地 watcher 完成一次同步后再刷新页面。");
    });
  });

  return { refreshCards };
}

function readCatalog(root) {
  const node = root.querySelector("#ask-ai-catalog");
  if (!node) return [];
  try {
    return JSON.parse(node.textContent || "[]");
  } catch {
    return [];
  }
}

function bindSettings(root, storage) {
  const dialog = root.querySelector("[data-ask-settings-dialog]");
  const input = root.querySelector("[data-gemini-key]");
  root.querySelector("[data-ask-settings]")?.addEventListener("click", () => {
    if (input) input.value = loadClientGeminiKey(storage);
    dialog?.showModal?.();
  });
  root.querySelector("[data-ask-settings-save]")?.addEventListener("click", () => {
    saveClientGeminiKey(input?.value ?? "", storage);
    dialog?.close?.();
  });
  root.querySelector("[data-ask-settings-close]")?.addEventListener("click", () => dialog?.close?.());
}
