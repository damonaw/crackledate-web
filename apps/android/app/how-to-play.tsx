import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageStyle } from 'react-native';
import { useCrackleDate } from '../src/crackle-date-context';
import { HOW_TO_PLAY_DETAIL_CARDS, HOW_TO_PLAY_SECTIONS } from '../src/how-to-play-content';
import { styles } from '../src/ui';

export default function HowToPlayScreen() {
  const { isDarkMode, setHasStarted } = useCrackleDate();
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [detailIndex, setDetailIndex] = useState(0);
  const detailCard = HOW_TO_PLAY_DETAIL_CARDS[detailIndex];

  function previousCard() {
    setDetailIndex((current) => (current - 1 + HOW_TO_PLAY_DETAIL_CARDS.length) % HOW_TO_PLAY_DETAIL_CARDS.length);
  }

  function nextCard() {
    setDetailIndex((current) => (current + 1) % HOW_TO_PLAY_DETAIL_CARDS.length);
  }

  async function play() {
    await setHasStarted(true);
    router.replace('/');
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.screen, isDarkMode && styles.screenOnDark]}>
      <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.documentKicker}>Crackle Date</Text>
            <Text style={[styles.detailTitle, isDarkMode && styles.textOnDark]}>
              {showQuickGuide ? 'How to Play' : 'Cracked Instructions'}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              isDarkMode && styles.secondaryButtonOnDark,
              pressed && styles.pressed,
            ]}
            onPress={() => setShowQuickGuide((current) => !current)}
          >
            <Text style={[styles.secondaryButtonText, isDarkMode && styles.textOnDark]}>
              {showQuickGuide ? 'Cracked Instructions' : 'Quick Guide'}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, styles.playButton, pressed && styles.pressed]}
            onPress={() => void play()}
          >
            <Text style={styles.playButtonText}>Play</Text>
          </Pressable>
        </View>
      </View>

      {showQuickGuide ? (
        <View style={[styles.panel, isDarkMode && styles.panelOnDark]}>
          {HOW_TO_PLAY_SECTIONS.map((section) => (
            <View key={section.title} style={[styles.instructionStep, isDarkMode && styles.instructionStepOnDark]}>
              <Text style={[styles.listTitle, isDarkMode && styles.textOnDark]}>{section.title}</Text>
              {section.items.map((item) => (
                <Text key={item} style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>
                  {'\u2022'} {item}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <>
          <View style={[styles.instructionCard, isDarkMode && styles.panelOnDark]}>
            <Image
              source={detailCard.imageSource}
              style={styles.instructionImage as ImageStyle}
              resizeMode="contain"
              accessibilityLabel={detailCard.imageAlt}
            />
            <View style={styles.instructionNote}>
              <Text style={[styles.documentMeta, isDarkMode && styles.documentMetaOnDark]}>
                {detailIndex + 1} of {HOW_TO_PLAY_DETAIL_CARDS.length}
              </Text>
              <Text style={[styles.sectionTitle, isDarkMode && styles.textOnDark]}>{detailCard.title}</Text>
              <Text style={[styles.body, isDarkMode && styles.secondaryTextOnDark]}>{detailCard.note}</Text>
            </View>
          </View>

          <View style={styles.instructionControls} accessibilityLabel="Detailed instruction controls">
            <Pressable
              style={({ pressed }) => [
                styles.selectorArrowButton,
                isDarkMode && styles.selectorArrowButtonOnDark,
                pressed && styles.pressed,
              ]}
              onPress={previousCard}
              accessibilityLabel="Previous instruction card"
            >
              <Text style={[styles.selectorArrowText, isDarkMode && styles.selectorArrowTextOnDark]}>←</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.selectorArrowButton,
                isDarkMode && styles.selectorArrowButtonOnDark,
                pressed && styles.pressed,
              ]}
              onPress={nextCard}
              accessibilityLabel="Next instruction card"
            >
              <Text style={[styles.selectorArrowText, isDarkMode && styles.selectorArrowTextOnDark]}>→</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}
