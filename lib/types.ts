// ============================================================
// Razor Field Companion — Domain Types
// ============================================================

/** Condition grades for captured assets */
export type AssetCondition = "Excellent" | "Good" | "Fair" | "Poor";

/** Status of an inbound order from the driver's perspective */
export type OrderStatus = "Pending" | "In Progress" | "Completed";

/** Sync status for offline queue items */
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

// ---- Razor ERP API models (subset relevant to driver app) ----

export interface RazorCustomer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
}

export interface RazorInboundOrder {
  id: number;
  autoName: string;
  customerId: number;
  customerName?: string;
  status?: string;
  notes?: string;
  pickupDate?: string;
  locationAddress?: string;
  locationCity?: string;
  locationState?: string;
  locationZip?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

// ---- Local app models ----

export interface CapturedAsset {
  localId: string; // UUID generated locally
  razorAssetId?: number; // Set after synced to Razor ERP
  orderId: number; // Links to the inbound order
  make: string;
  model: string;
  serialNumber: string;
  condition: AssetCondition;
  notes: string;
  capturedAt: string; // ISO timestamp
  syncStatus: SyncStatus;
}

export interface CapturedSignature {
  localId: string;
  orderId: number;
  signatureBase64: string; // base64 PNG data
  signerName: string;
  signerTitle: string;
  capturedAt: string;
  syncStatus: SyncStatus;
}

export interface LocalOrder {
  razorOrder: RazorInboundOrder;
  assets: CapturedAsset[];
  signature?: CapturedSignature;
  localStatus: OrderStatus;
  lastSyncedAt?: string;
}

export interface ApiConfig {
  baseUrl: string;
  accessToken: string;
  companyId?: number;
  username?: string;
  isConnected: boolean;
}

/** Response from POST /api/v1/JwtAuth */
export interface JwtAuthResponse {
  accessToken: string | null;
  refreshTokenCookieName: string | null;
}

/** Request body for POST /api/v1/JwtAuth */
export interface IssueJwtDto {
  companyId: number;
  login: string;
  password: string;
}

export interface SyncQueueItem {
  id: string;
  type: "asset" | "signature" | "order_notes";
  orderId: number;
  payload: unknown;
  status: SyncStatus;
  createdAt: string;
  lastAttemptAt?: string;
  errorMessage?: string;
}
