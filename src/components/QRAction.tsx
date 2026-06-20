import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../design/theme";
import { RallyIcon } from "./RallyIcon";

type QRActionProps = {
  disabled?: boolean;
  errorMessage?: string | null;
  label?: string;
  onPress: () => void;
  supportingText?: string | null;
};

export function QRAction({
  disabled = false,
  errorMessage = null,
  label = "Scan league QR",
  onPress,
  supportingText = null
}: QRActionProps) {
  const hasError = Boolean(errorMessage);

  return (
    <View>
      <Pressable
        accessibilityHint="Starts league entry from a QR code"
        accessibilityLabel="Scan league QR code"
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.action,
          pressed ? styles.pressed : null,
          hasError ? styles.error : null,
          disabled ? styles.disabled : null
        ]}
      >
        <RallyIcon
          color={hasError ? theme.color.feedback.error : theme.color.action.primary}
          name="scan"
          size={theme.size.iconPrimary}
        />
        <Text style={styles.label}>{label}</Text>
        {supportingText ? <Text style={styles.supportingText}>{supportingText}</Text> : null}
      </Pressable>
      {hasError ? (
        <View style={styles.errorRow}>
          <RallyIcon color={theme.color.feedback.error} name="error" size={theme.size.iconCompact} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.control,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.interactive,
    gap: theme.layout.iconLabelGap,
    justifyContent: "center",
    minHeight: theme.size.qrActionMinimumHeight,
    padding: theme.space[20],
    width: "100%"
  },
  disabled: {
    opacity: 0.6
  },
  error: {
    borderColor: theme.color.border.error
  },
  errorRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.space[6],
    marginTop: theme.space[6]
  },
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error,
    flex: 1
  },
  label: {
    ...theme.type.headingSection,
    color: theme.color.text.primary,
    textAlign: "center"
  },
  pressed: {
    backgroundColor: theme.color.surface.info,
    borderColor: theme.color.action.primary
  },
  supportingText: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary,
    textAlign: "center"
  }
});
