import { cache } from "react";
import type { Paper, PaperListing } from "./paper-shared";
import { buildPaperSlugMap } from "./paper-url";
import {
  HOMEPAGE_DATA_URL,
  MOST_CITED_DATA_URL,
  MOST_STARRED_DATA_URL,
  paperSummaryPath,
  PAPER_CATALOG_URL,
  readStorageJson,
  storageRelativePath,
} from "./public-storage";

export type { Paper, PaperListing } from "./paper-shared";
export { formatCompactNumber, formatMonthYear, topicLabel } from "./paper-shared";

type PaperCatalogData = {
  schemaVersion: number;
  generatedAt: string;
  papers: PaperListing[];
};

export type HomepageData = {
  schemaVersion: number;
  generatedAt: string;
  trending: PaperListing[];
  mostCited: PaperListing[];
  monthCounts: Record<string, number>;
  topicCounts: Record<string, number>;
};

export type MostCitedData = {
  schemaVersion: number;
  generatedAt: string;
  papers: PaperListing[];
  paperCount: number;
};

export type MostStarredData = MostCitedData;

export type PaperDetails = {
  paper: Paper;
  relatedPapers: PaperListing[];
};

export type ResolvedPaperRoute = {
  sourceId: string;
  slug: string;
  listing: PaperListing;
};

export const getPaperCatalog = cache(async (): Promise<PaperCatalogData> => {
  return readStorageJson<PaperCatalogData>(storageRelativePath(PAPER_CATALOG_URL));
});

const getPaperRoutes = cache(async (): Promise<ResolvedPaperRoute[]> => {
  const { papers } = await getPaperCatalog();
  const slugs = buildPaperSlugMap(papers);
  return papers.map((listing) => ({
    sourceId: listing.id,
    slug: slugs.get(listing.id)!,
    listing,
  }));
});

export const resolvePaperRoute = cache(async (identifier: string): Promise<ResolvedPaperRoute | undefined> => {
  const routes = await getPaperRoutes();
  return routes.find((route) => route.sourceId === identifier)
    ?? routes.find((route) => route.slug === identifier);
});

export const getHomepageData = cache(async (): Promise<HomepageData> => {
  return readStorageJson<HomepageData>(storageRelativePath(HOMEPAGE_DATA_URL));
});

export const getMostCitedData = cache(async (): Promise<MostCitedData> => {
  return readStorageJson<MostCitedData>(storageRelativePath(MOST_CITED_DATA_URL));
});

export const getMostStarredData = cache(async (): Promise<MostStarredData> => {
  return readStorageJson<MostStarredData>(storageRelativePath(MOST_STARRED_DATA_URL));
});

export const getPaperDetails = cache(async (id: string): Promise<PaperDetails | undefined> => {
  try {
    return await readStorageJson<PaperDetails>(paperSummaryPath(id));
  } catch {
    return undefined;
  }
});
