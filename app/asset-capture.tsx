import { useState } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { v4 as uuidv4 } from "uuid";
import type { AssetCondition, CapturedAsset } from "@/lib/types";

const CONDITIONS: AssetCondition[] = ["Excellent", "Good", "Fair", "Poor"];

export default function AssetCaptureScreen() {
  const { orderId, scannedSerial } = useLocalSearchParams<{
    orderId: string;
    scannedSerial?: string;
  }>();
  const { dispatch } = useStore();
  const colors = useColors();

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState(scannedSerial || "");
  const [condition, setCondition] = useState<AssetCondition>("Good");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function handleScan() {
    router.push({
      pathname: "/scanner",
      params: { orderId, returnTo: "asset-capture" },
    });
  }

  function handleSave() {
    if (!make.trim()) {
      setError("Make is required");
      return;
    }
    if (!model.trim()) {
      setError("Model is required");
      return;
    }
    if (!serialNumber.trim()) {
      setError("Serial number is required");
      return;
    }
    setError("");

    const asset: CapturedAsset = {
      localId: uuidv4(),
      orderId: Number(orderId),
      make: make.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
      condition,
      notes: notes.trim(),
      capturedAt: new Date().toISOString(),
      syncStatus: "pending",
    };

    dispatch({ type: "ADD_ASSET", payload: { orderId: Number(orderId), asset } });

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    router.back();
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
        <Text className="text-lg font-bold text-foreground flex-1">Capture Asset</Text>
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
          {/* Make */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-muted mb-1.5">Make *</Text>
            <TextInput
              className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
              value={make}
              onChangeText={setMake}
              placeholder="e.g. Dell, HP, Lenovo"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          {/* Model */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-muted mb-1.5">Model *</Text>
            <TextInput
              className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
              value={model}
              onChangeText={setModel}
              placeholder="e.g. OptiPlex 7090, EliteBook 840"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          {/* Serial Number with Scan Button */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-muted mb-1.5">Serial Number *</Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                className="flex-1 bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                value={serialNumber}
                onChangeText={setSerialNumber}
                placeholder="Enter or scan serial number"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                returnKeyType="next"
              />
              <TouchableOpacity
                className="rounded-xl items-center justify-center"
                style={{
                  backgroundColor: colors.primary,
                  width: 52,
                  height: 52,
                }}
                onPress={handleScan}
                activeOpacity={0.8}
              >
                <MaterialIcons name="qr-code-scanner" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Condition */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-muted mb-1.5">Condition</Text>
            <View className="flex-row gap-2">
              {CONDITIONS.map((c) => {
                const isSelected = condition === c;
                return (
                  <TouchableOpacity
                    key={c}
                    className="flex-1 py-3 rounded-xl items-center border"
                    style={{
                      backgroundColor: isSelected ? colors.primary : colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                    onPress={() => setCondition(c)}
                    activeOpacity={0.7}
                  >
                    <Text
                      className="text-sm font-medium"
                      style={{ color: isSelected ? "#FFFFFF" : colors.foreground }}
                    >
                      {c}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notes */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-muted mb-1.5">Notes (optional)</Text>
            <TextInput
              className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes about this asset"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 80 }}
            />
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
              <Text className="text-white font-semibold text-base">Save Asset</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
