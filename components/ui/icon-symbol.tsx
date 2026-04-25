import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];
type IconMapping = Record<string, MaterialIconName>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "gearshape.fill": "settings",
  "list.bullet": "list",
  "doc.text.fill": "description",
  "qrcode.viewfinder": "qr-code-scanner",
  "camera.fill": "camera-alt",
  "checkmark.circle.fill": "check-circle",
  "xmark.circle.fill": "cancel",
  "arrow.clockwise": "refresh",
  "plus.circle.fill": "add-circle",
  "trash.fill": "delete",
  "pencil": "edit",
  "magnifyingglass": "search",
  "person.fill": "person",
  "location.fill": "location-on",
  "phone.fill": "phone",
  "envelope.fill": "email",
  "clock.fill": "schedule",
  "exclamationmark.triangle.fill": "warning",
  "wifi.slash": "wifi-off",
  "wifi": "wifi",
  "arrow.up.circle.fill": "cloud-upload",
  "signature": "draw",
  "barcode.viewfinder": "document-scanner",
  "chevron.left": "chevron-left",
  "ellipsis.circle": "more-horiz",
  "square.and.pencil": "edit-note",
  "tray.full.fill": "inventory",
  "shippingbox.fill": "local-shipping",
  "location.circle.fill": "my-location",
  "map.fill": "map",
  "navigation.fill": "navigation",
} satisfies IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
