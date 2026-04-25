/**
 * Web implementation of NativeMap.
 * Renders a placeholder since react-native-maps is native-only.
 */
import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface NativeMapProps {
  initialRegion?: any;
  coordinates?: MapCoordinate[];
  polylineCoordinates?: MapCoordinate[];
  polylineColor?: string;
  showsUserLocation?: boolean;
  followsUserLocation?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  style?: any;
  markerTitle?: string;
}

const NativeMap = forwardRef<any, NativeMapProps>(
  ({ coordinates = [], style }, _ref) => {
    const hasCoords = coordinates.length > 0;
    return (
      <View style={[styles.container, style]}>
        <MaterialIcons name="map" size={48} color="#9BA1A6" />
        <Text style={styles.text}>
          {hasCoords
            ? `Map available on mobile device`
            : "No location data"}
        </Text>
        {hasCoords && (
          <Text style={styles.subtext}>
            {coordinates[0].latitude.toFixed(5)}, {coordinates[0].longitude.toFixed(5)}
          </Text>
        )}
      </View>
    );
  }
);

NativeMap.displayName = "NativeMap";

export default NativeMap;

export function animateMapToRegion(_mapRef: any, _region: any, _duration = 500) {
  // No-op on web
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    minHeight: 120,
  },
  text: {
    marginTop: 8,
    fontSize: 13,
    color: "#687076",
  },
  subtext: {
    marginTop: 4,
    fontSize: 11,
    color: "#9BA1A6",
    fontFamily: "monospace",
  },
});
