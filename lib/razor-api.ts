// ============================================================
// Razor ERP API Client
// ============================================================
import axios, { AxiosInstance } from "axios";
import type { RazorInboundOrder, CapturedAsset } from "./types";

let client: AxiosInstance | null = null;

export function initRazorClient(baseUrl: string, apiKey: string) {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  client = axios.create({
    baseURL: `${cleanUrl}/api/v1`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
  });
  return client;
}

export function getRazorClient(): AxiosInstance | null {
  return client;
}

export function clearRazorClient() {
  client = null;
}

// ---- Connection test ----

export async function testConnection(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    const tempClient = axios.create({
      baseURL: `${baseUrl.replace(/\/+$/, "")}/api/v1`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      timeout: 10000,
    });
    const res = await tempClient.get("/InboundOrder", { params: { pageSize: 1 } });
    return res.status === 200;
  } catch {
    return false;
  }
}

// ---- Inbound Orders ----

export async function fetchInboundOrders(): Promise<RazorInboundOrder[]> {
  if (!client) throw new Error("Razor API client not initialized");
  try {
    const res = await client.get("/InboundOrder/all");
    const data = res.data;
    // Normalize response — API may return array directly or wrapped
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
  // Convert base64 to blob for multipart upload
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
