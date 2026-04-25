// ============================================================
// Razor Field Companion — Domain Types
// ============================================================

/** Condition grades for captured assets */
export type AssetCondition = "Excellent" | "Good" | "Fair" | "Poor";

/** Asset type categories for electronics recycling */
export type AssetType =
  | "Laptop"
  | "Desktop"
  | "Cell Phone"
  | "Tablet"
  | "Server"
  | "Monitor"
  | "Printer"
  | "Networking"
  | "UPS/Battery"
  | "Other";

/** Status of an inbound order from the driver's perspective */
export type OrderStatus = "Pending" | "In Progress" | "Completed";

/** Sync status for offline queue items */
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

// ---- Razor ERP API models (matches InboundOrderGetDto from Swagger) ----

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
  statusId?: number;
  statusName?: string;

  // Pickup dates (actual API field names)
  pickupStartDate?: string;
  pickupEndDate?: string;
  pickupStartDateTime?: string;
  pickupEndDateTime?: string;
  pickupTimeWindowFrom?: string;
  pickupTimeWindowTo?: string;

  // Other dates
  receiveStartDate?: string;
  receiveEndDate?: string;
  createdDate?: string;
  updatedDate?: string;
  deliveryDate?: string;
  settledDate?: string;
  slaDate?: string;

  // Address fields from the API
  customerAddress?: string; // Full address string from API
  customerLocationName?: string;
  customerAddressId?: number;

  // Resolved location fields (enriched locally)
  locationAddress?: string;
  locationCity?: string;
  locationState?: string;
  locationZip?: string;

  // Contact fields from the API
  onsiteContactId?: number;
  customerContactId?: number;
  // Resolved contact fields (enriched locally)
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;

  // Notes
  notes?: string;
  onsiteNotes?: string;
  receivingNotes?: string;
  internalComments?: string;
  workInstructions?: string;

  // Additional useful fields
  serviceTypeId?: number;
  serviceTypeName?: string;
  repUserId?: number;
  repUserName?: string;
  repUserEmail?: string;
  priorityId?: number;
  priorityName?: string;
  warehouseId?: number;
  warehouseName?: string;
  totalEstimatedWeight?: number;
  itemCount?: number;
  palletCount?: number;
  poNumber?: string;
  bolNumber?: string;
  employee?: string;
  logisticTypeName?: string;
  destructionTypeName?: string;
  distance?: number;

  // References
  reference1?: string;
  reference2?: string;
  reference3?: string;
}

/** Contact details resolved from Razor ERP Contact API */
export interface RazorContact {
  id: number;
  firstName?: string;
  lastName?: string;
  mainEmail?: string;
  mainPhoneNumber?: string;
  businessPhoneNumber?: string;
  mobilePhoneNumber?: string;
  jobTitle?: string;
  customerName?: string;
}

/** Address details from Razor ERP Customer Address API */
export interface RazorAddress {
  id: number;
  name?: string;
  street1?: string;
  street2?: string;
  street3?: string;
  city?: string;
  stateName?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
  companyName?: string;
}

// ---- Local app models ----

export interface CapturedAsset {
  localId: string; // UUID generated locally
  razorAssetId?: number; // Set after synced to Razor ERP
  razorUid?: string; // Razor auto-generated UID e.g. "AST-00001234"
  orderId: number; // Links to the inbound order
  assetType: AssetType; // Category of the asset
  make: string;
  model: string;
  serialNumber: string;
  condition: AssetCondition;
  notes: string;
  capturedAt: string; // ISO timestamp
  syncStatus: SyncStatus;
  // GPS location where the asset was captured/serialized
  captureLatitude?: number;
  captureLongitude?: number;
  captureLocationAddress?: string; // Reverse-geocoded address (if available)
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

/** Response from POST /api/v1/Auth */
export interface JwtAuthResponse {
  accessToken: string | null;
  refreshTokenCookieName: string | null;
}

/** Request body for POST /api/v1/Auth */
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
