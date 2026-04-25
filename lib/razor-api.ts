// ============================================================
// Razor ERP API Client — JWT Authentication
// ============================================================
import axios, { AxiosInstance } from "axios";
import type { RazorInboundOrder, CapturedAsset, JwtAuthResponse, IssueJwtDto } from "./types";

let client: AxiosInstance | null = null;
let currentBaseUrl: string = "";

/**
 * Authenticate with Razor ERP using username/password.
 * The baseUrl is the tenant-specific URL (e.g. https://monwire.razorerp.com).
 * POST /api/v1/Auth with { companyId, login, password }
 * Returns the JWT access token on success.
 */
export async function loginWithCredentials(
  baseUrl: string,
  companyId: number,
  login: string,
  password: string
): Promise<JwtAuthResponse> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
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
  return res.data;
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
    timeout: 15000,
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

// ---- Connection test (uses existing client) ----

export async function testConnection(): Promise<boolean> {
  if (!client) return false;
  try {
    const res = await client.get("/InboundOrder", { params: { pageSize: 1 } });
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
        withCredentials: true, // send refresh token cookie
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

export async function fetchInboundOrders(): Promise<RazorInboundOrder[]> {
  if (!client) throw new Error("Razor API client not initialized");
  try {
    const res = await client.get("/InboundOrder/all");
    const data = res.data;
    const orders: RazorInboundOrder[] = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
    return orders;
  } catch (error: any) {
    console.error("Failed to fetch orders:", error?.message);
    throw error;
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

export async function createAsset(asset: {
  make: string;
  model: string;
  serialNumber: string;
  condition?: string;
  notes?: string;
}) {
  if (!client) throw new Error("Razor API client not initialized");
  const res = await client.post("/Asset", asset);
  return res.data;
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
