import { useState, useEffect, useRef, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Location from "expo-location";
import NativeMap, { animateMapToRegion } from "@/components/native-map";

interface TrackPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed: number | null;
}

export default function TrackingScreen() {
  const colors = useColors();
  const mapRef = useRef<any>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [trackingStartTime, setTrackingStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [totalDistance, setTotalDistance] = useState(0);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasPermission(status === "granted");
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setCurrentLocation(loc);
        } catch {
          // Will get location when tracking starts
        }
      }
    })();
    return () => {
      if (locationSubRef.current) locationSubRef.current.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)} m`;
    const miles = meters / 1609.344;
    return `${miles.toFixed(1)} mi`;
  }

  const startTracking = useCallback(async () => {
    if (!hasPermission) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (Platform.OS !== "web") {
          Alert.alert("Permission Required", "Location permission is needed for GPS tracking.");
        }
        return;
      }
      setHasPermission(true);
    }

    setIsTracking(true);
    setTrackPoints([]);
    setTotalDistance(0);
    const startTime = Date.now();
    setTrackingStartTime(startTime);

    timerRef.current = setInterval(() => {
      setElapsedTime(formatDuration((Date.now() - startTime) / 1000));
    }, 1000);

    locationSubRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      (loc) => {
        setCurrentLocation(loc);
        const newPoint: TrackPoint = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
          speed: loc.coords.speed,
        };

        setTrackPoints((prev) => {
          const updated = [...prev, newPoint];
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = haversineDistance(last.latitude, last.longitude, newPoint.latitude, newPoint.longitude);
            if (dist > 2) setTotalDistance((d) => d + dist);
          }
          return updated;
        });

        animateMapToRegion(mapRef, {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
      }
    );
  }, [hasPermission]);

  const stopTracking = useCallback(() => {
    if (locationSubRef.current) { locationSubRef.current.remove(); locationSubRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsTracking(false);
  }, []);

  const resetTracking = useCallback(() => {
    stopTracking();
    setTrackPoints([]);
    setTotalDistance(0);
    setElapsedTime("00:00:00");
    setTrackingStartTime(null);
  }, [stopTracking]);

  if (hasPermission === null) {
    return (
      <ScreenContainer className="p-4">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-sm text-muted mt-3">Requesting location access...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!hasPermission) {
    return (
      <ScreenContainer className="p-4">
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="location-off" size={56} color={colors.error} />
          <Text className="text-lg font-bold text-foreground mt-4 text-center">
            Location Access Required
          </Text>
          <Text className="text-sm text-muted mt-2 text-center">
            GPS tracking needs location permission to track your route. Please enable location access in your device settings.
          </Text>
          <TouchableOpacity
            className="mt-6 px-6 py-3 rounded-xl"
            style={{ backgroundColor: colors.primary }}
            onPress={async () => {
              const { status } = await Location.requestForegroundPermissionsAsync();
              setHasPermission(status === "granted");
            }}
            activeOpacity={0.8}
          >
            <Text className="text-white font-semibold">Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const currentSpeed = currentLocation?.coords.speed
    ? Math.max(0, currentLocation.coords.speed * 2.237)
    : 0;

  const startMarker = trackPoints.length > 0
    ? [{ latitude: trackPoints[0].latitude, longitude: trackPoints[0].longitude }]
    : [];

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-4 pt-2 pb-3">
        <Text className="text-2xl font-bold text-foreground">GPS Tracking</Text>
        <Text className="text-sm text-muted mt-0.5">
          {isTracking ? "Tracking your route..." : "Start tracking to record your route"}
        </Text>
      </View>

      {/* Map */}
      <View style={{ flex: 1 }}>
        <NativeMap
          ref={mapRef}
          showsUserLocation
          followsUserLocation={isTracking}
          initialRegion={
            currentLocation
              ? {
                  latitude: currentLocation.coords.latitude,
                  longitude: currentLocation.coords.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }
              : {
                  latitude: 37.78825,
                  longitude: -122.4324,
                  latitudeDelta: 0.1,
                  longitudeDelta: 0.1,
                }
          }
          coordinates={startMarker}
          markerTitle="Start"
          polylineCoordinates={trackPoints.length > 1 ? trackPoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude })) : undefined}
          polylineColor={colors.primary}
        />
        {/* Web fallback overlay with live data */}
        {Platform.OS === "web" && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }]}>
            <MaterialIcons name="map" size={64} color={colors.border} />
            <Text className="text-sm text-muted mt-3">
              {currentLocation
                ? `Location: ${currentLocation.coords.latitude.toFixed(5)}, ${currentLocation.coords.longitude.toFixed(5)}`
                : "Acquiring location..."}
            </Text>
            {isTracking && (
              <Text className="text-xs text-muted mt-1">
                {trackPoints.length} points recorded
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Stats Bar */}
      <View
        className="px-4 pt-4 pb-2 border-t"
        style={{ borderTopColor: colors.border, backgroundColor: colors.background }}
      >
        <View className="flex-row justify-around mb-4">
          <View className="items-center">
            <Text className="text-xs text-muted uppercase tracking-wider">Time</Text>
            <Text className="text-xl font-bold text-foreground mt-1">{elapsedTime}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <View className="items-center">
            <Text className="text-xs text-muted uppercase tracking-wider">Distance</Text>
            <Text className="text-xl font-bold text-foreground mt-1">
              {formatDistance(totalDistance)}
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <View className="items-center">
            <Text className="text-xs text-muted uppercase tracking-wider">Speed</Text>
            <Text className="text-xl font-bold text-foreground mt-1">
              {currentSpeed.toFixed(0)} mph
            </Text>
          </View>
        </View>

        {/* Control Buttons */}
        <View className="flex-row gap-3 pb-4">
          {!isTracking ? (
            <TouchableOpacity
              style={[styles.controlBtn, { backgroundColor: colors.primary, flex: 1 }]}
              onPress={startTracking}
              activeOpacity={0.8}
            >
              <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
              <Text style={styles.controlBtnText}>
                {trackPoints.length > 0 ? "Resume" : "Start Tracking"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.controlBtn, { backgroundColor: colors.error, flex: 1 }]}
              onPress={stopTracking}
              activeOpacity={0.8}
            >
              <MaterialIcons name="stop" size={24} color="#FFFFFF" />
              <Text style={styles.controlBtnText}>Stop</Text>
            </TouchableOpacity>
          )}

          {trackPoints.length > 0 && !isTracking && (
            <TouchableOpacity
              style={[styles.controlBtn, { borderWidth: 1, borderColor: colors.border }]}
              onPress={resetTracking}
              activeOpacity={0.8}
            >
              <MaterialIcons name="refresh" size={22} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  controlBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  controlBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
});
