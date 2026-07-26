import { useFonts } from "expo-font";
import { useCallback, useState } from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomNavigation } from "./src/components/BottomNavigation";
import { type Destination, theme } from "./src/design/theme";
import { AuthProvider } from "./src/lib/auth";
import type { LocalPlayerProfile } from "./src/lib/localGuestProfile";
import { HomeScreen } from "./src/screens/HomeScreen";
import type { LeagueQueueProfile } from "./src/screens/LeagueQueueScreen";
import { PlayScreen } from "./src/screens/PlayScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Cabin_400Regular: require("@expo-google-fonts/cabin/400Regular/Cabin_400Regular.ttf"),
    Cabin_600SemiBold: require("@expo-google-fonts/cabin/600SemiBold/Cabin_600SemiBold.ttf"),
    Cabin_700Bold: require("@expo-google-fonts/cabin/700Bold/Cabin_700Bold.ttf"),
    GoMono_400Regular: require("./assets/fonts/Go-Mono.ttf"),
    GoMono_700Bold: require("./assets/fonts/Go-Mono-Bold.ttf")
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

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
  const [creationFlowActive, setCreationFlowActive] = useState(false);
  const [homeVisitKey, setHomeVisitKey] = useState(0);

  const handleDestinationChanged = useCallback((destination: Destination) => {
    if (destination === "home") {
      setHomeVisitKey((previousKey) => previousKey + 1);
    }

    setActiveDestination(destination);
  }, []);

  const handleActivePlayerProfileChanged = useCallback((profile: LocalPlayerProfile) => {
    if (!profile.sessionId) {
      setActiveQueueProfile(null);
      return;
    }

    setActiveSessionId(profile.sessionId);
    setActiveQueueProfile({
      avatarPath: profile.avatarPath ?? null,
      displayName: profile.displayName,
      leagueId: profile.leagueId,
      leagueName: profile.leagueName,
      playerId: profile.playerId,
      rating: profile.rating ?? null,
      sessionId: profile.sessionId
    });
  }, []);

  const handleActivePlayerDeactivated = useCallback(() => {
    setActiveSessionId(null);
    setActiveQueueProfile(null);
  }, []);

  const handleSessionEnded = useCallback(() => {
    setActiveSessionId(null);
    setActiveQueueProfile(null);
    setHomeVisitKey((previousKey) => previousKey + 1);
    setActiveDestination("home");
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.app}>
        <StatusBar backgroundColor={theme.color.surface.canvas} barStyle="dark-content" />
        {activeDestination === "home" ? (
          <HomeScreen
            activeQueueProfile={activeQueueProfile}
            onCreationFlowActiveChanged={setCreationFlowActive}
            onQueueProfileChanged={setActiveQueueProfile}
            onSessionSelected={(sessionId) => {
              setActiveSessionId(sessionId);
            }}
            queueAutoOpenKey={homeVisitKey}
          />
        ) : null}
        {activeDestination === "play" ? (
          <PlayScreen
            currentPlayerId={activeQueueProfile?.playerId ?? null}
            onSessionEnded={handleSessionEnded}
            sessionId={activeSessionId}
          />
        ) : null}
        {activeDestination === "profile" ? (
          <ProfileScreen
            onActiveProfileChanged={handleActivePlayerProfileChanged}
            onActiveProfileDeactivated={handleActivePlayerDeactivated}
          />
        ) : null}
        {!creationFlowActive ? (
          <BottomNavigation activeDestination={activeDestination} onDestinationChanged={handleDestinationChanged} />
        ) : null}
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
