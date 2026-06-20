import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../design/theme";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityLabel="Profile"
      style={[
        styles.screen,
        {
          paddingBottom: theme.size.navigationBottomHeight + insets.bottom,
          paddingTop: insets.top + theme.space[20]
        }
      ]}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.color.surface.canvas,
    flex: 1,
    paddingHorizontal: theme.layout.screenInset
  }
});
