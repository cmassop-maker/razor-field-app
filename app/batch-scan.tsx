import { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  StyleSheet,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { generateId } from "@/lib/uuid";
import type { AssetCondition, AssetType, CapturedAsset } from "@/lib/types";
import {
  recordMakeModel,
  suggestMakes,
  suggestModels,
} from "@/lib/autocomplete-db";

const CONDITIONS: AssetCondition[] = ["Used", "New"];

const ASSET_TYPES: AssetType[] = [
  "Laptop",
  "Desktop",
  "Cell Phone",
  "Tablet",
  "Server",
  "Monitor",
  "Printer",
  "Networking",
  "UPS/Battery",
  "Other",
];

const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  Laptop: "laptop",
  Desktop: "desktop-windows",
  "Cell Phone": "smartphone",
  Tablet: "tablet",
  Server: "dns",
  Monitor: "monitor",
  Printer: "print",
  Networking: "router",
  "UPS/Battery": "battery-charging-full",
  Other: "devices-other",
};

/**
 * Batch Scan Screen
 *
 * Set make, model, asset type, and condition ONCE,
 * then scan multiple serial numbers consecutively.
 * Each scanned serial auto-creates an asset with the pre-set info.
 */
export default function BatchScanScreen() {
  const params = useLocalSearchParams<{
    orderId: string;
    scannedSerials?: string;
    _scanTs?: string;
  }>();
  const orderId = params.orderId;
  const { state, dispatch } = useStore();
  const colors = useColors();

  // Phase: "setup" = fill in make/model, "scanning" = actively scanning serials
  const [phase, setPhase] = useState<"setup" | "scanning">("setup");

  // Shared fields (set once)
  const [assetType, setAssetType] = useState<AssetType>("Laptop");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [condition, setCondition] = useState<AssetCondition>("Used");
  const [notes, setNotes] = useState("");

  // Scanned serials and saved assets
  const [savedAssets, setSavedAssets] = useState<
    { serial: string; localId: string }[]
  >([]);
  const [error, setError] = useState("");

  // Track processed scan timestamps
  const lastProcessedTs = useRef<string>("");

  // Auto-complete state
  const [makeSuggestions, setMakeSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<
    { model: string; assetType?: AssetType; count: number }[]
  >([]);
  const [showMakeSuggestions, setShowMakeSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);

  // GPS location
  const [gpsLatitude, setGpsLatitude] = useState<number | null>(null);
  const [gpsLongitude, setGpsLongitude] = useState<number | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string | null>(null);

  // Duplicate detection
  const allCapturedSerials = useRef<
    Map<string, { orderId: number; orderNum: string }>
  >(new Map());

  useEffect(() => {
    const map = new Map<string, { orderId: number; orderNum: string }>();
    for (const order of state.orders) {
      for (const asset of order.assets) {
        if (asset.serialNumber) {
          map.set(asset.serialNumber.toUpperCase(), {
            orderId: order.razorOrder.id,
            orderNum:
              order.razorOrder.autoName || String(order.razorOrder.id),
          });
        }
      }
    }
    allCapturedSerials.current = map;
  }, [state.orders]);

  // Capture GPS on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setGpsLatitude(loc.coords.latitude);
        setGpsLongitude(loc.coords.longitude);
        try {
          const addresses = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (addresses.length > 0) {
            const a = addresses[0];
            const parts = [
              a.streetNumber,
              a.street,
              a.city,
              a.region,
              a.postalCode,
            ].filter(Boolean);
            setGpsAddress(parts.join(", ") || null);
          }
        } catch {
          // Reverse geocode optional
        }
      } catch {
        // Location unavailable
      }
    })();
  }, []);

  // Auto-complete suggestions
  useEffect(() => {
    let cancelled = false;
    suggestMakes(make).then((s) => {
      if (!cancelled) setMakeSuggestions(s);
    });
    return () => {
      cancelled = true;
    };
  }, [make]);

  useEffect(() => {
    let cancelled = false;
    if (make.trim()) {
      suggestModels(make, model).then((s) => {
        if (!cancelled) setModelSuggestions(s);
      });
    } else {
      setModelSuggestions([]);
    }
    return () => {
      cancelled = true;
    };
  }, [make, model]);

  // Process returned scanned serials from scanner
  useEffect(() => {
    const raw = params.scannedSerials;
    const ts = params._scanTs;
    if (raw && ts && ts !== lastProcessedTs.current) {
      lastProcessedTs.current = ts;
      try {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Auto-save each scanned serial as an asset
          let newSaved: { serial: string; localId: string }[] = [];
          let duplicates: string[] = [];

          for (const serial of parsed) {
            const trimmed = serial.trim();
            if (!trimmed) continue;

            // Check for duplicates
            const key = trimmed.toUpperCase();
            const existing = allCapturedSerials.current.get(key);
            if (existing) {
              duplicates.push(trimmed);
              continue;
            }

            // Also check within this batch
            const alreadyInBatch = savedAssets.some(
              (a) => a.serial.toUpperCase() === key
            );
            const alreadyInNewBatch = newSaved.some(
              (a) => a.serial.toUpperCase() === key
            );
            if (alreadyInBatch || alreadyInNewBatch) {
              duplicates.push(trimmed);
              continue;
            }

            const localId = generateId();
            const asset: CapturedAsset = {
              localId,
              orderId: Number(orderId),
              assetType,
              make: make.trim(),
              model: model.trim(),
              serialNumber: trimmed,
              condition,
              notes: notes.trim(),
              capturedAt: new Date().toISOString(),
              syncStatus: "pending",
              captureLatitude: gpsLatitude ?? undefined,
              captureLongitude: gpsLongitude ?? undefined,
              captureLocationAddress: gpsAddress ?? undefined,
            };

            dispatch({
              type: "ADD_ASSET",
              payload: { orderId: Number(orderId), asset },
            });
            recordMakeModel(make.trim(), model.trim(), assetType);
            newSaved.push({ serial: trimmed, localId });

            // Add to duplicate map so subsequent items in same batch are caught
            allCapturedSerials.current.set(key, {
              orderId: Number(orderId),
              orderNum: orderId,
            });
          }

          if (newSaved.length > 0) {
            setSavedAssets((prev) => [...prev, ...newSaved]);
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
            }
          }

          if (duplicates.length > 0) {
            Alert.alert(
              "Duplicates Skipped",
              `${duplicates.length} serial(s) were already captured and skipped:\n${duplicates.join(", ")}`,
              [{ text: "OK" }]
            );
          }
        }
      } catch {
        // Invalid JSON
      }
    }
  }, [params.scannedSerials, params._scanTs]);

  function handleStartScanning() {
    if (!make.trim()) {
      setError("Make is required");
      return;
    }
    if (!model.trim()) {
      setError("Model is required");
      return;
    }
    setError("");
    setPhase("scanning");

    // Open scanner in continuous mode
    router.push({
      pathname: "/scanner",
      params: {
        orderId,
        continuous: "true",
        returnTo: "batch-scan",
      },
    });
  }

  function handleScanMore() {
    router.push({
      pathname: "/scanner",
      params: {
        orderId,
        continuous: "true",
        returnTo: "batch-scan",
      },
    });
  }

  function handleRemoveAsset(localId: string, serial: string) {
    Alert.alert("Remove Asset", `Remove "${serial}" from this batch?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          dispatch({
            type: "REMOVE_ASSET",
            payload: { orderId: Number(orderId), localId },
          });
          setSavedAssets((prev) => prev.filter((a) => a.localId !== localId));
          // Remove from duplicate map
          allCapturedSerials.current.delete(serial.toUpperCase());
        },
      },
    ]);
  }

  function handleDone() {
    router.replace({ pathname: "/order/[id]", params: { id: orderId } });
  }

  function selectMakeSuggestion(suggestion: string) {
    setMake(suggestion);
    setShowMakeSuggestions(false);
  }

  function selectModelSuggestion(suggestion: {
    model: string;
    assetType?: AssetType;
  }) {
    setModel(suggestion.model);
    if (suggestion.assetType) {
      setAssetType(suggestion.assetType);
    }
    setShowModelSuggestions(false);
  }

  // ==================== SETUP PHASE ====================
  if (phase === "setup") {
    return (
      <ScreenContainer>
        {/* Header */}
        <View
          className="flex-row items-center px-4 py-3 border-b"
          style={{ borderBottomColor: colors.border }}
        >
          <TouchableOpacity
            onPress={() =>
              router.replace({
                pathname: "/order/[id]",
                params: { id: orderId },
              })
            }
            style={{ padding: 4, marginRight: 12 }}
          >
            <MaterialIcons
              name="arrow-back"
              size={24}
              color={colors.foreground}
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text className="text-lg font-bold text-foreground">
              Batch Scan
            </Text>
            <Text className="text-xs text-muted">
              Set device info once, then scan multiple serials
            </Text>
          </View>
          <MaterialIcons
            name="playlist-add-check"
            size={28}
            color={colors.primary}
          />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            className="flex-1 px-4 pt-4"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* Info Banner */}
            <View
              className="rounded-xl p-4 mb-4 border"
              style={{
                backgroundColor: colors.primary + "10",
                borderColor: colors.primary + "30",
              }}
            >
              <View className="flex-row items-center mb-2">
                <MaterialIcons
                  name="info-outline"
                  size={20}
                  color={colors.primary}
                />
                <Text
                  className="text-sm font-semibold ml-2"
                  style={{ color: colors.primary }}
                >
                  How Batch Scan Works
                </Text>
              </View>
              <Text className="text-sm text-muted leading-5">
                Fill in the device details below. Then scan multiple serial
                numbers — each scan will automatically create an asset with
                these details.
              </Text>
            </View>

            {/* Asset Type */}
            <View
              className="rounded-xl p-4 mb-4 border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Text
                className="text-base font-bold mb-3"
                style={{ color: colors.foreground }}
              >
                Device Information
              </Text>

              {/* Asset Type Selector */}
              <View className="mb-3">
                <Text className="text-sm font-medium text-muted mb-2">
                  Asset Type *
                </Text>
                <View style={styles.assetTypeGrid}>
                  {ASSET_TYPES.map((type) => {
                    const isSelected = assetType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.assetTypeItem,
                          {
                            backgroundColor: isSelected
                              ? colors.primary
                              : colors.background,
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                        onPress={() => setAssetType(type)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={ASSET_TYPE_ICONS[type] as any}
                          size={18}
                          color={isSelected ? "#FFFFFF" : colors.muted}
                        />
                        <Text
                          style={[
                            styles.assetTypeText,
                            {
                              color: isSelected
                                ? "#FFFFFF"
                                : colors.foreground,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Make */}
              <View className="mb-3" style={{ zIndex: 20 }}>
                <Text className="text-sm font-medium text-muted mb-1.5">
                  Make *
                </Text>
                <TextInput
                  className="border rounded-xl px-4 py-3.5 text-foreground text-base"
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  }}
                  value={make}
                  onChangeText={(text) => {
                    setMake(text);
                    setShowMakeSuggestions(true);
                  }}
                  onFocus={() => setShowMakeSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowMakeSuggestions(false), 200)
                  }
                  placeholder="e.g. Apple, Dell, HP"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                {showMakeSuggestions && makeSuggestions.length > 0 && (
                  <View
                    style={[
                      styles.suggestionsDropdown,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {makeSuggestions.slice(0, 6).map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.suggestionItem,
                          { borderBottomColor: colors.border },
                        ]}
                        onPress={() => selectMakeSuggestion(s)}
                      >
                        <MaterialIcons
                          name="history"
                          size={16}
                          color={colors.muted}
                        />
                        <Text
                          style={[
                            styles.suggestionText,
                            { color: colors.foreground },
                          ]}
                        >
                          {s}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Model */}
              <View style={{ zIndex: 10 }}>
                <Text className="text-sm font-medium text-muted mb-1.5">
                  Model *
                </Text>
                <TextInput
                  className="border rounded-xl px-4 py-3.5 text-foreground text-base"
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  }}
                  value={model}
                  onChangeText={(text) => {
                    setModel(text);
                    setShowModelSuggestions(true);
                  }}
                  onFocus={() => setShowModelSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowModelSuggestions(false), 200)
                  }
                  placeholder="e.g. iPad Pro, OptiPlex 7090"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                {showModelSuggestions && modelSuggestions.length > 0 && (
                  <View
                    style={[
                      styles.suggestionsDropdown,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {modelSuggestions.slice(0, 6).map((s) => (
                      <TouchableOpacity
                        key={s.model}
                        style={[
                          styles.suggestionItem,
                          { borderBottomColor: colors.border },
                        ]}
                        onPress={() => selectModelSuggestion(s)}
                      >
                        <MaterialIcons
                          name="history"
                          size={16}
                          color={colors.muted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.suggestionText,
                              { color: colors.foreground },
                            ]}
                          >
                            {s.model}
                          </Text>
                          {s.assetType && (
                            <Text
                              style={{ fontSize: 11, color: colors.muted }}
                            >
                              {s.assetType} • used {s.count}x
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Condition */}
            <View
              className="rounded-xl p-4 mb-4 border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Text className="text-sm font-medium text-muted mb-2">
                Condition
              </Text>
              <View className="flex-row gap-2">
                {CONDITIONS.map((c) => {
                  const isSelected = condition === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      className="flex-1 py-3 rounded-xl items-center border"
                      style={{
                        backgroundColor: isSelected
                          ? colors.primary
                          : colors.background,
                        borderColor: isSelected
                          ? colors.primary
                          : colors.border,
                      }}
                      onPress={() => setCondition(c)}
                      activeOpacity={0.7}
                    >
                      <Text
                        className="text-sm font-medium"
                        style={{
                          color: isSelected ? "#FFFFFF" : colors.foreground,
                        }}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Notes */}
              <View className="mt-3">
                <Text className="text-sm font-medium text-muted mb-1.5">
                  Notes (optional — applies to all)
                </Text>
                <TextInput
                  className="border rounded-xl px-4 py-3.5 text-foreground text-base"
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    minHeight: 60,
                  }}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Notes for all assets in this batch"
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {error ? (
              <View className="bg-error/10 rounded-lg px-4 py-3 mb-4">
                <Text className="text-error text-sm">{error}</Text>
              </View>
            ) : null}

            {/* Start Scanning Button */}
            <TouchableOpacity
              className="rounded-xl py-4 items-center"
              style={{ backgroundColor: colors.primary }}
              onPress={handleStartScanning}
              activeOpacity={0.8}
            >
              <View className="flex-row items-center gap-2">
                <MaterialIcons
                  name="qr-code-scanner"
                  size={22}
                  color="#FFFFFF"
                />
                <Text className="text-white font-semibold text-base">
                  Start Scanning Serials
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenContainer>
    );
  }

  // ==================== SCANNING PHASE ====================
  return (
    <ScreenContainer>
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{ borderBottomColor: colors.border }}
      >
        <TouchableOpacity
          onPress={handleDone}
          style={{ padding: 4, marginRight: 12 }}
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={colors.foreground}
          />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text className="text-lg font-bold text-foreground">
            Batch Scan
          </Text>
          <Text className="text-xs text-muted">
            {make} — {model}
          </Text>
        </View>
        <View
          style={[styles.savedBadge, { backgroundColor: colors.success }]}
        >
          <Text style={styles.savedBadgeText}>
            {savedAssets.length} saved
          </Text>
        </View>
      </View>

      {/* Device info summary card */}
      <View
        className="mx-4 mt-3 rounded-xl p-3 border"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
        }}
      >
        <View className="flex-row items-center">
          <MaterialIcons
            name={ASSET_TYPE_ICONS[assetType] as any}
            size={24}
            color={colors.primary}
          />
          <View className="ml-3 flex-1">
            <Text
              className="text-sm font-bold"
              style={{ color: colors.foreground }}
            >
              {make} {model}
            </Text>
            <Text className="text-xs text-muted">
              {assetType} • {condition}
              {notes ? ` • ${notes}` : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setPhase("setup")}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              className="text-xs font-medium"
              style={{ color: colors.muted }}
            >
              Edit
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Scanned serials list */}
      <View className="flex-1 px-4 mt-3">
        {savedAssets.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <MaterialIcons
              name="qr-code-scanner"
              size={64}
              color={colors.border}
            />
            <Text
              className="text-base text-muted mt-4 text-center"
              style={{ maxWidth: 260 }}
            >
              Tap "Scan More" to start scanning serial numbers
            </Text>
          </View>
        ) : (
          <FlatList
            data={savedAssets}
            keyExtractor={(item) => item.localId}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item, index }) => (
              <View
                className="flex-row items-center py-3 border-b"
                style={{ borderBottomColor: colors.border }}
              >
                <View
                  style={[
                    styles.indexBadge,
                    { backgroundColor: colors.primary + "15" },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: colors.primary,
                    }}
                  >
                    {index + 1}
                  </Text>
                </View>
                <View className="flex-1 ml-3">
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.foreground,
                      fontFamily:
                        Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  >
                    {item.serial}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveAsset(item.localId, item.serial)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 4 }}
                >
                  <MaterialIcons
                    name="delete-outline"
                    size={20}
                    color={colors.error}
                  />
                </TouchableOpacity>
              </View>
            )}
            ListHeaderComponent={
              <Text className="text-sm font-semibold text-muted mb-2">
                Scanned Serials ({savedAssets.length})
              </Text>
            }
          />
        )}
      </View>

      {/* Bottom action buttons */}
      <View
        className="px-4 pb-4 pt-3 border-t"
        style={{ borderTopColor: colors.border }}
      >
        <TouchableOpacity
          className="rounded-xl py-4 items-center mb-2"
          style={{ backgroundColor: colors.primary }}
          onPress={handleScanMore}
          activeOpacity={0.8}
        >
          <View className="flex-row items-center gap-2">
            <MaterialIcons
              name="qr-code-scanner"
              size={22}
              color="#FFFFFF"
            />
            <Text className="text-white font-semibold text-base">
              Scan More Serials
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          className="rounded-xl py-3 items-center border"
          style={{ borderColor: colors.border }}
          onPress={handleDone}
          activeOpacity={0.8}
        >
          <Text
            className="font-semibold text-base"
            style={{ color: colors.foreground }}
          >
            Done — Return to Order
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  assetTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  assetTypeItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    minWidth: "30%",
    flexGrow: 1,
    flexBasis: "28%",
  },
  assetTypeText: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  suggestionsDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    maxHeight: 200,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  suggestionText: {
    fontSize: 15,
    fontWeight: "500",
  },
  savedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  savedBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
