import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Destination, theme } from "../design/theme";
import { RallyIcon, type RallyIconName } from "./RallyIcon";

type NavigationItem = {
  destination: Destination;
  icon: RallyIconName;
  label: string;
};

const items: NavigationItem[] = [
  { destination: "home", icon: "home", label: "Home" },
  { destination: "play", icon: "play", label: "Play" },
  { destination: "profile", icon: "profile", label: "Profile" }
];

type BottomNavigationProps = {
  activeDestination: Destination;
  onDestinationChanged: (destination: Destination) => void;
};

export function BottomNavigation({ activeDestination, onDestinationChanged }: BottomNavigationProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityLabel="Primary"
      accessibilityRole="tablist"
      style={[styles.navigation, { paddingBottom: insets.bottom + theme.space[8] }]}
    >
      {items.map((item) => {
        const active = activeDestination === item.destination;
        const color = active ? theme.color.action.primary : theme.color.text.secondary;

        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.destination}
            onPress={() => onDestinationChanged(item.destination)}
            style={({ pressed }) => [
              styles.item,
              active ? styles.itemActive : null,
              pressed ? styles.itemPressed : null
            ]}
          >
            <RallyIcon color={color} name={item.icon} size={theme.size.iconDefault} />
            <Text style={[styles.label, { color }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: theme.radius.control,
    borderWidth: theme.border.interactive,
    gap: theme.space[2],
    justifyContent: "center",
    minHeight: theme.size.targetMinimum,
    minWidth: theme.size.targetMinimum,
    paddingHorizontal: theme.space[8],
    paddingVertical: theme.space[4]
  },
  itemActive: {
    borderColor: theme.color.action.primary
  },
  itemPressed: {
    backgroundColor: theme.color.surface.info
  },
  label: {
    ...theme.type.labelNavigation
  },
  navigation: {
    alignItems: "flex-start",
    backgroundColor: theme.color.surface.card,
    borderTopColor: theme.color.border.subtle,
    borderTopWidth: theme.border.quiet,
    bottom: 0,
    flexDirection: "row",
    gap: theme.space[6],
    justifyContent: "space-between",
    left: 0,
    minHeight: theme.size.navigationBottomHeight,
    paddingHorizontal: theme.layout.screenInset,
    paddingTop: theme.space[8],
    position: "absolute",
    right: 0
  }
});
