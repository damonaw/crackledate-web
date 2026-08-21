import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  deleteAtSelection,
  insertTokensAtSelection,
  nextAbsoluteDelimiterRole,
  normalizeEditorSelection,
  moveSelectionHorizontally,
  type EditorSelection,
  type SlotPlacement,
} from './equationEditing';
import { EquationEmptyState } from './EquationEmptyState';
import { EquationHelperRow } from './EquationHelperRow';
import type { SelectorDirection } from './EquationSelectorControls';
import { shouldSurfaceEvaluationError } from './editorFeedback';
import { feedbackMessageAfterPuzzleLoad } from './feedbackRetention';
import { HOW_TO_PLAY_SECTIONS } from './howToPlayContent';
import { requestValidation } from './validationRequest';
import {
  ValidationRequestCoordinator,
  sameValidationRequestIdentity,
  type ValidationRequestCompletion,
  type ValidationRequestIdentity,
} from './validationRequestCoordinator';
import { equationToLatex, equationTokensToLatex, type EquationLatexToken } from './mathLatexFormatter';
import { statusToastDismissMs } from './notificationTiming';
import { practiceCompletionTarget } from './practiceCompletion';
import { practiceRound, practiceSuccessMessage } from './practiceRound';
import { RULES_SECTIONS } from './rulesContent';
import {
  persistSavedSolutions,
  savedSolutionDateSet,
  savedSolutionsStorageKey,
  solutionStorageError,
} from './savedSolutionDates';
import { SettingsPanel } from './SettingsPanel';
import { StartScreen } from './StartScreen';
import {
  dailyDashboardSummaryFromSolutions,
  monthProgressText,
  solutionCountText,
  streakDescription,
  streakValue,
  successMessage,
  type DailyDashboardSummary,
} from './dailyDashboard';
import {
  savedSolutionSharePayload,
  spoilerFreeDailySharePayload,
} from './sharePayloads';
import { GuidedTutorial } from './GuidedTutorial';
import {
  advanceOnboardingTransition,
  canApplyPracticeValidation,
  capturePracticeValidation,
  clearOnboardingStorage,
  createOnboardingTransitionState,
  difficultyModeStorageKey,
  FirstRunOnboardingPhase,
  homeDestinationForPhase,
  isRequiredOnboardingPractice,
  launchDestinationForPhase,
  loadWebOnboardingBootstrap,
  onboardingStorageError,
  phaseAfterPracticeSuccess,
  playDestinationForPhase,
  persistOnboardingPhase,
  persistWebPreference,
  practiceEntryForPhase,
  resetOnboardingPhase,
  themePreferenceStorageKey,
  type DifficultyMode,
  type ThemePreference,
} from './firstRunOnboarding';
import {
  guidedPracticeGlowKey,
  guidedPracticeStepForTokens,
} from './guidedPractice';
import { dateAccessDecisionFor } from './dateAccessPolicy';
import { averageTimeForSolutions } from './calendarHistory';
import './styles.css';

type Puzzle = {
  dateIdentifier: string;
  displayDate: string;
  formattedDate: string;
  digits: number[];
  delimiterPositions: number[];
};

type EvaluationResponse = {
  left: string;
  middle?: string;
  right: string;
  errorMessage?: string;
};

type EvaluationState = EvaluationResponse & {
  equation: string;
};

type SavedSolution = {
  equation: string;
  timestamp: string;
  seconds: number;
  value: string;
  solvedOnOtherDay?: boolean;
  difficulty?: 'easy' | 'hard';
};

type StoredSolutions = Record<string, SavedSolution[]>;
type FeedbackTone = 'success' | 'error';
type ActiveView = 'start' | 'game' | 'practice' | 'calendar' | 'settings' | 'howToPlay' | 'rules';

type EquationToken = EquationLatexToken & {
  id: string;
  digitIndex?: number;
};

type EquationEditorState = {
  tokens: EquationToken[];
  selection: EditorSelection;
};

type SelectorMoveHandler = (direction: SelectorDirection) => void;

type ValueSegment = {
  text: string;
  isRepeating: boolean;
};

type CalendarDay = {
  date: Date;
  dateIdentifier: string;
  day: number;
  isCurrentMonth: boolean;
};

const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

const operators = [
  ['+', '+'],
  ['−', '-'],
  ['×', '×'],
  ['÷', '÷'],
  ['xʸ', '^'],
  ['√', '√'],
  ['!', '!'],
  ['|', '|'],
  ['(', '('],
  [')', ')'],
];

const keyboardInsertableOperators: Record<string, string> = {
  '+': '+',
  '-': '-',
  '*': '×',
  '×': '×',
  '/': '÷',
  '÷': '÷',
  '^': '^',
  '!': '!',
  '(': '(',
  ')': ')',
  '|': '|',
  '=': '=',
  s: '√',
  S: '√',
  r: '√',
  R: '√',
};

function Confetti() {
  const particles = useMemo(() => {
    const colors = ['#ff3b30', '#ff9500', '#34c759', '#007aff', '#af52de', '#ffcc00'];
    return Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[i % colors.length],
      size: Math.random() * 8 + 6,
      delay: Math.random() * 1.5,
      duration: Math.random() * 2 + 2,
      drift: Math.random() * 40 - 20,
    }));
  }, []);

  return (
    <div className="confetti-container" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.x}%`,
            backgroundColor: p.color,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--drift': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

async function shareTextWithBrowser(text: string): Promise<'shared' | 'copied'> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  }

  await navigator.clipboard.writeText(text);
  return 'copied';
}

function calculateStreaks(savedSolutions: StoredSolutions) {
  const solvedDates = Object.keys(savedSolutions)
    .filter((dateStr) => savedSolutions[dateStr] && savedSolutions[dateStr]!.length > 0)
    .map((dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!y || !m || !d) return 0;
      return Math.floor(Date.UTC(y, m - 1, d) / (24 * 60 * 60 * 1000));
    })
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (solvedDates.length === 0) {
    return { currentStreak: 0, maxStreak: 0 };
  }

  const today = new Date();
  const todayNum = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / (24 * 60 * 60 * 1000));

  let maxStreak = 0;
  let currentStreak = 0;
  let runningStreak = 0;
  let prevDay = -999;

  for (const day of solvedDates) {
    if (day === prevDay + 1) {
      runningStreak++;
    } else if (day !== prevDay) {
      runningStreak = 1;
    }
    if (runningStreak > maxStreak) {
      maxStreak = runningStreak;
    }
    prevDay = day;
  }

  const lastSolvedDay = solvedDates[solvedDates.length - 1]!;
  if (lastSolvedDay === todayNum || lastSolvedDay === todayNum - 1) {
    currentStreak = 0;
    let expected = lastSolvedDay;
    for (let idx = solvedDates.length - 1; idx >= 0; idx--) {
      const day = solvedDates[idx]!;
      if (day === expected) {
        currentStreak++;
        expected--;
      } else if (day < expected) {
        break;
      }
    }
  } else {
    currentStreak = 0;
  }

  return { currentStreak, maxStreak };
}

function StatsDashboard({ savedSolutions }: { savedSolutions: StoredSolutions }) {
  const { currentStreak, maxStreak } = useMemo(() => calculateStreaks(savedSolutions), [savedSolutions]);
  const { totalSolved, avgTime } = useMemo(() => {
    const dates = Object.keys(savedSolutions).filter((dateStr) => savedSolutions[dateStr] && savedSolutions[dateStr]!.length > 0);
    const allSeconds = Object.values(savedSolutions)
      .flat()
      .map((s) => s.seconds)
      .filter((s) => s > 0);
    const avg = allSeconds.length > 0 ? Math.round(allSeconds.reduce((a, b) => a + b, 0) / allSeconds.length) : 0;
    return {
      totalSolved: dates.length,
      avgTime: avg,
    };
  }, [savedSolutions]);

  return (
    <section className="stats-dashboard" aria-labelledby="dashboard-title">
      <h2 id="dashboard-title" className="sr-only">Dashboard Stats</h2>
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <span className="dashboard-val">{totalSolved}</span>
          <span className="dashboard-label">Played</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-val">{currentStreak}</span>
          <span className="dashboard-label">Streak</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-val">{maxStreak}</span>
          <span className="dashboard-label">Max Streak</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-val">{formatTime(avgTime)}</span>
          <span className="dashboard-label">Avg Time</span>
        </div>
      </div>
    </section>
  );
}

const emptyDigitIndices = new Set<number>();

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/privacy') {
    return <PrivacyPage />;
  }
  if (path === '/support') {
    return <SupportPage />;
  }
  return <GamePage />;
}

function GamePage() {
  const [onboardingBootstrap] = useState(loadWebOnboardingBootstrap);
  const [onboardingPhase, setOnboardingPhase] =
    useState(onboardingBootstrap.phase);
  const [activeView, setActiveView] = useState<ActiveView>(
    () => launchDestinationForPhase(onboardingBootstrap.phase),
  );
  const [selectedDate, setSelectedDate] = useState(localDateIdentifier(new Date()));
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [editorState, setEditorState] = useState<EquationEditorState>(emptyEditorState);
  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;
  const [evaluation, setEvaluation] = useState<EvaluationState>({ left: '?', middle: '', right: '?', equation: '' });
  const [shakeActive, setShakeActive] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);
  const [message, setMessage] = useState(onboardingBootstrap.errorMessage);
  const [messageTone, setMessageTone] = useState<FeedbackTone>(
    onboardingBootstrap.errorMessage ? 'error' : 'success',
  );
  const [startTime, setStartTime] = useState<number | null>(null);
  const [savedSolutions, setSavedSolutions] = useState<StoredSolutions>(loadSolutions);
  const savedSolutionsRef = useRef(savedSolutions);
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(onboardingBootstrap.themePreference);
  const [difficultyMode, setDifficultyMode] =
    useState<DifficultyMode>(onboardingBootstrap.difficultyMode);
  const [clearDataConfirmVisible, setClearDataConfirmVisible] = useState(false);
  const selectorMoveRef = useRef<SelectorMoveHandler | null>(null);
  const autocompleteIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preserveFeedbackOnNextPuzzleLoadRef = useRef(false);
  const onboardingTransitionRef = useRef(
    createOnboardingTransitionState(onboardingBootstrap.phase),
  );
  const validationRequestCoordinatorRef = useRef<ValidationRequestCoordinator | null>(null);
  const validationCompletionHandlerRef = useRef<(completion: ValidationRequestCompletion) => void>(
    () => undefined,
  );
  const validationIdentityRef = useRef<ValidationRequestIdentity | null>(null);
  const [isAutocompleting, setIsAutocompleting] = useState(false);
  const [isSearchingAnother, setIsSearchingAnother] = useState(false);
  const todayId = useMemo(() => localDateIdentifier(new Date()), []);
  const tomorrowId = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return localDateIdentifier(tomorrow);
  }, []);
  const isPracticeMode = activeView === 'practice';
  const requiredOnboardingPractice = isRequiredOnboardingPractice({
    phase: onboardingPhase,
    activeView,
  });
  const onboardingCompleted =
    onboardingPhase === FirstRunOnboardingPhase.Completed;
  const puzzleDateIdentifier = isPracticeMode ? practiceRound.dateIdentifier : selectedDate;

  const { tokens, selection } = editorState;
  const equation = useMemo(() => tokensToEquation(tokens), [tokens]);
  const loadedPuzzleDate = puzzle?.dateIdentifier ?? '';
  const currentValidationIdentity: ValidationRequestIdentity = {
    activeView,
    puzzleDate: puzzleDateIdentifier,
    playMode: isPracticeMode ? 'practice' : 'daily',
    equation: equation.trim(),
    onboardingPhase,
    onboardingGeneration: onboardingTransitionRef.current.revision,
  };
  validationIdentityRef.current = currentValidationIdentity;
  const usedDigitIndices = useMemo(() => digitIndicesInUse(tokens), [tokens]);
  const unusedDigits = useMemo(() => {
    if (!puzzle) return [];
    return puzzle.digits.filter((_, idx) => !usedDigitIndices.has(idx));
  }, [puzzle, usedDigitIndices]);
  const isEquationCorrect = useMemo(() => {
    if (!puzzle) return false;
    const allDigitsUsed = usedDigitIndices.size === puzzle.digits.length;
    if (!allDigitsUsed) return false;
    if (evaluation.errorMessage) return false;

    const eqParts = equation.split('=');
    return (
      eqParts.length === 2 &&
      evaluation.left !== '?' &&
      evaluation.left === evaluation.right
    );
  }, [puzzle, usedDigitIndices, evaluation, equation]);
  const nextDigitIndex = useMemo(
    () => (puzzle ? firstUnusedDigitIndex(tokens, puzzle.digits) : null),
    [puzzle, tokens],
  );
  const guidedPracticeStep = useMemo(
    () => (isPracticeMode ? guidedPracticeStepForTokens(tokens) : null),
    [isPracticeMode, tokens],
  );
  const todaySolutions = puzzle && !isPracticeMode ? savedSolutions[puzzle.dateIdentifier] ?? [] : [];
  const savedSolutionDates = useMemo(() => savedSolutionDateSet(savedSolutions), [savedSolutions]);
  const dailyDashboardSummary = useMemo(() => {
    if (!puzzle || isPracticeMode) return null;
    return dailyDashboardSummaryFromSolutions({
      dateIdentifier: puzzle.dateIdentifier,
      displayDate: puzzle.displayDate,
      todayIdentifier: todayId,
      savedSolutions,
    });
  }, [isPracticeMode, puzzle, savedSolutions, todayId]);
  const nextDigit = puzzle && nextDigitIndex !== null ? puzzle.digits[nextDigitIndex] : null;
  const isEasyMode = difficultyMode === 'easy';
  const activeGlowKey = guidedPracticeGlowKey(guidedPracticeStep);

  const cancelValidationRequests = useCallback(() => {
    validationRequestCoordinatorRef.current?.invalidate();
    setValidationLoading(false);
  }, []);

  const navigateTo = useCallback((destination: ActiveView) => {
    cancelValidationRequests();
    if (validationIdentityRef.current) {
      validationIdentityRef.current = {
        ...validationIdentityRef.current,
        activeView: destination,
        playMode: destination === 'practice' ? 'practice' : 'daily',
        ...(destination === 'practice'
          ? { puzzleDate: practiceRound.dateIdentifier }
          : {}),
      };
    }
    setActiveView(destination);
  }, [cancelValidationRequests]);

  const selectPuzzleDate = useCallback((dateIdentifier: string) => {
    cancelValidationRequests();
    if (validationIdentityRef.current) {
      validationIdentityRef.current = {
        ...validationIdentityRef.current,
        puzzleDate: dateIdentifier,
      };
    }
    setSelectedDate(dateIdentifier);
  }, [cancelValidationRequests]);

  const transitionOnboardingPhase = useCallback(
    (phase: FirstRunOnboardingPhase) => {
      cancelValidationRequests();
      onboardingTransitionRef.current = advanceOnboardingTransition(
        onboardingTransitionRef.current,
        phase,
      );
      if (validationIdentityRef.current) {
        validationIdentityRef.current = {
          ...validationIdentityRef.current,
          onboardingPhase: phase,
          onboardingGeneration: onboardingTransitionRef.current.revision,
        };
      }
      setOnboardingPhase(phase);
    },
    [cancelValidationRequests],
  );

  const recoverFromOnboardingStorageFailure = useCallback(() => {
    transitionOnboardingPhase(FirstRunOnboardingPhase.NotStarted);
    navigateTo('start');
    setMessageTone('error');
    setMessage(onboardingStorageError);
  }, [navigateTo, transitionOnboardingPhase]);

  useEffect(() => {
    if (themePreference === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.dataset.theme = themePreference;
    }
    if (!persistWebPreference(themePreferenceStorageKey, themePreference)) {
      recoverFromOnboardingStorageFailure();
    }
  }, [recoverFromOnboardingStorageFailure, themePreference]);

  useEffect(() => {
    if (!persistWebPreference(difficultyModeStorageKey, difficultyMode)) {
      recoverFromOnboardingStorageFailure();
    }
  }, [difficultyMode, recoverFromOnboardingStorageFailure]);

  useEffect(() => {
    cancelValidationRequests();
    let isCurrent = true;
    fetch(`/api/puzzle?date=${puzzleDateIdentifier}`)
      .then((response) => response.json() as Promise<Puzzle>)
      .then((nextPuzzle) => {
        if (!isCurrent) return;
        if (autocompleteIntervalRef.current) {
          clearInterval(autocompleteIntervalRef.current);
          autocompleteIntervalRef.current = null;
        }
        setPuzzle(nextPuzzle);
        setEditorState(emptyEditorState());
        setEvaluation({ left: '?', middle: '', right: '?', equation: '' });
        const preserveCurrentMessage = preserveFeedbackOnNextPuzzleLoadRef.current;
        preserveFeedbackOnNextPuzzleLoadRef.current = false;
        setMessage((currentMessage) => feedbackMessageAfterPuzzleLoad(
          currentMessage,
          preserveCurrentMessage,
          onboardingStorageError,
        ));
        setStartTime(null);
        setConfettiActive(false);
      })
      .catch(() => {
        preserveFeedbackOnNextPuzzleLoadRef.current = false;
        setMessageTone('error');
        setMessage('Could not load the puzzle date.');
      });
    return () => {
      isCurrent = false;
      if (autocompleteIntervalRef.current) {
        clearInterval(autocompleteIntervalRef.current);
        autocompleteIntervalRef.current = null;
      }
    };
  }, [cancelValidationRequests, puzzleDateIdentifier]);

  useEffect(() => {
    return () => cancelValidationRequests();
  }, [
    activeView,
    cancelValidationRequests,
    equation,
    onboardingPhase,
    puzzleDateIdentifier,
  ]);

  useEffect(() => {
    return () => {
      if (autocompleteIntervalRef.current) {
        clearInterval(autocompleteIntervalRef.current);
        autocompleteIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setIsSearchingAnother(false);
  }, [selectedDate]);

  const shareSolutionText = useCallback((solution: SavedSolution) => {
    const text = savedSolutionSharePayload(puzzle?.displayDate || dateDisplayString(selectedDate), solution);

    void shareTextWithBrowser(text)
      .then((result) => {
        setMessageTone('success');
        if (result === 'shared') {
          setMessage('Shared!');
        } else {
          setMessage('Copied to clipboard!');
        }
      })
      .catch(() => {
        setMessageTone('error');
        setMessage('Failed to share or copy.');
      });
  }, [puzzle, selectedDate]);

  const shareDailyResults = useCallback(() => {
    if (!dailyDashboardSummary) return;
    const text = spoilerFreeDailySharePayload(dailyDashboardSummary);

    void shareTextWithBrowser(text)
      .then((result) => {
        setMessageTone('success');
        if (result === 'shared') {
          setMessage('Shared!');
        } else {
          setMessage('Copied to clipboard!');
        }
      })
      .catch(() => {
        setMessageTone('error');
        setMessage('Failed to share or copy.');
      });
  }, [dailyDashboardSummary]);

  const handleUnlockTomorrow = useCallback(() => {
    selectPuzzleDate(tomorrowId);
  }, [selectPuzzleDate, tomorrowId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: puzzleDateIdentifier, equation }),
      signal: controller.signal,
    })
      .then((response) => response.json() as Promise<EvaluationResponse>)
      .then((response) => setEvaluation({ ...response, equation }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setEvaluation({ left: '?', middle: '', right: '?', equation });
        }
      });
    return () => controller.abort();
  }, [equation, puzzleDateIdentifier]);

  const applyEditorEdit = useCallback(
    (
      edit: (
        tokens: EquationToken[],
        selection: EditorSelection,
      ) => { tokens: EquationToken[]; selection: EditorSelection },
    ) => {
      const currentEditorState = editorStateRef.current;
      const editedEditorState = edit(
        currentEditorState.tokens,
        currentEditorState.selection,
      );
      const nextEditorState = {
        tokens: editedEditorState.tokens,
        selection: normalizeEditorSelection(
          editedEditorState.selection,
          editedEditorState.tokens.length,
        ),
      };

      if (
        currentEditorState.tokens === nextEditorState.tokens
        && currentEditorState.selection === nextEditorState.selection
      ) return;
      const currentEquation = tokensToEquation(currentEditorState.tokens).trim();
      const nextEquation = tokensToEquation(nextEditorState.tokens).trim();
      if (currentEquation !== nextEquation) {
        cancelValidationRequests();
        if (validationIdentityRef.current) {
          validationIdentityRef.current = {
            ...validationIdentityRef.current,
            equation: nextEquation,
          };
        }
      }
      if (autocompleteIntervalRef.current) {
        clearInterval(autocompleteIntervalRef.current);
        autocompleteIntervalRef.current = null;
        setIsAutocompleting(false);
      }
      editorStateRef.current = nextEditorState;
      setEditorState(nextEditorState);
      setMessage('');
    },
    [cancelValidationRequests],
  );

  const insertText = useCallback(
    (value: string) => {
      if (!startTime) {
        setStartTime(Date.now());
      }
      applyEditorEdit((currentTokens, currentSelection) =>
        insertTokensAtSelection(currentTokens, currentSelection, [createOperatorToken(value)]),
      );
    },
    [applyEditorEdit, startTime],
  );

  const insertAbsoluteDelimiter = useCallback(
    () => {
      if (!startTime) {
        setStartTime(Date.now());
      }
      applyEditorEdit((currentTokens, currentSelection) => {
        const role = nextAbsoluteDelimiterRole(currentTokens, currentSelection);
        return insertTokensAtSelection(currentTokens, currentSelection, [createOperatorToken('|', role)]);
      });
    },
    [applyEditorEdit, startTime],
  );

  const insertClosingDelimiter = useCallback(
    (closeValue: string) => {
      if (!startTime) {
        setStartTime(Date.now());
      }
      applyEditorEdit((currentTokens, currentSelection) => {
        if (currentSelection.kind === 'slot' && currentTokens[currentSelection.index]?.value === closeValue) {
          return {
            tokens: currentTokens,
            selection: { kind: 'slot', index: currentSelection.index + 1 },
          };
        }

        return insertTokensAtSelection(currentTokens, currentSelection, [createOperatorToken(closeValue)]);
      });
    },
    [applyEditorEdit, startTime],
  );

  const insertOperator = useCallback(
    (value: string) => {
      if (value === '|') {
        insertAbsoluteDelimiter();
        return;
      }
      if (value === '(') {
        insertText('(');
        return;
      }
      if (value === ')') {
        insertClosingDelimiter(')');
        return;
      }
      insertText(value);
    },
    [insertAbsoluteDelimiter, insertClosingDelimiter, insertText],
  );

  const appendDigit = useCallback(() => {
    if (nextDigit === null || nextDigitIndex === null) return;
    if (!startTime) {
      setStartTime(Date.now());
    }
    applyEditorEdit((currentTokens, currentSelection) =>
      insertTokensAtSelection(currentTokens, currentSelection, [createDigitToken(nextDigit, nextDigitIndex)]),
    );
  }, [applyEditorEdit, nextDigit, nextDigitIndex, startTime]);

  const backspace = useCallback(() => {
    applyEditorEdit((currentTokens, currentSelection) => deleteAtSelection(currentTokens, currentSelection));
  }, [applyEditorEdit]);

  const clear = useCallback(() => {
    cancelValidationRequests();
    if (autocompleteIntervalRef.current) {
      clearInterval(autocompleteIntervalRef.current);
      autocompleteIntervalRef.current = null;
    }
    setEditorState(emptyEditorState());
    if (validationIdentityRef.current) {
      validationIdentityRef.current = {
        ...validationIdentityRef.current,
        equation: '',
      };
    }
    setEvaluation({ left: '?', middle: '', right: '?', equation: '' });
    setMessage('');
    setStartTime(null);
  }, [cancelValidationRequests]);

  const enterPractice = useCallback(() => {
    const entry = practiceEntryForPhase(onboardingPhase);
    if (entry.phase !== onboardingPhase &&
        !persistOnboardingPhase(entry.phase)) {
      setMessageTone('error');
      setMessage(onboardingStorageError);
      return;
    }
    clear();
    transitionOnboardingPhase(entry.phase);
    navigateTo(entry.destination);
    setMessage('');
  }, [clear, navigateTo, onboardingPhase, transitionOnboardingPhase]);

  const moveSelectorFromControls = useCallback((direction: SelectorDirection) => {
    selectorMoveRef.current?.(direction);
  }, []);

  validationCompletionHandlerRef.current = ({ identity, result }) => {
    const currentIdentity = validationIdentityRef.current;
    if (!currentIdentity ||
        !sameValidationRequestIdentity(identity, currentIdentity) ||
        loadedPuzzleDate !== identity.puzzleDate) {
      return;
    }

    const practiceValidationTicket = identity.playMode === 'practice'
      ? capturePracticeValidation({
          phase: identity.onboardingPhase as FirstRunOnboardingPhase,
          revision: identity.onboardingGeneration,
        })
      : null;
    if (practiceValidationTicket &&
        !canApplyPracticeValidation(
          practiceValidationTicket,
          onboardingTransitionRef.current,
        )) {
      return;
    }

    if (result.kind === 'invalid_equation') {
      setMessageTone('error');
      setMessage(result.errorMessage ?? 'That equation is not valid.');
      setShakeActive(true);
      setTimeout(() => setShakeActive(false), 500);
      return;
    }
    if (result.kind === 'bad_request') {
      setMessageTone('error');
      setMessage('The check request was not accepted. Please review the equation and puzzle date, then try again.');
      setShakeActive(true);
      setTimeout(() => setShakeActive(false), 500);
      return;
    }
    if (result.kind === 'rate_limited') {
      setMessageTone('error');
      setMessage('Too many checks at once. Please wait a moment and try again.');
      return;
    }
    if (result.kind === 'temporary') {
      setMessageTone('error');
      setMessage('Could not check this equation right now. Your equation is still here—try again.');
      return;
    }
    if (result.kind !== 'valid') return;

    if (isPracticeMode) {
      const nextOnboardingPhase = phaseAfterPracticeSuccess(onboardingPhase);
      if (nextOnboardingPhase !== onboardingPhase &&
          !persistOnboardingPhase(FirstRunOnboardingPhase.Completed, true)) {
        setMessageTone('error');
        setMessage(onboardingStorageError);
        return;
      }
      clear();
      setMessageTone('success');
      setMessage(practiceSuccessMessage(result.leftValue ?? evaluation.left));
      preserveFeedbackOnNextPuzzleLoadRef.current = true;
      const destination = practiceCompletionTarget(todayId);
      transitionOnboardingPhase(nextOnboardingPhase);
      selectPuzzleDate(destination.selectedDate);
      navigateTo(destination.activeView);
      return;
    }

    const seconds = startTime ? Math.max(1, Math.round((Date.now() - startTime) / 1000)) : 0;
    const solvedTodayIdentifier = localDateIdentifier(new Date());
    const solvedOnOtherDay = solvedTodayIdentifier !== identity.puzzleDate;
    const solution: SavedSolution = {
      equation: identity.equation,
      timestamp: new Date().toISOString(),
      seconds,
      value: result.leftValue ?? evaluation.left,
      difficulty: difficultyMode,
      solvedOnOtherDay,
    };
    const currentSavedSolutions = savedSolutionsRef.current;
    const nextSavedSolutions = {
      ...currentSavedSolutions,
      [identity.puzzleDate]: [
        ...(currentSavedSolutions[identity.puzzleDate] ?? []),
        solution,
      ],
    };
    if (!persistSavedSolutions(nextSavedSolutions)) {
      setMessageTone('error');
      setMessage(solutionStorageError);
      return;
    }
    savedSolutionsRef.current = nextSavedSolutions;
    setSavedSolutions(nextSavedSolutions);
    setIsSearchingAnother(false);
    setMessageTone('success');
    setMessage(`Solved. Both sides equal ${solution.value}.`);
    setConfettiActive(true);
    setTimeout(() => setConfettiActive(false), 4000);
  };

  if (!validationRequestCoordinatorRef.current) {
    validationRequestCoordinatorRef.current = new ValidationRequestCoordinator({
      request: (identity, signal) => requestValidation({
        date: identity.puzzleDate,
        equation: identity.equation,
      }, signal),
      onStart: () => setValidationLoading(true),
      onResult: (completion) => validationCompletionHandlerRef.current(completion),
      onFinish: () => setValidationLoading(false),
    });
  }

  const submit = useCallback(() => {
    const identity = validationIdentityRef.current;
    if (!identity || loadedPuzzleDate !== identity.puzzleDate) return;
    if (identity.playMode === 'daily' &&
        (savedSolutionsRef.current[identity.puzzleDate] ?? [])
          .some((solution) => solution.equation === identity.equation)) {
      setMessageTone('error');
      setMessage('Solution already saved for this date.');
      return;
    }

    setMessage('');
    validationRequestCoordinatorRef.current?.submit(identity);
  }, [loadedPuzzleDate]);

  const shareSolution = useCallback((sol: SavedSolution, dateId: string) => {
    const text = savedSolutionSharePayload(dateDisplayString(dateId), sol);
    void shareTextWithBrowser(text)
      .then((result) => {
        setMessageTone('success');
        if (result === 'shared') {
          setMessage('Shared!');
        } else {
          setMessage('Copied to clipboard!');
        }
      })
      .catch(() => {
        setMessageTone('error');
        setMessage('Failed to share or copy.');
      });
  }, []);

  const dateInputLabel = useMemo(() => {
    if (!puzzle) return 'Puzzle date';
    return `Puzzle date, currently ${puzzle.displayDate}`;
  }, [puzzle]);

  const toggleThemePreference = useCallback(() => {
    setThemePreference((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const playPuzzle = useCallback(() => {
    const destination = playDestinationForPhase(onboardingPhase);
    if (destination === 'practice') {
      enterPractice();
      return;
    }
    navigateTo(destination === 'guided_first_win' ? 'game' : destination);
  }, [enterPractice, navigateTo, onboardingPhase]);

  const showSettingsPage = useCallback(() => {
    navigateTo('settings');
  }, [navigateTo]);

  const showHowToPlay = useCallback(() => {
    navigateTo('howToPlay');
  }, [navigateTo]);

  const clearBrowserData = useCallback(() => {
    cancelValidationRequests();
    try {
      localStorage.removeItem(savedSolutionsStorageKey);
      localStorage.removeItem(themePreferenceStorageKey);
      localStorage.removeItem(difficultyModeStorageKey);
    } catch {
      setClearDataConfirmVisible(false);
      setMessageTone('error');
      setMessage(onboardingStorageError);
      return;
    }
    if (!clearOnboardingStorage()) {
      setClearDataConfirmVisible(false);
      setMessageTone('error');
      setMessage(onboardingStorageError);
      return;
    }
    savedSolutionsRef.current = {};
    setSavedSolutions({});
    transitionOnboardingPhase(resetOnboardingPhase());
    setThemePreference('light');
    setDifficultyMode('easy');
    setEditorState(emptyEditorState());
    setEvaluation({ left: '?', right: '?', equation: '' });
    setStartTime(null);
    navigateTo('start');
    setClearDataConfirmVisible(false);
    setMessageTone('success');
    setMessage('Local data cleared.');
  }, [cancelValidationRequests, navigateTo, transitionOnboardingPhase]);

  const showCalendar = useCallback(() => {
    navigateTo('calendar');
  }, [navigateTo]);

  const showGame = useCallback(() => {
    cancelValidationRequests();
    setActiveView(homeDestinationForPhase(onboardingPhase));
  }, [cancelValidationRequests, onboardingPhase]);

  const chooseCalendarDate = useCallback((dateIdentifier: string) => {
    selectPuzzleDate(dateIdentifier);
  }, [selectPuzzleDate]);

  const playCalendarDate = useCallback(() => {
    const decision = dateAccessDecisionFor({
      selectedDate,
      today: localDateIdentifier(new Date()),
    });

    if (decision.kind === 'open') {
      navigateTo('game');
    }
  }, [navigateTo, selectedDate]);

  const chooseToday = useCallback(() => {
    selectPuzzleDate(localDateIdentifier(new Date()));
  }, [selectPuzzleDate]);

  const showEvaluationError = shouldSurfaceEvaluationError(
    tokens,
    nextDigitIndex,
    evaluation.equation === equation ? evaluation.errorMessage ?? '' : '',
  );
  const feedbackMessage = message || (showEvaluationError ? evaluation.errorMessage ?? '' : '');
  const feedbackTone: FeedbackTone = message ? messageTone : 'error';
  const inlineEquationFeedback =
    (activeView === 'game' || activeView === 'practice') && feedbackTone === 'error' ? feedbackMessage : '';
  const toastFeedbackMessage = inlineEquationFeedback ? '' : feedbackMessage;

  return (
    <main
      className={`app-shell play-shell ${
        activeView === 'start' ? 'start-shell' : ''
      } ${
        activeView === 'game' || activeView === 'practice' ? 'game-shell' : ''
      } ${activeView === 'calendar' ? 'calendar-shell detail-shell' : ''} ${
        activeView === 'settings' ? 'settings-shell detail-shell' : ''
      } ${
        activeView === 'howToPlay' ? 'how-to-play-shell detail-shell' : ''
      } ${
        activeView === 'rules' ? 'how-to-play-shell detail-shell' : ''
      }`}
    >
      {activeView !== 'start' && (
        <header className="top-bar game-top-bar">
          <button className="toolbar-home-button" type="button" aria-label="Play Crackle Date" onClick={showGame}>
            <img src="/app-icon.png" alt="" />
          </button>
          {onboardingCompleted && (
            <nav className="site-nav" aria-label="Site">
              <ToolbarButton
                label={puzzle?.displayDate ?? 'Calendar'}
                icon={<CalendarIcon />}
                isExpanded={activeView === 'calendar'}
                onClick={activeView === 'calendar' ? showGame : showCalendar}
                ariaLabel={dateInputLabel}
              />
              <ToolbarButton
                label="Settings"
                icon={<SettingsIcon />}
                isExpanded={activeView === 'settings'}
                onClick={activeView === 'settings' ? showGame : showSettingsPage}
              />
              <ToolbarButton
                label={themePreference === 'dark' ? 'Light' : 'Dark'}
                icon={themePreference === 'dark' ? <SunIcon /> : <MoonIcon />}
                className={themePreference === 'dark' ? 'theme-target-light' : 'theme-target-dark'}
                isExpanded={false}
                onClick={toggleThemePreference}
                ariaLabel={`Switch to ${themePreference === 'dark' ? 'light' : 'dark'} mode`}
              />
            </nav>
          )}
        </header>
      )}

      {confettiActive && <Confetti />}

      {activeView === 'start' && (
        <StartScreen
          onPlay={playPuzzle}
          onHowToPlay={showHowToPlay}
          onPractice={enterPractice}
        />
      )}

      {(activeView === 'game' || activeView === 'practice') && (
        <section className="game-panel" aria-label={`${puzzle?.displayDate ?? 'Crackle Date'} game board`}>
          {isPracticeMode && (
            <div
              className="practice-coach"
              role="note"
              data-required-onboarding={requiredOnboardingPractice ? 'true' : 'false'}
            >
              <strong>{practiceRound.title}: {practiceRound.displayDate}</strong>
              <span>{guidedPracticeStep?.instruction ?? practiceRound.coach}</span>
              <small>{practiceRound.coach}</small>
            </div>
          )}
          {todaySolutions.length > 0 && !isSearchingAnother ? (
            <VictoryPanel
              displayDate={puzzle?.displayDate ?? selectedDate}
              summary={dailyDashboardSummary}
              solutions={todaySolutions}
              savedSolutions={savedSolutions}
              onPlayAnother={() => {
                clear();
                setIsSearchingAnother(true);
              }}
              onUnlockTomorrow={handleUnlockTomorrow}
              onShare={shareDailyResults}
              onShareIndividual={shareSolutionText}
              onShowSavedSolutions={showCalendar}
              onShowCalendar={showCalendar}
              hasTomorrow={selectedDate === todayId}
              isArchived={selectedDate < todayId}
              onGoToToday={chooseToday}
            />
          ) : (
            <>
              <div className={`expression-area ${shakeActive ? 'shake' : ''}`}>
                <EquationEditor
                  tokens={tokens}
                  selection={selection}
                  onSelectionChange={(nextSelection) =>
                    setEditorState((current) => ({
                      ...current,
                      selection: normalizeEditorSelection(nextSelection, current.tokens.length),
                    }))
                  }
                  onBackspace={backspace}
                  onInsertValue={insertOperator}
                  onShowDetailedInstructions={showHowToPlay}
                  onStartPractice={enterPractice}
                  selectorMoveRef={selectorMoveRef}
                  nextDigit={nextDigit}
                  onAppendDigit={appendDigit}
                  isAutocompleting={isAutocompleting}
                />

                <EquationHelperRow
                  showHelperValues={isEasyMode}
                  leftValue={<RepeatingDecimalValue value={evaluation.left || '?'} />}
                  rightValue={<RepeatingDecimalValue value={evaluation.right || '?'} />}
                  onMove={moveSelectorFromControls}
                />

                <EquationFeedbackBanner message={inlineEquationFeedback} tone={feedbackTone} />
              </div>

              <div className="control-area">
                {puzzle && (
                  <DigitRail
                    digits={puzzle.digits}
                    delimiterPositions={puzzle.delimiterPositions}
                    usedDigitIndices={usedDigitIndices}
                    activeIndex={nextDigitIndex}
                    onActiveDigitClick={nextDigit !== null ? appendDigit : undefined}
                    glowActiveDigit={activeGlowKey === 'digit'}
                  />
                )}

                <div className="operator-grid" aria-label="Equation controls">
                  {operators.map(([label, value]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => insertOperator(value)}
                      data-operator-value={value}
                      className={activeGlowKey === value ? 'glow' : ''}
                    >
                      {label}
                    </button>
                  ))}
                  <button className={`danger ${activeGlowKey === 'Clear' ? 'glow' : ''}`.trim()} type="button" onClick={clear}>
                    C
                  </button>
                  <button className={`warning ${activeGlowKey === 'Backspace' ? 'glow' : ''}`.trim()} type="button" onClick={backspace} aria-label="Backspace">
                    ⌫
                  </button>
                  <button className={`wide ${activeGlowKey === '=' ? 'glow' : ''}`.trim()} type="button" onClick={() => insertText('=')}>
                    =
                  </button>
                  <button
                    className={`submit ${activeGlowKey === 'Submit' ? 'glow' : ''}`.trim()}
                    type="button"
                    onClick={submit}
                    disabled={validationLoading}
                    aria-busy={validationLoading}
                  >
                    Submit
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <StatusToast message={toastFeedbackMessage} tone={feedbackTone} />

      {onboardingCompleted && activeView === 'calendar' && (
        <CalendarPage
          selectedDate={selectedDate}
          savedSolutionDates={savedSolutionDates}
          onSelectedDateChange={chooseCalendarDate}
          onToday={chooseToday}
          savedSolutions={savedSolutions}
          onShare={shareSolution}
          onPlay={playCalendarDate}
        />
      )}

      {onboardingCompleted && activeView === 'settings' && (
        <SettingsPanel
          themePreference={themePreference}
          difficultyMode={difficultyMode}
          onThemePreferenceChange={setThemePreference}
          onDifficultyModeChange={setDifficultyMode}
          onClearData={() => setClearDataConfirmVisible(true)}
          onShowHowToPlay={showHowToPlay}
          onPractice={enterPractice}
        />
      )}

      {onboardingCompleted && activeView === 'howToPlay' && (
        <HowToPlayView onPlay={playPuzzle} />
      )}

      {onboardingPhase === FirstRunOnboardingPhase.NotStarted && activeView === 'game' && (
        <GuidedTutorial
          onStartGuidedCrack={enterPractice}
          onReadRules={showHowToPlay}
        />
      )}

      {clearDataConfirmVisible && (
        <ClearDataConfirmModal
          onCancel={() => setClearDataConfirmVisible(false)}
          onClear={clearBrowserData}
        />
      )}
    </main>
  );
}

function StatusToast({ message, tone }: { message: string; tone: FeedbackTone }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setIsVisible(false);
      return undefined;
    }

    setIsVisible(true);
    const timeoutId = window.setTimeout(() => setIsVisible(false), statusToastDismissMs);
    return () => window.clearTimeout(timeoutId);
  }, [message, tone]);

  if (!message || !isVisible) {
    return null;
  }

  return (
    <div className="toast-region" aria-live={tone === 'error' ? 'assertive' : 'polite'}>
      <button
        className={`status-toast ${tone === 'error' ? 'error' : 'success'}`}
        type="button"
        aria-label={`Dismiss notification: ${message}`}
        data-testid="status-toast"
        onClick={() => setIsVisible(false)}
      >
        <span className="status-toast-accent" aria-hidden="true" />
        <span>{message}</span>
      </button>
    </div>
  );
}

function EquationFeedbackBanner({ message, tone }: { message: string; tone: FeedbackTone }) {
  if (!message) return null;

  return (
    <div
      className={`equation-feedback ${tone === 'error' ? 'error' : 'success'}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      {message}
    </div>
  );
}

function ClearDataConfirmModal({
  onCancel,
  onClear,
}: {
  onCancel: () => void;
  onClear: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card clear-data-modal" role="dialog" aria-modal="true" aria-labelledby="clear-data-title">
        <h2 id="clear-data-title">Clear Data?</h2>
        <p>This permanently deletes Calendar history and Crackle Date settings in this browser.</p>
        <div className="clear-data-modal-actions">
          <button className="modal-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="modal-primary clear-data-confirm-action" type="button" onClick={onClear}>
            Clear
          </button>
        </div>
      </section>
    </div>
  );
}

function VictoryPanel({
  displayDate,
  summary,
  solutions,
  savedSolutions,
  onPlayAnother,
  onUnlockTomorrow,
  onShare,
  onShareIndividual,
  onShowSavedSolutions,
  onShowCalendar,
  hasTomorrow,
  isArchived,
  onGoToToday,
}: {
  displayDate: string;
  summary: DailyDashboardSummary | null;
  solutions: SavedSolution[];
  savedSolutions: StoredSolutions;
  onPlayAnother: () => void;
  onUnlockTomorrow?: () => void;
  onShare: () => void;
  onShareIndividual: (sol: SavedSolution) => void;
  onShowSavedSolutions: () => void;
  onShowCalendar: () => void;
  hasTomorrow: boolean;
  isArchived: boolean;
  onGoToToday: () => void;
}) {
  const victoryMessage = summary
    ? successMessage(summary.latestValue)
    : solutions.length === 1
      ? "You solved today's puzzle. Awesome work!"
      : `You found ${solutions.length} solutions for this date!`;

  return (
    <div className="victory-panel-card">
      <div className="victory-status-row">
        <span className="victory-status-pill">🎉 Puzzle Cracked!</span>
      </div>
      <h2 className="victory-date-title">{displayDate}</h2>
      <p className="victory-subtext">{victoryMessage}</p>

      {summary && (
        <section className="daily-dashboard-crackle" aria-label="Latest cracked solution">
          <span>CRACKED</span>
          <MathEquation equation={summary.latestEquation} className="daily-dashboard-equation" />
          <strong>{solutionCountText(summary.solvedCountForDate)}</strong>
        </section>
      )}

      <div className="victory-stats-box">
        {summary ? <DailyDashboardStats summary={summary} /> : <StatsDashboard savedSolutions={savedSolutions} />}
      </div>

      <div className="victory-solutions-section">
        <h3>Your Solutions</h3>
        <ul className="victory-sol-list">
          {solutions.map((sol, index) => {
            return (
              <li className="victory-sol-item" key={index}>
                <div className="victory-sol-main">
                  <span className="victory-sol-math">
                    <MathEquation equation={sol.equation} />
                  </span>
                  <div className="victory-sol-metadata">
                    <span className="victory-meta-mode">Classic</span>
                    <span>⏱ {formatTime(sol.seconds)}</span>
                    <span className={`victory-meta-difficulty difficulty-${sol.difficulty || 'easy'}`}>
                      {sol.difficulty || 'easy'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="victory-share-individual-btn"
                  onClick={() => onShareIndividual(sol)}
                  aria-label="Share this solution"
                >
                  <ShareIcon />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="victory-cta-actions">
        <button className="modal-primary victory-main-share-btn" type="button" onClick={onShare}>
          <span className="share-icon-inline">
            <ShareIcon />
          </span>
          Share Daily
        </button>

        <div className="victory-secondary-row">
          <button className="modal-secondary" type="button" onClick={onPlayAnother}>
            Keep Playing
          </button>

          <button className="modal-secondary" type="button" onClick={onShowSavedSolutions}>
            Saved Solutions
          </button>

          <button className="modal-secondary" type="button" onClick={onShowCalendar}>
            Calendar
          </button>

          {isArchived && (
            <button className="modal-secondary" type="button" onClick={onGoToToday}>
              Play Today's Puzzle
            </button>
          )}

          {hasTomorrow && onUnlockTomorrow && (
            <button className="modal-secondary" type="button" onClick={onUnlockTomorrow}>
              Play Tomorrow's Puzzle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DailyDashboardStats({ summary }: { summary: DailyDashboardSummary }) {
  return (
    <section className="daily-dashboard-stats" aria-labelledby="daily-dashboard-stats-title">
      <h3 id="daily-dashboard-stats-title" className="sr-only">Daily Dashboard Stats</h3>
      <article className="daily-dashboard-stat-card" aria-label={`Streak, ${streakDescription(summary.streakCount)}`}>
        <span>Streak</span>
        <strong>{streakValue(summary.streakCount)}</strong>
      </article>
      <article
        className="daily-dashboard-stat-card"
        aria-label={`Month, ${monthProgressText(summary.monthSolvedCount, summary.monthAvailableCount)}`}
      >
        <span>Month</span>
        <strong>{monthProgressText(summary.monthSolvedCount, summary.monthAvailableCount)}</strong>
      </article>
    </section>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.52a2 2 0 0 1-1 1.72l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.52a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function formatDisplayDate(dateIdentifier: string | undefined): string {
  if (!dateIdentifier) return 'Date unknown';
  const [year, month, day] = dateIdentifier.split('-').map(Number);
  if (!year || !month || !day) return dateIdentifier;
  return fullDateFormatter.format(new Date(year, month - 1, day));
}

function SolutionsList({ solutions, onShare }: { solutions: SavedSolution[]; onShare?: (sol: SavedSolution) => void }) {
  if (solutions.length === 0) {
    return <p>No solutions saved for this date yet.</p>;
  }

  return (
    <ol className="solutions-list">
      {solutions.map((solution) => {
        return (
          <li key={`${solution.equation}-${solution.timestamp}`}>
            <div className="solution-row-content">
              <strong>
                <MathEquation equation={solution.equation} className="solution-equation" />
              </strong>
              <span className="solution-meta-row">
                <span className="solution-mode">Classic</span>
                <span className="solution-divider">·</span>
                <span>{formatTime(solution.seconds)}</span>
                <span className="solution-divider">·</span>
                <span className="solution-value-label">value <RepeatingDecimalValue value={solution.value} /></span>
                {solution.solvedOnOtherDay && <span className="solution-tag archive-tag">Archive</span>}
                {solution.difficulty && (
                  <span className={`solution-tag difficulty-${solution.difficulty}`}>
                    {solution.difficulty}
                  </span>
                )}
              </span>
            </div>
            {onShare && (
              <button className="share-row-button" type="button" onClick={() => onShare(solution)} aria-label="Share solution">
                <ShareIcon />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function MathEquation({
  equation,
  className = '',
  cursorIndex,
  tokens,
  preserveDelimiters = false,
  editorMarkers = false,
  selectedSource,
}: {
  equation: string;
  className?: string;
  cursorIndex?: number;
  tokens?: EquationLatexToken[];
  preserveDelimiters?: boolean;
  editorMarkers?: boolean;
  selectedSource?: { kind: 'token'; index: number } | { kind: 'slot'; index: number; placement?: SlotPlacement };
}) {
  const latex = useMemo(
    () =>
      tokens
        ? equationTokensToLatex(tokens, { cursorIndex, preserveDelimiters, editorMarkers, selectedSource })
        : equationToLatex(equation, { cursorIndex, preserveDelimiters, editorMarkers, selectedSource }),
    [cursorIndex, editorMarkers, equation, preserveDelimiters, selectedSource, tokens],
  );
  const html = useMemo(
    () =>
      katex.renderToString(latex, {
        errorColor: '#ff3b30',
        strict: 'ignore',
        throwOnError: false,
        trust: true,
      }),
    [latex],
  );
  const classNames = ['math-equation', className].filter(Boolean).join(' ');

  return (
    <span
      className={classNames}
      aria-label={equation}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function RepeatingDecimalValue({ value }: { value: string }) {
  const segments = useMemo(() => repeatingDecimalSegments(value), [value]);
  const accessibilityText = value.replaceAll('\u0305', '');

  return (
    <span className="value-display" aria-label={accessibilityText}>
      {segments.map((segment, index) => (
        <span
          className={`value-segment ${segment.isRepeating ? 'repeating' : ''}`}
          key={`${segment.text}-${segment.isRepeating}-${index}`}
          aria-hidden="true"
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
}

function ToolbarButton({
  label,
  icon,
  isExpanded,
  onClick,
  ariaLabel = label,
  className = '',
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`toolbar-trigger ${className}`}
      type="button"
      aria-label={ariaLabel}
      aria-pressed={isExpanded}
      data-expanded={isExpanded}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 14.2A7.6 7.6 0 0 1 9.8 4 8 8 0 1 0 20 14.2Z" />
    </svg>
  );
}

function repeatingDecimalSegments(value: string): ValueSegment[] {
  const segments: ValueSegment[] = [];
  const characters = Array.from(value);

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (character === '\u0305') {
      continue;
    }

    const isRepeating = characters[index + 1] === '\u0305';
    appendValueSegment(segments, character, isRepeating);
    if (isRepeating) {
      index += 1;
    }
  }

  return segments;
}

function appendValueSegment(segments: ValueSegment[], text: string, isRepeating: boolean) {
  const previous = segments.at(-1);
  if (previous && previous.isRepeating === isRepeating) {
    previous.text += text;
    return;
  }

  segments.push({ text, isRepeating });
}

function HowToPlayView({ onPlay }: { onPlay: () => void }) {
  return (
    <section className="start-panel" aria-labelledby="how-to-play-title">
      <div className="how-to-play-card">
        <div className="how-to-play-header">
          <img className="start-icon" src="/app-icon.png" alt="" />
          <div><p className="document-kicker">Crackle Date</p><h1 id="how-to-play-title">How to Play</h1></div>
        </div>
        <p className="written-rules-intro">Use the date digits in order, add operators, and make both sides match.</p>
        <div className="how-to-play-actions"><button className="start-action-button play-button" type="button" onClick={onPlay}>Play</button></div>
        <div className="how-to-play-quick-list">
          {HOW_TO_PLAY_SECTIONS.map((section, index) => (
            <section className="how-to-play-quick-section" key={section.title}><h2>{index + 1}. {section.title}</h2><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></section>
          ))}
          {RULES_SECTIONS.map((section) => (
            <section className="how-to-play-quick-section" key={section.title}><h2>{section.title}</h2><ul>{section.rows.map((row) => <li key={row}>{row}</li>)}</ul></section>
          ))}
        </div>
      </div>
    </section>
  );
}

function CalendarPage({
  selectedDate,
  savedSolutionDates,
  onSelectedDateChange,
  onToday,
  savedSolutions,
  onShare,
  onPlay,
}: {
  selectedDate: string;
  savedSolutionDates: ReadonlySet<string>;
  onSelectedDateChange: (date: string) => void;
  onToday: () => void;
  savedSolutions: StoredSolutions;
  onShare: (sol: SavedSolution, dateId: string) => void;
  onPlay: () => void;
}) {
  const selectedDateObject = useMemo(() => dateFromIdentifier(selectedDate), [selectedDate]);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDateObject));
  const todayIdentifier = useMemo(() => localDateIdentifier(new Date()), []);
  const calendarDays = useMemo(() => calendarDaysForMonth(visibleMonth), [visibleMonth]);
  const monthLabel = useMemo(() => monthFormatter.format(visibleMonth), [visibleMonth]);
  const selectedSolutions = savedSolutions[selectedDate] ?? [];
  const averageSeconds = useMemo(
    () => averageTimeForSolutions(selectedSolutions),
    [selectedSolutions],
  );

  useEffect(() => {
    setVisibleMonth(startOfMonth(selectedDateObject));
  }, [selectedDateObject]);

  return (
    <section className="calendar-page" aria-labelledby="calendar-page-title">
      <div className="calendar-page-header">
        <div>
          <h1 id="calendar-page-title">Choose Date</h1>
          <p>Saved days are marked in green.</p>
        </div>
        <button
          className="calendar-today-button"
          type="button"
          onClick={() => {
            setVisibleMonth(startOfMonth(dateFromIdentifier(todayIdentifier)));
            onToday();
          }}
        >
          Today
        </button>
      </div>

      <div className="date-picker-calendar" role="group" aria-label="Choose puzzle date">
        <div className="date-picker-header">
          <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth((month) => addMonths(month, -1))}>
            ‹
          </button>
          <strong>{monthLabel}</strong>
          <button type="button" aria-label="Next month" onClick={() => setVisibleMonth((month) => addMonths(month, 1))}>
            ›
          </button>
        </div>

        <CalendarGrid
          calendarDays={calendarDays}
          selectedDate={selectedDate}
          todayIdentifier={todayIdentifier}
          savedSolutionDates={savedSolutionDates}
          onSelectedDateChange={onSelectedDateChange}
        />
      </div>

      <div className="calendar-equations-section">
        <div className="calendar-equations-header">
          <h2>Equations for {formatDisplayDate(selectedDate)}</h2>
          <button className="play-date-button" type="button" onClick={onPlay}>
            Play this Date
          </button>
        </div>
        <article className="calendar-average-card" aria-label="Average time for selected date">
          <span>Average Time</span>
          <strong>{averageSeconds === null ? '—' : formatTime(averageSeconds)}</strong>
        </article>
        <SolutionsList solutions={selectedSolutions} onShare={(solution) => onShare(solution, selectedDate)} />
      </div>
    </section>
  );
}

function CalendarGrid({
  calendarDays,
  selectedDate,
  todayIdentifier,
  savedSolutionDates,
  onSelectedDateChange,
}: {
  calendarDays: CalendarDay[];
  selectedDate: string;
  todayIdentifier: string;
  savedSolutionDates: ReadonlySet<string>;
  onSelectedDateChange: (date: string) => void;
}) {
  return (
    <>
      <div className="date-picker-weekdays" aria-hidden="true">
        {weekdayLabels.map((weekday, index) => (
          <span key={`${weekday}-${index}`}>{weekday}</span>
        ))}
      </div>

      <div className="date-picker-grid">
        {calendarDays.map((day) => {
          const hasSavedSolution = savedSolutionDates.has(day.dateIdentifier);
          return (
            <button
              className={`date-picker-day ${day.isCurrentMonth ? '' : 'outside'} ${
                day.dateIdentifier === selectedDate ? 'selected' : ''
              } ${day.dateIdentifier === todayIdentifier ? 'today' : ''} ${
                hasSavedSolution ? 'has-saved-solution' : ''
              }`}
              type="button"
              key={day.dateIdentifier}
              aria-label={`${fullDateFormatter.format(day.date)}${hasSavedSolution ? ', saved solution' : ''}`}
              aria-pressed={day.dateIdentifier === selectedDate}
              onClick={() => onSelectedDateChange(day.dateIdentifier)}
            >
              {day.day}
            </button>
          );
        })}
      </div>
    </>
  );
}

function DigitRail({
  digits,
  delimiterPositions,
  usedDigitIndices = emptyDigitIndices,
  activeIndex = null,
  onActiveDigitClick,
  glowActiveDigit = false,
}: {
  digits: number[];
  delimiterPositions: number[];
  usedDigitIndices?: ReadonlySet<number>;
  activeIndex?: number | null;
  onActiveDigitClick?: () => void;
  glowActiveDigit?: boolean;
}) {
  const delimiters = new Set(delimiterPositions);
  return (
    <div className="digit-rail" aria-label="Date digits">
      {digits.map((digit, index) => (
        <React.Fragment key={`${digit}-${index}`}>
          {index === activeIndex && onActiveDigitClick ? (
            <button
              className={`${digitClassName(index, usedDigitIndices, activeIndex)} ${glowActiveDigit ? 'glow' : ''}`.trim()}
              type="button"
              onClick={onActiveDigitClick}
              aria-label={`Use current digit ${digit}`}
              data-testid="active-digit"
            >
              {digit}
            </button>
          ) : (
            <span className={digitClassName(index, usedDigitIndices, activeIndex)}>{digit}</span>
          )}
          {delimiters.has(index) && <i aria-hidden="true" />}
        </React.Fragment>
      ))}
    </div>
  );
}

function EquationEditor({
  tokens,
  selection,
  onSelectionChange,
  onBackspace,
  onInsertValue,
  onShowDetailedInstructions,
  onStartPractice,
  selectorMoveRef,
  nextDigit,
  onAppendDigit,
  isAutocompleting = false,
}: {
  tokens: EquationToken[];
  selection: EditorSelection;
  onSelectionChange: (selection: EditorSelection) => void;
  onBackspace: () => void;
  onInsertValue: (value: string) => void;
  onShowDetailedInstructions: () => void;
  onStartPractice: () => void;
  selectorMoveRef?: React.MutableRefObject<SelectorMoveHandler | null>;
  nextDigit?: number | null;
  onAppendDigit?: () => void;
  isAutocompleting?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const normalizedSelection = normalizeEditorSelection(selection, tokens.length);
  const equation = tokensToEquation(tokens);
  const maxSlotIndex = tokens.length;

  const refreshHitTargets = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return [];
    const measuredTargets = measureEquationHitTargets(editor, maxSlotIndex);
    return measuredTargets;
  }, [maxSlotIndex]);

  useLayoutEffect(() => {
    refreshHitTargets();
    const frameId = window.requestAnimationFrame(refreshHitTargets);
    const editor = editorRef.current;
    const resizeObserver =
      editor && 'ResizeObserver' in window
        ? new ResizeObserver(() => refreshHitTargets())
        : null;

    if (editor) {
      resizeObserver?.observe(editor);
    }
    window.addEventListener('resize', refreshHitTargets);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', refreshHitTargets);
    };
  }, [equation, normalizedSelection.index, normalizedSelection.kind, refreshHitTargets, tokens.length]);

  const selectFromPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor) return;

      const targets = refreshHitTargets();
      const editorRect = editor.getBoundingClientRect();
      const nextTarget = targetAtPoint(targets, event.clientX - editorRect.left, event.clientY - editorRect.top);

      if (!nextTarget) return;
      event.preventDefault();
      editor.focus();
      onSelectionChange(nextTarget.selection);
    },
    [onSelectionChange, refreshHitTargets],
  );

  const moveSelector = useCallback(
    (direction: SelectorDirection) => {
      const targets = refreshHitTargets();
      onSelectionChange(
        nextSelectionFromRenderedTargets(targets, normalizedSelection, direction)
          ?? moveSelectionHorizontally(tokens.length, normalizedSelection, direction),
      );
      editorRef.current?.focus();
    },
    [normalizedSelection, onSelectionChange, refreshHitTargets, tokens.length],
  );

  useLayoutEffect(() => {
    if (!selectorMoveRef) return undefined;

    selectorMoveRef.current = moveSelector;
    return () => {
      if (selectorMoveRef.current === moveSelector) {
        selectorMoveRef.current = null;
      }
    };
  }, [moveSelector, selectorMoveRef]);

  const handleEditorKey = useCallback(
    (event: {
      key: string;
      metaKey?: boolean;
      ctrlKey?: boolean;
      altKey?: boolean;
      preventDefault: () => void;
    }) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        moveSelector(direction);
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        const value = keyboardInsertableOperators[event.key];
        if (value !== undefined) {
          event.preventDefault();
          onInsertValue(value);
          return;
        }
        if (nextDigit !== undefined && nextDigit !== null && onAppendDigit && event.key === String(nextDigit)) {
          event.preventDefault();
          onAppendDigit();
          return;
        }
      }

      if (event.key !== 'Backspace') return;
      event.preventDefault();
      onBackspace();
    },
    [
      onBackspace,
      onInsertValue,
      moveSelector,
      nextDigit,
      onAppendDigit,
    ],
  );

  const isEditableTarget = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return true;
    }

    const closestFormControl = target.closest(
      'input, textarea, [contenteditable], [contenteditable="true"], [role="textbox"]',
    );
    return !!closestFormControl;
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const isDigitMatch = nextDigit !== undefined && nextDigit !== null && event.key === String(nextDigit);
      if (
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowRight' &&
        event.key !== 'Backspace' &&
        keyboardInsertableOperators[event.key] === undefined &&
        !isDigitMatch
      ) {
        return;
      }

      if (event.target instanceof Node && editorRef.current?.contains(event.target)) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      handleEditorKey(event);
      editorRef.current?.focus();
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleEditorKey, isEditableTarget, nextDigit]);

  if (tokens.length === 0) {
    return (
      <div
        ref={editorRef}
        className={`equation-box empty ${isAutocompleting ? 'autocompleting' : ''}`}
        aria-label="Equation input"
        data-testid="equation-editor"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          editorRef.current?.focus();
          onSelectionChange({ kind: 'slot', index: 0 });
        }}
        onKeyDown={handleEditorKey}
      >
        <EquationEmptyState
          onShowDetailedInstructions={onShowDetailedInstructions}
          onStartPractice={onStartPractice}
        />
      </div>
    );
  }

  return (
    <div
      ref={editorRef}
      className={`equation-box ${isAutocompleting ? 'autocompleting' : ''}`}
      aria-label="Equation input"
      data-testid="equation-editor"
      tabIndex={0}
      onPointerDown={selectFromPointer}
      onKeyDown={handleEditorKey}
    >
      <div className="equation-preview" aria-hidden="true">
        <MathEquation
          equation={equation}
          tokens={tokens}
          preserveDelimiters
          editorMarkers
          selectedSource={normalizedSelection}
        />
      </div>
    </div>
  );
}

type LocalRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type EquationHitTarget = {
  selection: EditorSelection;
  hitRect: LocalRect;
  centerX: number;
  centerY: number;
};

const equationSelectionSize = 42;
const fractionOperatorHitHeight = 22;
const fractionSelectedHitSize = 78;

function nextSelectionFromRenderedTargets(
  targets: EquationHitTarget[],
  currentSelection: EditorSelection,
  direction: -1 | 1,
): EditorSelection | null {
  const orderedTargets = orderedEquationHitTargets(targets);
  if (orderedTargets.length === 0) {
    return null;
  }

  const currentIndex = orderedTargets.findIndex((target) => selectionKey(target.selection) === selectionKey(currentSelection));
  if (currentIndex === -1) {
    return null;
  }

  const nextIndex = (currentIndex + direction + orderedTargets.length) % orderedTargets.length;
  return orderedTargets[nextIndex]?.selection ?? null;
}

function orderedEquationHitTargets(targets: EquationHitTarget[]): EquationHitTarget[] {
  const uniqueTargets = new Map<string, EquationHitTarget>();
  for (const target of targets) {
    uniqueTargets.set(selectionKey(target.selection), target);
  }

  return [...uniqueTargets.values()].sort((first, second) => {
    const orderDelta = selectionOrder(first.selection) - selectionOrder(second.selection);
    if (orderDelta !== 0) return orderDelta;
    return first.centerX - second.centerX;
  });
}

function selectionKey(selection: EditorSelection): string {
  return selection.kind === 'slot'
    ? `${selection.kind}:${selection.index}:${selection.placement ?? 'source'}`
    : `${selection.kind}:${selection.index}`;
}

function selectionOrder(selection: EditorSelection): number {
  if (selection.kind === 'token') {
    return selection.index * 2 + 1;
  }

  const baseOrder = selection.index * 2;
  if (selection.placement === 'fractionNumeratorStart') {
    return baseOrder + 0.25;
  }
  if (selection.placement === 'fractionDenominatorEnd') {
    return baseOrder - 0.25;
  }
  return baseOrder;
}

function measureEquationHitTargets(editor: HTMLElement, maxSlotIndex: number): EquationHitTarget[] {
  const editorRect = editor.getBoundingClientRect();
  const tokenTargets = Array.from(editor.querySelectorAll<HTMLElement>('.katex-html .equation-source-token'))
    .map((element) => targetFromMarker(element, editorRect, 'token', maxSlotIndex))
    .filter((target): target is EquationHitTarget => Boolean(target));
  const slotTargets = Array.from(editor.querySelectorAll<HTMLElement>('.katex-html .equation-source-slot'))
    .map((element) => targetFromMarker(element, editorRect, 'slot', maxSlotIndex))
    .filter((target): target is EquationHitTarget => Boolean(target));

  return [...tokenTargets, ...slotTargets];
}

function targetFromMarker(
  element: HTMLElement,
  editorRect: DOMRect,
  kind: EditorSelection['kind'],
  maxSlotIndex: number,
): EquationHitTarget | null {
  const index = sourceMarkerIndex(element, `equation-source-${kind}-`);
  if (index === null) return null;
  const placement = kind === 'slot' ? sourceMarkerSlotPlacement(element) : undefined;
  const selection: EditorSelection = placement
    ? { kind, index, placement }
    : { kind, index };

  const rect = element.getBoundingClientRect();
  const localRect = {
    left: rect.left - editorRect.left,
    top: rect.top - editorRect.top,
    width: rect.width,
    height: rect.height,
  };
  const centerX = localRect.left + localRect.width / 2;
  const centerY = localRect.top + localRect.height / 2;

  if (element.classList.contains('equation-source-fraction-token')) {
    const isFractionSelected = element.classList.contains('equation-source-selected') || element.classList.contains('equation-source-fraction-selected');
    if (isFractionSelected) {
      return {
        selection,
        hitRect: squareAround(centerX, centerY, fractionSelectedHitSize),
        centerX,
        centerY,
      };
    }

    const width = Math.max(equationSelectionSize, localRect.width);
    return {
      selection,
      hitRect: {
        left: centerX - width / 2,
        top: centerY - fractionOperatorHitHeight / 2,
        width,
        height: fractionOperatorHitHeight,
      },
      centerX,
      centerY,
    };
  }

  if (kind === 'slot' && index === 0) {
    const baseRect = squareAround(centerX, centerY, equationSelectionSize);
    return {
      selection,
      hitRect: {
        left: baseRect.left - equationSelectionSize,
        top: baseRect.top,
        width: baseRect.width + equationSelectionSize,
        height: baseRect.height,
      },
      centerX,
      centerY,
    };
  }

  if (kind === 'slot' && index === maxSlotIndex && maxSlotIndex > 0) {
    const baseRect = squareAround(centerX, centerY, equationSelectionSize);
    return {
      selection,
      hitRect: {
        left: baseRect.left,
        top: baseRect.top,
        width: baseRect.width + equationSelectionSize,
        height: baseRect.height,
      },
      centerX,
      centerY,
    };
  }

  return {
    selection,
    hitRect: squareAround(centerX, centerY, equationSelectionSize),
    centerX,
    centerY,
  };
}

function sourceMarkerIndex(element: HTMLElement, prefix: string): number | null {
  for (const className of element.classList) {
    if (!className.startsWith(prefix)) continue;
    const value = Number(className.slice(prefix.length));
    if (Number.isInteger(value)) return value;
  }

  return null;
}

function sourceMarkerSlotPlacement(element: HTMLElement): SlotPlacement | undefined {
  if (element.classList.contains('equation-source-slot-placement-fraction-numerator-start')) {
    return 'fractionNumeratorStart';
  }
  if (element.classList.contains('equation-source-slot-placement-fraction-denominator-end')) {
    return 'fractionDenominatorEnd';
  }
  return undefined;
}

function targetAtPoint(targets: EquationHitTarget[], x: number, y: number): EquationHitTarget | null {
  const matchingTargets = targets.filter((target) => rectContains(target.hitRect, x, y));
  if (matchingTargets.length === 0) return null;

  return matchingTargets.sort((first, second) => {
    const distanceDelta = distanceToTarget(first, x, y) - distanceToTarget(second, x, y);
    if (distanceDelta !== 0) return distanceDelta;
    return rectArea(first.hitRect) - rectArea(second.hitRect);
  })[0];
}

function squareAround(centerX: number, centerY: number, size: number): LocalRect {
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
}

function rectContains(rect: LocalRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function rectArea(rect: LocalRect): number {
  return rect.width * rect.height;
}

function distanceToTarget(target: EquationHitTarget, x: number, y: number): number {
  return Math.hypot(target.centerX - x, target.centerY - y);
}

function PrivacyPage() {
  return (
    <DocumentShell
      currentPage="privacy"
      title="Privacy"
      subtitle="Crackle Date is free to play, with no ads, paid version, purchases, accounts, tracking, public profiles, or cloud gameplay history."
      meta="Last updated July 18, 2026"
    >
      <DocumentSection
        title="Local Storage"
        rows={[
          {
            label: 'On this device',
             body: 'Saved equations, solve times, streaks, settings, theme, difficulty, and onboarding progress stay in this browser. We do not save user data on our servers.',
          },
          {
            label: 'Clearing data',
            body: 'You can remove local web data from the Settings page with Clear Data, or by clearing this site in your browser settings.',
          },
        ]}
      />

      <DocumentSection
        title="Gameplay Requests"
        rows={[
          {
            label: 'While you play',
             body: 'Crackle Date does not send or keep user data on our servers. Puzzle, equation, and validation requests are processed only long enough to respond.',
          },
          {
            label: 'Operational data',
            body: 'Operational logs contain only timestamp, level, method, path, status, and duration; they do not contain gameplay content or a client identifier.',
          },
        ]}
      />

      <DocumentSection
        title="Ads and Purchases"
        rows={[
          {
             label: 'Free to play',
             body: 'Crackle Date is free to play. There are no ads, paid version, purchases, accounts, tracking, public profiles, or cloud gameplay history. Past, current, and future dates open without paid unlocks.',
          },
          {
            label: 'No tracking ads',
            body: 'The web app does not load an advertising SDK or use advertising identifiers.',
          },
        ]}
      />

      <DocumentSection
        title="Tracking"
        rows={[
          {
            label: 'No sale of personal information',
            body: 'Crackle Date does not sell personal information or provide a public user profile, leaderboard, or user-generated content feed.',
          },
          {
            label: 'No public profile',
            body: 'Your puzzle history and settings stay local. There is no public profile, leaderboard, or user-generated content feed.',
          },
        ]}
      />
    </DocumentShell>
  );
}

function SupportPage() {
  return (
    <DocumentShell
      currentPage="support"
      title="Support"
      subtitle="Help for gameplay and display issues. Crackle Date is free to play and does not save or send user data to our servers."
      meta="Last updated June 25, 2026"
    >
      <DocumentSection
        title="Gameplay Support"
        rows={[
          {
            label: 'Date access',
            body: 'Past, current, and future dates are playable without ads, purchases, or paid unlocks.',
          },
        ]}
      />

      <DocumentSection
        title="Common Checks"
        rows={[
          {
            label: 'Equation rejected',
            body: 'Confirm every date digit is used in order, the equation has exactly one equals sign, and both sides evaluate to the same value before submitting.',
          },
          {
            label: 'Cursor or formatting issue',
            body: 'If a fraction, parenthesis, absolute value bar, or selected slot looks wrong, try the arrow controls, Backspace, or Clear before rebuilding the equation.',
          },
          {
            label: 'Missing history',
             body: 'Clearing browser data, using private browsing, switching browsers, or changing devices can remove local history. Crackle Date does not keep, receive, or restore a server copy.',
          },
        ]}
      />

      <DocumentSection
        title="Useful Details"
        rows={[
          {
            label: 'Puzzle date',
            body: 'Include the puzzle date, difficulty mode, and whether the issue happened on the game board, Calendar, Settings, or instructions screen.',
          },
          {
            label: 'Equation',
            body: 'Include the exact equation you typed, especially if formatting, selection, cursor movement, validation, or evaluation looked wrong.',
          },
          {
            label: 'Device',
            body: 'Include the device, browser, operating system, screen size if relevant, and whether light or dark mode was active.',
          },
        ]}
      />

      <DocumentSection
        title="Privacy Reminder"
        rows={[
          {
            label: 'Keep it minimal',
            body: 'Do not send payment details, private identifiers, or unrelated personal information. Crackle Date does not need those details for support.',
          },
        ]}
      />
    </DocumentShell>
  );
}

function DocumentShell({
  currentPage,
  title,
  subtitle,
  meta,
  children,
}: {
  currentPage: 'privacy' | 'support';
  title: string;
  subtitle: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="document-page">
      <header className="document-top-bar">
        <a className="document-brand" href="/" aria-label="Crackle Date home">
          <img src="/app-icon.png" alt="" />
          <span>Crackle Date</span>
        </a>
        <PageNav currentPage={currentPage} />
      </header>

      <section className="document-hero" aria-labelledby="document-title">
        <p className="document-kicker">Crackle Date</p>
        <h1 id="document-title">{title}</h1>
        <p>{subtitle}</p>
        {meta && <span className="document-meta">{meta}</span>}
      </section>

      <div className="document-stack">{children}</div>
    </main>
  );
}

function DocumentSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; body: string }>;
}) {
  return (
    <section className="document-card" aria-labelledby={`${title.toLowerCase().replaceAll(' ', '-')}-title`}>
      <h2 id={`${title.toLowerCase().replaceAll(' ', '-')}-title`}>{title}</h2>
      <div className="document-list">
        {rows.map((row) => (
          <div className="document-row" key={row.label}>
            <strong>{row.label}</strong>
            <p>{row.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PageNav({ currentPage }: { currentPage: 'privacy' | 'support' }) {
  return (
    <nav className="page-nav" aria-label="Site">
      <a href="/">Play</a>
      <a href="/privacy/" aria-current={currentPage === 'privacy' ? 'page' : undefined}>Privacy</a>
      <a href="/support/" aria-current={currentPage === 'support' ? 'page' : undefined}>Support</a>
    </nav>
  );
}

function loadSolutions(): StoredSolutions {
  try {
    const value = localStorage.getItem(savedSolutionsStorageKey);
    return value ? (JSON.parse(value) as StoredSolutions) : {};
  } catch {
    return {};
  }
}

function emptyEditorState(): EquationEditorState {
  return {
    tokens: [],
    selection: { kind: 'slot', index: 0 },
  };
}

function createTokenId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createOperatorToken(value: string, role?: EquationToken['role']): EquationToken {
  return { id: createTokenId(), value, role };
}

function createDigitToken(value: number, digitIndex: number): EquationToken {
  return { id: createTokenId(), value: String(value), digitIndex };
}

function stringToEquationTokens(s: string, digits: number[]): EquationToken[] {
  const tokens: EquationToken[] = [];
  const usedIndices = new Set<number>();
  
  const operatorMap: Record<string, string> = {
    '+': '+',
    '-': '-',
    '*': '×',
    '×': '×',
    '/': '÷',
    '÷': '÷',
    '^': '^',
    '√': '√',
    '!': '!',
    '|': '|',
    '(': '(',
    ')': ')',
    '=': '=',
  };

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (/[0-9]/.test(char)) {
      const val = Number(char);
      let foundIndex = -1;
      for (let d = 0; d < digits.length; d++) {
        if (digits[d] === val && !usedIndices.has(d)) {
          foundIndex = d;
          break;
        }
      }
      if (foundIndex !== -1) {
        usedIndices.add(foundIndex);
        tokens.push({
          id: createTokenId(),
          value: char,
          digitIndex: foundIndex,
        });
      } else {
        tokens.push({
          id: createTokenId(),
          value: char,
        });
      }
    } else if (operatorMap[char] !== undefined) {
      const isPipe = char === '|';
      const pipeCount = tokens.filter((t) => t.value === '|').length;
      tokens.push({
        id: createTokenId(),
        value: operatorMap[char],
        role: isPipe ? (pipeCount % 2 === 0 ? 'absoluteOpen' : 'absoluteClose') : undefined,
      });
    }
  }

  return tokens;
}

function tokensToEquation(tokens: EquationToken[]): string {
  return tokens.map((token) => token.value).join('');
}

function digitIndicesInUse(tokens: EquationToken[]): ReadonlySet<number> {
  return new Set(tokens.flatMap((token) => (token.digitIndex === undefined ? [] : [token.digitIndex])));
}

function firstUnusedDigitIndex(tokens: EquationToken[], digits: number[]): number | null {
  const usedDigitIndices = digitIndicesInUse(tokens);
  for (let index = 0; index < digits.length; index += 1) {
    if (!usedDigitIndices.has(index)) return index;
  }
  return null;
}

function digitClassName(
  index: number,
  usedDigitIndices: ReadonlySet<number>,
  activeIndex: number | null,
): string {
  if (usedDigitIndices.has(index)) return 'used';
  if (activeIndex === index) return 'active';
  return '';
}

function localDateIdentifier(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromIdentifier(identifier: string): Date {
  const [year, month, day] = identifier.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date();
  }
  return new Date(year, month - 1, day);
}

function dateDisplayString(identifier: string): string {
  return fullDateFormatter.format(dateFromIdentifier(identifier));
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calendarDaysForMonth(month: Date): CalendarDay[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  return Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(year, monthIndex, offset - firstWeekday + 1);
    return {
      date,
      dateIdentifier: localDateIdentifier(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === monthIndex,
    };
  });
}

function formatTime(seconds: number): string {
  if (!seconds) return '0s';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

const rootElement = document.getElementById('root')!;
const hotMeta = import.meta as ImportMeta & { hot?: { data: { root?: Root } } };
const hotData = hotMeta.hot?.data;
const root = hotData?.root ?? createRoot(rootElement);

if (hotData) {
  hotData.root = root;
}

root.render(<App />);
