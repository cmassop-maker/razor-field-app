import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import type { AssetCondition, AssetType } from "@/lib/types";
import {
  recordMakeModel,
  suggestMakes,
  suggestModels,
} from "@/lib/autocomplete-db";

const CONDITIONS: AssetCondition[] = ["Excellent", "Good", "Fair", "Poor"];

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

export default function EditAssetScreen() {
  const { orderId, localId } = useLocalSearchParams<{
    orderId: string;
    localId: string;
  }>();
  const { state, dispatch } = useStore();
  const colors = useColors();

  const order = useMemo(
    () => state.orders.find((o) => String(o.razorOrder.id) === orderId),
    [state.orders, orderId]
  );

  const asset = useMemo(
    () => order?.assets.find((a) => a.localId === localId),
    [order, localId]
  );

  const [assetType, setAssetType] = useState<AssetType>(asset?.assetType ?? "Laptop");
  const [make, setMake] = useState(asset?.make ?? "");
  const [model, setModel] = useState(asset?.model ?? "");
  const [serialNumber, setSerialNumber] = useState(asset?.serialNumber ?? "");
  const [condition, setCondition] = useState<AssetCondition>(asset?.condition ?? "Good");
  const [notes, setNotes] = useState(asset?.notes ?? "");
  const [error, setError] = useState("");

  const [makeSuggestions, setMakeSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<{ model: string; assetType?: AssetType; count: number }[]>([]);
  const [showMakeSuggestions, setShowMakeSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);

  // Load make suggestions when make input changes (async)
  useEffect(() => {
    let cancelled = false;
    suggestMakes(make).then((suggestions) => {
      if (!cancelled) setMakeSuggestions(suggestions);
    });
    return () => { cancelled = true; };
  }, [make]);

  // Load model suggestions when make or model input changes (async)
  useEffect(() => {
    let cancelled = false;
    if (make.trim()) {
      suggestModels(make, model).then((suggestions) => {
        if (!cancelled) setModelSuggestions(suggestions);
      });
    } else {
      setModelSuggestions([]);
    }
    return () => { cancelled = true; };
  }, [make, model]);

  const isDuplicateSerial = useMemo(() => {
    if (!serialNumber.trim()) return false;
    const normalized = serialNumber.trim().toUpperCase();
    for (const o of state.orders) {
      for (const a of o.assets) {
        if (a.localId === localId) continue;
        if (a.serialNumber.trim().toUpperCase() === normalized) return true;
      }
    }
    return false;
  }, [serialNumber, state.orders, localId]);

  const handleSave = useCallback(() => {
    setError("");
    if (!serialNumber.trim()) { setError("Serial number is required."); return; }
    if (!make.trim()) { setError("Make is required."); return; }
    if (!model.trim()) { setError("Model is required."); return; }
    if (isDuplicateSerial) { setError("This serial number already exists on another asset."); return; }

    dispatch({
      type: "UPDATE_ASSET",
      payload: {
        orderId: Number(orderId),
        localId: localId!,
        updates: {
          assetType,
          make: make.trim(),
          model: model.trim(),
          serialNumber: serialNumber.trim(),
          condition,
          notes: notes.trim(),
          ...(asset?.syncStatus === "synced" ? { syncStatus: "pending" as const } : {}),
        },
      },
    });

    recordMakeModel(make.trim(), model.trim(), assetType);

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    router.back();
  }, [serialNumber, make, model, isDuplicateSerial, assetType, condition, notes, orderId, localId, asset, dispatch]);

  if (!order || !asset) {
    return (
      <ScreenContainer className="p-4">
        <Text className="text-lg text-muted text-center mt-20">Asset not found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 self-center">
          <Text className="text-primary font-semibold">Go Back</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

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
        <Text className="text-lg font-bold text-foreground flex-1">Edit Asset</Text>
        {asset.razorUid ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary + "15", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
            <MaterialIcons name="verified" size={14} color={colors.primary} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>{asset.razorUid}</Text>
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Step 1: Serial Number */}
          <View className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <View className="flex-row items-center gap-2 mb-3">
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>1</Text>
              </View>
              <Text className="text-sm font-semibold text-foreground">Serial Number</Text>
            </View>
            <TextInput
              className="rounded-xl px-4 py-3 text-base border"
              style={{
                backgroundColor: colors.background,
                borderColor: isDuplicateSerial ? colors.error : colors.border,
                color: colors.foreground,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              }}
              value={serialNumber}
              onChangeText={setSerialNumber}
              placeholder="Enter serial number"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              returnKeyType="next"
            />
            {isDuplicateSerial && (
              <View className="flex-row items-center gap-2 mt-2 px-1">
                <MaterialIcons name="block" size={14} color={colors.error} />
                <Text style={{ fontSize: 12, color: colors.error, flex: 1 }}>
                  This serial number already exists. Duplicate serials are not allowed.
                </Text>
              </View>
            )}
          </View>

          {/* Step 2: Device Information */}
          <View className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <View className="flex-row items-center gap-2 mb-3">
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>2</Text>
              </View>
              <Text className="text-sm font-semibold text-foreground">Device Information</Text>
            </View>

            {/* Asset Type */}
            <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Asset Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {ASSET_TYPES.map((type) => {
                const isSelected = assetType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setAssetType(type)}
                    style={[styles.assetTypeChip, { backgroundColor: isSelected ? colors.primary : colors.background, borderColor: isSelected ? colors.primary : colors.border }]}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name={ASSET_TYPE_ICONS[type] as any} size={16} color={isSelected ? "#FFFFFF" : colors.muted} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: isSelected ? "#FFFFFF" : colors.foreground }}>{type}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Make */}
            <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Make</Text>
            <View style={{ position: "relative", zIndex: 20 }}>
              <TextInput
                className="rounded-xl px-4 py-3 text-base border mb-3"
                style={{ backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }}
                value={make}
                onChangeText={setMake}
                placeholder="e.g. Dell, HP, Apple"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                returnKeyType="next"
                onFocus={() => setShowMakeSuggestions(makeSuggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowMakeSuggestions(false), 200)}
              />
              {showMakeSuggestions && makeSuggestions.length > 0 && (
                <View style={[styles.suggestionsDropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {makeSuggestions.slice(0, 5).map((s) => (
                    <TouchableOpacity key={s} style={[styles.suggestionItem, { borderBottomColor: colors.border }]} onPress={() => { setMake(s); setShowMakeSuggestions(false); }}>
                      <Text style={{ fontSize: 14, color: colors.foreground }}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Model */}
            <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Model</Text>
            <View style={{ position: "relative", zIndex: 10 }}>
              <TextInput
                className="rounded-xl px-4 py-3 text-base border"
                style={{ backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }}
                value={model}
                onChangeText={setModel}
                placeholder="e.g. Latitude 5520, ProBook 450"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                returnKeyType="next"
                onFocus={() => setShowModelSuggestions(modelSuggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowModelSuggestions(false), 200)}
              />
              {showModelSuggestions && modelSuggestions.length > 0 && (
                <View style={[styles.suggestionsDropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {modelSuggestions.slice(0, 5).map((item) => (
                    <TouchableOpacity key={item.model} style={[styles.suggestionItem, { borderBottomColor: colors.border }]} onPress={() => { setModel(item.model); if (item.assetType) setAssetType(item.assetType); setShowModelSuggestions(false); }}>
                      <Text style={{ fontSize: 14, color: colors.foreground }}>{item.model}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Step 3: Condition & Notes */}
          <View className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <View className="flex-row items-center gap-2 mb-3">
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>3</Text>
              </View>
              <Text className="text-sm font-semibold text-foreground">Condition & Notes</Text>
            </View>

            <View className="flex-row flex-wrap gap-2 mb-3">
              {CONDITIONS.map((c) => {
                const isSelected = condition === c;
                const bgColor = c === "Excellent" || c === "Good" ? "#D1FAE5" : c === "Fair" ? "#FEF3C7" : "#FEE2E2";
                const textColor = c === "Excellent" || c === "Good" ? "#065F46" : c === "Fair" ? "#92400E" : "#991B1B";
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCondition(c)}
                    style={[styles.conditionChip, { backgroundColor: isSelected ? bgColor : colors.background, borderColor: isSelected ? textColor : colors.border, borderWidth: isSelected ? 1.5 : 1 }]}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, fontWeight: isSelected ? "700" : "500", color: isSelected ? textColor : colors.muted }}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              className="rounded-xl px-4 py-3 text-base border"
              style={{ backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, minHeight: 80, textAlignVertical: "top" }}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes about this asset..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Sync warning */}
          {asset.syncStatus === "synced" && (
            <View className="rounded-lg px-4 py-3 mb-4 flex-row items-center gap-2" style={{ backgroundColor: colors.warning + "15" }}>
              <MaterialIcons name="info" size={16} color={colors.warning} />
              <Text style={{ fontSize: 12, color: colors.warning, flex: 1 }}>
                This asset has already been synced to Razor ERP. Saving changes will mark it as pending re-sync.
              </Text>
            </View>
          )}

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
              <Text className="text-white font-semibold text-base">Save Changes</Text>
            </View>
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            className="rounded-xl py-3 items-center mt-3 border"
            style={{ borderColor: colors.border }}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text className="font-semibold text-base" style={{ color: colors.foreground }}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  assetTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  conditionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  suggestionsDropdown: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 10,
    maxHeight: 200,
    zIndex: 100,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
