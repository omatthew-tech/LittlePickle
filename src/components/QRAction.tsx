import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
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
  const actionColor = hasError ? theme.color.feedback.error : theme.color.action.primary;

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
        <LeagueQrMark color={actionColor} />
        <Text style={[styles.label, { color: actionColor }]}>{label}</Text>
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

function LeagueQrMark({ color }: { color: string }) {
  return (
    <Svg
      accessibilityElementsHidden
      height={theme.space[64]}
      importantForAccessibility="no"
      viewBox="0 0 64 64"
      width={theme.space[64]}
    >
      <Path
        d="M19 7H7v12M45 7h12v12M7 45v12h12M57 45v12H45"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.75}
      />
      <Rect fill="none" height={10.5} rx={1.25} stroke={color} strokeWidth={2.25} width={10.5} x={20.25} y={20.25} />
      <Rect fill="none" height={10.5} rx={1.25} stroke={color} strokeWidth={2.25} width={10.5} x={34.75} y={20.25} />
      <Rect fill="none" height={10.5} rx={1.25} stroke={color} strokeWidth={2.25} width={10.5} x={20.25} y={34.75} />
      <Rect fill={color} height={2.75} rx={0.55} width={2.75} x={24.1} y={24.1} />
      <Rect fill={color} height={2.75} rx={0.55} width={2.75} x={38.6} y={24.1} />
      <Rect fill={color} height={2.75} rx={0.55} width={2.75} x={24.1} y={38.6} />
      <Rect fill={color} height={4.25} rx={0.75} width={4.25} x={35} y={35} />
      <Rect fill={color} height={4.25} rx={0.75} width={4.25} x={45.5} y={35} />
      <Rect fill={color} height={4.25} rx={0.75} width={4.25} x={40.25} y={40.25} />
      <Rect fill={color} height={4.25} rx={0.75} width={4.25} x={35} y={45.5} />
      <Rect fill={color} height={4.25} rx={0.75} width={4.25} x={45.5} y={45.5} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.quiet,
    gap: theme.layout.stackDefault,
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
