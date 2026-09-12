import {
  PROMPT_PAGE_SIZE,
  filterPromptGalleryIndex,
  formatPromptGalleryCount,
  nextPromptGalleryState,
  pagePromptGallery,
} from "./prompt-gallery.mjs";

export function createPromptCard(item) {
  const facets = item.facets ?? [];
  const caption = [item.type, ...facets.slice(0, 2)].filter(Boolean).join(" · ");
  const card = document.createElement("article");
  card.className = "prompt-card";
  card.setAttribute("data-prompt-card", "");
  card.dataset.itemId = item.id ?? "";
  card.dataset.source = item.source ?? "";
  card.dataset.type = item.type ?? "";
  card.dataset.facets = facets.join(",");
  card.dataset.imageCount = String(item.imageCount ?? item.images?.length ?? 0);

  const open = document.createElement("button");
  open.type = "button";
  open.className = "prompt-image-open";
  open.setAttribute("data-open-viewer", "");
  open.setAttribute("aria-label", `查看「${caption}」大图和提示词`);

  const img = document.createElement("img");
  img.src = item.cover || item.images?.[0] || "";
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  open.append(img);

  const count = Number(item.imageCount ?? item.images?.length ?? 0);
  if (count > 1) {
    const badge = document.createElement("span");
    badge.className = "prompt-count-badge";
    badge.textContent = `${count}张`;
    open.append(badge);
  }

  const captionEl = document.createElement("p");
  captionEl.className = "prompt-card-caption";
  captionEl.textContent = caption;

  const list = document.createElement("ul");
  list.className = "prompt-set-images";
  list.hidden = true;
  for (const url of item.images ?? []) {
    const li = document.createElement("li");
    li.setAttribute("data-set-image", url);
    list.append(li);
  }

  const source = document.createElement("a");
  source.className = "prompt-source";
  source.hidden = true;
  source.href = item.tweetUrl || "#";
  source.target = "_blank";
  source.rel = "noreferrer";
  source.textContent = item.sourceLabel || "原文";

  const payload = document.createElement("pre");
  payload.className = "prompt-payload";
  payload.hidden = true;
  payload.textContent = item.prompt ?? "";

  card.append(open, captionEl, list, source, payload);
  return card;
}

function syncPressed(buttons, isSelected) {
  buttons.forEach((item) => {
    const selected = isSelected(item);
    item.classList.toggle("is-selected", selected);
    item.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

export function initPromptGallery(root = document) {
  const indexEl = root.querySelector("[data-prompt-index]");
  const masonry = root.querySelector("[data-prompt-mount]");
  if (!indexEl || !masonry) return;

  let index = [];
  try {
    index = JSON.parse(indexEl.textContent || "[]");
  } catch (error) {
    console.error("prompt gallery index is not valid JSON", error);
    index = [];
  }

  const pageSize = Number(masonry.getAttribute("data-page-size")) || PROMPT_PAGE_SIZE;
  const searchInput = root.querySelector("[data-prompt-search]");
  const typeButtons = root.querySelectorAll("[data-type-filter]");
  const facetButtons = root.querySelectorAll("[data-facet-filter]");
  const filterEmpty = root.querySelector("[data-filter-empty]");
  const countEl = root.querySelector("[data-record-count]");
  const pager = root.querySelector("[data-prompt-pager]");
  const pagerStatus = root.querySelector("[data-pager-status]");
  const pagerPrev = root.querySelector("[data-pager-prev]");
  const pagerNext = root.querySelector("[data-pager-next]");

  let state = { type: "", facets: [], query: "", page: 1 };

  function refresh({ scroll = false } = {}) {
    const filtered = filterPromptGalleryIndex(index, state);
    const paged = pagePromptGallery(filtered, state.page, pageSize);
    state = { ...state, page: paged.page };
    masonry.replaceChildren(...paged.items.map(createPromptCard));
    if (countEl) {
      countEl.textContent = formatPromptGalleryCount({
        matched: paged.total,
        page: paged.page,
        pages: paged.pages,
      });
    }
    if (filterEmpty) filterEmpty.hidden = paged.total !== 0;
    if (pager) {
      pager.hidden = paged.total === 0 || paged.pages <= 1;
      if (pagerStatus) pagerStatus.textContent = `第 ${paged.page}/${paged.pages} 页`;
      if (pagerPrev) pagerPrev.disabled = paged.page <= 1;
      if (pagerNext) pagerNext.disabled = paged.page >= paged.pages;
    }
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  typeButtons.forEach((button) => button.addEventListener("click", () => {
    const next = button.getAttribute("data-type-filter") ?? "";
    state = nextPromptGalleryState(state, { type: state.type === next ? "" : next });
    syncPressed(typeButtons, (item) => (item.getAttribute("data-type-filter") ?? "") === state.type);
    refresh({ scroll: true });
  }));

  facetButtons.forEach((button) => button.addEventListener("click", () => {
    const facet = button.getAttribute("data-facet-filter") ?? "";
    if (!facet) return;
    const facets = new Set(state.facets);
    if (facets.has(facet)) facets.delete(facet);
    else facets.add(facet);
    state = nextPromptGalleryState(state, { facets: [...facets] });
    const selected = facets.has(facet);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    refresh({ scroll: true });
  }));

  searchInput?.addEventListener("input", () => {
    state = nextPromptGalleryState(state, { query: searchInput.value });
    refresh();
  });

  root.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    state = nextPromptGalleryState(state, { type: "", facets: [], query: "" });
    if (searchInput) searchInput.value = "";
    syncPressed(typeButtons, (item) => (item.getAttribute("data-type-filter") ?? "") === "");
    syncPressed(facetButtons, () => false);
    refresh({ scroll: true });
  });

  pagerPrev?.addEventListener("click", () => {
    state = nextPromptGalleryState(state, { page: state.page - 1 });
    refresh({ scroll: true });
  });
  pagerNext?.addEventListener("click", () => {
    state = nextPromptGalleryState(state, { page: state.page + 1 });
    refresh({ scroll: true });
  });

  refresh();
}
