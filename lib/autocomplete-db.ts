import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AssetType } from "./types";

const STORAGE_KEY = "razor_autocomplete_db";

/** A single make/model entry in the auto-complete database */
export interface AutocompleteEntry {
  make: string;
  model: string;
  assetType?: AssetType;
  count: number; // How many times this combination was used
  lastUsed: string; // ISO timestamp
}

/** In-memory cache of the auto-complete database */
let dbCache: AutocompleteEntry[] | null = null;

/** Load the auto-complete database from storage */
export async function loadAutocompleteDb(): Promise<AutocompleteEntry[]> {
  if (dbCache) return dbCache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      dbCache = JSON.parse(raw);
      return dbCache!;
    }
  } catch {
    // Ignore parse errors
  }
  dbCache = [];
  return dbCache;
}

/** Save the auto-complete database to storage */
async function saveAutocompleteDb(): Promise<void> {
  if (!dbCache) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dbCache));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Record a make/model entry. If it already exists, increment the count.
 * This builds the database over time as drivers capture assets.
 */
export async function recordMakeModel(
  make: string,
  model: string,
  assetType?: AssetType
): Promise<void> {
  const db = await loadAutocompleteDb();
  const normalizedMake = make.trim();
  const normalizedModel = model.trim();
  if (!normalizedMake || !normalizedModel) return;

  const existing = db.find(
    (e) =>
      e.make.toLowerCase() === normalizedMake.toLowerCase() &&
      e.model.toLowerCase() === normalizedModel.toLowerCase()
  );

  if (existing) {
    existing.count += 1;
    existing.lastUsed = new Date().toISOString();
    if (assetType) existing.assetType = assetType;
  } else {
    db.push({
      make: normalizedMake,
      model: normalizedModel,
      assetType,
      count: 1,
      lastUsed: new Date().toISOString(),
    });
  }

  dbCache = db;
  await saveAutocompleteDb();
}

/**
 * Search for make suggestions based on partial input.
 * Returns unique makes sorted by usage frequency.
 */
export async function suggestMakes(query: string): Promise<string[]> {
  const db = await loadAutocompleteDb();
  if (!query.trim()) {
    // Return all unique makes sorted by frequency
    const makeMap = new Map<string, number>();
    for (const e of db) {
      const key = e.make;
      makeMap.set(key, (makeMap.get(key) || 0) + e.count);
    }
    return [...makeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([make]) => make)
      .slice(0, 20);
  }

  const q = query.toLowerCase();
  const makeMap = new Map<string, number>();
  for (const e of db) {
    if (e.make.toLowerCase().includes(q)) {
      makeMap.set(e.make, (makeMap.get(e.make) || 0) + e.count);
    }
  }
  return [...makeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([make]) => make)
    .slice(0, 10);
}

/**
 * Search for model suggestions based on a selected make and partial model input.
 * Returns models sorted by usage frequency, optionally including the asset type.
 */
export async function suggestModels(
  make: string,
  query: string
): Promise<{ model: string; assetType?: AssetType; count: number }[]> {
  const db = await loadAutocompleteDb();
  const makeLower = make.toLowerCase();
  const q = query.toLowerCase();

  const matches = db
    .filter(
      (e) =>
        e.make.toLowerCase() === makeLower &&
        (q ? e.model.toLowerCase().includes(q) : true)
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return matches.map((e) => ({
    model: e.model,
    assetType: e.assetType,
    count: e.count,
  }));
}
