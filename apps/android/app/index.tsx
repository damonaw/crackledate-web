import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState, type ComponentProps } from 'react';
import { Image, Pressable, ScrollView, Text, ToastAndroid, View, useWindowDimensions, type ImageStyle } from 'react-native';
import {
  deleteAtSelection,
  equationText,
  firstUnusedDigitIndex,
  insertTokensAtSelection,
  moveSelectionHorizontally,
  nextAbsoluteDelimiterRole,
  normalizeEditorSelection,
  puzzleForDate,
  runningValues,
  validateEquation,
  type EditableEquationToken,
  type EditorSelection,
  type SlotPlacement,
} from '@crackledate/core';
import { useCrackleDate } from '../src/crackle-date-context';
import { NativeLatexEquation } from '../src/native-latex';
import { colors, darkColors, formatSeconds, operatorButtons, styles } from '../src/ui';

type EditorState = {
  tokens: EditableEquationToken[];
  selection: EditorSelection;
};

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

export default function GameScreen() {
  const {
    appVersion,
    difficulty,
    error,
    flushQueue,
    hasStarted,
    isDarkMode,
    loading,
    repository,
    selectedDate,
    setHasStarted,
    setTheme,
    solutionsByDate,
    refreshSolutions,
  } = useCrackleDate();
  const { height } = useWindowDimensions();
  const gameContentMinHeight = Math.max(0, height - 104);
  const [editor, setEditor] = useState<EditorState>({ tokens: [], selection: { kind: 'slot', index: 0 } });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const tokens = editor.tokens;
  const selection = useMemo(
    () => normalizeEditorSelection(editor.selection, editor.tokens.length),
    [editor.selection, editor.tokens.length],
  );
  const puzzle = useMemo(() => puzzleForDate(selectedDate), [selectedDate]);
  const equation = equationText(tokens);
  const todaySolutions = solutionsByDate[puzzle.dateIdentifier] ?? [];
  const nextDigitIndex = firstUnusedDigitIndex(tokens, puzzle.digits);
  const nextDigit = nextDigitIndex === null ? null : puzzle.digits[nextDigitIndex];
  const running = useMemo(() => runningValues(equation), [equation]);
  const usedDigitIndices = useMemo(
    () => new Set(tokens.flatMap((token) => (token.digitIndex === undefined ? [] : [token.digitIndex]))),
    [tokens],
  );
  const showHelperValues = difficulty === 'easy';

  function showToast(message: string, duration = ToastAndroid.SHORT) {
    ToastAndroid.show(message, duration);
  }

  function appendDigit() {
    if (nextDigit === null || nextDigitIndex === null) return;
    if (startedAt === null) setStartedAt(Date.now());
    setEditor((current) => {
      const next = insertTokensAtSelection(current.tokens, current.selection, [
        { value: String(nextDigit), digitIndex: nextDigitIndex },
      ]);
      return { tokens: next.tokens, selection: next.selection };
    });
  }

  function appendOperator(value: string) {
    if (startedAt === null) setStartedAt(Date.now());
    setEditor((current) => {
      const insertedToken =
        value === '|'
          ? { value, role: nextAbsoluteDelimiterRole(current.tokens, current.selection) }
          : { value };
      const next = insertTokensAtSelection(current.tokens, current.selection, [insertedToken]);
      return { tokens: next.tokens, selection: next.selection };
    });
  }

  function backspace() {
    setEditor((current) => {
      const next = deleteAtSelection(current.tokens, current.selection);
      return { tokens: next.tokens, selection: next.selection };
    });
  }

  function clear() {
    setEditor({ tokens: [], selection: { kind: 'slot', index: 0 } });
    setStartedAt(null);
  }

  function moveSelection(direction: -1 | 1) {
    setEditor((current) => ({
      ...current,
      selection: moveSelectionHorizontally(current.tokens.length, current.selection, direction),
    }));
  }

  function selectToken(index: number) {
    setEditor((current) => ({
      ...current,
      selection: normalizeEditorSelection({ kind: 'token', index }, current.tokens.length),
    }));
  }

  function selectSlot(index: number, placement?: SlotPlacement) {
    setEditor((current) => ({
      ...current,
      selection: normalizeEditorSelection(
        placement ? { kind: 'slot', index, placement } : { kind: 'slot', index },
        current.tokens.length,
      ),
    }));
  }

  async function submit() {
    if (!repository) {
      showToast('Local storage is not ready yet.');
      return;
    }
    const normalizedEquation = equation.trim();
    if (todaySolutions.some((solution) => solution.equation === normalizedEquation)) {
      showToast('Solution already saved for this date.');
      return;
    }
    const result = validateEquation(normalizedEquation, puzzle.digits);
    if (!result.valid) {
      showToast(result.errorMessage ?? 'That equation is not valid.', ToastAndroid.LONG);
      return;
    }
    const seconds = startedAt === null ? 0 : Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    await repository.saveSolvedPuzzle({
      date: puzzle.dateIdentifier,
      equation: normalizedEquation,
      value: result.leftValue ?? running.left,
      seconds,
      difficulty,
      appVersion,
      solvedAt: new Date().toISOString(),
    });
    await refreshSolutions();
    void flushQueue();
    setEditor({ tokens: [], selection: { kind: 'slot', index: 0 } });
    setStartedAt(null);
    showToast(`Solved in ${formatSeconds(seconds)}. Both sides equal ${result.leftValue}.`, ToastAndroid.LONG);
  }

  async function startPlaying() {
    await setHasStarted(true);
  }

  async function toggleTheme() {
    await setTheme(isDarkMode ? 'light' : 'dark');
  }

  const stackOptions = {
    headerShown: hasStarted,
    title: 'Crackle Date',
    headerTitleAlign: 'left' as const,
    headerRight: () => (
      <View style={styles.nativeHeaderActions}>
        <HeaderAction label="Archive" icon="calendar-today" isDarkMode={isDarkMode} onPress={() => router.push('/calendar')} />
        <HeaderAction label="Stats" icon="leaderboard" isDarkMode={isDarkMode} onPress={() => router.push('/solutions')} />
        <HeaderAction label="Settings" icon="settings" isDarkMode={isDarkMode} onPress={() => router.push('/settings')} />
        <HeaderAction
          label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
          icon={isDarkMode ? 'light-mode' : 'dark-mode'}
          isDarkMode={isDarkMode}
          onPress={() => {
            void toggleTheme();
          }}
        />
      </View>
    ),
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, title: 'Crackle Date' }} />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.startScreen, isDarkMode && styles.screenOnDark, { minHeight: height }]}
        >
          <StatusBar style={isDarkMode ? 'light' : 'dark'} />
          <Text style={[styles.muted, isDarkMode && styles.mutedOnDark]}>Loading local game data...</Text>
        </ScrollView>
      </>
    );
  }

  if (!hasStarted) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, title: 'Crackle Date' }} />
        <StartPage
          isDarkMode={isDarkMode}
          onPlay={startPlaying}
          onShowInstructions={() => router.push('/how-to-play')}
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={stackOptions} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.mobileGameScreen,
          isDarkMode && styles.mobileGameScreenOnDark,
          { minHeight: gameContentMinHeight },
        ]}
      >
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        {error ? <Text selectable style={styles.error}>{error}</Text> : null}

        <View style={styles.mobileGamePanel}>
          <View style={styles.expressionArea}>
            <Pressable
              style={({ pressed }) => [
                styles.equationBox,
                isDarkMode && styles.equationBoxDark,
                pressed && styles.pressed,
              ]}
              onPress={() => selectSlot(tokens.length)}
              accessibilityRole="button"
              accessibilityLabel="Equation input"
            >
              {equation ? (
                <NativeLatexEquation
                  tokens={tokens}
                  selection={selection}
                  isDarkMode={isDarkMode}
                  onSelectSlot={selectSlot}
                  onSelectToken={selectToken}
                />
              ) : (
                <View style={styles.emptyPrompt}>
                  <Text style={[styles.emptyEquationText, isDarkMode && styles.emptyEquationTextOnDark]}>
                    Not sure where to start, get some
                  </Text>
                  <Pressable
                    style={({ pressed }) => [styles.helpPill, pressed && styles.pressed]}
                    onPress={() => router.push('/how-to-play')}
                  >
                    <Text style={styles.helpPillText}>cracked instructions</Text>
                  </Pressable>
                </View>
              )}
            </Pressable>

            {showHelperValues ? (
              <View style={styles.mobileHelperRow}>
                <Text selectable style={[styles.helperValue, isDarkMode && styles.helperValueOnDark]} numberOfLines={1}>
                  <Text style={[styles.helperLabel, isDarkMode && styles.helperLabelOnDark]}>L </Text>
                  {running.left || '?'}
                </Text>
                <View style={styles.selectorArrowControls}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.selectorArrowButton,
                      isDarkMode && styles.selectorArrowButtonOnDark,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => moveSelection(-1)}
                    accessibilityLabel="Move selector left"
                  >
                    <Text style={[styles.selectorArrowText, isDarkMode && styles.selectorArrowTextOnDark]}>←</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.selectorArrowButton,
                      isDarkMode && styles.selectorArrowButtonOnDark,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => moveSelection(1)}
                    accessibilityLabel="Move selector right"
                  >
                    <Text style={[styles.selectorArrowText, isDarkMode && styles.selectorArrowTextOnDark]}>→</Text>
                  </Pressable>
                </View>
                <Text selectable style={[styles.helperValue, isDarkMode && styles.helperValueOnDark]} numberOfLines={1}>
                  <Text style={[styles.helperLabel, isDarkMode && styles.helperLabelOnDark]}>R </Text>
                  {running.right || '?'}
                </Text>
              </View>
            ) : (
              <View style={styles.selectorArrowControls}>
                <Pressable
                  style={({ pressed }) => [
                    styles.selectorArrowButton,
                    isDarkMode && styles.selectorArrowButtonOnDark,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => moveSelection(-1)}
                  accessibilityLabel="Move selector left"
                >
                  <Text style={[styles.selectorArrowText, isDarkMode && styles.selectorArrowTextOnDark]}>←</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.selectorArrowButton,
                    isDarkMode && styles.selectorArrowButtonOnDark,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => moveSelection(1)}
                  accessibilityLabel="Move selector right"
                >
                  <Text style={[styles.selectorArrowText, isDarkMode && styles.selectorArrowTextOnDark]}>→</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.controlArea}>
            <DigitRail
              digits={puzzle.digits}
              delimiterPositions={puzzle.delimiterPositions}
              usedDigitIndices={usedDigitIndices}
              activeIndex={nextDigitIndex}
              isDarkMode={isDarkMode}
              onActiveDigitClick={nextDigit !== null ? appendDigit : undefined}
            />

            <View style={styles.controlGrid}>
              {operatorButtons.map((operator) => (
                <Pressable
                  key={operator.value}
                  style={({ pressed }) => [
                    styles.controlButton,
                    isDarkMode && styles.controlButtonOnDark,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => appendOperator(operator.value)}
                >
                  <Text style={[styles.controlButtonText, isDarkMode && styles.controlButtonTextOnDark]}>
                    {operator.label}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={({ pressed }) => [styles.controlButton, styles.clearButton, pressed && styles.pressed]}
                onPress={clear}
              >
                <Text style={[styles.controlButtonText, styles.clearButtonText]}>C</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.controlButton, styles.backspaceButton, pressed && styles.pressed]}
                onPress={backspace}
                accessibilityLabel="Backspace"
              >
                <Text style={[styles.controlButtonText, styles.backspaceButtonText]}>⌫</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.controlButton,
                  isDarkMode && styles.controlButtonOnDark,
                  styles.wideButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => appendOperator('=')}
              >
                <Text style={[styles.controlButtonText, isDarkMode && styles.controlButtonTextOnDark]}>=</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.controlButton,
                  styles.wideButton,
                  styles.submitButton,
                  pressed && styles.pressed,
                ]}
                onPress={submit}
              >
                <Text style={styles.submitButtonText}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function HeaderAction({
  label,
  icon,
  isDarkMode,
  onPress,
}: {
  label: string;
  icon: MaterialIconName;
  isDarkMode: boolean;
  onPress: () => void;
}) {
  const iconColor = isDarkMode ? darkColors.label : colors.label;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.nativeHeaderAction,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <MaterialIcons name={icon} size={24} color={iconColor} />
    </Pressable>
  );
}

function StartPage({
  isDarkMode,
  onPlay,
  onShowInstructions,
}: {
  isDarkMode: boolean;
  onPlay: () => Promise<void>;
  onShowInstructions: () => void;
}) {
  const { height } = useWindowDimensions();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.startScreen, isDarkMode && styles.screenOnDark, { minHeight: height }]}
    >
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <View style={[styles.startCard, isDarkMode && styles.panelOnDark]}>
        <View style={styles.startCopy}>
          <Image source={require('../assets/adaptive-icon.png')} style={styles.startIcon as ImageStyle} />
          <Text style={[styles.startTitle, isDarkMode && styles.textOnDark]}>Crackle Date</Text>
          <Text style={[styles.startTagline, isDarkMode && styles.secondaryTextOnDark]}>
            Crack the date into equal values with Math!
          </Text>
        </View>

        <View style={styles.startActions}>
          <Pressable
            style={({ pressed }) => [
              styles.startActionButton,
              isDarkMode && styles.secondaryButtonOnDark,
              pressed && styles.pressed,
            ]}
            onPress={onShowInstructions}
          >
            <Text style={[styles.startActionText, isDarkMode && styles.textOnDark]}>How to Play</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.startActionButton, styles.playButton, pressed && styles.pressed]}
            onPress={() => {
              void onPlay();
            }}
          >
            <Text style={styles.playButtonText}>Play</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function DigitRail({
  digits,
  delimiterPositions,
  usedDigitIndices,
  activeIndex,
  isDarkMode,
  onActiveDigitClick,
}: {
  digits: number[];
  delimiterPositions: number[];
  usedDigitIndices: ReadonlySet<number>;
  activeIndex: number | null;
  isDarkMode: boolean;
  onActiveDigitClick?: () => void;
}) {
  const delimiters = useMemo(() => new Set(delimiterPositions), [delimiterPositions]);

  return (
    <View style={styles.digitRail} accessibilityLabel="Date digits">
      {digits.map((digit, index) => {
        const isActive = index === activeIndex;
        const isUsed = usedDigitIndices.has(index);
        const digitNode =
          isActive && onActiveDigitClick ? (
            <Pressable
              key={`digit-${digit}-${index}`}
              style={({ pressed }) => [
                styles.digitSlot,
                styles.activeDigit,
                pressed && styles.pressed,
              ]}
              onPress={onActiveDigitClick}
              accessibilityLabel={`Use current digit ${digit}`}
            >
              <Text style={[styles.digitText, styles.activeDigitText]}>{digit}</Text>
            </Pressable>
          ) : (
            <View
              key={`digit-${digit}-${index}`}
              style={[styles.digitSlot, isUsed && styles.usedDigit]}
            >
              <Text style={[styles.digitText, isDarkMode && styles.digitTextOnDark]}>{digit}</Text>
            </View>
          );

        return (
          <View key={`${digit}-${index}`} style={styles.digitRailGroup}>
            {digitNode}
            {delimiters.has(index) ? <Text style={[styles.delimiter, isDarkMode && styles.delimiterOnDark]}>/</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
