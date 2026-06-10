import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CrackleDateProvider, useCrackleDate } from '../src/crackle-date-context';
import { colors, darkColors } from '../src/ui';

export default function RootLayout() {
  return (
    <CrackleDateProvider>
      <ThemedStack />
    </CrackleDateProvider>
  );
}

function ThemedStack() {
  const { isDarkMode } = useCrackleDate();
  const palette = isDarkMode ? darkColors : colors;

  return (
    <>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerShadowVisible: false,
          headerTitleAlign: 'left',
          headerTitleStyle: { color: palette.label, fontSize: 17, fontWeight: '700' },
          headerTintColor: colors.blue,
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Crackle Date' }} />
        <Stack.Screen name="calendar" options={{ title: 'Archive' }} />
        <Stack.Screen name="solutions" options={{ title: 'Solutions' }} />
        <Stack.Screen name="how-to-play" options={{ title: 'How To Play' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
        <Stack.Screen name="support" options={{ title: 'Support' }} />
      </Stack>
    </>
  );
}
