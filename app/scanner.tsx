import { useState, useEffect } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
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
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const colors = useColors();
  const [scanned, setScanned] = useState(false);
  const [scannedValue, setScannedValue] = useState("");
  const [manualEntry, setManualEntry] = useState(false);
  const [manualValue, setManualValue] = useState("");

  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions
    ? useCameraPermissions()
    : [null, () => {}];

  function handleBarcodeScanned({ type, data }: { type: string; data: string }) {
    if (scanned) return;
    setScanned(true);
    setScannedValue(data);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  function handleUseValue(value: string) {
    router.replace({
      pathname: "/asset-capture",
      params: { orderId, scannedSerial: value.trim() },
    });
  }

  function handleScanAgain() {
    setScanned(false);
    setScannedValue("");
  }

  // Web fallback or no camera
  if (Platform.OS === "web" || !CameraView) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialIcons name="close" size={28} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Enter Serial Number</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.manualContainer}>
          <MaterialIcons name="document-scanner" size={64} color={colors.border} />
          <Text style={[styles.manualText, { color: colors.muted }]}>
            Camera scanning is available on mobile devices.{"\n"}Enter the serial number manually below.
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
            style={[styles.useButton, { backgroundColor: colors.primary, opacity: manualValue.trim() ? 1 : 0.5 }]}
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
            onPress={() => setManualEntry(true)}
          >
            <Text style={{ color: "#FFFFFF", textDecorationLine: "underline" }}>
              Enter manually instead
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Scanned result overlay
  if (scanned && scannedValue) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={styles.resultContainer}>
          <MaterialIcons name="check-circle" size={64} color={colors.success} />
          <Text style={styles.resultLabel}>Scanned Value</Text>
          <Text style={styles.resultValue}>{scannedValue}</Text>
          <TouchableOpacity
            style={[styles.useButton, { backgroundColor: colors.primary, marginTop: 24 }]}
            onPress={() => handleUseValue(scannedValue)}
          >
            <Text style={styles.useButtonText}>Use This Serial Number</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 16 }} onPress={handleScanAgain}>
            <Text style={{ color: "#FFFFFF", textDecorationLine: "underline" }}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Camera viewfinder
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
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.scanHeader}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.scanTitle}>Scan Serial / Barcode</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Viewfinder frame */}
        <View style={styles.viewfinder}>
          <View style={styles.cornerTL} />
          <View style={styles.cornerTR} />
          <View style={styles.cornerBL} />
          <View style={styles.cornerBR} />
        </View>

        <Text style={styles.scanHint}>
          Point the camera at a barcode or serial number
        </Text>

        {/* Manual entry fallback */}
        <TouchableOpacity
          style={[styles.manualButton, { borderColor: "#FFFFFF" }]}
          onPress={() => {
            setManualEntry(true);
            router.replace({
              pathname: "/asset-capture",
              params: { orderId },
            });
          }}
        >
          <MaterialIcons name="keyboard" size={18} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "600", marginLeft: 8 }}>
            Enter Manually
          </Text>
        </TouchableOpacity>
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 60,
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
