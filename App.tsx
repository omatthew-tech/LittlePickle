import { useState } from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomNavigation } from "./src/components/BottomNavigation";
import { type Destination, theme } from "./src/design/theme";
import { AuthProvider } from "./src/lib/auth";
import { HomeScreen } from "./src/screens/HomeScreen";
import type { LeagueQueueProfile } from "./src/screens/LeagueQueueScreen";
import { PlayScreen } from "./src/screens/PlayScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const [activeDestination, setActiveDestination] = useState<Destination>("home");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(process.env.EXPO_PUBLIC_DEFAULT_SESSION_ID ?? null);
  const [activeQueueProfile, setActiveQueueProfile] = useState<LeagueQueueProfile | null>(null);

  return (
    <SafeAreaProvider>
      <View style={styles.app}>
        <StatusBar backgroundColor={theme.color.surface.canvas} barStyle="dark-content" />
        {activeDestination === "home" ? (
          <HomeScreen
            activeQueueProfile={activeQueueProfile}
            onQueueProfileChanged={setActiveQueueProfile}
            onSessionSelected={(sessionId) => {
              setActiveSessionId(sessionId);
            }}
          />
        ) : null}
        {activeDestination === "play" ? (
          <PlayScreen
            onSessionClosed={() => {
              setActiveSessionId(null);
              setActiveQueueProfile(null);
              setActiveDestination("home");
            }}
            sessionId={activeSessionId}
          />
        ) : null}
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
