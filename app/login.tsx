import { useState, useRef } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { loginWithCredentials, initRazorClient } from "@/lib/razor-api";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function LoginScreen() {
  const { dispatch, saveCredentials } = useStore();
  const colors = useColors();

  const [baseUrl, setBaseUrl] = useState("https://apiprod.razorerp.com");
  const [companyId, setCompanyId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function handleLogin() {
    if (!companyId.trim() || !username.trim() || !password.trim()) {
      setError("Please enter your Company ID, username, and password.");
      return;
    }
    const parsedCompanyId = parseInt(companyId.trim(), 10);
    if (isNaN(parsedCompanyId)) {
      setError("Company ID must be a number.");
      return;
    }
    setError("");
    setIsConnecting(true);
    try {
      const result = await loginWithCredentials(
        baseUrl.trim(),
        parsedCompanyId,
        username.trim(),
        password.trim()
      );
      if (result.accessToken) {
        initRazorClient(baseUrl.trim(), result.accessToken);
        await saveCredentials(baseUrl.trim(), result.accessToken, parsedCompanyId, username.trim());
        dispatch({
          type: "SET_API_CONFIG",
          payload: {
            baseUrl: baseUrl.trim(),
            accessToken: result.accessToken,
            companyId: parsedCompanyId,
            username: username.trim(),
            isConnected: true,
          },
        });
        dispatch({ type: "SET_AUTHENTICATED", payload: true });
        router.replace("/(tabs)");
      } else {
        setError("Login failed. No access token received.");
      }
    } catch (e: any) {
      const msg =
        e?.response?.status === 401
          ? "Invalid credentials. Please check your Company ID, username, and password."
          : e?.response?.status === 400
            ? "Bad request. Please verify your login details."
            : e?.message || "An unexpected error occurred.";
      setError(msg);
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
              <Text className="text-base text-muted mt-1">Sign in with your Razor ERP account</Text>
            </View>

            {/* Form */}
            <View className="gap-4">
              <View>
                <Text className="text-sm font-medium text-muted mb-1.5">Company ID</Text>
                <TextInput
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                  value={companyId}
                  onChangeText={setCompanyId}
                  placeholder="Enter your company ID"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => usernameRef.current?.focus()}
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-muted mb-1.5">Username</Text>
                <TextInput
                  ref={usernameRef}
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter your Razor ERP username"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-muted mb-1.5">Password</Text>
                <TextInput
                  ref={passwordRef}
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </View>

              {/* Advanced: API URL toggle */}
              <TouchableOpacity
                onPress={() => setShowAdvanced(!showAdvanced)}
                activeOpacity={0.7}
              >
                <View className="flex-row items-center gap-1">
                  <MaterialIcons
                    name={showAdvanced ? "expand-less" : "expand-more"}
                    size={18}
                    color={colors.muted}
                  />
                  <Text className="text-sm text-muted">Advanced Settings</Text>
                </View>
              </TouchableOpacity>

              {showAdvanced ? (
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
                    returnKeyType="done"
                  />
                </View>
              ) : null}

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
                onPress={handleLogin}
                disabled={isConnecting}
                activeOpacity={0.8}
              >
                {isConnecting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-semibold text-base">Sign In</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Help text */}
            <View className="mt-8 items-center">
              <Text className="text-xs text-muted text-center leading-5">
                Use the same credentials you use to log in to Razor ERP.{"\n"}
                Your Company ID can be found in your Razor ERP account settings.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
