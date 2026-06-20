import { useState } from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomNavigation } from "./src/components/BottomNavigation";
import { type Destination, theme } from "./src/design/theme";
import { HomeScreen } from "./src/screens/HomeScreen";
import { PlayScreen } from "./src/screens/PlayScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";

export default function App() {
  const [activeDestination, setActiveDestination] = useState<Destination>("home");

  return (
    <SafeAreaProvider>
      <View style={styles.app}>
        <StatusBar backgroundColor={theme.color.surface.canvas} barStyle="dark-content" />
        {activeDestination === "home" ? <HomeScreen /> : null}
        {activeDestination === "play" ? <PlayScreen /> : null}
        {activeDestination === "profile" ? <ProfileScreen /> : null}
        <BottomNavigation activeDestination={activeDestination} onDestinationChanged={setActiveDestination} />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    backgroundColor: theme.color.surface.canvas,
    flex: 1
  }
});
