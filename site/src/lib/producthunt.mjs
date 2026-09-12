import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultDir = resolve(process.cwd(), "../data/producthunt");
const defaultDigest = resolve(defaultDir, "digest.json");
const DATE_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function asRank(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function asVotes(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function emptyFeed() {
  return {
    source: "",
    title: "",
    date: "",
    updated_at: "",
    count: 0,
    takeaways: [],
    recommend: "",
    products: [],
  };
}

function normalizeProduct(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    id: asText(item.id),
    rank: asRank(item.rank),
    name: asText(item.name),
    tagline: asText(item.tagline),
    intro: asText(item.intro),
    votes: asVotes(item.votes),
    producthunt_url: asText(item.producthunt_url),
    website: asText(item.website),
  };
}

export async function getDigestFeed(file = defaultDigest) {
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    const products = asList(raw.products).map(normalizeProduct);
    return {
      source: asText(raw.source),
      title: asText(raw.title),
      date: asText(raw.date),
      updated_at: asText(raw.updated_at),
      count: products.length,
      takeaways: asList(raw.takeaways).map((line) => asText(line)).filter(Boolean),
      recommend: asText(raw.recommend),
      products,
    };
  } catch {
    return emptyFeed();
  }
}

export async function getProducts(file = defaultDigest) {
  return (await getDigestFeed(file)).products;
}

export async function getProductById(id, file = defaultDigest) {
  return (await getProducts(file)).find((item) => item.id === id) ?? null;
}

export function hasDigestContent(feed) {
  return asList(feed?.products).length > 0;
}

export async function getRecentReportDates(dir = defaultDir) {
  try {
    const names = await readdir(dir);
    return names.filter((name) => DATE_FILE.test(name)).map((name) => name.slice(0, 10)).sort().reverse();
  } catch {
    return [];
  }
}

export function producthuntVotesLabel(votes) {
  if (typeof votes !== "number" || !Number.isFinite(votes)) return "";
  return `${votes} 票`;
}

export function topProducts(products, limit = 10) {
  return asList(products)
    .slice()
    .sort((left, right) => {
      const a = typeof left.rank === "number" ? left.rank : Number.POSITIVE_INFINITY;
      const b = typeof right.rank === "number" ? right.rank : Number.POSITIVE_INFINITY;
      return a - b;
    })
    .slice(0, limit);
}
