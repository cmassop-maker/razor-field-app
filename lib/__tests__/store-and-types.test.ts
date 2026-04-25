import { describe, it, expect } from "vitest";
import type {
  CapturedAsset,
  CapturedSignature,
  LocalOrder,
  RazorInboundOrder,
  ApiConfig,
  SyncQueueItem,
  AssetCondition,
  OrderStatus,
  SyncStatus,
} from "../types";

describe("Domain Types", () => {
  it("should create a valid CapturedAsset", () => {
    const asset: CapturedAsset = {
      localId: "test-uuid-1",
      orderId: 100,
      make: "Dell",
      model: "OptiPlex 7090",
      serialNumber: "ABC123XYZ",
      condition: "Good",
      notes: "Minor scratches",
      capturedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    expect(asset.make).toBe("Dell");
    expect(asset.model).toBe("OptiPlex 7090");
    expect(asset.serialNumber).toBe("ABC123XYZ");
    expect(asset.condition).toBe("Good");
    expect(asset.syncStatus).toBe("pending");
  });

  it("should create a valid CapturedSignature", () => {
    const sig: CapturedSignature = {
      localId: "sig-uuid-1",
      orderId: 100,
      signatureBase64: "iVBORw0KGgoAAAANSUhEUg==",
      signerName: "John Doe",
      signerTitle: "IT Manager",
      capturedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    expect(sig.signerName).toBe("John Doe");
    expect(sig.signerTitle).toBe("IT Manager");
    expect(sig.signatureBase64).toBeTruthy();
  });

  it("should create a valid LocalOrder with assets and signature", () => {
    const order: LocalOrder = {
      razorOrder: {
        id: 100,
        autoName: "IO-2024-001",
        customerId: 50,
        customerName: "Acme Corp",
        locationAddress: "123 Main St",
        locationCity: "Austin",
        locationState: "TX",
        locationZip: "78701",
        contactName: "Jane Smith",
        contactPhone: "555-1234",
      },
      assets: [
        {
          localId: "a1",
          orderId: 100,
          make: "HP",
          model: "EliteBook 840",
          serialNumber: "HP-SN-001",
          condition: "Excellent",
          notes: "",
          capturedAt: new Date().toISOString(),
          syncStatus: "pending",
        },
      ],
      signature: {
        localId: "s1",
        orderId: 100,
        signatureBase64: "base64data",
        signerName: "Jane Smith",
        signerTitle: "Facility Manager",
        capturedAt: new Date().toISOString(),
        syncStatus: "pending",
      },
      localStatus: "In Progress",
    };
    expect(order.razorOrder.autoName).toBe("IO-2024-001");
    expect(order.assets).toHaveLength(1);
    expect(order.signature?.signerName).toBe("Jane Smith");
    expect(order.localStatus).toBe("In Progress");
  });

  it("should validate AssetCondition values", () => {
    const conditions: AssetCondition[] = ["Excellent", "Good", "Fair", "Poor"];
    expect(conditions).toHaveLength(4);
    expect(conditions).toContain("Excellent");
    expect(conditions).toContain("Poor");
  });

  it("should validate OrderStatus values", () => {
    const statuses: OrderStatus[] = ["Pending", "In Progress", "Completed"];
    expect(statuses).toHaveLength(3);
  });

  it("should validate SyncStatus values", () => {
    const statuses: SyncStatus[] = ["pending", "syncing", "synced", "failed"];
    expect(statuses).toHaveLength(4);
  });

  it("should create a valid ApiConfig", () => {
    const config: ApiConfig = {
      baseUrl: "https://apiprod.razorerp.com",
      apiKey: "test-api-key",
      isConnected: true,
    };
    expect(config.baseUrl).toBe("https://apiprod.razorerp.com");
    expect(config.isConnected).toBe(true);
  });

  it("should create a valid SyncQueueItem", () => {
    const item: SyncQueueItem = {
      id: "sync-1",
      type: "asset",
      orderId: 100,
      payload: { make: "Dell", model: "Latitude", serialNumber: "SN123" },
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    expect(item.type).toBe("asset");
    expect(item.status).toBe("pending");
  });
});

describe("Razor API Module", () => {
  it("should export required functions from razor-api", async () => {
    const api = await import("../razor-api");
    expect(typeof api.initRazorClient).toBe("function");
    expect(typeof api.getRazorClient).toBe("function");
    expect(typeof api.clearRazorClient).toBe("function");
    expect(typeof api.testConnection).toBe("function");
    expect(typeof api.fetchInboundOrders).toBe("function");
    expect(typeof api.fetchInboundOrder).toBe("function");
    expect(typeof api.createAsset).toBe("function");
    expect(typeof api.lookupAssetBySerial).toBe("function");
    expect(typeof api.uploadOrderFile).toBe("function");
  });

  it("should return null client before initialization", async () => {
    const api = await import("../razor-api");
    // Clear any existing client
    api.clearRazorClient();
    expect(api.getRazorClient()).toBeNull();
  });

  it("should throw when calling API without initialization", async () => {
    const api = await import("../razor-api");
    api.clearRazorClient();
    await expect(api.fetchInboundOrders()).rejects.toThrow("Razor API client not initialized");
  });

  it("should initialize client with correct config", async () => {
    const api = await import("../razor-api");
    const client = api.initRazorClient("https://apiprod.razorerp.com", "test-key");
    expect(client).toBeTruthy();
    expect(api.getRazorClient()).toBeTruthy();
    // Clean up
    api.clearRazorClient();
  });
});
