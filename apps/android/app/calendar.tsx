import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { puzzleForDate } from '@crackledate/core';
import { useCrackleDate } from '../src/crackle-date-context';
import {
  addMonths,
  calendarDaysForMonth,
  dateIdentifier,
  fullDateFormatter,
  monthFormatter,
  startOfMonth,
  styles,
  weekdayLabels,
} from '../src/ui';

export default function CalendarScreen() {
  const { isDarkMode, selectedDate, setSelectedDate, solutionsByDate } = useCrackleDate();
  const currentPuzzle = puzzleForDate(selectedDate);
  const selectedIdentifier = currentPuzzle.dateIdentifier;
  const todayIdentifier = useMemo(() => dateIdentifier(new Date()), []);
  const savedSolutionDates = useMemo(() => new Set(Object.keys(solutionsByDate)), [solutionsByDate]);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate));
  const calendarDays = useMemo(() => calendarDaysForMonth(visibleMonth), [visibleMonth]);
  const monthLabel = useMemo(() => monthFormatter.format(visibleMonth), [visibleMonth]);

  useEffect(() => {
    setVisibleMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

  function chooseDate(next: Date) {
    setSelectedDate(next);
    router.push('/');
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.screen, isDarkMode && styles.screenOnDark]}>
      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.detailTitle, isDarkMode && styles.textOnDark]}>Choose Date</Text>
            <Text style={[styles.sectionSubtitle, isDarkMode && styles.secondaryTextOnDark]}>
              Saved days are marked in green.
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.smallButton, isDarkMode && styles.smallButtonOnDark, pressed && styles.pressed]}
            onPress={() => chooseDate(new Date())}
          >
            <Text style={[styles.secondaryButtonText, isDarkMode && styles.textOnDark]}>Today</Text>
          </Pressable>
        </View>

        <View style={[styles.calendar, isDarkMode && styles.calendarOnDark]} accessibilityLabel="Choose puzzle date">
          <View style={styles.calendarHeader}>
            <Pressable
              style={({ pressed }) => [styles.calendarArrow, isDarkMode && styles.calendarArrowOnDark, pressed && styles.pressed]}
              onPress={() => setVisibleMonth((month) => addMonths(month, -1))}
              accessibilityLabel="Previous month"
            >
              <Text style={[styles.calendarArrowText, isDarkMode && styles.textOnDark]}>‹</Text>
            </Pressable>
            <Text style={[styles.calendarMonth, isDarkMode && styles.textOnDark]}>{monthLabel}</Text>
            <Pressable
              style={({ pressed }) => [styles.calendarArrow, isDarkMode && styles.calendarArrowOnDark, pressed && styles.pressed]}
              onPress={() => setVisibleMonth((month) => addMonths(month, 1))}
              accessibilityLabel="Next month"
            >
              <Text style={[styles.calendarArrowText, isDarkMode && styles.textOnDark]}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow} accessibilityElementsHidden>
            {weekdayLabels.map((weekday, index) => (
              <View key={`${weekday}-${index}`} style={styles.weekdayCell}>
                <Text style={[styles.weekdayText, isDarkMode && styles.secondaryTextOnDark]}>{weekday}</Text>
              </View>
            ))}
          </View>

          <View style={styles.datePickerGrid}>
            {calendarDays.map((day) => {
              const isSelected = day.dateIdentifier === selectedIdentifier;
              const isToday = day.dateIdentifier === todayIdentifier;
              const hasSavedSolution = savedSolutionDates.has(day.dateIdentifier);
              return (
                <Pressable
                  key={day.dateIdentifier}
                  style={({ pressed }) => [
                    styles.datePickerDay,
                    !day.isCurrentMonth && styles.datePickerDayOutside,
                    isToday && !isSelected && styles.datePickerDayToday,
                    isSelected && styles.datePickerDaySelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => chooseDate(day.date)}
                  accessibilityLabel={`${fullDateFormatter.format(day.date)}${hasSavedSolution ? ', saved solution' : ''}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[
                      styles.datePickerDayText,
                      isDarkMode && styles.datePickerDayTextOnDark,
                      isToday && !isSelected && styles.datePickerDayTextToday,
                      isSelected && styles.datePickerDayTextSelected,
                    ]}
                  >
                    {day.day}
                  </Text>
                  {hasSavedSolution ? <View style={styles.savedDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>Selected Puzzle</Text>
        <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>{currentPuzzle.displayDate}</Text>
        <Text style={[styles.muted, isDarkMode && styles.mutedOnDark]}>{currentPuzzle.dateIdentifier}</Text>
        <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={() => router.push('/')}>
          <Text style={styles.primaryButtonText}>Play Selected Date</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
