import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "../design/theme";
import { RallyIcon } from "./RallyIcon";

type SearchFieldProps = {
  completionPlaceholder?: string | null;
  disabled?: boolean;
  errorMessage?: string | null;
  label: string;
  onChangeText: (query: string) => void;
  onSubmit?: (query: string) => void;
  placeholder: "Add player" | "Search for a league" | "Search players";
  scope: "league" | "player";
  value: string;
};

export function SearchField({
  completionPlaceholder = null,
  disabled = false,
  errorMessage = null,
  label,
  onChangeText,
  onSubmit,
  placeholder,
  scope,
  value
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(errorMessage);
  const showCompletionPlaceholder = Boolean(value && completionPlaceholder);

  return (
    <View>
      <View
        style={[
          styles.field,
          focused ? styles.fieldFocused : null,
          hasError ? styles.fieldError : null,
          disabled ? styles.fieldDisabled : null
        ]}
      >
        <RallyIcon color={hasError ? theme.color.feedback.error : theme.color.text.secondary} name="search" size={20} />
        <View style={styles.inputLayer}>
          {showCompletionPlaceholder ? (
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={styles.completionText}
            >
              <Text style={styles.completionSpacer}>{value}</Text>
              <Text>{` ${completionPlaceholder}`}</Text>
            </Text>
          ) : null}
          <TextInput
            accessibilityLabel={label}
            accessibilityRole="search"
            autoCapitalize="none"
            editable={!disabled}
            onBlur={() => setFocused(false)}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onSubmitEditing={() => onSubmit?.(value)}
            placeholder={placeholder}
            placeholderTextColor={theme.color.text.secondary}
            returnKeyType="search"
            style={styles.input}
            value={value}
          />
        </View>
        {hasError ? <RallyIcon color={theme.color.feedback.error} name="error" size={20} /> : null}
      </View>
      {hasError ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.hiddenScope}>
        {scope}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  errorText: {
    ...theme.type.bodySecondary,
    color: theme.color.feedback.error,
    marginTop: theme.space[6]
  },
  field: {
    alignItems: "center",
    backgroundColor: theme.color.surface.card,
    borderColor: theme.color.border.control,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.interactive,
    flexDirection: "row",
    gap: theme.layout.iconLabelGap,
    minHeight: theme.size.controlMinimumHeight,
    paddingHorizontal: theme.space[16],
    width: "100%"
  },
  fieldDisabled: {
    opacity: 0.6
  },
  fieldError: {
    borderColor: theme.color.border.error
  },
  fieldFocused: {
    borderColor: theme.color.focus.ring
  },
  completionSpacer: {
    color: "transparent"
  },
  completionText: {
    ...theme.type.bodyDefault,
    bottom: 0,
    color: theme.color.text.secondary,
    includeFontPadding: false,
    left: 0,
    lineHeight: theme.space[20],
    paddingBottom: theme.space[2],
    paddingTop: 0,
    position: "absolute",
    right: 0,
    textAlignVertical: "center",
    top: 0
  },
  hiddenScope: {
    height: 0,
    opacity: 0
  },
  input: {
    ...theme.type.bodyDefault,
    color: theme.color.text.primary,
    flex: 1,
    height: theme.size.controlMinimumHeight,
    includeFontPadding: false,
    lineHeight: theme.space[20],
    minHeight: theme.size.controlMinimumHeight,
    paddingBottom: theme.space[2],
    paddingHorizontal: 0,
    paddingTop: 0,
    textAlignVertical: "center"
  },
  inputLayer: {
    flex: 1,
    minHeight: theme.size.controlMinimumHeight
  }
});
