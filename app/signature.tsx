import { useState, useRef, useCallback } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useStore } from "@/lib/store";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { generateId } from "@/lib/uuid";
import type { CapturedSignature } from "@/lib/types";

// Conditionally import SignatureCanvas
let SignatureCanvas: any = null;
try {
  SignatureCanvas = require("react-native-signature-canvas").default;
} catch {
  // Not available on web
}

export default function SignatureScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { dispatch } = useStore();
  const colors = useColors();
  const sigRef = useRef<any>(null);

  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [hasSigned, setHasSigned] = useState(false);
  const [error, setError] = useState("");

  function handleClear() {
    sigRef.current?.clearSignature?.();
    setSignatureData("");
    setHasSigned(false);
  }

  // Called when the user lifts their finger after drawing
  const handleEnd = useCallback(() => {
    // Read the signature data from the canvas
    // This triggers onOK callback with the base64 data
    sigRef.current?.readSignature?.();
  }, []);

  // Called with the base64 data after readSignature completes
  const handleOK = useCallback((signature: string) => {
    if (signature && signature.length > 0) {
      // Store the full base64 string (may or may not have data URI prefix)
      setSignatureData(signature);
      setHasSigned(true);
    }
  }, []);

  // Called when signature data is empty (canvas was cleared)
  const handleEmpty = useCallback(() => {
    setSignatureData("");
    setHasSigned(false);
  }, []);

  function handleConfirm() {
    if (!signerName.trim()) {
      setError("Signer name is required");
      return;
    }
    if (!signatureData && !hasSigned) {
      setError("Please provide a signature");
      return;
    }

    // If we have hasSigned but signatureData is empty, try reading one more time
    if (!signatureData) {
      setError("Signature could not be captured. Please try again.");
      return;
    }

    setError("");

    // Extract base64 data, removing data URI prefix if present
    const base64 = signatureData.includes("base64,")
      ? signatureData.split("base64,")[1]
      : signatureData;

    const sig: CapturedSignature = {
      localId: generateId(),
      orderId: Number(orderId),
      signatureBase64: base64,
      signerName: signerName.trim(),
      signerTitle: signerTitle.trim(),
      capturedAt: new Date().toISOString(),
      syncStatus: "pending",
    };

    dispatch({ type: "SET_SIGNATURE", payload: { orderId: Number(orderId), signature: sig } });

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    router.back();
  }

  // Web fallback
  const isWeb = Platform.OS === "web" || !SignatureCanvas;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialIcons name="close" size={28} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Collect Signature</Text>
        <TouchableOpacity onPress={handleClear} style={{ padding: 4 }}>
          <Text style={{ color: colors.error, fontWeight: "600" }}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Signer Info */}
      <View style={styles.signerInfo}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[styles.label, { color: colors.muted }]}>Name *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={signerName}
            onChangeText={setSignerName}
            placeholder="Client name"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
          />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.label, { color: colors.muted }]}>Title</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={signerTitle}
            onChangeText={setSignerTitle}
            placeholder="Job title"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
          />
        </View>
      </View>

      {/* Signature Status Indicator */}
      {hasSigned && (
        <View style={[styles.statusBar, { backgroundColor: `${colors.success}15` }]}>
          <MaterialIcons name="check-circle" size={16} color={colors.success} />
          <Text style={{ color: colors.success, fontSize: 13, fontWeight: "600", marginLeft: 6 }}>
            Signature captured
          </Text>
        </View>
      )}

      {/* Signature Pad */}
      <View style={[styles.signatureArea, { borderColor: colors.border }]}>
        {isWeb ? (
          <View style={styles.webFallback}>
            <MaterialIcons name="draw" size={48} color={colors.border} />
            <Text style={[styles.webFallbackText, { color: colors.muted }]}>
              Signature pad is available on mobile devices.{"\n"}
              On web, the signature will be collected when the app runs on a phone or tablet.
            </Text>
            <TouchableOpacity
              style={[styles.mockSignButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                // Create a simple placeholder for web testing
                setSignatureData("PLACEHOLDER_WEB_SIGNATURE");
                setHasSigned(true);
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: "600" }}>
                Tap to simulate signature (web only)
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <SignatureCanvas
              ref={sigRef}
              onOK={handleOK}
              onEnd={handleEnd}
              onEmpty={handleEmpty}
              descriptionText=""
              clearText="Clear"
              confirmText="Save"
              webStyle={`
                .m-signature-pad { box-shadow: none; border: none; }
                .m-signature-pad--body { border: none; }
                .m-signature-pad--footer { display: none; }
                body, html { width: 100%; height: 100%; }
              `}
              autoClear={false}
              imageType="image/png"
              backgroundColor="rgba(255,255,255,0)"
              penColor="#000000"
              dotSize={2}
              minWidth={1.5}
              maxWidth={3}
              style={{ flex: 1 }}
            />
            <View style={styles.signLine}>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
              <Text style={[styles.signLabel, { color: colors.muted }]}>Sign above</Text>
            </View>
          </>
        )}
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: `${colors.error}15` }]}>
          <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {/* Confirm Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            {
              backgroundColor: colors.primary,
              opacity: hasSigned && signerName.trim() ? 1 : 0.5,
            },
          ]}
          onPress={handleConfirm}
          disabled={!hasSigned || !signerName.trim()}
          activeOpacity={0.8}
        >
          <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
          <Text style={styles.confirmText}>Confirm Signature</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 44,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  signerInfo: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  signatureArea: {
    flex: 1,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  signLine: {
    position: "absolute",
    bottom: 40,
    left: 24,
    right: 24,
    alignItems: "center",
  },
  line: {
    width: "100%",
    height: 1,
  },
  signLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  webFallbackText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  mockSignButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  confirmText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
