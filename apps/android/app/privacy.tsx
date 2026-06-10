import { ScrollView, Text, View } from 'react-native';
import { useCrackleDate } from '../src/crackle-date-context';
import { styles } from '../src/ui';

export default function PrivacyScreen() {
  const { isDarkMode } = useCrackleDate();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.detailScreen, isDarkMode && styles.screenOnDark]}>
      <View style={[styles.documentHero, isDarkMode && styles.documentHeroOnDark]}>
        <Text style={styles.documentKicker}>Crackle Date</Text>
        <Text style={[styles.detailTitle, isDarkMode && styles.textOnDark]}>Privacy</Text>
        <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
          Crackle Date is built to be played without accounts. Android v1 keeps gameplay local first.
        </Text>
        <Text style={[styles.documentMeta, isDarkMode && styles.documentMetaOnDark]}>Last updated June 10, 2026</Text>
      </View>

      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Local Storage</Text>
        <View style={[styles.listRow, styles.firstSettingsRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Stored on device</Text>
          <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
            Saved solutions, settings, stats, and pending upload records are stored locally on this Android device.
          </Text>
        </View>
        <View style={[styles.listRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Clearing data</Text>
          <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
            Use Settings to remove local Android app data created by Crackle Date.
          </Text>
        </View>
      </View>

      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Anonymous Submissions</Text>
        <View style={[styles.listRow, styles.firstSettingsRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>What is sent</Text>
          <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
            Correct solves queue puzzle date, equation, solve time, difficulty, platform, and app version for aggregate review.
          </Text>
        </View>
        <View style={[styles.listRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>What is not sent</Text>
          <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
            The Android app does not submit account IDs, names, email addresses, device IDs, advertising IDs, payment
            information, precise location, or local storage contents.
          </Text>
        </View>
      </View>

      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Advertising and Tracking</Text>
        <View style={[styles.listRow, styles.firstSettingsRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Android v1</Text>
          <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
            No ads, in-app purchases, accounts, login, or tracking are included in Android v1.
          </Text>
        </View>
        <View style={[styles.listRow, isDarkMode && styles.listRowOnDark]}>
          <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>Website</Text>
          <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
            The public web archive may add advertising separately under the website privacy policy.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
