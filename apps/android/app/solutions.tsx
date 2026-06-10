import { ScrollView, Text, View } from 'react-native';
import { puzzleForDate, solutionBadges } from '@crackledate/core';
import { useCrackleDate } from '../src/crackle-date-context';
import { dateFromIdentifier, fullDateFormatter, formatSeconds, styles } from '../src/ui';

export default function SolutionsScreen() {
  const { allSolutions, isDarkMode, selectedDate, solutionsByDate } = useCrackleDate();
  const puzzle = puzzleForDate(selectedDate);
  const selectedSolutions = allSolutions.filter((solution) => solution.date === puzzle.dateIdentifier);
  const badges = solutionBadges(solutionsByDate);
  const earnedBadges = badges.filter((badge) => badge.earned);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.screen, isDarkMode && styles.screenOnDark]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.detailTitle, isDarkMode && styles.textOnDark]}>Saved Solutions</Text>
          <Text style={[styles.sectionSubtitle, isDarkMode && styles.secondaryTextOnDark]}>{puzzle.displayDate}</Text>
        </View>
      </View>

      {earnedBadges.length > 0 ? (
        <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
          <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Badges</Text>
          <View style={styles.badgeGrid}>
            {earnedBadges.map((badge) => (
              <View key={badge.id} style={styles.badgeCard} accessibilityLabel={`${badge.title}, earned ${formatBadgeEarnedDate(badge.earnedDate)}`}>
                <View style={[styles.badgeIcon, isDarkMode && styles.badgeIconOnDark, styles.badgeIconEarned]}>
                  <Text style={[styles.badgeIconText, styles.badgeIconTextEarned]}>✓</Text>
                </View>
                <Text style={[styles.badgeTitle, isDarkMode && styles.textOnDark]}>{badge.title}</Text>
                <Text style={[styles.badgeMeta, isDarkMode && styles.secondaryTextOnDark]}>
                  {formatBadgeEarnedDate(badge.earnedDate)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Saved Solutions</Text>
        {selectedSolutions.length === 0 ? (
          <Text style={[styles.muted, isDarkMode && styles.mutedOnDark]}>No solutions saved for this date yet.</Text>
        ) : null}
        {selectedSolutions.map((solution) => (
          <View key={solution.id} style={[styles.listRow, isDarkMode && styles.listRowOnDark]}>
            <Text selectable style={[styles.listTitle, isDarkMode && styles.textOnDark]}>{solution.equation}</Text>
            <Text style={[styles.muted, isDarkMode && styles.mutedOnDark]}>
              {formatSeconds(solution.seconds)} · value {solution.value} · {solution.difficulty}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Stats</Text>
        <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
          {allSolutions.length} saved solution{allSolutions.length === 1 ? '' : 's'} on this device.
        </Text>
      </View>
    </ScrollView>
  );
}

function formatBadgeEarnedDate(dateIdentifier: string | undefined): string {
  if (!dateIdentifier) return 'Date unknown';
  return fullDateFormatter.format(dateFromIdentifier(dateIdentifier));
}
