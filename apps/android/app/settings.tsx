import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View, type ImageStyle } from 'react-native';
import { useCrackleDate } from '../src/crackle-date-context';
import { styles } from '../src/ui';

export default function SettingsScreen() {
  const { difficulty, flushQueue, isDarkMode, pendingCount, resetAll, setDifficulty, setTheme, theme } = useCrackleDate();
  const router = useRouter();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.screen, isDarkMode && styles.screenOnDark]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.detailTitle, isDarkMode && styles.textOnDark]}>Settings</Text>
          <Text style={[styles.sectionSubtitle, isDarkMode && styles.secondaryTextOnDark]}>
            Difficulty, theme, uploads, and local data.
          </Text>
        </View>
      </View>

      <View style={[styles.settingsGroup, isDarkMode && styles.settingsGroupOnDark]}>
        <View style={[styles.settingsRow, styles.firstSettingsRow]}>
          <Text style={[styles.label, isDarkMode && styles.secondaryTextOnDark]}>Theme</Text>
          <View style={[styles.segmentedControl, isDarkMode && styles.segmentedControlOnDark]}>
            {(['light', 'dark'] as const).map((option) => {
              const selected = theme === option;
              return (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    styles.segmentedOption,
                    selected && styles.segmentedOptionSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setTheme(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.segmentedText, isDarkMode && styles.secondaryTextOnDark, selected && styles.segmentedTextSelected]}>
                    {option === 'light' ? 'Light' : 'Dark'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.settingsRow, styles.borderedSettingsRow, isDarkMode && styles.settingsRowOnDark]}>
          <Text style={[styles.label, isDarkMode && styles.secondaryTextOnDark]}>Difficulty</Text>
          <View style={[styles.segmentedControl, isDarkMode && styles.segmentedControlOnDark]}>
            {(['easy', 'hard'] as const).map((option) => {
              const selected = difficulty === option;
              return (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    styles.segmentedOption,
                    selected && styles.segmentedOptionSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setDifficulty(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.segmentedText, isDarkMode && styles.secondaryTextOnDark, selected && styles.segmentedTextSelected]}>
                    {option === 'easy' ? 'Easy' : 'Hard'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.settingsRow, styles.borderedSettingsRow, isDarkMode && styles.settingsRowOnDark]}>
          <View>
            <Text style={[styles.label, isDarkMode && styles.secondaryTextOnDark]}>Offline Queue</Text>
            <Text style={[styles.muted, isDarkMode && styles.mutedOnDark]}>Pending anonymous uploads: {pendingCount}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.smallButton, isDarkMode && styles.smallButtonOnDark, pressed && styles.pressed]}
            onPress={flushQueue}
          >
            <Text style={[styles.smallButtonText, isDarkMode && styles.textOnDark]}>Try Now</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.linkList, isDarkMode && styles.linkListOnDark]}>
        <Pressable
          style={({ pressed }) => [styles.linkRow, styles.firstSettingsRow, pressed && styles.pressed]}
          onPress={() => router.push('/how-to-play')}
        >
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>How To Play</Text>
          <Text style={[styles.linkChevron, isDarkMode && styles.secondaryTextOnDark]}>›</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, styles.borderedSettingsRow, isDarkMode && styles.linkRowOnDark, pressed && styles.pressed]}
          onPress={() => router.push('/privacy')}
        >
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Privacy</Text>
          <Text style={[styles.linkChevron, isDarkMode && styles.secondaryTextOnDark]}>›</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.linkRow, styles.borderedSettingsRow, isDarkMode && styles.linkRowOnDark, pressed && styles.pressed]}
          onPress={() => router.push('/support')}
        >
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Support</Text>
          <Text style={[styles.linkChevron, isDarkMode && styles.secondaryTextOnDark]}>›</Text>
        </Pressable>
        <Pressable style={[styles.linkRow, styles.borderedSettingsRow, isDarkMode && styles.linkRowOnDark]} onPress={resetAll}>
          <Text style={styles.dangerButtonText}>Clear Local Data</Text>
        </Pressable>
      </View>

      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Data</Text>
        <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
          Clear Local Data removes saved solutions, settings, stats, and pending upload records on this device.
        </Text>
      </View>

      <View style={[styles.branding, isDarkMode && styles.brandingOnDark]} accessibilityLabel="Game studio credit">
        <View style={styles.brandingMark}>
          <Image source={require('../assets/ouroborialis-logo.png')} style={styles.brandingLogo as ImageStyle} resizeMode="contain" />
        </View>
        <Text style={styles.brandingText}>An Ouroborialis Game</Text>
      </View>
    </ScrollView>
  );
}
