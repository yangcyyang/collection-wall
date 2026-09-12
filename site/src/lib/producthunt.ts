export {
  getDigestFeed,
  getProductById,
  getProducts,
  getRecentReportDates,
  hasDigestContent,
  producthuntVotesLabel,
  topProducts,
} from "./producthunt.mjs";

export type ProducthuntProduct = {
  id: string;
  rank: number | "";
  name: string;
  tagline: string;
  intro: string;
  votes: number | null;
  producthunt_url: string;
  website: string;
};

export type ProducthuntFeed = {
  source: string;
  title: string;
  date: string;
  updated_at: string;
  count: number;
  takeaways: string[];
  recommend: string;
  products: ProducthuntProduct[];
};
