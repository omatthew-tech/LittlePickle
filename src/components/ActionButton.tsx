import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from "react-native";
import { theme } from "../design/theme";
import { RallyIcon, type RallyIconName } from "./RallyIcon";

type ActionButtonProps = {
  disabled?: boolean;
  icon?: RallyIconName;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: "primary" | "text";
  accessibilityLabel?: string;
};

export function ActionButton({
  accessibilityLabel,
  disabled = false,
  icon,
  label,
  onPress,
  style,
  variant = "primary"
}: ActionButtonProps) {
  const isPrimary = variant === "primary";

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.text,
        pressed && isPrimary ? styles.primaryPressed : null,
        disabled ? (isPrimary ? styles.primaryDisabled : styles.textDisabled) : null,
        style
      ]}
    >
      {({ pressed }) => {
        const foreground = getForegroundColor({ disabled, isPrimary, pressed });

        return (
          <View style={styles.content}>
            {icon ? (
              <RallyIcon
                color={foreground}
                name={icon}
                size={isPrimary ? theme.size.iconDefault : theme.size.iconCompact}
              />
            ) : null}
            <Text style={[styles.label, { color: foreground }]}>{label}</Text>
          </View>
        );
      }}
    </Pressable>
  );
}

function getForegroundColor({
  disabled,
  isPrimary
}: {
  disabled: boolean;
  isPrimary: boolean;
  pressed: boolean;
}) {
  if (disabled) {
    return theme.color.text.disabled;
  }

  return isPrimary ? theme.color.text.onPrimary : theme.color.action.primary;
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: theme.radius.control,
    justifyContent: "center",
    minHeight: theme.size.targetMinimum,
    minWidth: theme.size.targetMinimum
  },
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.layout.iconLabelGap,
    justifyContent: "center"
  },
  label: {
    ...theme.type.labelAction
  },
  primary: {
    backgroundColor: theme.color.action.primary,
    minHeight: theme.size.controlMinimumHeight,
    paddingHorizontal: theme.space[16],
    paddingVertical: theme.space[12]
  },
  primaryDisabled: {
    backgroundColor: theme.color.action.disabled
  },
  primaryPressed: {
    backgroundColor: theme.color.action.primaryPressed
  },
  text: {
    backgroundColor: "transparent",
    paddingHorizontal: theme.space[12],
    paddingVertical: theme.space[12]
  },
  textDisabled: {
    opacity: 1
  }
});
