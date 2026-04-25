import { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
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

export default function AssetCaptureScreen() {
  const params = useLocalSearchParams<{
    orderId: string;
    scannedSerial?: string;
    scannedSerials?: string;
    _scanTs?: string;
  }>();
  const orderId = params.orderId;
  const { state, dispatch } = useStore();
  const colors = useColors();

  const [assetType, setAssetType] = useState<AssetType>("Laptop");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");

  // Track whether we've already processed a given scan result
  const lastProcessedTs = useRef<string>("");

  // When scannedSerial param changes (single scan), update serial field
  useEffect(() => {
    const val = params.scannedSerial;
    const ts = params._scanTs;
    if (val && ts && ts !== lastProcessedTs.current) {
      lastProcessedTs.current = ts;
      setSerialNumber(val);
      // Check for duplicate immediately after scan
      checkDuplicateSerial(val);
    }
  }, [params.scannedSerial, params._scanTs]);

  // Queue of serials from continuous scanning
  const [serialQueue, setSerialQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [condition, setCondition] = useState<AssetCondition>("Used");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [duplicateWarning, setDuplicateWarning] = useState("");

  // Auto-complete state
  const [makeSuggestions, setMakeSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<
    { model: string; assetType?: AssetType; count: number }[]
  >([]);
  const [showMakeSuggestions, setShowMakeSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);

  // GPS location state
  const [gpsLatitude, setGpsLatitude] = useState<number | null>(null);
  const [gpsLongitude, setGpsLongitude] = useState<number | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsError, setGpsError] = useState("");
  const [captureTimestamp] = useState(() => new Date().toISOString());

  // Continuous scan mode
  const [continuousScan, setContinuousScan] = useState(false);

  // --- Duplicate serial detection ---
  // Collect all captured serial numbers across ALL orders
  const allCapturedSerials = useRef<Map<string, { orderId: number; orderNum: string }>>(new Map());

  useEffect(() => {
    const map = new Map<string, { orderId: number; orderNum: string }>();
    for (const order of state.orders) {
      for (const asset of order.assets) {
        if (asset.serialNumber) {
          map.set(asset.serialNumber.toUpperCase(), {
            orderId: order.razorOrder.id,
            orderNum: order.razorOrder.autoName || String(order.razorOrder.id),
          });
        }
      }
    }
    allCapturedSerials.current = map;
  }, [state.orders]);

  function checkDuplicateSerial(serial: string): boolean {
    if (!serial.trim()) {
      setDuplicateWarning("");
      return false;
    }
    const key = serial.trim().toUpperCase();
    const existing = allCapturedSerials.current.get(key);
    if (existing) {
      const isSameOrder = existing.orderId === Number(orderId);
      const msg = isSameOrder
        ? `Serial "${serial.trim()}" has already been captured on this order.`
        : `Serial "${serial.trim()}" was already captured on Order #${existing.orderNum}.`;
      setDuplicateWarning(msg);

      // Show alert and block — no option to keep
      Alert.alert(
        "Duplicate Serial Number",
        `"${serial.trim()}" has already been captured${isSameOrder ? " on this order" : ` on Order #${existing.orderNum}`}.\n\nDuplicate serial numbers are not allowed.`,
        [
          {
            text: "OK",
            style: "default",
            onPress: () => {
              setSerialNumber("");
              setDuplicateWarning("");
            },
          },
        ]
      );
      return true;
    }
    setDuplicateWarning("");
    return false;
  }

  // Process batch scanned serials from continuous scanner
  useEffect(() => {
    const raw = params.scannedSerials;
    const ts = params._scanTs;
    if (raw && ts && ts !== lastProcessedTs.current) {
      lastProcessedTs.current = ts;
      try {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSerialQueue(parsed);
          setSerialNumber(parsed[0]);
          setQueueIndex(0);
          setContinuousScan(true);
          // Check first serial for duplicates
          checkDuplicateSerial(parsed[0]);
        }
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, [params.scannedSerials]);

  const serialInputRef = useRef<TextInput>(null);

  // Capture GPS location when screen opens
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setGpsError("Location permission denied");
          setGpsLoading(false);
          return;
        }
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
          // Reverse geocode is optional
        }
      } catch {
        setGpsError("Could not get location");
      } finally {
        setGpsLoading(false);
      }
    })();
  }, []);

  // Load make suggestions when make input changes
  useEffect(() => {
    let cancelled = false;
    suggestMakes(make).then((suggestions) => {
      if (!cancelled) setMakeSuggestions(suggestions);
    });
    return () => {
      cancelled = true;
    };
  }, [make]);

  // Load model suggestions when make or model input changes
  useEffect(() => {
    let cancelled = false;
    if (make.trim()) {
      suggestModels(make, model).then((suggestions) => {
        if (!cancelled) setModelSuggestions(suggestions);
      });
    } else {
      setModelSuggestions([]);
    }
    return () => {
      cancelled = true;
    };
  }, [make, model]);

  function handleScan() {
    router.push({
      pathname: "/scanner",
      params: {
        orderId,
        continuous: continuousScan ? "true" : "false",
      },
    });
  }

  const handleSave = useCallback(() => {
    if (!serialNumber.trim()) {
      setError("Serial number is required");
      return;
    }
    // Block duplicate serial at save time as well
    const dupKey = serialNumber.trim().toUpperCase();
    const dupExisting = allCapturedSerials.current.get(dupKey);
    if (dupExisting) {
      const isSame = dupExisting.orderId === Number(orderId);
      Alert.alert(
        "Duplicate Serial Number",
        `"${serialNumber.trim()}" has already been captured${isSame ? " on this order" : ` on Order #${dupExisting.orderNum}`}.\n\nDuplicate serial numbers are not allowed.`,
        [{ text: "OK", onPress: () => { setSerialNumber(""); setDuplicateWarning(""); } }]
      );
      return;
    }
    if (!make.trim()) {
      setError("Make is required");
      return;
    }
    if (!model.trim()) {
      setError("Model is required");
      return;
    }
    setError("");

    const asset: CapturedAsset = {
      localId: generateId(),
      orderId: Number(orderId),
      assetType,
      make: make.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
      condition,
      notes: notes.trim(),
      capturedAt: new Date().toISOString(),
      syncStatus: "pending",
      captureLatitude: gpsLatitude ?? undefined,
      captureLongitude: gpsLongitude ?? undefined,
      captureLocationAddress: gpsAddress ?? undefined,
    };

    dispatch({ type: "ADD_ASSET", payload: { orderId: Number(orderId), asset } });

    // Record make/model for auto-complete database
    recordMakeModel(make.trim(), model.trim(), assetType);

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setSavedCount((prev) => prev + 1);
    setDuplicateWarning("");

    // After save: always clear serial number
    setSerialNumber("");

    if (continuousScan) {
      // Continuous mode: keep make, model, asset type, condition
      // Only clear notes and serial, then auto-reopen scanner for next serial
      setNotes("");

      if (serialQueue.length > 0 && queueIndex + 1 < serialQueue.length) {
        // Process next serial from batch queue
        const nextIdx = queueIndex + 1;
        setQueueIndex(nextIdx);
        setSerialNumber(serialQueue[nextIdx]);
        checkDuplicateSerial(serialQueue[nextIdx]);
      } else {
        // Auto-reopen camera scanner for next serial
        setSerialQueue([]);
        setQueueIndex(0);
        setTimeout(() => {
          router.push({
            pathname: "/scanner",
            params: {
              orderId,
              continuous: "false",
            },
          });
        }, 300);
      }
    } else {
      // Single capture mode: clear everything and reopen scanner
      setNotes("");
      setMake("");
      setModel("");
      setSerialQueue([]);
      setQueueIndex(0);
      setTimeout(() => {
        router.push({
          pathname: "/scanner",
          params: {
            orderId,
            continuous: "false",
          },
        });
      }, 300);
    }
  }, [
    make,
    model,
    serialNumber,
    assetType,
    condition,
    notes,
    orderId,
    gpsLatitude,
    gpsLongitude,
    gpsAddress,
    continuousScan,
    serialQueue,
    queueIndex,
    dispatch,
  ]);

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

  function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{ borderBottomColor: colors.border }}
      >
        <TouchableOpacity
          onPress={() => {
            // Navigate explicitly to order page to avoid landing on scanner
            router.replace({ pathname: "/order/[id]", params: { id: orderId } });
          }}
          style={{ padding: 4, marginRight: 12 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground flex-1">
          Capture Asset
        </Text>
        {savedCount > 0 && (
          <View
            style={[
              styles.savedBadge,
              { backgroundColor: colors.success },
            ]}
          >
            <Text style={styles.savedBadgeText}>{savedCount} saved</Text>
          </View>
        )}
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
          {/* GPS Location & Timestamp Banner */}
          <View
            className="rounded-xl p-3 mb-4 border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <View className="flex-row items-center mb-2">
              <MaterialIcons name="gps-fixed" size={16} color={colors.primary} />
              <Text className="text-xs font-semibold text-primary ml-1.5 uppercase tracking-wider">
                Capture Location
              </Text>
            </View>

            <View className="flex-row items-center mb-1.5">
              <MaterialIcons name="schedule" size={14} color={colors.muted} />
              <Text className="text-sm text-foreground ml-1.5">
                {formatTimestamp(captureTimestamp)}
              </Text>
            </View>

            {gpsLoading ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color={colors.primary} />
                <Text className="text-sm text-muted ml-2">
                  Acquiring GPS location...
                </Text>
              </View>
            ) : gpsLatitude !== null && gpsLongitude !== null ? (
              <>
                <View className="flex-row items-center mb-1">
                  <MaterialIcons
                    name="location-on"
                    size={14}
                    color={colors.success}
                  />
                  <Text className="text-sm text-foreground ml-1.5">
                    {gpsLatitude.toFixed(6)}, {gpsLongitude.toFixed(6)}
                  </Text>
                </View>
                {gpsAddress ? (
                  <View className="flex-row items-start ml-5">
                    <Text className="text-xs text-muted" numberOfLines={2}>
                      {gpsAddress}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <View className="flex-row items-center">
                <MaterialIcons
                  name="location-off"
                  size={14}
                  color={colors.error}
                />
                <Text className="text-sm text-error ml-1.5">
                  {gpsError || "Location unavailable"}
                </Text>
              </View>
            )}
          </View>

          {/* ========== STEP 1: SERIAL NUMBER ========== */}
          <View
            className="rounded-xl p-4 mb-4 border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <View className="flex-row items-center mb-3">
              <View
                style={[styles.stepBadge, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <Text
                className="text-base font-bold ml-2"
                style={{ color: colors.foreground }}
              >
                Serial Number
              </Text>
              {serialQueue.length > 0 && (
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.primary,
                    fontWeight: "600",
                    marginLeft: "auto",
                  }}
                >
                  {queueIndex + 1} of {serialQueue.length} scanned
                </Text>
              )}
            </View>
            <Text className="text-xs text-muted mb-3">
              Scan the barcode/serial label or type it manually
            </Text>

            {/* Scan Button - prominent */}
            <TouchableOpacity
              style={[
                styles.scanButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={handleScan}
              activeOpacity={0.8}
            >
              <MaterialIcons name="qr-code-scanner" size={24} color="#FFFFFF" />
              <Text style={styles.scanButtonText}>
                {serialNumber ? "Re-Scan Serial" : "Scan Serial Number"}
              </Text>
            </TouchableOpacity>

            {/* Manual Entry */}
            <View className="flex-row items-center my-3">
              <View
                style={{
                  flex: 1,
                  height: 1,
                  backgroundColor: colors.border,
                }}
              />
              <Text
                className="mx-3 text-xs"
                style={{ color: colors.muted }}
              >
                or enter manually
              </Text>
              <View
                style={{
                  flex: 1,
                  height: 1,
                  backgroundColor: colors.border,
                }}
              />
            </View>

            <TextInput
              ref={serialInputRef}
              className="border rounded-xl px-4 py-3.5 text-foreground text-base"
              style={{
                backgroundColor: colors.background,
                borderColor: duplicateWarning
                  ? colors.error
                  : serialNumber
                    ? colors.success
                    : colors.border,
                borderWidth: serialNumber ? 2 : 1,
              }}
              value={serialNumber}
              onChangeText={(text) => {
                setSerialNumber(text);
                setDuplicateWarning("");
              }}
              onBlur={() => {
                if (serialNumber.trim()) {
                  checkDuplicateSerial(serialNumber);
                }
              }}
              placeholder="Type serial number here"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              returnKeyType="done"
            />

            {/* Serial confirmation or duplicate error */}
            {duplicateWarning ? (
              <View
                className="flex-row items-start mt-2 p-2.5 rounded-lg"
                style={{ backgroundColor: colors.error + "20" }}
              >
                <MaterialIcons
                  name="block"
                  size={18}
                  color={colors.error}
                  style={{ marginTop: 1 }}
                />
                <Text
                  className="text-sm ml-2 flex-1 font-medium"
                  style={{ color: colors.error }}
                >
                  {duplicateWarning}
                </Text>
              </View>
            ) : serialNumber ? (
              <View className="flex-row items-center mt-2">
                <MaterialIcons
                  name="check-circle"
                  size={16}
                  color={colors.success}
                />
                <Text
                  className="text-sm ml-1.5 font-medium"
                  style={{ color: colors.success }}
                >
                  Serial: {serialNumber}
                </Text>
              </View>
            ) : null}

            {/* Continuous Scan Toggle */}
            <TouchableOpacity
              style={[
                styles.continuousToggle,
                {
                  backgroundColor: continuousScan
                    ? colors.primary + "15"
                    : colors.background,
                  borderColor: continuousScan ? colors.primary : colors.border,
                  marginTop: 12,
                },
              ]}
              onPress={() => setContinuousScan(!continuousScan)}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={continuousScan ? "check-box" : "check-box-outline-blank"}
                size={22}
                color={continuousScan ? colors.primary : colors.muted}
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text
                  style={[
                    styles.continuousTitle,
                    {
                      color: continuousScan
                        ? colors.primary
                        : colors.foreground,
                    },
                  ]}
                >
                  Continuous Capture Mode
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  After saving, stay on this screen to quickly add more assets
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* ========== STEP 2: DEVICE INFO ========== */}
          <View
            className="rounded-xl p-4 mb-4 border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <View className="flex-row items-center mb-3">
              <View
                style={[styles.stepBadge, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <Text
                className="text-base font-bold ml-2"
                style={{ color: colors.foreground }}
              >
                Device Information
              </Text>
            </View>
            <Text className="text-xs text-muted mb-3">
              Select the asset type and enter make and model
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
                            color: isSelected ? "#FFFFFF" : colors.foreground,
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

            {/* Make with Auto-complete */}
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
                placeholder="e.g. Dell, HP, Lenovo"
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

            {/* Model with Auto-complete */}
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
                placeholder="e.g. OptiPlex 7090, EliteBook 840"
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
                            style={{
                              fontSize: 11,
                              color: colors.muted,
                            }}
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

          {/* ========== STEP 3: CONDITION & NOTES ========== */}
          <View
            className="rounded-xl p-4 mb-4 border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <View className="flex-row items-center mb-3">
              <View
                style={[styles.stepBadge, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.stepBadgeText}>3</Text>
              </View>
              <Text
                className="text-base font-bold ml-2"
                style={{ color: colors.foreground }}
              >
                Condition & Notes
              </Text>
            </View>

            {/* Condition */}
            <View className="mb-3">
              <Text className="text-sm font-medium text-muted mb-1.5">
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
            </View>

            {/* Notes */}
            <View>
              <Text className="text-sm font-medium text-muted mb-1.5">
                Notes (optional)
              </Text>
              <TextInput
                className="border rounded-xl px-4 py-3.5 text-foreground text-base"
                style={{
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  minHeight: 80,
                }}
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional notes about this asset"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          {error ? (
            <View className="bg-error/10 rounded-lg px-4 py-3 mb-4">
              <Text className="text-error text-sm">{error}</Text>
            </View>
          ) : null}

          {/* Save Button */}
          <TouchableOpacity
            className="rounded-xl py-4 items-center"
            style={{ backgroundColor: colors.primary }}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <View className="flex-row items-center gap-2">
              <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
              <Text className="text-white font-semibold text-base">
                Save & Scan Next
              </Text>
            </View>
          </TouchableOpacity>

          {savedCount > 0 && (
            <TouchableOpacity
              className="rounded-xl py-3 items-center mt-3 border"
              style={{ borderColor: colors.border }}
              onPress={() => {
                // Navigate explicitly to order page to avoid landing on scanner
                router.replace({ pathname: "/order/[id]", params: { id: orderId } });
              }}
              activeOpacity={0.8}
            >
              <Text
                className="font-semibold text-base"
                style={{ color: colors.foreground }}
              >
                Done — Return to Order
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
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
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
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
  continuousToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  continuousTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
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
});
