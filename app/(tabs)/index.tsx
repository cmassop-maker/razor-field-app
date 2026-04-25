import { useCallback, useState, useMemo } from "react";
import {
  Text,
  View,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Linking,
} from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { fetchInboundOrders, enrichOrderWithContactAndAddress } from "@/lib/razor-api";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { LocalOrder, OrderStatus, RazorInboundOrder } from "@/lib/types";

type FilterTab = "All" | OrderStatus;
const FILTER_TABS: FilterTab[] = ["All", "Pending", "In Progress", "Completed"];

type SortDirection = "desc" | "asc";

const STATUS_CONFIG: Record<OrderStatus, { bg: string; text: string; label: string }> = {
  Pending: { bg: "#FEF3C7", text: "#92400E", label: "Pending" },
  "In Progress": { bg: "#DBEAFE", text: "#1E40AF", label: "In Progress" },
  Completed: { bg: "#D1FAE5", text: "#065F46", label: "Completed" },
};

/** Build a display address from the order's various address fields */
function getDisplayAddress(ro: RazorInboundOrder): string {
  if (ro.locationAddress) return ro.locationAddress;
  if (ro.customerAddress) return ro.customerAddress;
  const parts = [ro.locationCity, ro.locationState, ro.locationZip].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  if (ro.customerLocationName) return ro.customerLocationName;
  return "";
}

/** Extract numeric order number for sorting */
function getOrderNum(ro: RazorInboundOrder): number {
  if (ro.autoName) {
    const match = ro.autoName.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return ro.id;
}

function OrderCard({ order, onPress }: { order: LocalOrder; onPress: () => void }) {
  const colors = useColors();
  const statusCfg = STATUS_CONFIG[order.localStatus];
  const assetCount = order.assets.length;
  const hasSig = !!order.signature;
  const ro = order.razorOrder;
  const displayAddress = getDisplayAddress(ro);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header: Order number + status badge */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.orderNumber, { color: colors.foreground }]}>
            {ro.autoName || `Order #${ro.id}`}
          </Text>
          <Text style={[styles.customerName, { color: colors.muted }]} numberOfLines={1}>
            {ro.customerName || "Unknown Customer"}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.badgeText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
        </View>
      </View>

      {/* Point of Contact */}
      {ro.contactName ? (
        <View style={styles.infoRow}>
          <MaterialIcons name="person" size={14} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground }]} numberOfLines={1}>
            {ro.contactName}
            {ro.contactPhone ? `  •  ${ro.contactPhone}` : ""}
          </Text>
          {ro.contactPhone ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${ro.contactPhone}`)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="phone" size={16} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Address */}
      {displayAddress ? (
        <View style={styles.infoRow}>
          <MaterialIcons name="location-on" size={14} color={colors.error} />
          <Text style={[styles.infoText, { color: colors.muted }]} numberOfLines={2}>
            {displayAddress}
          </Text>
        </View>
      ) : null}

      {/* Footer: asset count, signature, date */}
      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <View style={styles.footerItem}>
          <MaterialIcons name="inventory" size={14} color={colors.muted} />
          <Text style={[styles.footerText, { color: colors.muted }]}>
            {assetCount} asset{assetCount !== 1 ? "s" : ""}
          </Text>
        </View>
        {hasSig && (
          <View style={styles.footerItem}>
            <MaterialIcons name="draw" size={14} color={colors.success} />
            <Text style={[styles.footerText, { color: colors.success }]}>Signed</Text>
          </View>
        )}
        {(ro.pickupStartDate || ro.pickupEndDate) ? (
          <View style={styles.footerItem}>
            <MaterialIcons name="schedule" size={14} color={colors.muted} />
            <Text style={[styles.footerText, { color: colors.muted }]}>
              {new Date(ro.pickupStartDate || ro.pickupEndDate!).toLocaleDateString()}
            </Text>
          </View>
        ) : null}
        {ro.statusName ? (
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={[styles.footerText, { color: colors.muted, fontStyle: "italic" }]}>
              {ro.statusName}
            </Text>
          </View>
        ) : null}
        <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

export default function OrdersScreen() {
  const { state, dispatch, persistOrders } = useStore();
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [enrichingCount, setEnrichingCount] = useState(0);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loadingProgress, setLoadingProgress] = useState("");

  // Count orders per status for tab badges
  const statusCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      All: state.orders.length,
      Pending: 0,
      "In Progress": 0,
      Completed: 0,
    };
    for (const o of state.orders) {
      counts[o.localStatus] = (counts[o.localStatus] || 0) + 1;
    }
    return counts;
  }, [state.orders]);

  const filteredOrders = useMemo(() => {
    let orders = state.orders;

    // Apply status filter
    if (activeFilter !== "All") {
      orders = orders.filter((o) => o.localStatus === activeFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      orders = orders.filter((o) => {
        const ro = o.razorOrder;
        return (
          ro.autoName?.toLowerCase().includes(q) ||
          ro.customerName?.toLowerCase().includes(q) ||
          ro.contactName?.toLowerCase().includes(q) ||
          ro.contactPhone?.toLowerCase().includes(q) ||
          ro.contactEmail?.toLowerCase().includes(q) ||
          ro.customerAddress?.toLowerCase().includes(q) ||
          ro.locationAddress?.toLowerCase().includes(q) ||
          ro.customerLocationName?.toLowerCase().includes(q) ||
          ro.statusName?.toLowerCase().includes(q)
        );
      });
    }

    // Apply sort by order number
    const sorted = [...orders].sort((a, b) => {
      const numA = getOrderNum(a.razorOrder);
      const numB = getOrderNum(b.razorOrder);
      return sortDirection === "desc" ? numB - numA : numA - numB;
    });

    return sorted;
  }, [state.orders, searchQuery, activeFilter, sortDirection]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadError("");
    try {
      setLoadingProgress("Fetching orders...");
      const rawOrders = await fetchInboundOrders((fetched, total) => {
        setLoadingProgress(`Loading orders: ${fetched}${total > fetched ? ` / ${total}` : ""}`);
      });
      setLoadingProgress("");
      const existingMap = new Map(state.orders.map((o) => [o.razorOrder.id, o]));

      // First pass: merge raw orders immediately so the list updates fast
      const merged: LocalOrder[] = rawOrders.map((ro) => {
        const existing = existingMap.get(ro.id);
        if (existing) {
          return { ...existing, razorOrder: { ...existing.razorOrder, ...ro } };
        }
        return {
          razorOrder: ro,
          assets: [],
          localStatus: "Pending" as OrderStatus,
        };
      });
      dispatch({ type: "SET_ORDERS", payload: merged });

      // Second pass: enrich orders with contact and address details (in background)
      const needsEnrichment = merged.filter(
        (o) =>
          !o.razorOrder.contactName &&
          (o.razorOrder.onsiteContactId || o.razorOrder.customerContactId)
      );

      if (needsEnrichment.length > 0) {
        setEnrichingCount(needsEnrichment.length);
        const enrichedMap = new Map<number, RazorInboundOrder>();

        // Enrich in batches of 5 to avoid overwhelming the API
        for (let i = 0; i < needsEnrichment.length; i += 5) {
          const batch = needsEnrichment.slice(i, i + 5);
          const results = await Promise.allSettled(
            batch.map((o) => enrichOrderWithContactAndAddress(o.razorOrder))
          );
          results.forEach((result, idx) => {
            if (result.status === "fulfilled") {
              enrichedMap.set(batch[idx].razorOrder.id, result.value);
            }
          });
          setEnrichingCount(Math.max(0, needsEnrichment.length - i - batch.length));
        }

        // Apply enriched data
        if (enrichedMap.size > 0) {
          const enrichedOrders = merged.map((o) => {
            const enriched = enrichedMap.get(o.razorOrder.id);
            if (enriched) {
              return { ...o, razorOrder: enriched };
            }
            return o;
          });
          dispatch({ type: "SET_ORDERS", payload: enrichedOrders });
          await persistOrders(enrichedOrders);
        }
        setEnrichingCount(0);
      } else {
        await persistOrders(merged);
      }
    } catch (e: any) {
      setLoadError(e?.message || "Failed to fetch orders");
    } finally {
      setRefreshing(false);
    }
  }, [state.orders, dispatch, persistOrders]);

  const toggleSort = useCallback(() => {
    setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: LocalOrder }) => (
      <OrderCard
        order={item}
        onPress={() =>
          router.push({
            pathname: "/order/[id]",
            params: { id: String(item.razorOrder.id) },
          })
        }
      />
    ),
    []
  );

  const keyExtractor = useCallback((item: LocalOrder) => String(item.razorOrder.id), []);

  return (
    <ScreenContainer className="px-4">
      {/* Header */}
      <View className="pt-2 pb-3">
        <Text className="text-2xl font-bold text-foreground">Pickup Orders</Text>
        <Text className="text-sm text-muted mt-0.5">
          {state.orders.length} total orders
          {loadingProgress ? ` • ${loadingProgress}` : ""}
          {enrichingCount > 0 ? ` • Loading contacts (${enrichingCount})...` : ""}
        </Text>
      </View>

      {/* Search + Sort Row */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <View
          style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}
        >
          <MaterialIcons name="search" size={20} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search orders, contacts, addresses..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <MaterialIcons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Sort Toggle */}
        <TouchableOpacity
          style={[styles.sortButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={toggleSort}
          activeOpacity={0.7}
        >
          <MaterialIcons
            name={sortDirection === "desc" ? "arrow-downward" : "arrow-upward"}
            size={18}
            color={colors.primary}
          />
          <Text style={[styles.sortText, { color: colors.primary }]}>
            {sortDirection === "desc" ? "New" : "Old"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={{ marginBottom: 12 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab;
            const count = statusCounts[tab];
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.filterTab,
                  {
                    backgroundColor: isActive ? colors.primary : colors.surface,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setActiveFilter(tab)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: isActive ? "#FFFFFF" : colors.foreground },
                  ]}
                >
                  {tab}
                </Text>
                <View
                  style={[
                    styles.filterTabBadge,
                    {
                      backgroundColor: isActive ? "rgba(255,255,255,0.25)" : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterTabBadgeText,
                      { color: isActive ? "#FFFFFF" : colors.muted },
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loadError ? (
        <View className="bg-error/10 rounded-lg px-4 py-3 mb-3">
          <Text className="text-error text-sm">{loadError}</Text>
        </View>
      ) : null}

      {/* Order List */}
      <FlatList
        data={filteredOrders}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center pt-20">
            <MaterialIcons name="local-shipping" size={56} color={colors.border} />
            <Text className="text-lg font-medium text-muted mt-4">
              {activeFilter === "All" ? "No orders found" : `No ${activeFilter.toLowerCase()} orders`}
            </Text>
            <Text className="text-sm text-muted mt-1 text-center px-8">
              {activeFilter === "All"
                ? "Pull down to refresh orders from Razor ERP"
                : "Try a different filter or pull down to refresh"}
            </Text>
            {activeFilter === "All" && (
              <TouchableOpacity
                className="mt-6 px-6 py-3 rounded-xl"
                style={{ backgroundColor: colors.primary }}
                onPress={handleRefresh}
                activeOpacity={0.8}
              >
                <Text className="text-white font-semibold">Refresh Orders</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  orderNumber: {
    fontSize: 17,
    fontWeight: "700",
  },
  customerName: {
    fontSize: 14,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    paddingRight: 4,
  },
  infoText: {
    fontSize: 13,
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 0.5,
    paddingTop: 10,
    marginTop: 4,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 4,
  },
  sortText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterTabBadge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  filterTabBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
