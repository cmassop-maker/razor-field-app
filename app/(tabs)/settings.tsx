import { Text, View, TouchableOpacity, Alert, ScrollView, Platform } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function SettingsScreen() {
  const { state, clearCredentials } = useStore();
  const colors = useColors();

  const pendingSyncCount = state.syncQueue.filter((s) => s.status === "pending").length;

  function handleLogout() {
    if (Platform.OS === "web") {
      clearCredentials();
      router.replace("/login");
      return;
    }
    Alert.alert(
      "Disconnect",
      "Are you sure you want to disconnect from Razor ERP? Local data will be cleared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            clearCredentials();
            router.replace("/login");
          },
        },
      ]
    );
  }

  return (
    <ScreenContainer className="px-4">
      <View className="pt-2 pb-4">
        <Text className="text-2xl font-bold text-foreground">Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Connection Status */}
        <View
          className="bg-surface border border-border rounded-2xl p-4 mb-4"
        >
          <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Connection
          </Text>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base text-foreground">Status</Text>
            <View className="flex-row items-center gap-2">
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: state.apiConfig.isConnected ? colors.success : colors.error,
                }}
              />
              <Text
                className="text-sm font-medium"
                style={{
                  color: state.apiConfig.isConnected ? colors.success : colors.error,
                }}
              >
                {state.apiConfig.isConnected ? "Connected" : "Disconnected"}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-foreground">API URL</Text>
            <Text className="text-sm text-muted" numberOfLines={1} style={{ maxWidth: 200 }}>
              {state.apiConfig.baseUrl || "Not configured"}
            </Text>
          </View>
        </View>

        {/* Sync Status */}
        <View className="bg-surface border border-border rounded-2xl p-4 mb-4">
          <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Sync Queue
          </Text>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base text-foreground">Pending Items</Text>
            <View className="flex-row items-center gap-2">
              <Text
                className="text-sm font-semibold"
                style={{ color: pendingSyncCount > 0 ? colors.warning : colors.success }}
              >
                {pendingSyncCount}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-foreground">Total Orders</Text>
            <Text className="text-sm text-muted">{state.orders.length}</Text>
          </View>
        </View>

        {/* Data */}
        <View className="bg-surface border border-border rounded-2xl p-4 mb-4">
          <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Data Summary
          </Text>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base text-foreground">Captured Assets</Text>
            <Text className="text-sm text-muted">
              {state.orders.reduce((sum, o) => sum + o.assets.length, 0)}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-foreground">Signatures Collected</Text>
            <Text className="text-sm text-muted">
              {state.orders.filter((o) => o.signature).length}
            </Text>
          </View>
        </View>

        {/* About */}
        <View className="bg-surface border border-border rounded-2xl p-4 mb-6">
          <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            About
          </Text>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base text-foreground">App Version</Text>
            <Text className="text-sm text-muted">1.0.0</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-foreground">Razor ERP API</Text>
            <Text className="text-sm text-muted">v1.0</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          className="rounded-2xl py-4 items-center border"
          style={{ borderColor: colors.error, backgroundColor: "transparent" }}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <View className="flex-row items-center gap-2">
            <MaterialIcons name="logout" size={18} color={colors.error} />
            <Text className="font-semibold text-base" style={{ color: colors.error }}>
              Disconnect from Razor ERP
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
