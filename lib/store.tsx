// ============================================================
// App State — React Context + useReducer
// ============================================================
import React, { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type {
  ApiConfig,
  CapturedAsset,
  CapturedSignature,
  LocalOrder,
  OrderStatus,
  RazorInboundOrder,
  SyncQueueItem,
} from "./types";
import { initRazorClient, clearRazorClient, signOut } from "./razor-api";

// ---- Secure storage helpers ----
async function secureSet(key: string, value: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}
async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}
async function secureDelete(key: string) {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

// ---- State shape ----
interface AppState {
  apiConfig: ApiConfig;
  orders: LocalOrder[];
  syncQueue: SyncQueueItem[];
  isLoading: boolean;
  isAuthenticated: boolean;
}

const initialState: AppState = {
  apiConfig: { baseUrl: "", accessToken: "", isConnected: false },
  orders: [],
  syncQueue: [],
  isLoading: true,
  isAuthenticated: false,
};

// ---- Actions ----
type Action =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_API_CONFIG"; payload: ApiConfig }
  | { type: "SET_AUTHENTICATED"; payload: boolean }
  | { type: "SET_ORDERS"; payload: LocalOrder[] }
  | { type: "UPDATE_ORDER"; payload: LocalOrder }
  | { type: "ADD_ASSET"; payload: { orderId: number; asset: CapturedAsset } }
  | { type: "REMOVE_ASSET"; payload: { orderId: number; localId: string } }
  | { type: "SET_SIGNATURE"; payload: { orderId: number; signature: CapturedSignature } }
  | { type: "SET_ORDER_STATUS"; payload: { orderId: number; status: OrderStatus } }
  | { type: "ADD_SYNC_ITEM"; payload: SyncQueueItem }
  | { type: "UPDATE_SYNC_ITEM"; payload: SyncQueueItem }
  | { type: "REMOVE_SYNC_ITEM"; payload: string }
  | { type: "CLEAR_SYNC_QUEUE" }
  | { type: "LOGOUT" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_API_CONFIG":
      return { ...state, apiConfig: action.payload };
    case "SET_AUTHENTICATED":
      return { ...state, isAuthenticated: action.payload };
    case "SET_ORDERS":
      return { ...state, orders: action.payload };
    case "UPDATE_ORDER":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.razorOrder.id === action.payload.razorOrder.id ? action.payload : o
        ),
      };
    case "ADD_ASSET": {
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.razorOrder.id === action.payload.orderId) {
            return { ...o, assets: [...o.assets, action.payload.asset] };
          }
          return o;
        }),
      };
    }
    case "REMOVE_ASSET": {
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.razorOrder.id === action.payload.orderId) {
            return {
              ...o,
              assets: o.assets.filter((a) => a.localId !== action.payload.localId),
            };
          }
          return o;
        }),
      };
    }
    case "SET_SIGNATURE": {
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.razorOrder.id === action.payload.orderId) {
            return { ...o, signature: action.payload.signature };
          }
          return o;
        }),
      };
    }
    case "SET_ORDER_STATUS": {
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.razorOrder.id === action.payload.orderId) {
            return { ...o, localStatus: action.payload.status };
          }
          return o;
        }),
      };
    }
    case "ADD_SYNC_ITEM":
      return { ...state, syncQueue: [...state.syncQueue, action.payload] };
    case "UPDATE_SYNC_ITEM":
      return {
        ...state,
        syncQueue: state.syncQueue.map((s) =>
          s.id === action.payload.id ? action.payload : s
        ),
      };
    case "REMOVE_SYNC_ITEM":
      return {
        ...state,
        syncQueue: state.syncQueue.filter((s) => s.id !== action.payload),
      };
    case "CLEAR_SYNC_QUEUE":
      return { ...state, syncQueue: [] };
    case "LOGOUT":
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
}

// ---- Context ----
interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  saveCredentials: (baseUrl: string, accessToken: string, companyId: number, username: string) => Promise<void>;
  loadCredentials: () => Promise<ApiConfig | null>;
  clearCredentials: () => Promise<void>;
  persistOrders: (orders: LocalOrder[]) => Promise<void>;
  loadPersistedOrders: () => Promise<LocalOrder[]>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const saveCredentials = useCallback(
    async (baseUrl: string, accessToken: string, companyId: number, username: string) => {
      await secureSet("razor_base_url", baseUrl);
      await secureSet("razor_access_token", accessToken);
      await secureSet("razor_company_id", String(companyId));
      await secureSet("razor_username", username);
    },
    []
  );

  const loadCredentials = useCallback(async (): Promise<ApiConfig | null> => {
    const baseUrl = await secureGet("razor_base_url");
    const accessToken = await secureGet("razor_access_token");
    const companyIdStr = await secureGet("razor_company_id");
    const username = await secureGet("razor_username");
    if (baseUrl && accessToken) {
      return {
        baseUrl,
        accessToken,
        companyId: companyIdStr ? Number(companyIdStr) : undefined,
        username: username ?? undefined,
        isConnected: false,
      };
    }
    return null;
  }, []);

  const clearCredentials = useCallback(async () => {
    await secureDelete("razor_base_url");
    await secureDelete("razor_access_token");
    await secureDelete("razor_company_id");
    await secureDelete("razor_username");
    try {
      await signOut();
    } catch {
      // best-effort
    }
    clearRazorClient();
    dispatch({ type: "LOGOUT" });
  }, []);

  const persistOrders = useCallback(async (orders: LocalOrder[]) => {
    try {
      await AsyncStorage.setItem("local_orders", JSON.stringify(orders));
    } catch (e) {
      console.error("Failed to persist orders:", e);
    }
  }, []);

  const loadPersistedOrders = useCallback(async (): Promise<LocalOrder[]> => {
    try {
      const raw = await AsyncStorage.getItem("local_orders");
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error("Failed to load persisted orders:", e);
    }
    return [];
  }, []);

  // Boot: load saved credentials and restore session
  useEffect(() => {
    (async () => {
      const creds = await loadCredentials();
      if (creds && creds.accessToken) {
        initRazorClient(creds.baseUrl, creds.accessToken);
        dispatch({
          type: "SET_API_CONFIG",
          payload: { ...creds, isConnected: true },
        });
        dispatch({ type: "SET_AUTHENTICATED", payload: true });
        const orders = await loadPersistedOrders();
        if (orders.length > 0) {
          dispatch({ type: "SET_ORDERS", payload: orders });
        }
      }
      dispatch({ type: "SET_LOADING", payload: false });
    })();
  }, [loadCredentials, loadPersistedOrders]);

  // Persist orders whenever they change
  useEffect(() => {
    if (!state.isLoading && state.orders.length > 0) {
      persistOrders(state.orders);
    }
  }, [state.orders, state.isLoading, persistOrders]);

  return (
    <StoreContext.Provider
      value={{
        state,
        dispatch,
        saveCredentials,
        loadCredentials,
        clearCredentials,
        persistOrders,
        loadPersistedOrders,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
