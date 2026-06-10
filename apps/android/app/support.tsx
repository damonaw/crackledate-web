import { ScrollView, Text, View } from 'react-native';
import { useCrackleDate } from '../src/crackle-date-context';
import { styles } from '../src/ui';

export default function SupportScreen() {
  const { isDarkMode } = useCrackleDate();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.detailScreen, isDarkMode && styles.screenOnDark]}>
      <View style={[styles.documentHero, isDarkMode && styles.documentHeroOnDark]}>
        <Text style={styles.documentKicker}>Crackle Date</Text>
        <Text style={[styles.detailTitle, isDarkMode && styles.textOnDark]}>Support</Text>
        <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
          Include the puzzle date, difficulty mode, and the exact equation if something looks wrong.
        </Text>
        <Text style={[styles.documentMeta, isDarkMode && styles.documentMetaOnDark]}>Last updated June 10, 2026</Text>
      </View>

      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Troubleshooting</Text>
        <View style={[styles.listRow, styles.firstSettingsRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Equation checks</Text>
          <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
            Confirm every date digit is used in order, the equation has exactly one equals sign, and both sides evaluate
            to the same value before submitting.
          </Text>
        </View>
        <View style={[styles.listRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Offline uploads</Text>
          <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
            If a solve upload fails while offline, gameplay remains saved on this device. The app retries queued uploads
            when it opens, resumes, or detects connectivity.
          </Text>
        </View>
        <View style={[styles.listRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Local saves</Text>
          <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
            Saved solutions and badges are local to this Android device. Clearing app data removes local history.
          </Text>
        </View>
      </View>

      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Links</Text>
        <View style={[styles.listRow, styles.firstSettingsRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Website support</Text>
          <Text selectable style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>https://crackledate.com/support/</Text>
        </View>
        <View style={[styles.listRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Privacy</Text>
          <Text selectable style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>https://crackledate.com/privacy/</Text>
        </View>
      </View>
    </ScrollView>
  );
}
