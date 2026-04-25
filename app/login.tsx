import { useState, useRef, useEffect } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { loginWithCredentials, initRazorClient } from "@/lib/razor-api";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const REMEMBER_KEY = "razor_remember_me";
const SAVED_URL_KEY = "razor_saved_url";
const SAVED_USER_KEY = "razor_saved_username";
const SAVED_PASS_KEY = "razor_saved_password";

export default function LoginScreen() {
  const { dispatch, saveCredentials } = useStore();
  const colors = useColors();

  const [companyUrl, setCompanyUrl] = useState("https://monwire.razorerp.com");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [loaded, setLoaded] = useState(false);

  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  // Load saved credentials on mount
  useEffect(() => {
    (async () => {
      try {
        const remembered = await AsyncStorage.getItem(REMEMBER_KEY);
        if (remembered === "true") {
          setRememberMe(true);
          const savedUrl = await AsyncStorage.getItem(SAVED_URL_KEY);
          const savedUser = await AsyncStorage.getItem(SAVED_USER_KEY);
          const savedPass = await AsyncStorage.getItem(SAVED_PASS_KEY);
          if (savedUrl) setCompanyUrl(savedUrl);
          if (savedUser) setUsername(savedUser);
          if (savedPass) setPassword(savedPass);
        }
      } catch {
        // ignore
      }
      setLoaded(true);
    })();
  }, []);

  // Auto-login when remembered credentials are loaded
  useEffect(() => {
    if (loaded && rememberMe && username && password && companyUrl) {
      handleLogin();
    }
  }, [loaded]);

  function normalizeUrl(url: string): string {
    let cleaned = url.trim().replace(/\/+$/, "");
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
      cleaned = `https://${cleaned}`;
    }
    return cleaned;
  }

  async function handleLogin() {
    if (!companyUrl.trim() || !username.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    const baseUrl = normalizeUrl(companyUrl);
    setError("");
    setStatusText("Connecting to Razor ERP...");
    setIsConnecting(true);
    try {
      setStatusText("Resolving company...");
      const result = await loginWithCredentials(
        baseUrl,
        username.trim(),
        password.trim()
      );
      if (result.accessToken) {
        setStatusText("Authenticated! Loading...");
        initRazorClient(baseUrl, result.accessToken);
        await saveCredentials(baseUrl, result.accessToken, result.companyId, username.trim());

        // Save or clear Remember Me preferences
        if (rememberMe) {
          await AsyncStorage.setItem(REMEMBER_KEY, "true");
          await AsyncStorage.setItem(SAVED_URL_KEY, baseUrl);
          await AsyncStorage.setItem(SAVED_USER_KEY, username.trim());
          await AsyncStorage.setItem(SAVED_PASS_KEY, password.trim());
        } else {
          await AsyncStorage.multiRemove([REMEMBER_KEY, SAVED_URL_KEY, SAVED_USER_KEY, SAVED_PASS_KEY]);
        }

        dispatch({
          type: "SET_API_CONFIG",
          payload: {
            baseUrl,
            accessToken: result.accessToken,
            companyId: result.companyId,
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
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.message || e?.response?.data?.title;
      let msg: string;
      if (serverMsg) {
        msg = serverMsg;
      } else if (status === 404) {
        msg = "Invalid username or password. Please try again.";
      } else if (status === 400) {
        msg = "Bad request. Please verify your login details.";
      } else if (e?.message?.includes("Company ID")) {
        msg = "Could not identify your company from the URL. Please check the Razor ERP URL.";
      } else {
        msg = e?.message || "An unexpected error occurred. Please try again.";
      }
      setError(msg);
    } finally {
      setIsConnecting(false);
      setStatusText("");
    }
  }

  if (!loaded) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
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
            <View className="items-center mb-8">
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
                <Text className="text-sm font-medium text-muted mb-1.5">Razor ERP URL</Text>
                <TextInput
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                  value={companyUrl}
                  onChangeText={setCompanyUrl}
                  placeholder="https://yourcompany.razorerp.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
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
                  placeholder="Enter your username"
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

              {/* Remember Me Toggle */}
              <View className="flex-row items-center justify-between">
                <Text className="text-base text-foreground">Remember Me</Text>
                <Switch
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={Platform.OS === "android" ? "#FFFFFF" : undefined}
                  ios_backgroundColor={colors.border}
                />
              </View>

              {error ? (
                <View className="bg-error/10 rounded-lg px-4 py-3">
                  <Text className="text-error text-sm">{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                className="rounded-xl py-4 items-center mt-1"
                style={{
                  backgroundColor: colors.primary,
                  opacity: isConnecting ? 0.7 : 1,
                }}
                onPress={handleLogin}
                disabled={isConnecting}
                activeOpacity={0.8}
              >
                {isConnecting ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text className="text-white font-semibold text-base">{statusText || "Signing in..."}</Text>
                  </View>
                ) : (
                  <Text className="text-white font-semibold text-base">Sign In</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Help text */}
            <View className="mt-6 items-center">
              <Text className="text-xs text-muted text-center leading-5">
                Use the same credentials you use to log in to Razor ERP.{"\n"}
                Your company is automatically detected from the URL.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
