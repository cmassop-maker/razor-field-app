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
} from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { fetchInboundOrders } from "@/lib/razor-api";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { LocalOrder, OrderStatus } from "@/lib/types";

type FilterTab = "All" | OrderStatus;
const FILTER_TABS: FilterTab[] = ["All", "Pending", "In Progress", "Completed"];

const STATUS_CONFIG: Record<OrderStatus, { bg: string; text: string; label: string }> = {
  Pending: { bg: "#FEF3C7", text: "#92400E", label: "Pending" },
  "In Progress": { bg: "#DBEAFE", text: "#1E40AF", label: "In Progress" },
  Completed: { bg: "#D1FAE5", text: "#065F46", label: "Completed" },
};

function OrderCard({ order, onPress }: { order: LocalOrder; onPress: () => void }) {
  const colors = useColors();
  const statusCfg = STATUS_CONFIG[order.localStatus];
  const assetCount = order.assets.length;
  const hasSig = !!order.signature;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.orderNumber, { color: colors.foreground }]}>
            {order.razorOrder.autoName || `Order #${order.razorOrder.id}`}
          </Text>
          <Text style={[styles.customerName, { color: colors.muted }]} numberOfLines={1}>
            {order.razorOrder.customerName || "Unknown Customer"}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.badgeText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
        </View>
      </View>

      {order.razorOrder.locationAddress ? (
        <View style={styles.addressRow}>
          <MaterialIcons name="location-on" size={14} color={colors.muted} />
          <Text style={[styles.addressText, { color: colors.muted }]} numberOfLines={1}>
            {order.razorOrder.locationAddress}
            {order.razorOrder.locationCity ? `, ${order.razorOrder.locationCity}` : ""}
            {order.razorOrder.locationState ? `, ${order.razorOrder.locationState}` : ""}
          </Text>
        </View>
      ) : null}

      <View style={styles.cardFooter}>
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
        {order.razorOrder.pickupDate ? (
          <View style={styles.footerItem}>
            <MaterialIcons name="schedule" size={14} color={colors.muted} />
            <Text style={[styles.footerText, { color: colors.muted }]}>
              {new Date(order.razorOrder.pickupDate).toLocaleDateString()}
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
      orders = orders.filter(
        (o) =>
          o.razorOrder.autoName?.toLowerCase().includes(q) ||
          o.razorOrder.customerName?.toLowerCase().includes(q) ||
          o.razorOrder.locationAddress?.toLowerCase().includes(q)
      );
    }

    return orders;
  }, [state.orders, searchQuery, activeFilter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadError("");
    try {
      const rawOrders = await fetchInboundOrders();
      const existingMap = new Map(state.orders.map((o) => [o.razorOrder.id, o]));
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
      await persistOrders(merged);
    } catch (e: any) {
      setLoadError(e?.message || "Failed to fetch orders");
    } finally {
      setRefreshing(false);
    }
  }, [state.orders, dispatch, persistOrders]);

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
          {state.orders.length} order{state.orders.length !== 1 ? "s" : ""} from Razor ERP
        </Text>
      </View>

      {/* Search */}
      <View
        className="flex-row items-center bg-surface border border-border rounded-xl px-3 mb-3"
        style={{ height: 44 }}
      >
        <MaterialIcons name="search" size={20} color={colors.muted} />
        <TextInput
          className="flex-1 ml-2 text-foreground text-base"
          placeholder="Search orders..."
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
    marginBottom: 8,
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
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },
  addressText: {
    fontSize: 13,
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#E5E7EB",
    paddingTop: 10,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 12,
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
