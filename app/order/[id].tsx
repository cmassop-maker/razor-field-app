import { useMemo, useCallback } from "react";
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { CapturedAsset } from "@/lib/types";

function AssetRow({
  asset,
  onDelete,
}: {
  asset: CapturedAsset;
  onDelete: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.assetRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.assetMake, { color: colors.foreground }]}>
          {asset.make} {asset.model}
        </Text>
        <Text style={[styles.assetSerial, { color: colors.muted }]}>
          S/N: {asset.serialNumber}
        </Text>
        <View style={styles.assetMeta}>
          <View
            style={[
              styles.conditionBadge,
              {
                backgroundColor:
                  asset.condition === "Excellent" || asset.condition === "Good"
                    ? "#D1FAE5"
                    : asset.condition === "Fair"
                    ? "#FEF3C7"
                    : "#FEE2E2",
              },
            ]}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color:
                  asset.condition === "Excellent" || asset.condition === "Good"
                    ? "#065F46"
                    : asset.condition === "Fair"
                    ? "#92400E"
                    : "#991B1B",
              }}
            >
              {asset.condition}
            </Text>
          </View>
          {asset.notes ? (
            <Text style={[styles.assetNote, { color: colors.muted }]} numberOfLines={1}>
              {asset.notes}
            </Text>
          ) : null}
        </View>
      </View>
      <TouchableOpacity onPress={onDelete} style={{ padding: 8 }}>
        <MaterialIcons name="delete-outline" size={20} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const colors = useColors();

  const order = useMemo(
    () => state.orders.find((o) => String(o.razorOrder.id) === id),
    [state.orders, id]
  );

  const handleDeleteAsset = useCallback(
    (localId: string) => {
      if (!order) return;
      const doDelete = () => {
        dispatch({
          type: "REMOVE_ASSET",
          payload: { orderId: order.razorOrder.id, localId },
        });
      };
      if (Platform.OS === "web") {
        doDelete();
      } else {
        Alert.alert("Remove Asset", "Are you sure you want to remove this asset?", [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: doDelete },
        ]);
      }
    },
    [order, dispatch]
  );

  if (!order) {
    return (
      <ScreenContainer className="p-4">
        <Text className="text-lg text-muted text-center mt-20">Order not found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 self-center">
          <Text className="text-primary font-semibold">Go Back</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  const ro = order.razorOrder;

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{ borderBottomColor: colors.border }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4, marginRight: 12 }}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
            {ro.autoName || `Order #${ro.id}`}
          </Text>
          <Text className="text-xs text-muted">{ro.customerName || "Unknown Customer"}</Text>
        </View>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/order-summary",
              params: { id: String(ro.id) },
            })
          }
          style={{ padding: 4 }}
        >
          <MaterialIcons name="summarize" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={order.assets}
        keyExtractor={(item) => item.localId}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={
          <View>
            {/* Location Info */}
            {(ro.locationAddress || ro.contactName) && (
              <View
                className="bg-surface border border-border rounded-2xl p-4 mb-4"
              >
                <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                  Pickup Location
                </Text>
                {ro.locationAddress && (
                  <View className="flex-row items-start gap-2 mb-2">
                    <MaterialIcons name="location-on" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                    <Text className="text-sm text-foreground flex-1">
                      {ro.locationAddress}
                      {ro.locationCity ? `, ${ro.locationCity}` : ""}
                      {ro.locationState ? `, ${ro.locationState}` : ""}
                      {ro.locationZip ? ` ${ro.locationZip}` : ""}
                    </Text>
                  </View>
                )}
                {ro.contactName && (
                  <View className="flex-row items-center gap-2 mb-1">
                    <MaterialIcons name="person" size={16} color={colors.muted} />
                    <Text className="text-sm text-foreground">{ro.contactName}</Text>
                  </View>
                )}
                {ro.contactPhone && (
                  <View className="flex-row items-center gap-2 mb-1">
                    <MaterialIcons name="phone" size={16} color={colors.muted} />
                    <Text className="text-sm text-foreground">{ro.contactPhone}</Text>
                  </View>
                )}
                {ro.contactEmail && (
                  <View className="flex-row items-center gap-2">
                    <MaterialIcons name="email" size={16} color={colors.muted} />
                    <Text className="text-sm text-foreground">{ro.contactEmail}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Notes */}
            {ro.notes && (
              <View className="bg-surface border border-border rounded-2xl p-4 mb-4">
                <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  Notes
                </Text>
                <Text className="text-sm text-foreground">{ro.notes}</Text>
              </View>
            )}

            {/* Signature Status */}
            {order.signature && (
              <View
                className="bg-surface border rounded-2xl p-4 mb-4"
                style={{ borderColor: colors.success }}
              >
                <View className="flex-row items-center gap-2">
                  <MaterialIcons name="check-circle" size={20} color={colors.success} />
                  <Text className="text-sm font-medium" style={{ color: colors.success }}>
                    Signature collected from {order.signature.signerName}
                  </Text>
                </View>
              </View>
            )}

            {/* Assets Header */}
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-semibold text-muted uppercase tracking-wider">
                Captured Assets ({order.assets.length})
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <AssetRow asset={item} onDelete={() => handleDeleteAsset(item.localId)} />
        )}
        ListEmptyComponent={
          <View className="items-center py-8">
            <MaterialIcons name="inventory" size={40} color={colors.border} />
            <Text className="text-sm text-muted mt-2">No assets captured yet</Text>
            <Text className="text-xs text-muted mt-1">Tap "Capture Asset" below to start</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom Action Bar */}
      <View
        className="absolute bottom-0 left-0 right-0 flex-row gap-3 px-4 pt-3 pb-8 border-t"
        style={{ backgroundColor: colors.background, borderTopColor: colors.border }}
      >
        <TouchableOpacity
          className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl"
          style={{ backgroundColor: colors.primary }}
          onPress={() =>
            router.push({
              pathname: "/asset-capture",
              params: { orderId: String(ro.id) },
            })
          }
          activeOpacity={0.8}
        >
          <MaterialIcons name="add-circle" size={20} color="#FFFFFF" />
          <Text className="text-white font-semibold">Capture Asset</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border"
          style={{ borderColor: colors.primary }}
          onPress={() =>
            router.push({
              pathname: "/signature",
              params: { orderId: String(ro.id) },
            })
          }
          activeOpacity={0.8}
        >
          <MaterialIcons name="draw" size={20} color={colors.primary} />
          <Text className="font-semibold" style={{ color: colors.primary }}>
            {order.signature ? "Re-sign" : "Signature"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  assetMake: {
    fontSize: 15,
    fontWeight: "600",
  },
  assetSerial: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  assetMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  conditionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  assetNote: {
    fontSize: 12,
    flex: 1,
  },
});
