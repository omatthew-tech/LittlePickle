import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QRAction } from "../components/QRAction";
import { SearchField } from "../components/SearchField";
import { theme } from "../design/theme";

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [leagueQuery, setLeagueQuery] = useState("");

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: theme.size.navigationBottomHeight + insets.bottom + theme.layout.sectionGap,
          paddingTop: insets.top + theme.space[20]
        }
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={styles.brand}>
        LittlePickle
      </Text>
      <View style={styles.entryStack}>
        <QRAction
          onPress={() =>
            Alert.alert("Scan league QR", "Camera access will be requested after this action when the scanner flow is connected.")
          }
        />
        <Text style={styles.or}>or</Text>
        <SearchField
          label="Search for a league"
          onChangeText={setLeagueQuery}
          onSubmit={(query) => Alert.alert("Search for a league", query || "Enter a league name to search.")}
          placeholder="Search for a league"
          scope="league"
          value={leagueQuery}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  brand: {
    ...theme.type.headingBrand,
    color: theme.color.text.primary
  },
  content: {
    backgroundColor: theme.color.surface.canvas,
    flexGrow: 1,
    paddingHorizontal: theme.layout.screenInset
  },
  entryStack: {
    gap: theme.layout.stackDefault,
    marginTop: theme.layout.sectionGap
  },
  or: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary,
    textAlign: "center"
  }
});
