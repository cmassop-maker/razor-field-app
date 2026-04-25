import { useMemo, useCallback, useState, useEffect } from "react";
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useColors } from "@/hooks/use-colors";
import { geocodeAddress } from "@/lib/razor-api";
import NativeMap from "@/components/native-map";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { CapturedAsset } from "@/lib/types";
import { generateAndShareReport, printReport } from "@/lib/generate-report";

function AssetRow({
  asset,
  onDelete,
  onEdit,
}: {
  asset: CapturedAsset;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.assetRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {asset.assetType ? (
            <View style={[styles.assetTypeBadge, { backgroundColor: colors.primary + "18" }]}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.primary }}>
                {asset.assetType.toUpperCase()}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.assetMake, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
            {asset.make} {asset.model}
          </Text>
          {asset.syncStatus === "synced" && (
            <MaterialIcons name="check-circle" size={14} color={colors.success} />
          )}
          {asset.syncStatus === "failed" && (
            <MaterialIcons name="error" size={14} color={colors.error} />
          )}
        </View>
        <Text style={[styles.assetSerial, { color: colors.muted }]}>
          S/N: {asset.serialNumber}
        </Text>
        {asset.razorUid ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <MaterialIcons name="verified" size={12} color={colors.primary} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
              {asset.razorUid}
            </Text>
          </View>
        ) : null}
        <View style={styles.assetMeta}>
          <View
            style={[
              styles.conditionBadge,
              {
                backgroundColor:
                  asset.condition === "New" || asset.condition === "Used"
                    ? "#D1FAE5"
                    : asset.condition === "For Parts"
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
                  asset.condition === "New" || asset.condition === "Used"
                    ? "#065F46"
                    : asset.condition === "For Parts"
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
        {/* GPS Location & Timestamp */}
        <View style={{ marginTop: 6, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MaterialIcons name="schedule" size={11} color={colors.muted} />
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {new Date(asset.capturedAt).toLocaleString(undefined, {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </Text>
          </View>
          {asset.captureLatitude != null && asset.captureLongitude != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <MaterialIcons name="gps-fixed" size={11} color={colors.primary} />
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {asset.captureLocationAddress
                  ? asset.captureLocationAddress
                  : `${asset.captureLatitude.toFixed(5)}, ${asset.captureLongitude.toFixed(5)}`}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ gap: 8, alignItems: "center" }}>
        <TouchableOpacity onPress={onEdit} style={{ padding: 8 }}>
          <MaterialIcons name="edit" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={{ padding: 8 }}>
          <MaterialIcons name="delete-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const colors = useColors();

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const order = useMemo(
    () => state.orders.find((o) => String(o.razorOrder.id) === id),
    [state.orders, id]
  );

  // Build full address string
  const fullAddress = useMemo(() => {
    if (!order) return "";
    const ro = order.razorOrder;
    // Prefer resolved locationAddress, fall back to customerAddress from API
    if (ro.locationAddress) {
      return ro.locationAddress;
    }
    if (ro.customerAddress) {
      return ro.customerAddress;
    }
    const parts = [ro.locationCity, ro.locationState, ro.locationZip].filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
    if (ro.customerLocationName) return ro.customerLocationName;
    return "";
  }, [order]);

  // Geocode the address
  useEffect(() => {
    if (!fullAddress) return;
    let cancelled = false;
    setGeocoding(true);
    geocodeAddress(fullAddress).then((result) => {
      if (!cancelled) {
        setCoords(result);
        setGeocoding(false);
      }
    });
    return () => { cancelled = true; };
  }, [fullAddress]);

  /** Open native maps app for navigation */
  const openNavigation = useCallback(() => {
    if (!fullAddress && !coords) return;
    const destination = coords
      ? `${coords.latitude},${coords.longitude}`
      : encodeURIComponent(fullAddress);
    if (Platform.OS === "ios") {
      Linking.openURL(`maps://app?daddr=${destination}`).catch(() =>
        Linking.openURL(`https://maps.apple.com/?daddr=${destination}`)
      );
    } else if (Platform.OS === "android") {
      Linking.openURL(`google.navigation:q=${destination}`).catch(() =>
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`)
      );
    } else {
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
      );
    }
  }, [fullAddress, coords]);

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
          onPress={() => {
            if (Platform.OS === "web") {
              generateAndShareReport(order).catch((e) =>
                Alert.alert("Error", "Failed to generate report")
              );
            } else {
              Alert.alert(
                "Order Report",
                "Generate a PDF report for this order?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Share PDF",
                    onPress: () =>
                      generateAndShareReport(order).catch((e) =>
                        Alert.alert("Error", e?.message || "Failed to generate report")
                      ),
                  },
                  {
                    text: "Print",
                    onPress: () =>
                      printReport(order).catch((e) =>
                        Alert.alert("Error", e?.message || "Failed to print report")
                      ),
                  },
                ]
              );
            }
          }}
          style={{ padding: 4, marginRight: 8 }}
        >
          <MaterialIcons name="picture-as-pdf" size={24} color={colors.error} />
        </TouchableOpacity>
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
            {/* Map & Address Card */}
            {fullAddress ? (
              <View className="bg-surface border border-border rounded-2xl overflow-hidden mb-4">
                {/* Map */}
                {coords ? (
                  <View style={{ height: 180, width: "100%" }}>
                    <NativeMap
                      initialRegion={{
                        ...coords,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }}
                      coordinates={[coords]}
                      markerTitle={ro.customerName || "Pickup"}
                      scrollEnabled={false}
                      zoomEnabled={false}
                    />
                  </View>
                ) : geocoding ? (
                  <View style={{ height: 120, justifyContent: "center", alignItems: "center" }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text className="text-xs text-muted mt-2">Loading map...</Text>
                  </View>
                ) : null}

                {/* Address & Navigate Button */}
                <View className="p-4">
                  <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Pickup Location
                  </Text>
                  <View className="flex-row items-start gap-2 mb-3">
                    <MaterialIcons name="location-on" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                    <Text className="text-sm text-foreground flex-1">{fullAddress}</Text>
                  </View>

                  {/* Navigate Button */}
                  <TouchableOpacity
                    style={[styles.navigateBtn, { backgroundColor: colors.primary }]}
                    onPress={openNavigation}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="navigation" size={18} color="#FFFFFF" />
                    <Text style={styles.navigateBtnText}>Navigate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* Contact Info */}
            {(ro.contactName || ro.contactPhone || ro.contactEmail) && (
              <View className="bg-surface border border-border rounded-2xl p-4 mb-4">
                <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                  Contact
                </Text>
                {ro.contactName && (
                  <View className="flex-row items-center gap-2 mb-2">
                    <MaterialIcons name="person" size={16} color={colors.muted} />
                    <Text className="text-sm text-foreground">{ro.contactName}</Text>
                  </View>
                )}
                {ro.contactPhone && (
                  <TouchableOpacity
                    className="flex-row items-center gap-2 mb-2"
                    onPress={() => Linking.openURL(`tel:${ro.contactPhone}`)}
                  >
                    <MaterialIcons name="phone" size={16} color={colors.primary} />
                    <Text className="text-sm" style={{ color: colors.primary }}>{ro.contactPhone}</Text>
                  </TouchableOpacity>
                )}
                {ro.contactEmail && (
                  <TouchableOpacity
                    className="flex-row items-center gap-2"
                    onPress={() => Linking.openURL(`mailto:${ro.contactEmail}`)}
                  >
                    <MaterialIcons name="email" size={16} color={colors.primary} />
                    <Text className="text-sm" style={{ color: colors.primary }}>{ro.contactEmail}</Text>
                  </TouchableOpacity>
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
          <AssetRow
            asset={item}
            onDelete={() => handleDeleteAsset(item.localId)}
            onEdit={() =>
              router.push({
                pathname: "/edit-asset",
                params: { orderId: String(ro.id), localId: item.localId },
              })
            }
          />
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
        className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-8 border-t"
        style={{ backgroundColor: colors.background, borderTopColor: colors.border }}
      >
        {/* Top row: Capture Asset + Batch Scan */}
        <View className="flex-row gap-3 mb-2">
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
            <Text className="text-white font-semibold">Capture</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl"
            style={{ backgroundColor: colors.primary }}
            onPress={() =>
              router.push({
                pathname: "/batch-scan",
                params: { orderId: String(ro.id) },
              })
            }
            activeOpacity={0.8}
          >
            <MaterialIcons name="playlist-add-check" size={20} color="#FFFFFF" />
            <Text className="text-white font-semibold">Batch Scan</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom row: Signature */}
        <TouchableOpacity
          className="flex-row items-center justify-center gap-2 py-3.5 rounded-xl border"
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
  assetTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
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
  navigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  navigateBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
});
