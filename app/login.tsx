import { useState } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { initRazorClient, testConnection } from "@/lib/razor-api";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function LoginScreen() {
  const { dispatch, saveCredentials } = useStore();
  const colors = useColors();
  const [baseUrl, setBaseUrl] = useState("https://apiprod.razorerp.com");
  const [apiKey, setApiKey] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    if (!baseUrl.trim() || !apiKey.trim()) {
      setError("Please enter both the API URL and API Key.");
      return;
    }
    setError("");
    setIsConnecting(true);
    try {
      const ok = await testConnection(baseUrl.trim(), apiKey.trim());
      if (ok) {
        initRazorClient(baseUrl.trim(), apiKey.trim());
        await saveCredentials(baseUrl.trim(), apiKey.trim());
        dispatch({
          type: "SET_API_CONFIG",
          payload: { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), isConnected: true },
        });
        dispatch({ type: "SET_AUTHENTICATED", payload: true });
        router.replace("/(tabs)");
      } else {
        setError("Connection failed. Please check your API URL and API Key.");
      }
    } catch (e: any) {
      setError(e?.message || "An unexpected error occurred.");
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 justify-center px-6">
            {/* Logo / Brand */}
            <View className="items-center mb-10">
              <View
                className="w-20 h-20 rounded-2xl items-center justify-center mb-4"
                style={{ backgroundColor: colors.primary }}
              >
                <MaterialIcons name="recycling" size={44} color="#FFFFFF" />
              </View>
              <Text className="text-3xl font-bold text-foreground">Razor Field</Text>
              <Text className="text-base text-muted mt-1">Connect to your Razor ERP</Text>
            </View>

            {/* Form */}
            <View className="gap-4">
              <View>
                <Text className="text-sm font-medium text-muted mb-1.5">API Base URL</Text>
                <TextInput
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                  placeholder="https://apiprod.razorerp.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="next"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-muted mb-1.5">API Key</Text>
                <TextInput
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="Enter your Razor ERP API key"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleConnect}
                />
              </View>

              {error ? (
                <View className="bg-error/10 rounded-lg px-4 py-3">
                  <Text className="text-error text-sm">{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                className="rounded-xl py-4 items-center mt-2"
                style={{
                  backgroundColor: colors.primary,
                  opacity: isConnecting ? 0.7 : 1,
                }}
                onPress={handleConnect}
                disabled={isConnecting}
                activeOpacity={0.8}
              >
                {isConnecting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-semibold text-base">Connect to Razor ERP</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Help text */}
            <View className="mt-8 items-center">
              <Text className="text-xs text-muted text-center leading-5">
                Your API key can be found in Razor ERP under{"\n"}
                Account Settings. Credentials are stored securely on this device.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
