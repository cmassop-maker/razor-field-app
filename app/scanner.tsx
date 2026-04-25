import { useState, useCallback, useRef } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  FlatList,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";

// Conditionally import camera to avoid web crashes
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch {
  // Camera not available (web)
}

export default function ScannerScreen() {
  const { orderId, continuous: continuousParam } = useLocalSearchParams<{
    orderId: string;
    continuous?: string;
  }>();
  const isContinuous = continuousParam === "true";
  const colors = useColors();

  // Use state for rendering, ref for callback access (avoids stale closure)
  const [scanned, setScanned] = useState(false);
  const scannedRef = useRef(false);
  const [scannedValue, setScannedValue] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [scannedList, setScannedList] = useState<string[]>([]);
  const scannedListRef = useRef<string[]>([]);
  const lastScannedRef = useRef<string>("");
  const scanCooldownRef = useRef(false);

  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions
    ? useCameraPermissions()
    : [null, () => {}];

  const handleBarcodeScanned = useCallback(
    ({ data }: { type: string; data: string }) => {
      const trimmed = data.trim();
      if (!trimmed) return;

      if (isContinuous) {
        // In continuous mode, auto-add unique serials with a cooldown
        if (scanCooldownRef.current) return;
        if (trimmed === lastScannedRef.current) return;
        if (scannedListRef.current.includes(trimmed)) return;

        scanCooldownRef.current = true;
        lastScannedRef.current = trimmed;
        setScannedList((prev) => {
          const next = [...prev, trimmed];
          scannedListRef.current = next;
          return next;
        });

        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Cooldown to avoid rapid duplicate scans
        setTimeout(() => {
          scanCooldownRef.current = false;
        }, 1500);
      } else {
        // Single scan mode — use ref to check, avoids stale closure
        if (scannedRef.current) return;
        scannedRef.current = true;
        setScanned(true);
        setScannedValue(trimmed);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    },
    [isContinuous]
  );

  function handleUseValue(value: string) {
    router.navigate({
      pathname: "/asset-capture",
      params: { orderId, scannedSerial: value.trim(), _scanTs: Date.now().toString() },
    });
  }

  function handleUseContinuousValues() {
    router.navigate({
      pathname: "/asset-capture",
      params: {
        orderId,
        scannedSerials: JSON.stringify(scannedList),
        _scanTs: Date.now().toString(),
      },
    });
  }

  function handleScanAgain() {
    // Reset both state and ref so the callback allows new scans
    scannedRef.current = false;
    setScanned(false);
    setScannedValue("");
    lastScannedRef.current = "";
  }

  function removeFromList(serial: string) {
    setScannedList((prev) => {
      const next = prev.filter((s) => s !== serial);
      scannedListRef.current = next;
      return next;
    });
    if (lastScannedRef.current === serial) {
      lastScannedRef.current = "";
    }
  }

  // Web fallback or no camera
  if (Platform.OS === "web" || !CameraView) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialIcons name="close" size={28} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Enter Serial Number
          </Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.manualContainer}>
          <MaterialIcons name="document-scanner" size={64} color={colors.border} />
          <Text style={[styles.manualText, { color: colors.muted }]}>
            Camera scanning is available on mobile devices.{"\n"}Enter the serial
            number manually below.
          </Text>
          <TextInput
            style={[
              styles.manualInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={manualValue}
            onChangeText={setManualValue}
            placeholder="Type serial number here"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => {
              if (manualValue.trim()) handleUseValue(manualValue);
            }}
          />
          <TouchableOpacity
            style={[
              styles.useButton,
              {
                backgroundColor: colors.primary,
                opacity: manualValue.trim() ? 1 : 0.5,
              },
            ]}
            onPress={() => handleUseValue(manualValue)}
            disabled={!manualValue.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.useButtonText}>Use This Serial Number</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Native: permission handling
  if (!permission) {
    return <View style={[styles.container, { backgroundColor: "#000" }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={styles.permissionContainer}>
          <MaterialIcons name="camera-alt" size={64} color="#FFFFFF" />
          <Text style={styles.permissionText}>
            Camera permission is needed to scan serial numbers and barcodes.
          </Text>
          <TouchableOpacity
            style={[styles.useButton, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.useButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ marginTop: 16 }}
            onPress={() => router.back()}
          >
            <Text style={{ color: "#FFFFFF", textDecorationLine: "underline" }}>
              Enter manually instead
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Single scan: result overlay
  if (!isContinuous && scanned && scannedValue) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={styles.resultContainer}>
          <MaterialIcons name="check-circle" size={64} color={colors.success} />
          <Text style={styles.resultLabel}>Scanned Value</Text>
          <Text style={styles.resultValue}>{scannedValue}</Text>
          <TouchableOpacity
            style={[
              styles.useButton,
              { backgroundColor: colors.primary, marginTop: 24 },
            ]}
            onPress={() => handleUseValue(scannedValue)}
          >
            <Text style={styles.useButtonText}>Use This Serial Number</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.scanAgainButton}
            onPress={handleScanAgain}
            activeOpacity={0.7}
          >
            <MaterialIcons name="qr-code-scanner" size={18} color="#FFFFFF" />
            <Text style={styles.scanAgainText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Camera viewfinder (both single and continuous modes)
  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: [
            "qr",
            "ean13",
            "ean8",
            "code128",
            "code39",
            "code93",
            "codabar",
            "datamatrix",
            "itf14",
            "upc_a",
            "upc_e",
            "pdf417",
          ],
        }}
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.scanHeader}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.scanTitle}>
            {isContinuous ? "Continuous Scan" : "Scan Serial / Barcode"}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Viewfinder frame */}
        <View style={styles.viewfinder}>
          <View style={styles.cornerTL} />
          <View style={styles.cornerTR} />
          <View style={styles.cornerBL} />
          <View style={styles.cornerBR} />
        </View>

        {isContinuous ? (
          <View style={styles.continuousBottom}>
            <Text style={styles.scanHint}>
              Keep scanning — each barcode is added automatically
            </Text>

            {/* Scanned items list */}
            {scannedList.length > 0 && (
              <View
                style={[
                  styles.scannedListContainer,
                  { backgroundColor: "rgba(0,0,0,0.75)" },
                ]}
              >
                <Text style={styles.scannedListTitle}>
                  Scanned ({scannedList.length})
                </Text>
                <FlatList
                  data={scannedList}
                  keyExtractor={(item, idx) => `${item}-${idx}`}
                  style={{ maxHeight: 120 }}
                  renderItem={({ item }) => (
                    <View style={styles.scannedListItem}>
                      <MaterialIcons
                        name="check-circle"
                        size={16}
                        color={colors.success}
                      />
                      <Text style={styles.scannedListText}>{item}</Text>
                      <TouchableOpacity
                        onPress={() => removeFromList(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialIcons
                          name="close"
                          size={18}
                          color="#EF4444"
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                />
              </View>
            )}

            {/* Done button */}
            <TouchableOpacity
              style={[
                styles.useButton,
                {
                  backgroundColor: colors.primary,
                  opacity: scannedList.length > 0 ? 1 : 0.5,
                },
              ]}
              onPress={handleUseContinuousValues}
              disabled={scannedList.length === 0}
              activeOpacity={0.8}
            >
              <Text style={styles.useButtonText}>
                Done — Use {scannedList.length} Serial
                {scannedList.length !== 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ alignItems: "center", gap: 16, paddingBottom: 20 }}>
            <Text style={styles.scanHint}>
              Point the camera at a barcode or serial number
            </Text>
            <TouchableOpacity
              style={[styles.manualButton, { borderColor: "#FFFFFF" }]}
              onPress={() => router.back()}
            >
              <MaterialIcons name="keyboard" size={18} color="#FFFFFF" />
              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "600",
                  marginLeft: 8,
                }}
              >
                Enter Manually
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  manualContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  manualText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  manualInput: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginTop: 8,
  },
  useButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  useButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  permissionText: {
    color: "#FFFFFF",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  resultContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  resultLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    marginTop: 16,
  },
  resultValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlign: "center",
  },
  scanAgainButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    gap: 8,
  },
  scanAgainText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 20,
  },
  scanHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  scanTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  viewfinder: {
    width: 260,
    height: 260,
    position: "relative",
  },
  scanHint: {
    color: "#FFFFFF",
    fontSize: 14,
    textAlign: "center",
    opacity: 0.8,
  },
  manualButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  continuousBottom: {
    width: "100%",
    paddingHorizontal: 20,
    gap: 12,
    alignItems: "center",
  },
  scannedListContainer: {
    width: "100%",
    borderRadius: 12,
    padding: 12,
  },
  scannedListTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  scannedListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  scannedListText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flex: 1,
  },
  cornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: "#FFFFFF",
  },
  cornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: "#FFFFFF",
  },
  cornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: "#FFFFFF",
  },
  cornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: "#FFFFFF",
  },
});
