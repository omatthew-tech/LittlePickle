import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData
} from "react-native";
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
  const [firstCompletionWidth, setFirstCompletionWidth] = useState(0);
  const [completionSpaceWidth, setCompletionSpaceWidth] = useState(0);
  const firstCompletionInputRef = useRef<TextInput>(null);
  const lastCompletionInputRef = useRef<TextInput>(null);
  const shouldFocusFirstCompletionInput = useRef(false);
  const shouldFocusLastCompletionInput = useRef(false);
  const wasCompletionFieldVisible = useRef(false);
  const hasError = Boolean(errorMessage);
  const showCompletionField = Boolean(value && completionPlaceholder);
  const completionParts = splitCompletionValue(value);
  const firstCompletionInputWidth = Math.max(
    firstCompletionWidth || completionParts.first.length * theme.type.bodyDefault.fontSize * 0.55,
    theme.space[8]
  );
  const completionGapWidth = Math.max(
    completionSpaceWidth || theme.type.bodyDefault.fontSize * 0.3,
    theme.space[4]
  );

  useEffect(() => {
    if (showCompletionField && !wasCompletionFieldVisible.current) {
      shouldFocusFirstCompletionInput.current = true;
    }

    wasCompletionFieldVisible.current = showCompletionField;
  }, [showCompletionField]);

  useEffect(() => {
    if (!showCompletionField) {
      return;
    }

    if (shouldFocusLastCompletionInput.current && completionParts.hasSeparator) {
      shouldFocusLastCompletionInput.current = false;
      requestAnimationFrame(() => lastCompletionInputRef.current?.focus());
      return;
    }

    if (shouldFocusFirstCompletionInput.current) {
      shouldFocusFirstCompletionInput.current = false;
      requestAnimationFrame(() => firstCompletionInputRef.current?.focus());
    }
  }, [completionParts.hasSeparator, completionParts.first, completionParts.last, showCompletionField]);

  function handleFirstCompletionChange(nextFirstValue: string) {
    if (/\s/.test(nextFirstValue)) {
      shouldFocusLastCompletionInput.current = true;
      onChangeText(nextFirstValue);
      return;
    }

    const separator = completionParts.hasSeparator || completionParts.last ? " " : "";
    onChangeText(`${nextFirstValue}${separator}${completionParts.last}`);
  }

  function handleLastCompletionChange(nextLastValue: string) {
    onChangeText(`${completionParts.first} ${nextLastValue}`);
  }

  function handleLastCompletionKeyPress(event: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (event.nativeEvent.key !== "Backspace" || completionParts.last) {
      return;
    }

    shouldFocusFirstCompletionInput.current = true;
    onChangeText(completionParts.first);
  }

  function handleFocus() {
    setFocused(true);
  }

  function handleBlur() {
    setFocused(false);
  }

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
        <View style={[styles.inputLayer, showCompletionField ? styles.completionInputLayer : null]}>
          {showCompletionField ? (
            <>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onLayout={(event) => setFirstCompletionWidth(event.nativeEvent.layout.width)}
                pointerEvents="none"
                style={styles.completionMeasureText}
              >
                {completionParts.first || " "}
              </Text>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onLayout={(event) => setCompletionSpaceWidth(event.nativeEvent.layout.width)}
                pointerEvents="none"
                style={styles.completionMeasureText}
              >
                {"\u00A0"}
              </Text>
              <TextInput
                accessibilityLabel={label}
                accessibilityRole="search"
                autoCapitalize="none"
                editable={!disabled}
                onBlur={handleBlur}
                onChangeText={handleFirstCompletionChange}
                onFocus={handleFocus}
                onSubmitEditing={() => onSubmit?.(value)}
                placeholder={placeholder}
                placeholderTextColor={theme.color.text.secondary}
                ref={firstCompletionInputRef}
                returnKeyType="next"
                style={[styles.input, styles.completionFirstInput, { width: firstCompletionInputWidth }]}
                value={completionParts.first}
              />
              <View style={{ width: completionGapWidth }} />
              <TextInput
                accessibilityLabel={`${label} last name`}
                accessibilityRole="search"
                autoCapitalize="none"
                editable={!disabled}
                onBlur={handleBlur}
                onChangeText={handleLastCompletionChange}
                onFocus={handleFocus}
                onKeyPress={handleLastCompletionKeyPress}
                onSubmitEditing={() => onSubmit?.(value)}
                placeholder={completionPlaceholder ?? undefined}
                placeholderTextColor={theme.color.text.secondary}
                ref={lastCompletionInputRef}
                returnKeyType="search"
                style={[styles.input, styles.completionLastInput]}
                value={completionParts.last}
              />
            </>
          ) : (
            <TextInput
              accessibilityLabel={label}
              accessibilityRole="search"
              autoCapitalize="none"
              editable={!disabled}
              onBlur={handleBlur}
              onChangeText={onChangeText}
              onFocus={handleFocus}
              onSubmitEditing={() => onSubmit?.(value)}
              placeholder={placeholder}
              placeholderTextColor={theme.color.text.secondary}
              returnKeyType="search"
              style={styles.input}
              value={value}
            />
          )}
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
    borderColor: theme.color.border.subtle,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.quiet,
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
  completionFirstInput: {
    flex: 0,
    flexShrink: 0
  },
  completionInputLayer: {
    alignItems: "center",
    flexDirection: "row"
  },
  completionLastInput: {
    flex: 1,
    minWidth: theme.space[64]
  },
  completionMeasureText: {
    ...theme.type.bodyDefault,
    color: "transparent",
    includeFontPadding: false,
    left: 0,
    lineHeight: theme.space[20],
    opacity: 0,
    paddingBottom: theme.space[2],
    paddingTop: 0,
    position: "absolute",
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

function splitCompletionValue(value: string) {
  const firstSeparatorIndex = value.search(/\s/);

  if (firstSeparatorIndex === -1) {
    return {
      first: value,
      hasSeparator: false,
      last: ""
    };
  }

  return {
    first: value.slice(0, firstSeparatorIndex),
    hasSeparator: true,
    last: value.slice(firstSeparatorIndex).trimStart()
  };
}
