import { useMemo, useState } from "react";
import {
  Text,
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { createAsset, uploadOrderFile, updateOrderNotes } from "@/lib/razor-api";
import type { CapturedAsset } from "@/lib/types";

export default function OrderSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const colors = useColors();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const order = useMemo(
    () => state.orders.find((o) => String(o.razorOrder.id) === id),
    [state.orders, id]
  );

  async function handleSubmit() {
    if (!order) return;

    const doSubmit = async () => {
      setIsSubmitting(true);
      setSubmitResult(null);
      let successCount = 0;
      let failCount = 0;

      // Submit each asset
      for (const asset of order.assets) {
        if (asset.syncStatus === "synced") {
          successCount++;
          continue;
        }
        try {
          await createAsset({
            make: asset.make,
            model: asset.model,
            serialNumber: asset.serialNumber,
            condition: asset.condition,
            notes: asset.notes,
          });
          successCount++;
        } catch (e) {
          failCount++;
          console.error("Failed to submit asset:", asset.localId, e);
        }
      }

      // Upload signature
      if (order.signature && order.signature.syncStatus !== "synced") {
        try {
          await uploadOrderFile(
            order.razorOrder.id,
            order.signature.signatureBase64,
            `signature_${order.razorOrder.id}_${Date.now()}.png`
          );
        } catch (e) {
          console.error("Failed to upload signature:", e);
          failCount++;
        }
      }

      // Update order status
      if (failCount === 0) {
        dispatch({
          type: "SET_ORDER_STATUS",
          payload: { orderId: order.razorOrder.id, status: "Completed" },
        });
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setSubmitResult({
          success: true,
          message: `Successfully submitted ${successCount} asset${successCount !== 1 ? "s" : ""} and signature to Razor ERP.`,
        });
      } else {
        setSubmitResult({
          success: false,
          message: `Submitted ${successCount} asset${successCount !== 1 ? "s" : ""}, but ${failCount} item${failCount !== 1 ? "s" : ""} failed. Check your connection and try again.`,
        });
      }

      setIsSubmitting(false);
    };

    if (Platform.OS === "web") {
      doSubmit();
    } else {
      Alert.alert(
        "Submit to Razor ERP",
        `This will submit ${order.assets.length} asset${order.assets.length !== 1 ? "s" : ""}${order.signature ? " and the collected signature" : ""} to Razor ERP.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Submit", onPress: doSubmit },
        ]
      );
    }
  }

  if (!order) {
    return (
      <ScreenContainer className="p-4">
        <Text className="text-lg text-muted text-center mt-20">Order not found</Text>
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
          <Text className="text-lg font-bold text-foreground">Order Summary</Text>
          <Text className="text-xs text-muted">{ro.autoName || `Order #${ro.id}`}</Text>
        </View>
      </View>

      <FlatList
        data={order.assets}
        keyExtractor={(item) => item.localId}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        ListHeaderComponent={
          <View>
            {/* Order Info Card */}
            <View className="bg-surface border border-border rounded-2xl p-4 mb-4">
              <Text className="text-base font-semibold text-foreground mb-1">
                {ro.customerName || "Unknown Customer"}
              </Text>
              {ro.locationAddress && (
                <Text className="text-sm text-muted">
                  {ro.locationAddress}
                  {ro.locationCity ? `, ${ro.locationCity}` : ""}
                </Text>
              )}
            </View>

            {/* Signature Preview */}
            <View className="bg-surface border border-border rounded-2xl p-4 mb-4">
              <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                Signature
              </Text>
              {order.signature ? (
                <View>
                  {order.signature.signatureBase64 !== "PLACEHOLDER_WEB_SIGNATURE" ? (
                    <View
                      className="rounded-lg overflow-hidden mb-2"
                      style={{ height: 100, backgroundColor: "#FFFFFF" }}
                    >
                      <Image
                        source={{
                          uri: `data:image/png;base64,${order.signature.signatureBase64}`,
                        }}
                        style={{ width: "100%", height: 100 }}
                        resizeMode="contain"
                      />
                    </View>
                  ) : (
                    <View
                      className="rounded-lg items-center justify-center mb-2"
                      style={{ height: 60, backgroundColor: "#F0F4F0" }}
                    >
                      <Text className="text-sm text-muted">Signature captured (web placeholder)</Text>
                    </View>
                  )}
                  <Text className="text-sm text-foreground">
                    {order.signature.signerName}
                    {order.signature.signerTitle ? ` — ${order.signature.signerTitle}` : ""}
                  </Text>
                </View>
              ) : (
                <View className="items-center py-4">
                  <MaterialIcons name="draw" size={32} color={colors.border} />
                  <Text className="text-sm text-muted mt-2">No signature collected</Text>
                  <TouchableOpacity
                    className="mt-2"
                    onPress={() =>
                      router.push({
                        pathname: "/signature",
                        params: { orderId: String(ro.id) },
                      })
                    }
                  >
                    <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                      Collect Signature
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Assets Header */}
            <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              Assets ({order.assets.length})
            </Text>
          </View>
        }
        renderItem={({ item }: { item: CapturedAsset }) => (
          <View
            style={[styles.assetItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.assetTitle, { color: colors.foreground }]}>
                {item.make} {item.model}
              </Text>
              <Text
                style={[
                  styles.assetSerial,
                  { color: colors.muted, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
                ]}
              >
                S/N: {item.serialNumber}
              </Text>
            </View>
            <Text style={[styles.condition, { color: colors.muted }]}>{item.condition}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center py-8">
            <Text className="text-sm text-muted">No assets to submit</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Submit Result */}
      {submitResult && (
        <View
          style={[
            styles.resultBanner,
            {
              backgroundColor: submitResult.success ? `${colors.success}15` : `${colors.error}15`,
              borderColor: submitResult.success ? colors.success : colors.error,
            },
          ]}
        >
          <MaterialIcons
            name={submitResult.success ? "check-circle" : "error"}
            size={20}
            color={submitResult.success ? colors.success : colors.error}
          />
          <Text
            style={{
              flex: 1,
              marginLeft: 8,
              fontSize: 13,
              color: submitResult.success ? colors.success : colors.error,
            }}
          >
            {submitResult.message}
          </Text>
        </View>
      )}

      {/* Submit Button */}
      <View
        className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-8 border-t"
        style={{ backgroundColor: colors.background, borderTopColor: colors.border }}
      >
        <TouchableOpacity
          className="rounded-xl py-4 items-center"
          style={{
            backgroundColor: colors.primary,
            opacity: isSubmitting || order.assets.length === 0 ? 0.6 : 1,
          }}
          onPress={handleSubmit}
          disabled={isSubmitting || order.assets.length === 0}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View className="flex-row items-center gap-2">
              <MaterialIcons name="cloud-upload" size={20} color="#FFFFFF" />
              <Text className="text-white font-semibold text-base">Submit All to Razor ERP</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  assetItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  assetTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  assetSerial: {
    fontSize: 12,
    marginTop: 2,
  },
  condition: {
    fontSize: 12,
    fontWeight: "500",
  },
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
