// ============================================================
// Razor ERP API Client — JWT Authentication
// ============================================================
import axios, { AxiosInstance } from "axios";
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
  return client;
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

// ---- Assets ----

export interface CreateAssetPayload {
  make: string;
  model: string;
  serialNumber: string;
  assetTypeName?: string;
  condition?: string;
  notes?: string;
  inboundOrderId?: number;
}

export interface RazorAssetResponse {
  id: number;
  autoName?: string; // Razor UID e.g. "AST-00001234"
  make?: string;
  model?: string;
  serialNumber?: string;
  [key: string]: unknown;
}

export async function createAsset(asset: CreateAssetPayload): Promise<RazorAssetResponse> {
  if (!client) throw new Error("Razor API client not initialized");

  // Generate a unique ID for this asset (UUID v4 format)
  const uniqueId = generateUUID();

  // Build the payload with all required fields per Razor ERP validation:
  // Required: quantity, uniqueId, lotAutoName, assetWorkflowStep
  // Plus our asset data: make, model, serialNumber
  const payload: Record<string, unknown> = {
    make: asset.make,
    model: asset.model,
    serialNumber: asset.serialNumber,
    quantity: 1,
    uniqueId: uniqueId,
    lotAutoName: asset.assetTypeName || asset.make || "Asset",
    assetWorkflowStep: "Inbound",
  };

  // Add optional fields if provided
  if (asset.assetTypeName) payload.assetTypeName = asset.assetTypeName;
  if (asset.condition) payload.condition = asset.condition;
  if (asset.notes) payload.notes = asset.notes;

  try {
    console.log("[RazorAPI] Creating asset with payload:", JSON.stringify(payload));
    const res = await client.post<RazorAssetResponse>("/Asset", payload);
    console.log("[RazorAPI] Asset created successfully:", JSON.stringify(res.data));
    return res.data;
  } catch (e: any) {
    const status = e?.response?.status;
    const body = e?.response?.data;
    console.error(`[RazorAPI] Asset creation failed (${status}):`, JSON.stringify(body));
    const errorDetail = body ? JSON.stringify(body) : e?.message;
    throw new Error(`Asset creation failed (${status}): ${errorDetail}`);
  }
}

/**
 * Generate a UUID v4 string (no crypto dependency needed).
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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

export async function lookupAssetBySerial(serialNumber: string) {
  if (!client) throw new Error("Razor API client not initialized");
  try {
    const res = await client.get(`/Asset/by-serial-number/${encodeURIComponent(serialNumber)}`);
    return res.data;
  } catch {
    return null;
  }
}

// ---- File Upload (for signatures) ----

export async function uploadOrderFile(orderId: number, base64Data: string, fileName: string) {
  if (!client) throw new Error("Razor API client not initialized");
  const formData = new FormData();
  formData.append("file", {
    uri: `data:image/png;base64,${base64Data}`,
    name: fileName,
    type: "image/png",
  } as any);
  return client.post(`/InboundOrder/file-upload/${orderId}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}
