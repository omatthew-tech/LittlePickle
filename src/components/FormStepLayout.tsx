import type { ReactNode } from "react";
import { StyleSheet, Text, View, type DimensionValue } from "react-native";
import { theme } from "../design/theme";
import { ActionButton } from "./ActionButton";

type FormStepLayoutProps = {
  children: ReactNode;
  currentStep: number;
  onBack: () => void;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  primaryLabel?: string;
  title: string;
  totalSteps: number;
};

export function FormStepLayout({
  children,
  currentStep,
  onBack,
  onPrimaryPress,
  primaryDisabled = false,
  primaryLabel = "Next",
  title,
  totalSteps
}: FormStepLayoutProps) {
  const progressWidth = `${Math.max(0, Math.min(100, (currentStep / totalSteps) * 100))}%` as DimensionValue;

  return (
    <View style={styles.root}>
      <View>
        <ActionButton label="Go back" onPress={onBack} style={styles.backButton} variant="text" />
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
        <View style={styles.formContent}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <View style={styles.fields}>{children}</View>
        </View>
      </View>
      <View style={styles.footer}>
        <View style={styles.footerDivider} />
        <ActionButton
          disabled={primaryDisabled}
          label={primaryLabel}
          onPress={onPrimaryPress}
          style={styles.primaryButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: "flex-start",
    marginLeft: -theme.space[12]
  },
  fields: {
    gap: theme.layout.stackDefault,
    marginTop: theme.space[48]
  },
  footer: {
    gap: theme.layout.sectionGap
  },
  footerDivider: {
    backgroundColor: theme.color.border.subtle,
    height: theme.border.quiet,
    marginHorizontal: -theme.layout.screenInset
  },
  formContent: {
    marginTop: theme.space[64]
  },
  primaryButton: {
    alignSelf: "stretch"
  },
  progressFill: {
    backgroundColor: theme.color.action.primary,
    borderRadius: theme.radius.pill,
    height: "100%"
  },
  progressTrack: {
    backgroundColor: theme.color.border.subtle,
    borderRadius: theme.radius.pill,
    height: theme.space[4],
    marginTop: theme.space[8]
  },
  root: {
    flex: 1,
    justifyContent: "space-between",
    minHeight: 560
  },
  title: {
    ...theme.type.headingPage,
    color: theme.color.text.primary
  }
});
