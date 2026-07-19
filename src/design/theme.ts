const fontFamilies = {
  interfaceRegular: "Cabin_400Regular",
  interfaceSemibold: "Cabin_600SemiBold",
  interfaceBold: "Cabin_700Bold",
  metricRegular: "GoMono_400Regular",
  metricBold: "GoMono_700Bold"
} as const;

export const theme = {
  color: {
    surface: {
      canvas: "#F6F2E8",
      card: "#FFFDF8",
      info: "#E8ECFA",
      social: "#CBDDA4"
    },
    text: {
      primary: "#22283A",
      secondary: "#686D7A",
      onPrimary: "#FFFDF8",
      selected: "#3D50A8",
      disabled: "#686D7A"
    },
    action: {
      primary: "#4B63C6",
      primaryPressed: "#3D50A8",
      disabled: "#D8D5CD"
    },
    border: {
      control: "#7F8592",
      subtle: "#D8D5CD",
      active: "#4B63C6",
      error: "#BE3E68"
    },
    focus: {
      ring: "#4B63C6"
    },
    feedback: {
      error: "#BE3E68"
    }
  },
  font: fontFamilies,
  type: {
    headingBrand: {
      fontFamily: fontFamilies.interfaceBold,
      fontSize: 32,
      fontWeight: "700",
      lineHeight: 40,
      letterSpacing: -0.32
    },
    headingPage: {
      fontFamily: fontFamilies.interfaceBold,
      fontSize: 28,
      fontWeight: "700",
      lineHeight: 36,
      letterSpacing: -0.28
    },
    headingSection: {
      fontFamily: fontFamilies.interfaceSemibold,
      fontSize: 20,
      fontWeight: "600",
      lineHeight: 24,
      letterSpacing: 0
    },
    titleCard: {
      fontFamily: fontFamilies.interfaceSemibold,
      fontSize: 17,
      fontWeight: "600",
      lineHeight: 24,
      letterSpacing: 0
    },
    bodyDefault: {
      fontFamily: fontFamilies.interfaceRegular,
      fontSize: 16,
      fontWeight: "400",
      lineHeight: 24,
      letterSpacing: 0
    },
    bodySecondary: {
      fontFamily: fontFamilies.interfaceRegular,
      fontSize: 14,
      fontWeight: "400",
      lineHeight: 20,
      letterSpacing: 0
    },
    labelAction: {
      fontFamily: fontFamilies.interfaceSemibold,
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 20,
      letterSpacing: 0
    },
    labelNavigation: {
      fontFamily: fontFamilies.interfaceSemibold,
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 16,
      letterSpacing: 0.12
    },
    metricScore: {
      fontFamily: fontFamilies.metricBold,
      fontSize: 36,
      fontWeight: "700",
      lineHeight: 40,
      letterSpacing: -0.72
    },
    metricRecord: {
      fontFamily: fontFamilies.metricBold,
      fontSize: 24,
      fontWeight: "700",
      lineHeight: 28,
      letterSpacing: -0.48
    },
    metricDetail: {
      fontFamily: fontFamilies.metricRegular,
      fontSize: 14,
      fontWeight: "400",
      lineHeight: 20,
      letterSpacing: 0
    }
  },
  space: {
    0: 0,
    2: 2,
    4: 4,
    6: 6,
    8: 8,
    12: 12,
    16: 16,
    20: 20,
    24: 24,
    28: 28,
    32: 32,
    40: 40,
    48: 48,
    64: 64
  },
  layout: {
    screenInset: 20,
    sectionGap: 28,
    stackDefault: 12,
    stackCompact: 6,
    inlineDefault: 12,
    iconLabelGap: 6,
    cardPadding: 16
  },
  size: {
    targetMinimum: 48,
    controlMinimumHeight: 52,
    playerRowMinimumHeight: 64,
    qrActionMinimumHeight: 160,
    navigationBottomHeight: 72,
    avatarDefault: 36,
    iconCompact: 20,
    iconDefault: 24,
    iconPrimary: 28
  },
  radius: {
    control: 14,
    card: 18,
    pill: 999
  },
  border: {
    interactive: 1.5,
    quiet: 1,
    focus: 2
  },
  shadow: {
    card: {
      shadowColor: "#22283A",
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3
    }
  }
} as const;

export type Destination = "home" | "play" | "profile";
