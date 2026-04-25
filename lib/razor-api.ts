// ============================================================
// Razor ERP API Client — JWT Authentication
// ============================================================
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  RazorInboundOrder,
  CapturedAsset,
  JwtAuthResponse,
  IssueJwtDto,
  RazorContact,
  RazorAddress,
} from "./types";

let client: AxiosInstance | null = null;
let currentBaseUrl: string = "";

// Token refresh state — prevents concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Callback to notify the store when token is updated (set by store on boot)
let onTokenRefreshed: ((newToken: string) => void) | null = null;

/**
 * Register a callback that the store uses to persist the refreshed token.
 * Called from store.tsx during initialization.
 */
export function setTokenRefreshCallback(cb: (newToken: string) => void) {
  onTokenRefreshed = cb;
}

/**
 * Resolve the numeric Company ID from a Razor ERP tenant hostname.
 * GET /api/v1/company-domain/{hostname}/to-company
 */
export async function resolveCompanyId(baseUrl: string): Promise<number> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  let hostname: string;
  try {
    hostname = new URL(cleanUrl).host;
  } catch {
    hostname = cleanUrl.replace(/^https?:\/\//, "").split("/")[0];
  }
  const res = await axios.get<{ companyId: number }>(
    `${cleanUrl}/api/v1/company-domain/${hostname}/to-company`,
    {
      headers: { Accept: "application/json" },
      timeout: 10000,
    }
  );
  if (!res.data?.companyId) {
    throw new Error("Could not resolve Company ID from the provided URL.");
  }
  return res.data.companyId;
}

/**
 * Authenticate with Razor ERP using username/password.
 */
export async function loginWithCredentials(
  baseUrl: string,
  login: string,
  password: string
): Promise<JwtAuthResponse & { companyId: number }> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  const companyId = await resolveCompanyId(cleanUrl);
  const body: IssueJwtDto = { companyId, login, password };
  const res = await axios.post<JwtAuthResponse>(
    `${cleanUrl}/api/v1/Auth`,
    body,
    {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      timeout: 15000,
    }
  );
  if (!res.data?.accessToken) {
    throw new Error("Login failed: no access token returned.");
  }
  return { ...res.data, companyId };
}

/**
 * Initialise the reusable Axios client with a JWT access token.
 * Includes a 401 response interceptor that automatically refreshes the token
 * and retries the failed request.
 */
export function initRazorClient(baseUrl: string, accessToken: string) {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  currentBaseUrl = cleanUrl;
  client = axios.create({
    baseURL: `${cleanUrl}/api/v1`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 30000,
  });

  // ---- 401 Interceptor: auto-refresh token and retry ----
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // Only intercept 401 errors, and only retry once per request
      if (error.response?.status !== 401 || originalRequest._retry || !client) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      console.log("[RazorAPI] 401 detected — attempting automatic token refresh...");

      try {
        // Coalesce concurrent refresh attempts into a single request
        if (!isRefreshing) {
          isRefreshing = true;
          refreshPromise = attemptTokenRefresh();
        }
        const newToken = await refreshPromise;
        isRefreshing = false;
        refreshPromise = null;

        if (newToken && client) {
          // Update the default header for future requests
          client.defaults.headers.Authorization = `Bearer ${newToken}`;
          // Update this specific request's header and retry
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          console.log("[RazorAPI] Token refreshed successfully — retrying original request");
          return client(originalRequest);
        }
      } catch (refreshError) {
        isRefreshing = false;
        refreshPromise = null;
        console.error("[RazorAPI] Token refresh failed:", refreshError);
      }

      // If refresh failed, reject with original error
      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * Attempt to refresh the JWT token.
 * Strategy 1: Use the /Auth/refresh endpoint (cookie-based).
 * Strategy 2: Re-authenticate with saved credentials (from Remember Me).
 * Returns the new access token or null if all strategies fail.
 */
async function attemptTokenRefresh(): Promise<string | null> {
  // Strategy 1: Cookie-based refresh
  try {
    console.log("[RazorAPI] Trying /Auth/refresh...");
    const res = await axios.post<JwtAuthResponse>(
      `${currentBaseUrl}/api/v1/Auth/refresh`,
      {},
      {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        timeout: 10000,
        withCredentials: true,
      }
    );
    if (res.data?.accessToken) {
      console.log("[RazorAPI] Token refreshed via /Auth/refresh");
      persistNewToken(res.data.accessToken);
      return res.data.accessToken;
    }
  } catch (e: any) {
    console.log(`[RazorAPI] /Auth/refresh failed (${e?.response?.status}): ${e?.message}`);
  }

  // Strategy 2: Re-authenticate with saved credentials
  try {
    console.log("[RazorAPI] Trying re-authentication with saved credentials...");
    const savedUrl = await AsyncStorage.getItem("razor_saved_url");
    const savedUser = await AsyncStorage.getItem("razor_saved_username");
    const savedPass = await AsyncStorage.getItem("razor_saved_password");

    if (savedUrl && savedUser && savedPass) {
      const result = await loginWithCredentials(savedUrl, savedUser, savedPass);
      if (result.accessToken) {
        console.log("[RazorAPI] Re-authenticated successfully with saved credentials");
        persistNewToken(result.accessToken);
        return result.accessToken;
      }
    } else {
      console.log("[RazorAPI] No saved credentials available for re-authentication");
    }
  } catch (e: any) {
    console.error(`[RazorAPI] Re-authentication failed: ${e?.message}`);
  }

  console.error("[RazorAPI] All token refresh strategies failed");
  return null;
}

/**
 * Persist the new token to secure storage and notify the store.
 * Also clears lookup caches since they were populated under the old session.
 */
function persistNewToken(newToken: string) {
  // Update the in-memory client
  if (client) {
    client.defaults.headers.Authorization = `Bearer ${newToken}`;
  }
  // Clear lookup caches so they'll be re-fetched with the new token
  manufacturersCache = null;
  categoriesCache = null;
  itemTypesCache = null;
  // Notify the store to persist the new token
  if (onTokenRefreshed) {
    onTokenRefreshed(newToken);
  }
}

/**
 * Update the bearer token on the existing client (e.g. after refresh).
 */
export function updateClientToken(accessToken: string) {
  if (client) {
    client.defaults.headers.Authorization = `Bearer ${accessToken}`;
  }
}

export function getRazorClient(): AxiosInstance | null {
  return client;
}

export function clearRazorClient() {
  client = null;
  currentBaseUrl = "";
}

// ---- Connection test ----

export async function testConnection(): Promise<boolean> {
  if (!client) return false;
  try {
    const res = await client.get("/InboundOrder/all", { params: { offset: 0, limit: 1 } });
    return res.status === 200;
  } catch {
    return false;
  }
}

// ---- Token refresh ----

export async function refreshToken(): Promise<JwtAuthResponse | null> {
  if (!currentBaseUrl) return null;
  try {
    const res = await axios.post<JwtAuthResponse>(
      `${currentBaseUrl}/api/v1/Auth/refresh`,
      {},
      {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        timeout: 10000,
        withCredentials: true,
      }
    );
    if (res.data?.accessToken) {
      updateClientToken(res.data.accessToken);
      return res.data;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Sign out ----

export async function signOut(): Promise<void> {
  if (!currentBaseUrl) return;
  try {
    await axios.post(
      `${currentBaseUrl}/api/v1/Auth/sign-out`,
      {},
      { timeout: 5000, withCredentials: true }
    );
  } catch {
    // Best-effort sign out
  }
}

// ---- Inbound Orders ----

interface PageOfResponse<T> {
  items: T[] | null;
  records: number;
  totalCount: number;
}

/**
 * Fetch ALL inbound orders from Razor ERP using offset/limit pagination.
 * The API returns { items, records, totalCount } — we loop until we have them all.
 * An optional onProgress callback reports fetched/total counts for UI updates.
 */
export async function fetchInboundOrders(
  onProgress?: (fetched: number, total: number) => void
): Promise<RazorInboundOrder[]> {
  if (!client) throw new Error("Razor API client not initialized");
  const allOrders: RazorInboundOrder[] = [];
  let offset = 0;
  let totalCount = -1;
  let pageSize = 25; // will be detected from first response
  let batchNum = 0;

  try {
    while (true) {
      batchNum++;
      console.log(`[RazorAPI] Fetching batch #${batchNum}: offset=${offset}`);
      // Send multiple pagination parameter styles to maximize compatibility
      // Some ASP.NET APIs use Offset/Limit, others use offset/limit, PageSize/Page, etc.
      const res = await client.get<PageOfResponse<RazorInboundOrder> | RazorInboundOrder[]>(
        "/InboundOrder/all",
        {
          params: {
            offset,
            limit: 500,
            Offset: offset,
            Limit: 500,
            pageSize: 500,
            PageSize: 500,
            records: 500,
            Records: 500,
          },
          timeout: 60000,
        }
      );
      const data = res.data;

      let items: RazorInboundOrder[];
      if (Array.isArray(data)) {
        items = data;
      } else if (data && typeof data === "object") {
        items = data.items ?? [];
        if (totalCount < 0 && typeof data.totalCount === "number") {
          totalCount = data.totalCount;
          console.log(`[RazorAPI] Total orders reported by server: ${totalCount}`);
        }
        // Use 'records' as the page count if available
        if (typeof data.records === "number" && data.records > 0) {
          pageSize = data.records;
        }
      } else {
        break;
      }

      // Detect actual page size from first batch
      if (batchNum === 1 && items.length > 0) {
        pageSize = items.length;
        console.log(`[RazorAPI] Server page size detected: ${pageSize}`);
      }

      // Deduplicate by ID in case of overlapping offsets
      const existingIds = new Set(allOrders.map((o) => o.id));
      const newItems = items.filter((o) => !existingIds.has(o.id));
      allOrders.push(...newItems);

      console.log(`[RazorAPI] Batch #${batchNum}: got ${items.length} items (${newItems.length} new). Total: ${allOrders.length}${totalCount >= 0 ? ` / ${totalCount}` : ""})`);

      // Report progress
      if (onProgress) {
        onProgress(allOrders.length, totalCount >= 0 ? totalCount : allOrders.length);
      }

      // Stop conditions
      if (items.length === 0) break;
      if (totalCount >= 0 && allOrders.length >= totalCount) break;

      // Advance offset by the number of items the server actually returned
      offset += items.length;

      // If the batch was smaller than the detected page size, we've reached the end
      if (items.length < pageSize) break;

      // Safety cap
      if (offset >= 50000) break;

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch (error: any) {
    if (allOrders.length > 0) {
      console.warn(`[RazorAPI] Partial fetch: returning ${allOrders.length} orders after error: ${error?.message}`);
      return allOrders;
    }
    console.error("Failed to fetch orders:", error?.message);
    throw error;
  }
  console.log(`[RazorAPI] Fetch complete: ${allOrders.length} total orders`);
  return allOrders;
}

// ---- Contact Resolution ----

/**
 * Fetch a contact by ID from Razor ERP.
 * GET /api/v1/Contact/{id}
 */
export async function fetchContact(contactId: number): Promise<RazorContact | null> {
  if (!client) return null;
  try {
    const res = await client.get(`/Contact/${contactId}`);
    return res.data;
  } catch {
    return null;
  }
}

/**
 * Fetch addresses linked to a contact.
 * GET /api/v1/Contact/{id}/addresses
 */
export async function fetchContactAddresses(contactId: number): Promise<RazorAddress[]> {
  if (!client) return [];
  try {
    const res = await client.get(`/Contact/${contactId}/addresses`);
    return Array.isArray(res.data) ? res.data : res.data?.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch a specific customer address by ID.
 * GET /api/v1/Customer/{customerId}/address/by-id/{id}
 */
export async function fetchCustomerAddress(
  customerId: number,
  addressId: number
): Promise<RazorAddress | null> {
  if (!client) return null;
  try {
    const res = await client.get(`/Customer/${customerId}/address/by-id/${addressId}`);
    return res.data;
  } catch {
    return null;
  }
}

/**
 * Enrich an order with contact details and full address.
 * Resolves onsiteContactId (preferred) or customerContactId to get name/phone/email.
 * Resolves customerAddressId to get full street address.
 */
export async function enrichOrderWithContactAndAddress(
  order: RazorInboundOrder
): Promise<RazorInboundOrder> {
  const enriched = { ...order };

  // Resolve contact
  const contactId = order.onsiteContactId || order.customerContactId;
  if (contactId && !order.contactName) {
    const contact = await fetchContact(contactId);
    if (contact) {
      const nameParts = [contact.firstName, contact.lastName].filter(Boolean);
      enriched.contactName = nameParts.join(" ") || undefined;
      enriched.contactPhone =
        contact.mainPhoneNumber ||
        contact.mobilePhoneNumber ||
        contact.businessPhoneNumber ||
        undefined;
      enriched.contactEmail = contact.mainEmail || undefined;
    }
  }

  // Resolve full address if we have customerAddressId but no full address string
  if (order.customerAddressId && order.customerId && !order.locationAddress) {
    const addr = await fetchCustomerAddress(order.customerId, order.customerAddressId);
    if (addr) {
      const parts = [addr.street1, addr.street2, addr.city, addr.stateName, addr.postalCode]
        .filter(Boolean);
      enriched.locationAddress = parts.join(", ");
      enriched.locationCity = addr.city;
      enriched.locationState = addr.stateName;
      enriched.locationZip = addr.postalCode;
    }
  }

  return enriched;
}

/**
 * Geocode an address string to lat/lng coordinates using Nominatim (free, no API key).
 */
export async function geocodeAddress(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const res = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q: address, format: "json", limit: 1 },
      headers: { "User-Agent": "RazorFieldApp/1.0" },
      timeout: 10000,
    });
    if (res.data && res.data.length > 0) {
      return {
        latitude: parseFloat(res.data[0].lat),
        longitude: parseFloat(res.data[0].lon),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchInboundOrder(id: number): Promise<RazorInboundOrder> {
  if (!client) throw new Error("Razor API client not initialized");
  const res = await client.get(`/InboundOrder/${id}`);
  return res.data;
}

export async function fetchOrderLocationDetails(id: number) {
  if (!client) throw new Error("Razor API client not initialized");
  try {
    const res = await client.get(`/InboundOrder/${id}/location-details`);
    return res.data;
  } catch {
    return null;
  }
}

export async function updateOrderNotes(id: number, notes: string) {
  if (!client) throw new Error("Razor API client not initialized");
  return client.patch(`/InboundOrder/${id}/notes`, { notes });
}

// ---- Item Master Lookup / Auto-Create ----

/**
 * In-memory cache of ItemMaster lookups to avoid repeated API calls
 * within the same session. Key = lowercase model name, Value = itemMasterId.
 */
const itemMasterCache = new Map<string, number>();

/**
 * Cached lookup data from Razor ERP.
 * Loaded once per session to avoid repeated API calls.
 */
let manufacturersCache: Array<{ id: number; name: string }> | null = null;
let categoriesCache: Array<{ id: number; name: string }> | null = null;
let itemTypesCache: Array<{ id: number; name: string }> | null = null;

/**
 * Fetch the list of manufacturers from Razor ERP Lookup.
 * GET /api/v1/Lookup/manufacturers
 * Cached after first call.
 */
export async function lookupManufacturers(): Promise<Array<{ id: number; name: string }>> {
  if (manufacturersCache) return manufacturersCache;
  if (!client) return [];
  try {
    console.log("[RazorAPI] Fetching manufacturer lookup list (all entries)...");
    // IMPORTANT: The default page size is only 25, but there are 2600+ manufacturers.
    // We must request a large limit to get them all, otherwise common names like
    // "DELL" (id=136), "APPLE" (id=47), "LENOVO" (id=612) won't be found.
    const res = await client.get("/Lookup/manufacturers", {
      params: { limit: 5000 },
    });
    const data = res.data;
    const items = Array.isArray(data) ? data : data?.items ?? [];
    const mapped = items.map((m: any) => ({ id: m.id ?? m.Id, name: m.name ?? m.Name ?? m.title ?? "" }));
    manufacturersCache = mapped;
    console.log(`[RazorAPI] Loaded ${mapped.length} manufacturers`);
    return mapped;
  } catch (e: any) {
    console.warn(`[RazorAPI] Failed to fetch manufacturers: ${e?.message}`);
    return [];
  }
}

/**
 * Find a manufacturer ID by name (case-insensitive partial match).
 * Returns the first matching manufacturer's ID, or null if not found.
 */
export async function findManufacturerId(name: string): Promise<number | null> {
  if (!name) return null;
  const manufacturers = await lookupManufacturers();
  const lower = name.trim().toLowerCase();
  // Try exact match first
  const exact = manufacturers.find((m) => m.name.toLowerCase() === lower);
  if (exact) {
    console.log(`[RazorAPI] Exact manufacturer match: "${exact.name}" (id=${exact.id})`);
    return exact.id;
  }
  // Try partial match (manufacturer name contains the search term or vice versa)
  const partial = manufacturers.find(
    (m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase())
  );
  if (partial) {
    console.log(`[RazorAPI] Partial manufacturer match: "${partial.name}" (id=${partial.id}) for search "${name}"`);
    return partial.id;
  }
  // Log available manufacturers for debugging
  const available = manufacturers.slice(0, 20).map((m) => m.name).join(", ");
  console.warn(`[RazorAPI] No manufacturer match for "${name}". Available (first 20): ${available}`);
  return null;
}

/**
 * Fetch the list of inventory categories from Razor ERP Lookup.
 * GET /api/v1/Lookup/inventory-categories
 * Cached after first call.
 */
export async function lookupCategories(): Promise<Array<{ id: number; name: string }>> {
  if (categoriesCache) return categoriesCache;
  if (!client) return [];
  try {
    console.log("[RazorAPI] Fetching inventory categories lookup list (all entries)...");
    const res = await client.get("/Lookup/inventory-categories", {
      params: { limit: 1000 },
    });
    const data = res.data;
    const items = Array.isArray(data) ? data : data?.items ?? [];
    const mapped = items.map((c: any) => ({ id: c.id ?? c.Id, name: c.name ?? c.Name ?? c.title ?? "" }));
    categoriesCache = mapped;
    console.log(`[RazorAPI] Loaded ${mapped.length} categories`);
    return mapped;
  } catch (e: any) {
    console.warn(`[RazorAPI] Failed to fetch categories: ${e?.message}`);
    return [];
  }
}

/**
 * Find a category ID by asset type name (case-insensitive).
 * Falls back to the first available category if no match found.
 */
export async function findCategoryId(assetType?: string): Promise<number | null> {
  const categories = await lookupCategories();
  if (categories.length === 0) return null;
  if (assetType) {
    const lower = assetType.trim().toLowerCase();
    const match = categories.find(
      (c) => c.name.toLowerCase() === lower || c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
    );
    if (match) return match.id;
  }
  // Default to first category if no match
  console.log(`[RazorAPI] No category match for "${assetType}", using first available: ${categories[0].name} (id=${categories[0].id})`);
  return categories[0].id;
}

/**
 * Fetch the list of item types from Razor ERP Lookup.
 * GET /api/v1/Lookup/item-types
 * Cached after first call.
 */
export async function lookupItemTypes(): Promise<Array<{ id: number; name: string }>> {
  if (itemTypesCache) return itemTypesCache;
  if (!client) return [];
  try {
    console.log("[RazorAPI] Fetching item types lookup list (all entries)...");
    const res = await client.get("/Lookup/item-types", {
      params: { limit: 500 },
    });
    const data = res.data;
    const items = Array.isArray(data) ? data : data?.items ?? [];
    const mapped = items.map((t: any) => ({ id: t.id ?? t.Id, name: t.name ?? t.Name ?? t.title ?? "" }));
    itemTypesCache = mapped;
    console.log(`[RazorAPI] Loaded ${mapped.length} item types`);
    return mapped;
  } catch (e: any) {
    console.warn(`[RazorAPI] Failed to fetch item types: ${e?.message}`);
    return [];
  }
}

/**
 * Find an item type ID by asset type name (case-insensitive).
 * Maps common asset types: Desktop, Laptop, Monitor, etc.
 * Falls back to the first available item type if no match found.
 */
export async function findItemTypeId(assetType?: string): Promise<number | null> {
  const itemTypes = await lookupItemTypes();
  if (itemTypes.length === 0) return null;
  if (assetType) {
    const lower = assetType.trim().toLowerCase();
    const match = itemTypes.find(
      (t) => t.name.toLowerCase() === lower || t.name.toLowerCase().includes(lower) || lower.includes(t.name.toLowerCase())
    );
    if (match) return match.id;
  }
  // Default to first item type if no match
  console.log(`[RazorAPI] No item type match for "${assetType}", using first available: ${itemTypes[0].name} (id=${itemTypes[0].id})`);
  return itemTypes[0].id;
}

/**
 * Search for an existing ItemMaster by model name.
 * Tries multiple search strategies:
 *   1. GET /api/v1/ItemMaster/by-item-number/{itemNumber}
 *   2. GET /api/v1/ItemMaster/all?search={model}
 * Returns the itemMasterId if found, or null.
 */
export async function searchItemMaster(modelName: string): Promise<number | null> {
  if (!client) return null;

  const cacheKey = modelName.trim().toLowerCase();
  if (itemMasterCache.has(cacheKey)) {
    const cached = itemMasterCache.get(cacheKey)!;
    console.log(`[RazorAPI] ItemMaster cache hit for "${modelName}": id=${cached}`);
    return cached;
  }

  // Strategy 1: Direct lookup by item number
  try {
    console.log(`[RazorAPI] Searching ItemMaster by-item-number: "${modelName}"`);
    const res = await client.get(`/ItemMaster/by-item-number/${encodeURIComponent(modelName)}`);
    const data = res.data;
    if (data && typeof data.id === "number") {
      console.log(`[RazorAPI] Found ItemMaster by-item-number: id=${data.id}`);
      itemMasterCache.set(cacheKey, data.id);
      return data.id;
    }
  } catch (e: any) {
    console.log(`[RazorAPI] by-item-number lookup failed (${e?.response?.status}):`, e?.message);
  }

  // Strategy 2: Search all with query param
  try {
    console.log(`[RazorAPI] Searching ItemMaster/all for: "${modelName}"`);
    const res = await client.get("/ItemMaster/all", {
      params: { search: modelName, itemNumber: modelName },
    });
    const data = res.data;
    const items = Array.isArray(data) ? data : data?.items ?? [];
    // Find exact match (case-insensitive)
    const exact = items.find(
      (item: any) =>
        item.itemNumber?.toLowerCase() === cacheKey ||
        item.title?.toLowerCase() === cacheKey ||
        item.mpn?.toLowerCase() === cacheKey
    );
    if (exact && typeof exact.id === "number") {
      console.log(`[RazorAPI] Found ItemMaster via search: id=${exact.id}`);
      itemMasterCache.set(cacheKey, exact.id);
      return exact.id;
    }
    // Accept first result if only one returned
    if (items.length === 1 && typeof items[0].id === "number") {
      console.log(`[RazorAPI] Single ItemMaster result from search: id=${items[0].id}`);
      itemMasterCache.set(cacheKey, items[0].id);
      return items[0].id;
    }
  } catch (e: any) {
    console.log(`[RazorAPI] ItemMaster/all search failed (${e?.response?.status}):`, e?.message);
  }

  return null;
}

/**
 * Create a new ItemMaster in Razor ERP.
 * POST /api/v1/ItemMaster
 * Requires: manufacturerId and primaryCategoryId (both numeric).
 * Returns the new itemMasterId.
 */
export async function createItemMaster(
  modelName: string,
  manufacturer?: string,
  assetType?: string,
): Promise<number> {
  if (!client) throw new Error("Razor API client not initialized");

  // Resolve required fields: manufacturerId, primaryCategoryId, and itemTypeId
  const manufacturerId = manufacturer ? await findManufacturerId(manufacturer) : null;
  const categoryId = await findCategoryId(assetType);
  const itemTypeId = await findItemTypeId(assetType);

  if (!manufacturerId) {
    console.warn(`[RazorAPI] Could not find manufacturerId for "${manufacturer}". ItemMaster creation may fail.`);
  }
  if (!categoryId) {
    console.warn(`[RazorAPI] Could not find categoryId for "${assetType}". ItemMaster creation may fail.`);
  }
  if (!itemTypeId) {
    console.warn(`[RazorAPI] Could not find itemTypeId for "${assetType}". ItemMaster creation may fail.`);
  }

  const payload: Record<string, unknown> = {
    itemNumber: modelName,
    title: modelName,
  };

  // Include required numeric IDs
  if (manufacturerId) payload.manufacturerId = manufacturerId;
  if (categoryId) payload.primaryCategoryId = categoryId;
  if (itemTypeId) payload.itemTypeId = itemTypeId;

  try {
    console.log(`[RazorAPI] Creating new ItemMaster: "${modelName}" (mfr=${manufacturerId}, cat=${categoryId}, type=${itemTypeId})`);
    const res = await client.post("/ItemMaster", payload);
    // Response is the new itemMasterId (just a number)
    const newId = typeof res.data === "number" ? res.data : res.data?.id;
    if (typeof newId !== "number" || newId <= 0) {
      throw new Error(`Unexpected response from ItemMaster creation: ${JSON.stringify(res.data)}`);
    }
    console.log(`[RazorAPI] ItemMaster created: id=${newId} for "${modelName}"`);
    itemMasterCache.set(modelName.trim().toLowerCase(), newId);
    return newId;
  } catch (e: any) {
    const status = e?.response?.status;
    const body = e?.response?.data;
    console.error(`[RazorAPI] ItemMaster creation failed (${status}):`, JSON.stringify(body));
    const errorDetail = body ? JSON.stringify(body) : e?.message;
    throw new Error(`ItemMaster creation failed (${status}): ${errorDetail}`);
  }
}

/**
 * Patch an existing ItemMaster to update its manufacturerId.
 * PATCH /api/v1/ItemMaster/{id}
 */
async function patchItemMasterManufacturer(
  itemMasterId: number,
  manufacturerId: number,
): Promise<void> {
  if (!client) return;
  try {
    console.log(`[RazorAPI] Patching ItemMaster id=${itemMasterId} with manufacturerId=${manufacturerId}`);
    await client.patch(`/ItemMaster/${itemMasterId}`, { manufacturerId });
    console.log(`[RazorAPI] ItemMaster id=${itemMasterId} patched successfully with manufacturerId=${manufacturerId}`);
  } catch (e: any) {
    console.warn(`[RazorAPI] Failed to patch ItemMaster id=${itemMasterId}: ${e?.message}`);
  }
}

/**
 * Find an existing ItemMaster by model name, or create one if not found.
 * If found, ensures the manufacturer is set by patching if needed.
 * Returns the itemMasterId to use in asset creation.
 */
export async function findOrCreateItemMaster(
  modelName: string,
  manufacturer?: string,
  assetType?: string,
): Promise<number> {
  // Search first
  const existingId = await searchItemMaster(modelName);
  if (existingId !== null) {
    // Ensure the existing ItemMaster has the manufacturer set.
    // If the manufacturer was not set when the ItemMaster was originally created,
    // we patch it now to ensure MFG flows through to assets.
    if (manufacturer) {
      const mfrId = await findManufacturerId(manufacturer);
      if (mfrId) {
        await patchItemMasterManufacturer(existingId, mfrId);
      }
    }
    return existingId;
  }

  // Not found — create it
  console.log(`[RazorAPI] ItemMaster "${modelName}" not found, creating...`);
  return createItemMaster(modelName, manufacturer, assetType);
}

// ---- Assets ----

export interface CreateAssetPayload {
  make: string;
  model: string;
  serialNumber: string;
  assetTypeName?: string;
  condition?: string;
  notes?: string;
  inboundOrderId?: number;
  lotAutoName?: string; // Lot auto-name from the order (e.g. "21502")
}

export interface RazorAssetResponse {
  id: number;
  uniqueId?: string; // Razor-assigned UID e.g. "ATE9CD95A2"
  autoName?: string; // Legacy — not used on assets, only on orders
  make?: string;
  model?: string;
  serial?: string;
  [key: string]: unknown;
}

/**
 * Fetch a single asset by its numeric ID to retrieve the Razor-assigned uniqueId.
 * GET /api/v1/Asset/{id}
 */
export async function fetchAssetById(assetId: number): Promise<RazorAssetResponse | null> {
  if (!client) return null;
  try {
    const res = await client.get<RazorAssetResponse>(`/Asset/${assetId}`);
    return res.data;
  } catch (e: any) {
    // If GET by numeric ID fails, it might need the uniqueId instead
    console.warn(`[RazorAPI] fetchAssetById(${assetId}) failed: ${e?.message}`);
    return null;
  }
}

export async function createAsset(asset: CreateAssetPayload): Promise<RazorAssetResponse> {
  if (!client) throw new Error("Razor API client not initialized");

  // Step 1: Resolve the ItemMaster ID for this model.
  // Razor ERP validates the model against its ItemMaster table.
  // If the model doesn't exist, we auto-create it.
  let itemMasterId: number | undefined;
  if (asset.model) {
    try {
      itemMasterId = await findOrCreateItemMaster(asset.model, asset.make, asset.assetTypeName);
      console.log(`[RazorAPI] Resolved itemMasterId=${itemMasterId} for model "${asset.model}"`);
    } catch (e: any) {
      console.warn(`[RazorAPI] Could not resolve ItemMaster for "${asset.model}": ${e?.message}. Will try without itemMasterId.`);
    }
  }

  // Step 2: Manufacturer is set via the ItemMaster (not directly on the asset).
  // The findOrCreateItemMaster function above already handles setting/patching
  // the manufacturerId on the ItemMaster record.

  // Step 3: Build the payload with all required fields per Razor ERP validation:
  // Required: quantity, uniqueId, lotAutoName, assetWorkflowStep
  // uniqueId is required (cannot be empty).
  // We generate a short UID matching Razor ERP convention: "RF" prefix + 8 uppercase hex chars.
  // Example: "RF4A7B2C1E" (10 chars total, easy to read and communicate).
  // lotAutoName must reference an existing lot on the order (e.g. "21502")
  // Field names verified from Razor ERP Swagger docs (POST /api/v1/Asset):
  //   manufacturer (NOT make/mfg), serial (NOT serialNumber/serial#), model
  const uniqueId = generateShortUID();
  const payload: Record<string, unknown> = {
    manufacturer: asset.make,
    model: asset.model,
    serial: asset.serialNumber,
    quantity: 1,
    uniqueId: uniqueId,
    lotAutoName: asset.lotAutoName || "Asset",
    assetWorkflowStep: "Data Collection",
  };

  // Include the resolved itemMasterId if we have one
  if (itemMasterId) {
    payload.itemMasterId = itemMasterId;
  }

  // Note: manufacturerId is NOT in the NewAssetDto schema (per Swagger).
  // Manufacturer flows through the ItemMaster link, not the asset payload directly.

  // Add optional fields if provided
  if (asset.assetTypeName) payload.assetTypeName = asset.assetTypeName;
  if (asset.condition) payload.condition = asset.condition;
  if (asset.notes) payload.notes = asset.notes;

  try {
    console.log("[RazorAPI] Creating asset with payload:", JSON.stringify(payload));
    const res = await client.post<RazorAssetResponse>("/Asset", payload);
    console.log("[RazorAPI] Asset created successfully:", JSON.stringify(res.data));

    // We sent our short UID (e.g. "RF4A7B2C1E") as uniqueId.
    // Razor keeps whatever we send, so the UID in the app matches Razor ERP.
    // Ensure the response includes the uniqueId we sent.
    let result = res.data;
    if (!result.uniqueId) {
      // If POST response doesn't echo back uniqueId, use the one we generated
      result = { ...result, uniqueId };
      console.log(`[RazorAPI] Using generated UID: ${uniqueId}`);
    } else {
      console.log(`[RazorAPI] Razor UID confirmed: ${result.uniqueId}`);
    }

    return result;
  } catch (e: any) {
    const status = e?.response?.status;
    const body = e?.response?.data;
    console.error(`[RazorAPI] Asset creation failed (${status}):`, JSON.stringify(body));
    const errorDetail = body ? JSON.stringify(body) : e?.message;
    throw new Error(`Asset creation failed (${status}): ${errorDetail}`);
  }
}

/**
 * Generate a short, manageable UID matching Razor ERP convention.
 * Format: "RF" (Razor Field) prefix + 8 uppercase hex characters.
 * Example: "RF4A7B2C1E" (10 chars total).
 * Collision probability is ~1 in 4 billion (2^32), which is more than sufficient
 * for the volume of assets processed per company.
 */
function generateShortUID(): string {
  const hex = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("").toUpperCase();
  return `RF${hex}`;
}

/**
 * Link an existing asset to an inbound order.
 * POST /api/v1/InboundOrder/{orderId}/assets  with body { assetId }
 * Falls back to PATCH if POST is not available.
 */
export async function linkAssetToOrder(orderId: number, assetId: number): Promise<boolean> {
  if (!client) throw new Error("Razor API client not initialized");
  try {
    await client.post(`/InboundOrder/${orderId}/assets`, { assetId });
    return true;
  } catch (e: any) {
    // Some Razor versions use a different endpoint pattern
    try {
      await client.post(`/InboundOrder/${orderId}/asset/${assetId}`, {});
      return true;
    } catch {
      console.warn(`[RazorAPI] Could not link asset ${assetId} to order ${orderId}:`, e?.message);
      return false;
    }
  }
}

// ---- Lots ----

export interface RazorLot {
  id: number;
  autoName: string; // e.g. "21502"
  name?: string;
  statusName?: string;
  workflowStepName?: string;
  assetWorkflowStep?: string;
  [key: string]: unknown;
}

/**
 * Fetch lots associated with an inbound order.
 * Tries multiple endpoint patterns since Razor ERP versions vary.
 */
export async function fetchOrderLots(orderId: number): Promise<RazorLot[]> {
  if (!client) return [];
  
  // Try different endpoint patterns for fetching lots
  const endpoints = [
    `/InboundOrder/${orderId}/lots`,
    `/InboundOrder/${orderId}/lot`,
    `/Lot/by-inbound-order/${orderId}`,
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`[RazorAPI] Trying to fetch lots from: ${endpoint}`);
      const res = await client.get(endpoint);
      const data = res.data;
      const lots = Array.isArray(data) ? data : data?.items ?? (data ? [data] : []);
      if (lots.length > 0) {
        console.log(`[RazorAPI] Found ${lots.length} lots from ${endpoint}:`, JSON.stringify(lots.map((l: any) => ({ id: l.id, autoName: l.autoName }))));
        return lots;
      }
    } catch (e: any) {
      console.log(`[RazorAPI] Endpoint ${endpoint} failed (${e?.response?.status}):`, e?.message);
    }
  }

  console.warn(`[RazorAPI] No lots found for order ${orderId}`);
  return [];
}

export async function lookupAssetBySerial(serialNumber: string) {
  if (!client) throw new Error("Razor API client not initialized");
  try {
    const res = await client.get(`/Asset/by-serial-number/${encodeURIComponent(serialNumber)}`);
    return res.data;
  } catch {
    return null;
  }
}

// ---- File Upload (for signatures → Files tab / Add Files) ----

/**
 * Convert base64 string to a Blob (works on both web and React Native).
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
}

/**
 * Upload a file (e.g. signature PNG or PDF report) to the Razor ERP Files tab on an inbound order.
 * Confirmed endpoints from API probing:
 *   - /InboundOrder/{id}/attachments (401 = exists, needs auth)
 *   - /InboundOrder/file-upload/{id} (405 = exists, needs POST)
 *
 * @param orderId - The Razor ERP inbound order ID
 * @param base64Data - Base64-encoded file content (may include data URI prefix for images)
 * @param fileName - The filename to use when uploading
 * @param mimeType - The MIME type of the file (default: "image/png")
 * @param description - Optional description for JSON-based upload attempts
 */
export async function uploadOrderFile(
  orderId: number,
  base64Data: string,
  fileName: string,
  mimeType: string = "image/png",
  description: string = "Driver signature",
) {
  if (!client) throw new Error("Razor API client not initialized");

  // Strip data URI prefix if present (handles both image and application types)
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");

  // Build FormData with RN-style file object (works in React Native)
  const buildRNFormData = (fieldName: string) => {
    const formData = new FormData();
    formData.append(fieldName, {
      uri: `data:${mimeType};base64,${cleanBase64}`,
      name: fileName,
      type: mimeType,
    } as any);
    return formData;
  };

  // Build FormData with Blob (works on web)
  const buildBlobFormData = (fieldName: string) => {
    const formData = new FormData();
    try {
      const blob = base64ToBlob(cleanBase64, mimeType);
      formData.append(fieldName, blob, fileName);
    } catch {
      // Fallback to RN-style
      formData.append(fieldName, {
        uri: `data:${mimeType};base64,${cleanBase64}`,
        name: fileName,
        type: mimeType,
      } as any);
    }
    return formData;
  };

  // Prioritized list: confirmed endpoints first, then variations
  // Field names to try: file, files, attachment, formFile (common .NET naming)
  const attempts = [
    // Confirmed endpoint 1: /attachments
    { endpoint: `/InboundOrder/${orderId}/attachments`, field: "file", builder: buildRNFormData },
    { endpoint: `/InboundOrder/${orderId}/attachments`, field: "file", builder: buildBlobFormData },
    { endpoint: `/InboundOrder/${orderId}/attachments`, field: "files", builder: buildRNFormData },
    { endpoint: `/InboundOrder/${orderId}/attachments`, field: "formFile", builder: buildRNFormData },
    { endpoint: `/InboundOrder/${orderId}/attachments`, field: "attachment", builder: buildRNFormData },
    // Confirmed endpoint 2: /file-upload
    { endpoint: `/InboundOrder/file-upload/${orderId}`, field: "file", builder: buildRNFormData },
    { endpoint: `/InboundOrder/file-upload/${orderId}`, field: "file", builder: buildBlobFormData },
    { endpoint: `/InboundOrder/file-upload/${orderId}`, field: "files", builder: buildRNFormData },
    { endpoint: `/InboundOrder/file-upload/${orderId}`, field: "formFile", builder: buildRNFormData },
  ];

  for (const { endpoint, field, builder } of attempts) {
    try {
      const builderName = builder === buildRNFormData ? "RN" : "Blob";
      console.log(`[RazorAPI] Trying file upload to: ${endpoint} (field: ${field}, type: ${builderName})`);
      const formData = builder(field);
      const res = await client.post(endpoint, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      console.log(`[RazorAPI] File uploaded successfully to ${endpoint}:`, JSON.stringify(res.data));
      return res;
    } catch (e: any) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      console.log(`[RazorAPI] Upload to ${endpoint} (field: ${field}) failed (${status}):`, body ? JSON.stringify(body) : e?.message);
      continue;
    }
  }

  // Approach 2: JSON body with base64 content
  const jsonAttempts = [
    `/InboundOrder/${orderId}/attachments`,
    `/InboundOrder/file-upload/${orderId}`,
  ];

  for (const endpoint of jsonAttempts) {
    try {
      console.log(`[RazorAPI] Trying file upload (JSON base64) to: ${endpoint}`);
      const res = await client.post(endpoint, {
        fileName: fileName,
        fileContent: cleanBase64,
        contentType: mimeType,
        inboundOrderId: orderId,
        description: description,
      });
      console.log(`[RazorAPI] File uploaded (JSON) successfully to ${endpoint}:`, JSON.stringify(res.data));
      return res;
    } catch (e: any) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      console.log(`[RazorAPI] JSON upload to ${endpoint} failed (${status}):`, body ? JSON.stringify(body) : e?.message);
      continue;
    }
  }

  // All approaches failed
  console.error(`[RazorAPI] All file upload approaches failed for order ${orderId}. File was not uploaded.`);
  throw new Error(`Failed to upload file to order ${orderId} — all endpoint patterns exhausted. Check console logs for individual endpoint errors.`);
}

/**
 * Upload a PDF report to the Razor ERP Files tab on an inbound order.
 * This is a convenience wrapper around uploadOrderFile with PDF-specific defaults.
 */
export async function uploadPdfToOrder(
  orderId: number,
  base64Pdf: string,
  fileName: string,
): Promise<any> {
  console.log(`[RazorAPI] Uploading PDF report "${fileName}" to order ${orderId}`);
  return uploadOrderFile(
    orderId,
    base64Pdf,
    fileName,
    "application/pdf",
    "Field pickup report",
  );
}
