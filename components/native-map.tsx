/**
 * Platform-specific map wrapper.
 * On native: renders react-native-maps MapView.
 * On web: renders a placeholder with "Open in Maps" link.
 *
 * This file is the native implementation (.tsx).
 * The web implementation is in native-map.web.tsx.
 */
import React, { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface NativeMapProps {
  initialRegion?: Region;
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
  (
    {
      initialRegion,
      coordinates = [],
      polylineCoordinates,
      polylineColor = "#1B6B3A",
      showsUserLocation = false,
      followsUserLocation = false,
      scrollEnabled = true,
      zoomEnabled = true,
      style,
      markerTitle,
    },
    ref
  ) => {
    return (
      <MapView
        ref={ref}
        style={[StyleSheet.absoluteFillObject, style]}
        initialRegion={initialRegion}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={showsUserLocation}
        followsUserLocation={followsUserLocation}
        scrollEnabled={scrollEnabled}
        zoomEnabled={zoomEnabled}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {coordinates.map((coord, index) => (
          <Marker
            key={`marker-${index}`}
            coordinate={coord}
            title={index === 0 ? markerTitle || "Location" : `Point ${index + 1}`}
            pinColor={index === 0 ? "green" : "red"}
          />
        ))}
        {polylineCoordinates && polylineCoordinates.length > 1 && (
          <Polyline
            coordinates={polylineCoordinates}
            strokeColor={polylineColor}
            strokeWidth={4}
          />
        )}
      </MapView>
    );
  }
);

NativeMap.displayName = "NativeMap";

export default NativeMap;

/** Re-export animateToRegion helper */
export function animateMapToRegion(mapRef: any, region: Region, duration = 500) {
  if (mapRef?.current?.animateToRegion) {
    mapRef.current.animateToRegion(region, duration);
  }
}
