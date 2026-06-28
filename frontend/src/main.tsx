import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  countStoredSolutions,
  fetchAccountPreferences,
  fetchAccountSolutions,
  fetchCurrentUser,
  importAccountSolutions,
  login,
  logout,
  resendVerification,
  saveAccountPreferences,
  signup,
  verifyCode,
  type AuthUser,
} from './auth';
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
import { HOW_TO_PLAY_DETAIL_CARDS, HOW_TO_PLAY_SECTIONS } from './howToPlayContent';
import { nextVisibleHintStep, shouldGateFullSolutionHint } from './hintFlow';
import { equationToLatex, equationTokensToLatex, type EquationLatexToken } from './mathLatexFormatter';
import { statusToastDismissMs } from './notificationTiming';
import { practiceCompletionTarget } from './practiceCompletion';
import { practiceRound, practiceSuccessMessage } from './practiceRound';
import { RULES_SECTIONS } from './rulesContent';
import { savedSolutionDateSet } from './savedSolutionDates';
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
import { solutionBadges, type SolutionBadge } from './solutionBadges';
import { submitSolutionRecord, webAppVersion } from './submissions';
import { GuidedTutorial } from './GuidedTutorial';
import {
  GuidedFirstWinRoute,
  guidedFirstWinStorageKey,
  routeForGuidedFirstWin,
} from './guidedFirstWinPolicy';
import {
  guidedPracticeGlowKey,
  guidedPracticeStepForTokens,
} from './guidedPractice';
import { nextBadgeTargetFromBadges } from './nextBadgeTargets';
import {
  FUTURE_DATE_AD_DURATION_SECONDS,
  bannerPlacementForDate,
  dateAccessDecisionFor,
  dateAfterCancelingFutureGate,
} from './dateAccessPolicy';
import { initialActiveView } from './startScreenRouting';
import './styles.css';

const HINT_REWARD_AD_DURATION_SECONDS = 15;

type Puzzle = {
  dateIdentifier: string;
  displayDate: string;
  formattedDate: string;
  digits: number[];
  delimiterPositions: number[];
  targetValue?: string;
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

type ValidationResponse = {
  valid: boolean;
  leftValue?: string;
  rightValue?: string;
  errorMessage?: string;
};

type SavedSolution = {
  equation: string;
  timestamp: string;
  seconds: number;
  value: string;
  mode?: string;
  targetValue?: string;
  solvedOnOtherDay?: boolean;
  usedHint?: boolean;
  difficulty?: 'easy' | 'hard';
};

type StoredSolutions = Record<string, SavedSolution[]>;
type ThemePreference = 'system' | 'light' | 'dark';
type DifficultyMode = 'easy' | 'hard';
type GameMode = 'classic' | 'double_equality' | 'target' | 'single_expr';
type FeedbackTone = 'success' | 'error';
type AuthModalMode = 'login' | 'signup' | 'verify' | 'account';
type ActiveView = 'start' | 'game' | 'practice' | 'calendar' | 'solutions' | 'settings' | 'howToPlay' | 'rules';

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

const gameModeKey = 'crackledate.web.gamemode.v1';
const targetValueKey = 'crackledate.web.targetvalue.v1';
const canonicalPublicGameMode = 'classic' as const;

function loadGameMode(): GameMode {
  return canonicalPublicGameMode;
}

function loadTargetValue(): string {
  return localStorage.getItem(targetValueKey) || '10';
}

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

const storageKey = 'crackledate.web.solutions.v1';
const playStartedKey = 'crackledate.web.play-started.v1';
const themePreferenceKey = 'crackledate.web.theme.v1';
const difficultyModeKey = 'crackledate.web.difficulty.v1';
const supporterEntitlementKey = 'crackledate.web.supporter.v1';
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
  const [selectedDate, setSelectedDate] = useState(localDateIdentifier(new Date()));
  const [playStarted, setPlayStarted] = useState(() => localStorage.getItem(playStartedKey) === 'true');
  const [guidedFirstWinCompleted, setGuidedFirstWinCompleted] = useState(
    () => localStorage.getItem(guidedFirstWinStorageKey) === 'true',
  );
  const [guidedFirstWinActive, setGuidedFirstWinActive] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>(
    () => initialActiveView({ playStarted, guidedFirstWinCompleted }),
  );
  const [showHowToPlayDetailFirst, setShowHowToPlayDetailFirst] = useState(false);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [editorState, setEditorState] = useState<EquationEditorState>(emptyEditorState);
  const [evaluation, setEvaluation] = useState<EvaluationState>({ left: '?', middle: '', right: '?', equation: '' });
  const [gameMode, setGameMode] = useState<GameMode>(loadGameMode);
  const [targetValue, setTargetValue] = useState<string>(loadTargetValue);
  const [shakeActive, setShakeActive] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const [hintStep, setHintStep] = useState(0);
  const [hintData, setHintData] = useState<{ solution: string; step1: string; step2: string; step3: string; balancingHint?: string; mathTip?: string } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [isDeadEnd, setIsDeadEnd] = useState(false);
  const [shakeHintButton, setShakeHintButton] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<FeedbackTone>('success');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [savedSolutions, setSavedSolutions] = useState<StoredSolutions>(loadSolutions);
  const [themePreference, setThemePreference] = useState<ThemePreference>(loadThemePreference);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>(loadDifficultyMode);
  const [isSupporter, setIsSupporter] = useState(() => localStorage.getItem(supporterEntitlementKey) === 'true');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode | null>(null);
  const [showImportPrompt, setShowImportPrompt] = useState(false);
  const [pendingImportSolutions, setPendingImportSolutions] = useState<StoredSolutions>({});
  const [accountPreferencesLoaded, setAccountPreferencesLoaded] = useState(false);
  const [unlockedFutureDates, setUnlockedFutureDates] = useState<Set<string>>(() => new Set());
  const [unlockedAutocompleteDates, setUnlockedAutocompleteDates] = useState<Set<string>>(() => new Set());
  const [rewardModalAction, setRewardModalAction] = useState<{
    actionName: string;
    adDurationSeconds: number;
    claimLabel: string;
    onSuccess: () => void;
    onClose?: () => void;
  } | null>(null);
  const selectorMoveRef = useRef<SelectorMoveHandler | null>(null);
  const autocompleteIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preserveFeedbackOnNextPuzzleLoadRef = useRef(false);
  const [isAutocompleting, setIsAutocompleting] = useState(false);
  const [isSearchingAnother, setIsSearchingAnother] = useState(false);
  const todayId = useMemo(() => localDateIdentifier(new Date()), []);
  const tomorrowId = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return localDateIdentifier(tomorrow);
  }, []);
  const isPracticeMode = activeView === 'practice';
  const puzzleDateIdentifier = isPracticeMode ? practiceRound.dateIdentifier : selectedDate;

  const { tokens, selection } = editorState;
  const equation = useMemo(() => tokensToEquation(tokens), [tokens]);
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
    switch (gameMode) {
      case 'double_equality':
        return (
          eqParts.length === 3 &&
          evaluation.left !== '?' &&
          evaluation.left === evaluation.middle &&
          evaluation.middle === evaluation.right
        );
      case 'single_expr':
        return (
          eqParts.length === 1 &&
          evaluation.left !== '?' &&
          evaluation.left === targetValue
        );
      case 'target':
        return (
          eqParts.length === 2 &&
          evaluation.left !== '?' &&
          evaluation.left === targetValue &&
          evaluation.right === targetValue
        );
      default: // classic
        return (
          eqParts.length === 2 &&
          evaluation.left !== '?' &&
          evaluation.left === evaluation.right
        );
    }
  }, [puzzle, usedDigitIndices, evaluation, equation, gameMode, targetValue]);
  const nextDigitIndex = useMemo(
    () => (puzzle ? firstUnusedDigitIndex(tokens, puzzle.digits) : null),
    [puzzle, tokens],
  );
  const guidedFirstWinRoute = useMemo(
    () => routeForGuidedFirstWin({ playStarted, guidedFirstWinCompleted }),
    [guidedFirstWinCompleted, playStarted],
  );
  const guidedPracticeStep = useMemo(
    () => (isPracticeMode ? guidedPracticeStepForTokens(tokens) : null),
    [isPracticeMode, tokens],
  );
  const todaySolutions = puzzle && !isPracticeMode ? savedSolutions[puzzle.dateIdentifier] ?? [] : [];
  const savedSolutionDates = useMemo(() => savedSolutionDateSet(savedSolutions), [savedSolutions]);
  const badges = useMemo(() => solutionBadges(savedSolutions), [savedSolutions]);
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
  const gameAdBannerPlacement = isPracticeMode
    ? 'none'
    : bannerPlacementForDate({
        selectedDate,
        today: todayId,
        savedSolutionCount: todaySolutions.length,
        removesAds: isSupporter,
      });
  const gameAdBannerReason = gameAdBannerPlacement === 'none' ? null : gameAdBannerPlacement;
  const isEasyMode = difficultyMode === 'easy';
  const isLHSCompleteForHint = useMemo(() => {
    if (!hintData || gameMode !== 'classic') return false;
    const normalize = (str: string) => str.replace(/\s+/g, '').replace(/=+$/, '');
    return normalize(equation).startsWith(normalize(hintData.step2));
  }, [equation, hintData, gameMode]);
  const isVerifiedAccount = Boolean(authUser?.emailVerified);
  const accountImportKey = authUser ? `crackledate.web.import-offered.${authUser.email}` : '';

  const mappedGlowKey = useMemo(() => {
    if (hintStep === 0 || !hintData) return null;
    if (isDeadEnd) {
      return 'Backspace';
    }

    const normalizeEquationStr = (eq: string): string => {
      return eq.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s/g, '');
    };
    const normEq = normalizeEquationStr(equation);
    const normSol = normalizeEquationStr(hintData.solution);

    if (normSol.startsWith(normEq)) {
      const nextChar = normSol[normEq.length];
      if (nextChar) {
        const asciiToButtonVal: Record<string, string> = {
          '+': '+',
          '-': '-',
          '*': '×',
          '/': '÷',
          '^': '^',
          '√': '√',
          '!': '!',
          '|': '|',
          '(': '(',
          ')': ')',
          '=': '=',
        };
        return asciiToButtonVal[nextChar] || nextChar;
      }
    }
    return null;
  }, [hintStep, hintData, isDeadEnd, equation]);
  const activeGlowKey = guidedPracticeGlowKey(guidedPracticeStep) ?? mappedGlowKey;

  const syncAccountData = useCallback(async (user: AuthUser, options: { promptImport?: boolean } = {}) => {
    if (!user.emailVerified) {
      setAccountPreferencesLoaded(false);
      return;
    }

    const localSolutions = loadSolutions();
    const hasLocalSolutions = countStoredSolutions(localSolutions) > 0;
    const [preferences, accountSolutions] = await Promise.all([
      fetchAccountPreferences(),
      fetchAccountSolutions(),
    ]);

    setThemePreference(preferences.themePreference);
    setDifficultyMode(preferences.difficultyMode);
    setAccountPreferencesLoaded(true);
    setSavedSolutions(accountSolutions);
    localStorage.setItem(storageKey, JSON.stringify(accountSolutions));

    const importKey = `crackledate.web.import-offered.${user.email}`;
    if (options.promptImport && hasLocalSolutions && localStorage.getItem(importKey) !== 'true') {
      setPendingImportSolutions(localSolutions);
      setShowImportPrompt(true);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    fetchCurrentUser()
      .then((user) => {
        if (!isCurrent) return;
        setAuthUser(user);
        if (user?.emailVerified) {
          void syncAccountData(user, { promptImport: true });
        } else {
          setAccountPreferencesLoaded(false);
        }

        const params = new URLSearchParams(window.location.search);
        if (params.get('verified') === '1') {
          setMessageTone('success');
          setMessage('Email verified. Your account is ready.');
          window.history.replaceState({}, '', window.location.pathname);
        }
        if (params.get('verified') === '0') {
          setMessageTone('error');
          setMessage('Verification link expired or was already used.');
          window.history.replaceState({}, '', window.location.pathname);
        }
      })
      .catch(() => {
        if (!isCurrent) return;
        setAccountPreferencesLoaded(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [syncAccountData]);

  useEffect(() => {
    if (themePreference === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.dataset.theme = themePreference;
    }
    localStorage.setItem(themePreferenceKey, themePreference);
  }, [themePreference]);

  useEffect(() => {
    localStorage.setItem(difficultyModeKey, difficultyMode);
  }, [difficultyMode]);

  useEffect(() => {
    localStorage.setItem(gameModeKey, gameMode);
    setHintStep(0);
    setHintData(null);
    setUsedHint(false);
  }, [gameMode]);

  useEffect(() => {
    localStorage.setItem(targetValueKey, targetValue);
    setHintStep(0);
    setHintData(null);
    setUsedHint(false);
  }, [targetValue]);

  useEffect(() => {
    if (isAutocompleting) return;
    setShakeHintButton(false);

    if (!puzzle) return;

    const timer = setTimeout(() => {
      setShakeHintButton(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [equation, puzzle, gameMode, targetValue, isAutocompleting]);

  useEffect(() => {
    if (isAutocompleting) return;
    if (hintStep > 0 && puzzle) {
      const controller = new AbortController();
      const query = new URLSearchParams({
        date: puzzle.dateIdentifier,
        mode: gameMode,
        targetValue: (gameMode === 'target' || gameMode === 'single_expr') ? targetValue : '',
        prefix: equation,
      });

      fetch(`/api/hint?${query.toString()}`, { signal: controller.signal })
        .then((res) => {
          if (res.ok) {
            setIsDeadEnd(false);
            return res.json();
          }
          throw new Error('No solution found');
        })
        .then((data: any) => {
          setHintData(data);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            setIsDeadEnd(true);
          }
        });

      return () => controller.abort();
    } else {
      setIsDeadEnd(false);
    }
  }, [equation, hintStep, gameMode, targetValue, puzzle, isAutocompleting]);

  useEffect(() => {
    if (isVerifiedAccount && accountPreferencesLoaded) {
      void saveAccountPreferences({ themePreference, difficultyMode });
    }
  }, [accountPreferencesLoaded, difficultyMode, isVerifiedAccount, themePreference]);

  useEffect(() => {
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
        if (nextPuzzle.targetValue) {
          setTargetValue(nextPuzzle.targetValue);
        }
        setEditorState(emptyEditorState());
        setEvaluation({ left: '?', middle: '', right: '?', equation: '' });
        const preserveCurrentMessage = preserveFeedbackOnNextPuzzleLoadRef.current;
        preserveFeedbackOnNextPuzzleLoadRef.current = false;
        setMessage((currentMessage) => feedbackMessageAfterPuzzleLoad(currentMessage, preserveCurrentMessage));
        setStartTime(null);
        setHintStep(0);
        setHintData(null);
        setUsedHint(false);
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
  }, [puzzleDateIdentifier]);

  useEffect(() => {
    if (isEquationCorrect) {
      setHintStep(0);
      setHintData(null);
    }
  }, [isEquationCorrect]);

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

    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setMessageTone('success');
        setMessage('Result copied to clipboard!');
      })
      .catch(() => {
        setMessageTone('error');
        setMessage('Failed to copy to clipboard.');
      });
  }, [puzzle, selectedDate]);

  const shareDailyResults = useCallback(() => {
    if (!dailyDashboardSummary) return;
    const text = spoilerFreeDailySharePayload(dailyDashboardSummary);

    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setMessageTone('success');
        setMessage('Summary copied to clipboard!');
      })
      .catch(() => {
        setMessageTone('error');
        setMessage('Failed to copy to clipboard.');
      });
  }, [dailyDashboardSummary]);

  const handleUnlockTomorrow = useCallback(() => {
    if (isSupporter || unlockedFutureDates.has(tomorrowId)) {
      setSelectedDate(tomorrowId);
    } else {
      setRewardModalAction({
        actionName: `play tomorrow's puzzle (${tomorrowId})`,
        adDurationSeconds: FUTURE_DATE_AD_DURATION_SECONDS,
        claimLabel: 'Play Tomorrow',
        onSuccess: () => {
          setUnlockedFutureDates((prev) => {
            const next = new Set(prev);
            next.add(tomorrowId);
            return next;
          });
          setSelectedDate(tomorrowId);
        },
        onClose: () => {
          setSelectedDate(dateAfterCancelingFutureGate(todayId));
        },
      });
    }
  }, [isSupporter, todayId, tomorrowId, unlockedFutureDates]);

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
      if (autocompleteIntervalRef.current) {
        clearInterval(autocompleteIntervalRef.current);
        autocompleteIntervalRef.current = null;
        setIsAutocompleting(false);
      }
      setEditorState((current) => {
        const next = edit(current.tokens, current.selection);
        return {
          tokens: next.tokens,
          selection: normalizeEditorSelection(next.selection, next.tokens.length),
        };
      });
      setMessage('');
    },
    [],
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
      if (value === '=' && gameMode === 'single_expr') {
        return;
      }
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
    [insertAbsoluteDelimiter, insertClosingDelimiter, insertText, gameMode],
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
    if (autocompleteIntervalRef.current) {
      clearInterval(autocompleteIntervalRef.current);
      autocompleteIntervalRef.current = null;
    }
    setEditorState(emptyEditorState());
    setEvaluation({ left: '?', middle: '', right: '?', equation: '' });
    setMessage('');
    setStartTime(null);
  }, []);

  const moveSelectorFromControls = useCallback((direction: SelectorDirection) => {
    selectorMoveRef.current?.(direction);
  }, []);

  const submit = useCallback(async () => {
    if (!puzzle) return;
    const normalizedEquation = equation.trim();
    if (!isPracticeMode && todaySolutions.some((solution) => solution.equation === normalizedEquation)) {
      setMessageTone('error');
      setMessage('Solution already saved for this date.');
      return;
    }

    const response = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: puzzle.dateIdentifier,
        equation: normalizedEquation,
        mode: gameMode,
        targetValue: (gameMode === 'target' || gameMode === 'single_expr') ? targetValue : undefined,
      }),
    });
    const result = (await response.json()) as ValidationResponse;
    if (!result.valid) {
      setMessageTone('error');
      setMessage(result.errorMessage ?? 'That equation is not valid.');
      setShakeActive(true);
      setTimeout(() => setShakeActive(false), 500);
      return;
    }

    if (isPracticeMode) {
      clear();
      setMessageTone('success');
      setMessage(practiceSuccessMessage(result.leftValue ?? evaluation.left));
      preserveFeedbackOnNextPuzzleLoadRef.current = true;
      const destination = practiceCompletionTarget(todayId);
      setSelectedDate(destination.selectedDate);
      setActiveView(destination.activeView);
      if (guidedFirstWinActive) {
        localStorage.setItem(guidedFirstWinStorageKey, 'true');
        setGuidedFirstWinCompleted(true);
        setGuidedFirstWinActive(false);
      }
      return;
    }

    const seconds = startTime ? Math.max(1, Math.round((Date.now() - startTime) / 1000)) : 0;
    const solvedTodayIdentifier = localDateIdentifier(new Date());
    const solvedOnOtherDay = solvedTodayIdentifier !== puzzle.dateIdentifier;
    const solution: SavedSolution = {
      equation: normalizedEquation,
      timestamp: new Date().toISOString(),
      seconds,
      value: result.leftValue ?? evaluation.left,
      mode: gameMode,
      targetValue: (gameMode === 'target' || gameMode === 'single_expr') ? targetValue : undefined,
      difficulty: difficultyMode,
      solvedOnOtherDay,
      usedHint,
    };
    setSavedSolutions((current) => {
      const next = {
        ...current,
        [puzzle.dateIdentifier]: [...(current[puzzle.dateIdentifier] ?? []), solution],
      };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
    void submitSolutionRecord({
      date: puzzle.dateIdentifier,
      equation: normalizedEquation,
      seconds,
      difficulty: difficultyMode,
      platform: 'web',
      appVersion: webAppVersion,
      mode: gameMode,
      targetValue: (gameMode === 'target' || gameMode === 'single_expr') ? targetValue : undefined,
    });
    if (guidedFirstWinActive) {
      localStorage.setItem(guidedFirstWinStorageKey, 'true');
      setGuidedFirstWinCompleted(true);
      setGuidedFirstWinActive(false);
    }
    setIsSearchingAnother(false);
    setMessageTone('success');
    if (gameMode === 'double_equality') {
      setMessage(`Solved. All sides equal ${solution.value}.`);
    } else if (gameMode === 'single_expr') {
      setMessage(`Solved. Expression equals ${solution.value}.`);
    } else {
      setMessage(`Solved. Both sides equal ${solution.value}.`);
    }
    setConfettiActive(true);
    setTimeout(() => setConfettiActive(false), 4000);
  }, [clear, difficultyMode, equation, evaluation.left, guidedFirstWinActive, isPracticeMode, puzzle, startTime, todayId, todaySolutions, gameMode, targetValue]);

  const applyHintStep = useCallback(
    (step: number, data: { solution: string; step1: string; step2: string; step3: string; balancingHint?: string; mathTip?: string }) => {
      if (!puzzle) return;

      if (step === 1) {
        const hasEquals = tokens.some((t) => t.value === '=');
        if (!hasEquals && gameMode !== 'single_expr' && tokens.length > 0) {
          const expectedCount = gameMode === 'double_equality' ? 2 : 1;
          applyEditorEdit((currentTokens, currentSelection) => {
            let updatedTokens = [...currentTokens];
            let updatedSelection = { ...currentSelection };
            for (let i = 0; i < expectedCount; i++) {
              const edit = insertTokensAtSelection(updatedTokens, updatedSelection, [createOperatorToken('=')]);
              updatedTokens = edit.tokens;
              updatedSelection = edit.selection;
            }
            return { tokens: updatedTokens, selection: updatedSelection };
          });
        }
      } else if (step === 2) {
        const insertStr = gameMode === 'single_expr' ? data.step1 : data.step2;
        const hintTokens = stringToEquationTokens(insertStr, puzzle.digits);
        applyEditorEdit((currentTokens, currentSelection) => {
          let updatedTokens = [...currentTokens];
          let updatedSelection = { ...currentSelection };
          const hasEqualsInEditor = updatedTokens.some((t) => t.value === '=');

          if (gameMode === 'classic' || gameMode === 'double_equality') {
            if (hasEqualsInEditor) {
              return { tokens: currentTokens, selection: currentSelection };
            }
            // Avoid duplicate LHS entry by checking if currentTokens already match the hintTokens.
            // If they do, insert '=' instead.
            const normEquation = currentTokens.map(t => t.value).join('').replace(/\s+/g, '');
            const normHint = insertStr.replace(/\s+/g, '');
            if (normEquation !== '' && (normEquation.startsWith(normHint) || normHint.startsWith(normEquation))) {
              return insertTokensAtSelection(currentTokens, currentSelection, [createOperatorToken('=')]);
            }
            return insertTokensAtSelection(currentTokens, currentSelection, hintTokens);
          }

          if (gameMode === 'target') {
            if (!hasEqualsInEditor) {
              const edit = insertTokensAtSelection(updatedTokens, updatedSelection, [createOperatorToken('=')]);
              updatedTokens = edit.tokens;
              updatedSelection = edit.selection;
            }
            return insertTokensAtSelection(updatedTokens, updatedSelection, hintTokens);
          }

          return insertTokensAtSelection(currentTokens, currentSelection, hintTokens);
        });
      } else if (step === 3) {
        if (autocompleteIntervalRef.current) {
          clearInterval(autocompleteIntervalRef.current);
        }
        setIsAutocompleting(true);
        const targetTokens = stringToEquationTokens(data.solution, puzzle.digits);
        const currentLength = tokens.length;
        
        let isMatchingPrefix = true;
        for (let i = 0; i < currentLength; i++) {
          if (!targetTokens[i] || targetTokens[i].value !== tokens[i].value) {
            isMatchingPrefix = false;
            break;
          }
        }

        const startIdx = isMatchingPrefix ? currentLength : 0;
        let index = startIdx;
        const initialTokens = isMatchingPrefix ? [...tokens] : [];

        setEditorState({
          tokens: initialTokens,
          selection: { kind: 'slot', index: initialTokens.length },
        });

        autocompleteIntervalRef.current = setInterval(() => {
          if (index >= targetTokens.length) {
            if (autocompleteIntervalRef.current) {
              clearInterval(autocompleteIntervalRef.current);
              autocompleteIntervalRef.current = null;
            }
            setIsAutocompleting(false);
            setHintStep(0);
            setHintData(null);
            return;
          }

          const tokenToAdd = targetTokens[index];
          if (tokenToAdd) {
            setEditorState((prev) => {
              const nextTokens = [...prev.tokens, tokenToAdd];
              return {
                tokens: nextTokens,
                selection: { kind: 'slot', index: nextTokens.length },
              };
            });
          }
          index++;
        }, 300);
      }
    },
    [puzzle, tokens, gameMode, applyEditorEdit],
  );

  const fetchHint = useCallback(async () => {
    if (!puzzle) return;
    setHintLoading(true);
    try {
      const query = new URLSearchParams({
        date: puzzle.dateIdentifier,
        mode: gameMode,
        targetValue: (gameMode === 'target' || gameMode === 'single_expr') ? targetValue : '',
        prefix: equation,
      });
      const response = await fetch(`/api/hint?${query.toString()}`);
      if (!response.ok) {
        throw new Error('No solution found');
      }
      const data = (await response.json()) as { solution: string; step1: string; step2: string; step3: string; balancingHint?: string; mathTip?: string };
      setHintData(data);
      const initialStep = nextVisibleHintStep({
        requestedStep: 1,
        currentHintStep: 0,
        equation,
        gameMode,
        isEasyMode,
        evaluatedLeft: evaluation.left,
        data,
      });
      
      if (initialStep === 3 && shouldGateFullSolutionHint({
        isSupporter,
        isDateUnlocked: unlockedAutocompleteDates.has(puzzle.dateIdentifier),
      })) {
        setRewardModalAction({
          actionName: 'reveal a full solution',
          adDurationSeconds: HINT_REWARD_AD_DURATION_SECONDS,
          claimLabel: 'Unlock Clue',
          onSuccess: () => {
            setUnlockedAutocompleteDates((prev) => {
              const next = new Set(prev);
              next.add(puzzle.dateIdentifier);
              return next;
            });
            setHintStep(3);
            applyHintStep(3, data);
          },
        });
        setIsDeadEnd(false);
        setUsedHint(true);
      } else {
        setHintStep(initialStep);
        setIsDeadEnd(false);
        setUsedHint(true);
        applyHintStep(initialStep, data);
      }
    } catch {
      setMessageTone('error');
      if (equation.trim().length > 0) {
        const errMsg = gameMode === 'single_expr'
          ? 'Could not quickly find a solution with what is currently entered.'
          : 'Could not quickly find a solution to balance the sides with what is currently entered.';
        setMessage(errMsg);
        setIsDeadEnd(true);
      } else {
        setMessage('Could not find any solutions for this puzzle.');
      }
    } finally {
      setHintLoading(false);
    }
  }, [puzzle, gameMode, targetValue, equation, applyHintStep, unlockedAutocompleteDates, isSupporter, isEasyMode, evaluation.left]);

  const handleHintClick = useCallback(() => {
    if (hintStep === 0) {
      void fetchHint();
    } else {
      let nextStep = Math.min(hintStep + 1, 3);
      if (hintData) {
        nextStep = nextVisibleHintStep({
          requestedStep: nextStep,
          currentHintStep: hintStep,
          equation,
          gameMode,
          isEasyMode,
          evaluatedLeft: evaluation.left,
          data: hintData,
        });
      }

      if (nextStep === 3) {
        if (isDeadEnd || !hintData || !hintData.solution) {
          return;
        }
        if (puzzle && shouldGateFullSolutionHint({
          isSupporter,
          isDateUnlocked: unlockedAutocompleteDates.has(puzzle.dateIdentifier),
        })) {
          setRewardModalAction({
            actionName: 'reveal a full solution',
            adDurationSeconds: HINT_REWARD_AD_DURATION_SECONDS,
            claimLabel: 'Unlock Clue',
            onSuccess: () => {
              setUnlockedAutocompleteDates((prev) => {
                const next = new Set(prev);
                next.add(puzzle.dateIdentifier);
                return next;
              });
              setHintStep(3);
              if (hintData) {
                applyHintStep(3, hintData);
              }
            },
          });
        } else {
          setHintStep(3);
          if (hintData) {
            applyHintStep(3, hintData);
          }
        }
      } else {
        setHintStep(nextStep);
        if (hintData) {
          applyHintStep(nextStep, hintData);
        }
      }
    }
  }, [hintStep, fetchHint, hintData, applyHintStep, puzzle, unlockedAutocompleteDates, isDeadEnd, equation, gameMode, isEasyMode, evaluation.left, isSupporter]);

  const shareSolution = useCallback((sol: SavedSolution, dateId: string) => {
    const text = savedSolutionSharePayload(dateDisplayString(dateId), sol);
    void navigator.clipboard.writeText(text);
    setMessageTone('success');
    setMessage('Stats copied to clipboard!');
  }, []);

  const dateInputLabel = useMemo(() => {
    if (!puzzle) return 'Puzzle date';
    return `Puzzle date, currently ${puzzle.displayDate}`;
  }, [puzzle]);

  const toggleThemePreference = useCallback(() => {
    setThemePreference((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const playPuzzle = useCallback(() => {
    setActiveView('game');
  }, []);

  const showPractice = useCallback(() => {
    clear();
    setGuidedFirstWinActive(false);
    setActiveView('practice');
  }, [clear]);

  const startPracticeFromStart = useCallback(() => {
    localStorage.setItem(playStartedKey, 'true');
    setPlayStarted(true);
    showPractice();
  }, [showPractice]);

  const showRules = useCallback(() => {
    setActiveView('rules');
  }, []);

  const showSolutions = useCallback(() => {
    setActiveView('solutions');
  }, []);

  const showSettingsPage = useCallback(() => {
    setActiveView('settings');
  }, []);

  const showHowToPlay = useCallback(() => {
    setShowHowToPlayDetailFirst(false);
    setActiveView('howToPlay');
  }, []);

  const showDetailedHowToPlay = useCallback(() => {
    setShowHowToPlayDetailFirst(true);
    setActiveView('howToPlay');
  }, []);

  const startGuidedFirstWin = useCallback(() => {
    clear();
    localStorage.setItem(playStartedKey, 'true');
    setPlayStarted(true);
    setGuidedFirstWinActive(true);
    setActiveView('practice');
    setMessage('');
  }, [clear]);

  const restartTutorial = useCallback(() => {
    localStorage.removeItem(playStartedKey);
    localStorage.removeItem(guidedFirstWinStorageKey);
    setPlayStarted(false);
    setGuidedFirstWinCompleted(false);
    setGuidedFirstWinActive(false);
    setActiveView('game');
  }, []);

  const clearBrowserData = useCallback(() => {
    const confirmed = window.confirm('Clear saved solutions and settings from this browser?');
    if (!confirmed) return;

    localStorage.removeItem(storageKey);
    localStorage.removeItem(playStartedKey);
    localStorage.removeItem(guidedFirstWinStorageKey);
    localStorage.removeItem(themePreferenceKey);
    localStorage.removeItem(difficultyModeKey);
    localStorage.removeItem(supporterEntitlementKey);
    setSavedSolutions({});
    setPlayStarted(false);
    setGuidedFirstWinCompleted(false);
    setGuidedFirstWinActive(false);
    setIsSupporter(false);
    setThemePreference('light');
    setDifficultyMode('easy');
    setEditorState(emptyEditorState());
    setEvaluation({ left: '?', right: '?', equation: '' });
    setStartTime(null);
    setActiveView('start');
    setMessageTone('success');
    setMessage('Local data cleared.');
  }, []);

  const supportApp = useCallback(() => {
    localStorage.setItem(supporterEntitlementKey, 'true');
    setIsSupporter(true);
    setRewardModalAction(null);
    setMessageTone('success');
    setMessage('Thanks for supporting Crackle Date. Sponsor ads are removed on this device.');
  }, []);

  const showCalendar = useCallback(() => {
    setActiveView('calendar');
  }, []);

  const showGame = useCallback(() => {
    setActiveView('game');
  }, []);

  const chooseCalendarDate = useCallback((dateIdentifier: string) => {
    setSelectedDate(dateIdentifier);
  }, []);

  const playCalendarDate = useCallback(() => {
    const todayId = localDateIdentifier(new Date());
    const decision = dateAccessDecisionFor({
      selectedDate,
      today: todayId,
      unlockedFutureDates,
      removesAds: isSupporter,
    });

    if (decision.kind === 'future_unlock') {
      setRewardModalAction({
        actionName: `play a puzzle in the future (${decision.selectedDate})`,
        adDurationSeconds: FUTURE_DATE_AD_DURATION_SECONDS,
        claimLabel: 'Play Date',
        onSuccess: () => {
          setUnlockedFutureDates((prev) => {
            const next = new Set(prev);
            next.add(decision.selectedDate);
            return next;
          });
          setActiveView('game');
        },
        onClose: () => {
          setSelectedDate(dateAfterCancelingFutureGate(todayId));
        },
      });
    } else {
      setActiveView('game');
    }
  }, [isSupporter, selectedDate, unlockedFutureDates]);

  const chooseToday = useCallback(() => {
    setSelectedDate(localDateIdentifier(new Date()));
  }, []);

  const openLogin = useCallback(() => {
    setAuthModalMode(authUser ? 'account' : 'login');
  }, [authUser]);

  const handleAuthenticated = useCallback(
    (user: AuthUser) => {
      setAuthUser(user);
      if (user.emailVerified) {
        setAuthModalMode(null);
        void syncAccountData(user, { promptImport: true });
      } else {
        setAuthModalMode('verify');
        setAccountPreferencesLoaded(false);
      }
    },
    [syncAccountData],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    setAuthUser(null);
    setAuthModalMode(null);
    setShowImportPrompt(false);
    setPendingImportSolutions({});
    setAccountPreferencesLoaded(false);
  }, []);

  const importLocalSolutions = useCallback(async () => {
    if (!authUser?.emailVerified || !accountImportKey) return;
    const imported = await importAccountSolutions(pendingImportSolutions);
    localStorage.setItem(accountImportKey, 'true');
    setShowImportPrompt(false);
    setPendingImportSolutions({});
    await syncAccountData(authUser);
    setMessageTone('success');
    setMessage(imported === 1 ? 'Imported 1 local solution.' : `Imported ${imported} local solutions.`);
  }, [accountImportKey, authUser, pendingImportSolutions, syncAccountData]);

  const skipLocalImport = useCallback(() => {
    if (accountImportKey) {
      localStorage.setItem(accountImportKey, 'true');
    }
    setShowImportPrompt(false);
    setPendingImportSolutions({});
  }, [accountImportKey]);

  const showEvaluationError = shouldSurfaceEvaluationError(
    tokens,
    nextDigitIndex,
    evaluation.equation === equation ? evaluation.errorMessage ?? '' : '',
  );
  const feedbackMessage = message || (showEvaluationError ? evaluation.errorMessage ?? '' : '');
  const feedbackTone: FeedbackTone = message ? messageTone : 'error';

  return (
    <main
      className={`app-shell play-shell ${
        activeView === 'start' ? 'start-shell' : ''
      } ${
        activeView === 'game' || activeView === 'practice' ? 'game-shell' : ''
      } ${activeView === 'calendar' ? 'calendar-shell detail-shell' : ''} ${
        activeView === 'solutions' ? 'solutions-shell detail-shell' : ''
      } ${
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
          <nav className="site-nav" aria-label="Site">
            {activeView === 'game' && !isEquationCorrect && !(todaySolutions.length > 0 && !isSearchingAnother) && (
              <ToolbarButton
                label="Hint"
                icon={<HintIcon />}
                className={`toolbar-hint-button${shakeHintButton ? ' shake' : ''}`}
                isExpanded={true}
                onClick={handleHintClick}
                disabled={hintLoading}
              />
            )}
            <ToolbarButton
              label={puzzle?.displayDate ?? 'Calendar'}
              icon={<CalendarIcon />}
              isExpanded={activeView === 'calendar'}
              onClick={activeView === 'calendar' ? showGame : showCalendar}
              ariaLabel={dateInputLabel}
            />
            <ToolbarButton
              label="Stats"
              icon={<StatsIcon />}
              isExpanded={activeView === 'solutions'}
              onClick={activeView === 'solutions' ? showGame : showSolutions}
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
        </header>
      )}

      {confettiActive && <Confetti />}

      {activeView === 'start' && (
        <StartScreen
          onPlay={playPuzzle}
          onHowToPlay={showHowToPlay}
          onPractice={startPracticeFromStart}
        />
      )}

      {(activeView === 'game' || activeView === 'practice') && (
        <section className="game-panel" aria-label={`${puzzle?.displayDate ?? 'Crackle Date'} game board`}>
          {isPracticeMode && (
            <div className="practice-coach" role="note">
              <strong>{practiceRound.title}: {practiceRound.displayDate}</strong>
              <span>{guidedPracticeStep?.instruction ?? practiceRound.coach}</span>
              <small>{practiceRound.coach}</small>
            </div>
          )}
          {gameAdBannerReason && <GameAdBanner reason={gameAdBannerReason} />}
          {todaySolutions.length > 0 && !isSearchingAnother ? (
            <VictoryPanel
              displayDate={puzzle?.displayDate ?? selectedDate}
              summary={dailyDashboardSummary}
              solutions={todaySolutions}
              savedSolutions={savedSolutions}
              badges={badges}
              onPlayAnother={() => {
                clear();
                setIsSearchingAnother(true);
              }}
              onUnlockTomorrow={handleUnlockTomorrow}
              onShare={shareDailyResults}
              onShareIndividual={shareSolutionText}
              onShowSavedSolutions={showSolutions}
              onShowCalendar={showCalendar}
              isFutureUnlocked={unlockedFutureDates.has(tomorrowId)}
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
                  onShowDetailedInstructions={showDetailedHowToPlay}
                  onStartPractice={showPractice}
                  selectorMoveRef={selectorMoveRef}
                  nextDigit={nextDigit}
                  onAppendDigit={appendDigit}
                  isAutocompleting={isAutocompleting}
                />

                <EquationHelperRow
                  showHelperValues={isEasyMode}
                  leftValue={<RepeatingDecimalValue value={evaluation.left || '?'} />}
                  middleValue={<RepeatingDecimalValue value={evaluation.middle || '?'} />}
                  rightValue={<RepeatingDecimalValue value={evaluation.right || '?'} />}
                  onMove={moveSelectorFromControls}
                  gameMode={gameMode}
                  targetValue={(gameMode === 'target' || gameMode === 'single_expr') ? targetValue : undefined}
                />
              </div>

              <div className="control-area">
                {hintStep > 0 && hintData && (
                  <div className="hint-panel" aria-live="polite">
                    <div className="hint-header">
                      <strong>Hint (Step {hintStep}/3)</strong>
                      <button
                        type="button"
                        className="close-hint"
                        onClick={() => {
                          setHintStep(0);
                          setHintData(null);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div className="hint-body">
                      {isDeadEnd ? (
                        isEquationCorrect ? (
                          <p className="dead-end-message success-message">
                            🎉 Equation is correct! Click Submit to save your solution.
                          </p>
                        ) : (
                          <p className="dead-end-message">
                            ⚠️ {gameMode === 'single_expr' ? (
                              <>Could not quickly find a solution with what is currently entered. Try backspacing or clearing.</>
                            ) : (
                              <>Could not quickly find a solution to balance the sides with what is currently entered. Try backspacing or clearing.</>
                            )}
                          </p>
                        )
                      ) : (
                        <>
                          {hintStep === 1 && (
                            <p>
                              {gameMode === 'target' || gameMode === 'single_expr' ? (
                                <>Left side could start with: <code>{hintData.step1}</code></>
                              ) : isLHSCompleteForHint && hintData.balancingHint ? (
                                <>{hintData.balancingHint}</>
                              ) : (
                                <>Target value of all parts is: <strong>{hintData.step1}</strong></>
                              )}
                            </p>
                          )}
                          {hintStep === 2 && (
                            <p>
                              {gameMode === 'single_expr' ? (
                                <>Expression is almost complete: <code>{hintData.step2}</code></>
                              ) : gameMode === 'target' ? (
                                <>Right side could start with: <code>{hintData.step2}</code></>
                              ) : gameMode === 'double_equality' ? (
                                <>First two parts could be: <code>{hintData.step2}</code></>
                              ) : isLHSCompleteForHint && hintData.balancingHint ? (
                                <>{hintData.mathTip || "Tip: remember that x^0 = 1"}</>
                              ) : (
                                <>Left side could be: <code>{hintData.step2}</code></>
                              )}
                            </p>
                          )}
                          {hintStep === 3 && (
                            <p>
                              A possible solution: <code>{hintData.step3}</code>
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    {hintStep < 3 && !isDeadEnd && (
                      <button type="button" className="next-hint-button" onClick={handleHintClick}>
                        Next Hint
                      </button>
                    )}
                  </div>
                )}

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
                  {gameMode !== 'single_expr' && (
                    <button className={`wide ${activeGlowKey === '=' ? 'glow' : ''}`.trim()} type="button" onClick={() => insertText('=')}>
                      =
                    </button>
                  )}
                  <button className={`${gameMode === 'single_expr' ? 'wide submit' : 'submit'} ${activeGlowKey === 'Submit' ? 'glow' : ''}`.trim()} type="button" onClick={submit}>
                    Submit
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <StatusToast message={feedbackMessage} tone={feedbackTone} />

      {activeView === 'calendar' && (
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

      {activeView === 'solutions' && (
        <SolutionsPage
          badges={badges}
          savedSolutions={savedSolutions}
        />
      )}

      {activeView === 'settings' && (
        <SettingsPanel
          themePreference={themePreference}
          difficultyMode={difficultyMode}
          gameMode={gameMode}
          authUser={authUser}
          onThemePreferenceChange={setThemePreference}
          onDifficultyModeChange={setDifficultyMode}
          onGameModeChange={setGameMode}
          onLogin={openLogin}
          onLogout={handleLogout}
          onClearData={clearBrowserData}
          onShowHowToPlay={showHowToPlay}
          onPractice={showPractice}
          onShowRules={showRules}
          onRestartTutorial={restartTutorial}
          onSupport={supportApp}
          isSupporter={isSupporter}
        />
      )}

      {activeView === 'howToPlay' && (
        <HowToPlayView
          initiallyShowDetail={showHowToPlayDetailFirst}
          onPlay={playPuzzle}
        />
      )}

      {activeView === 'rules' && (
        <WrittenRulesView
          onPlay={playPuzzle}
          onHowToPlay={showHowToPlay}
        />
      )}

      {guidedFirstWinRoute === GuidedFirstWinRoute.GuidedFirstWin && activeView === 'game' && (
        <GuidedTutorial
          onStartGuidedCrack={startGuidedFirstWin}
          onReadRules={showRules}
        />
      )}

      {authModalMode && (
        <AuthModal
          mode={authModalMode}
          user={authUser}
          themePreference={themePreference}
          difficultyMode={difficultyMode}
          onModeChange={setAuthModalMode}
          onAuthenticated={handleAuthenticated}
          onLogout={handleLogout}
          onClose={() => setAuthModalMode(null)}
        />
      )}

      {rewardModalAction && (
        <RewardModal
          actionName={rewardModalAction.actionName}
          adDurationSeconds={rewardModalAction.adDurationSeconds}
          claimLabel={rewardModalAction.claimLabel}
          onSuccess={() => {
            rewardModalAction.onSuccess();
            setRewardModalAction(null);
          }}
          onClose={() => {
            rewardModalAction.onClose?.();
            setRewardModalAction(null);
          }}
          onOpenAuth={() => {
            setRewardModalAction(null);
            setAuthModalMode('signup');
          }}
          onSupporterUpgrade={supportApp}
          isLoggedIn={!!authUser}
        />
      )}

      {showImportPrompt && (
        <ImportPrompt
          count={countStoredSolutions(pendingImportSolutions)}
          onImport={importLocalSolutions}
          onSkip={skipLocalImport}
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

function AuthModal({
  mode,
  user,
  themePreference,
  difficultyMode,
  onModeChange,
  onAuthenticated,
  onLogout,
  onClose,
}: {
  mode: AuthModalMode;
  user: AuthUser | null;
  themePreference: ThemePreference;
  difficultyMode: DifficultyMode;
  onModeChange: (mode: AuthModalMode) => void;
  onAuthenticated: (user: AuthUser) => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
    setError('');
    setNotice('');
  }, [mode, user]);

  const submitAuth = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError('');
      setNotice('');
      setIsBusy(true);
      try {
        if (mode === 'signup') {
          if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
          }
          const nextUser = await signup(email, password, { themePreference, difficultyMode });
          onAuthenticated(nextUser);
          setNotice('Verification email sent. Click the link or enter the code.');
          return;
        }
        if (mode === 'login') {
          const nextUser = await login(email, password);
          onAuthenticated(nextUser);
          if (!nextUser.emailVerified) {
            setNotice('Verify your email before account syncing turns on.');
          }
          return;
        }
        if (mode === 'verify') {
          const nextUser = await verifyCode(email, code);
          onAuthenticated(nextUser);
        }
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : 'Account request failed');
      } finally {
        setIsBusy(false);
      }
    },
    [code, difficultyMode, email, mode, onAuthenticated, password, themePreference],
  );

  const resend = useCallback(async () => {
    setError('');
    setNotice('');
    setIsBusy(true);
    try {
      await resendVerification(email);
      setNotice('Verification email sent.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Could not send verification email');
    } finally {
      setIsBusy(false);
    }
  }, [email]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
          x
        </button>

        {mode === 'account' ? (
          <>
            <h2 id="auth-title">Account</h2>
            <p>{user?.email}</p>
            {user?.emailVerified ? (
              <span className="auth-status verified">Verified</span>
            ) : (
              <span className="auth-status">Email not verified</span>
            )}
            {!user?.emailVerified && (
              <button className="auth-primary" type="button" onClick={() => onModeChange('verify')}>
                Enter verification code
              </button>
            )}
            {!user?.emailVerified && (
              <button className="auth-secondary" type="button" disabled={isBusy} onClick={resend}>
                Resend email
              </button>
            )}
            <button className="auth-secondary" type="button" onClick={onLogout}>
              Log out
            </button>
          </>
        ) : (
          <form onSubmit={submitAuth}>
            <h2 id="auth-title">
              {mode === 'signup' ? 'Create account' : mode === 'verify' ? 'Verify email' : 'Log in'}
            </h2>
            <label>
              Email
              <input
                type="email"
                value={email}
                autoComplete="email"
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {mode !== 'verify' && (
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={8}
                  maxLength={128}
                  required
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            )}
            {mode === 'signup' && (
              <p className={`password-note ${password.length >= 8 ? 'ok' : ''}`}>
                Minimum 8 characters.
              </p>
            )}
            {mode === 'verify' && (
              <label>
                Verification code
                <input
                  type="text"
                  value={code}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  minLength={6}
                  maxLength={6}
                  required
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
            )}
            {error && <p className="auth-error">{error}</p>}
            {notice && <p className="auth-notice">{notice}</p>}
            <button className="auth-primary" type="submit" disabled={isBusy}>
              {isBusy ? 'Working...' : mode === 'signup' ? 'Create account' : mode === 'verify' ? 'Verify' : 'Log in'}
            </button>
            {mode === 'verify' && (
              <button className="auth-secondary" type="button" disabled={isBusy} onClick={resend}>
                Resend email
              </button>
            )}
            {mode === 'login' && (
              <button className="auth-switch" type="button" onClick={() => onModeChange('signup')}>
                Create an account
              </button>
            )}
            {mode === 'signup' && (
              <button className="auth-switch" type="button" onClick={() => onModeChange('login')}>
                I already have an account
              </button>
            )}
          </form>
        )}
      </section>
    </div>
  );
}

function CircularTimer({ timeLeft, total = 5, onClick, active }: { timeLeft: number; total: number; onClick: () => void; active: boolean }) {
  const radius = 18;
  const stroke = 3;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (timeLeft / total) * circumference;

  return (
    <button
      className={`playable-ad-close-btn ${active ? 'active animate-bounce' : 'disabled'}`}
      type="button"
      onClick={active ? onClick : undefined}
      disabled={!active}
      aria-label={active ? "Close and claim reward" : `Close disabled. Ad ends in ${timeLeft} seconds`}
    >
      <svg height={radius * 2} width={radius * 2} className="timer-svg">
        <circle
          stroke="rgba(255, 255, 255, 0.15)"
          fill="rgba(0, 0, 0, 0.5)"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={active ? "var(--ios-green)" : "#ff007f"}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 1s linear' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <span className="timer-text">
        {active ? '×' : timeLeft}
      </span>
    </button>
  );
}

function GameAdBanner({ reason }: { reason: 'past' | 'current_solution' }) {
  const copy = reason === 'past'
    ? 'Archive play is supported by a sponsor banner.'
    : 'Additional solves for today are supported by a sponsor banner.';

  return (
    <aside className="game-ad-banner" aria-label="Sponsor banner">
      <span className="game-ad-label">Ad</span>
      <span>{copy}</span>
    </aside>
  );
}

function RewardModal({
  actionName,
  adDurationSeconds,
  claimLabel,
  onSuccess,
  onClose,
  onOpenAuth,
  onSupporterUpgrade,
  isLoggedIn,
}: {
  actionName: string;
  adDurationSeconds: number;
  claimLabel: string;
  onSuccess: () => void;
  onClose: () => void;
  onOpenAuth: () => void;
  onSupporterUpgrade: () => void;
  isLoggedIn: boolean;
}) {
  const [status, setStatus] = useState<'ready' | 'playing' | 'completed'>('ready');
  const [timeLeft, setTimeLeft] = useState(adDurationSeconds);

  // Countdown timer effect for Ad Option
  useEffect(() => {
    if (status !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus('completed');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  // Dynamic Google AdSense injection
  useEffect(() => {
    if (status === 'playing') {
      const scriptId = 'adsense-sdk';
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-demo';
        script.async = true;
        script.crossOrigin = 'anonymous';
        document.body.appendChild(script);
      }

      // Initialize ads
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch (e) {
        console.warn('AdSense init error:', e);
      }
    }
  }, [status]);

  const startAd = () => {
    setStatus('playing');
    setTimeLeft(adDurationSeconds);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section 
        className={`auth-modal reward-modal-wrapper ${status === 'playing' ? 'ad-playing' : ''} ${status === 'completed' ? 'ad-completed' : ''}`} 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="reward-title"
        onPointerUp={(e) => e.stopPropagation()}
      >
        <header className="reward-modal-header">
          <h2 id="reward-title">Support Crackle Date</h2>
          <button 
            type="button" 
            className="reward-modal-close" 
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </header>

        {status === 'ready' && (
          <div className="reward-portal-content">
            <p className="reward-subtitle">
              Choose how you'd like to unlock <strong>"{actionName}"</strong>:
            </p>
            
            <div className={`reward-options-grid ${isLoggedIn ? 'two-cols' : 'three-cols'}`}>
              
              {/* Card 1: Supporter Option */}
              <div className="reward-option-card premium-card">
                <div className="card-badge">SUPPORTER</div>
                <div className="card-icon">$</div>
                <h3 className="card-title">Supporter Option</h3>
                <div className="card-price">$1.99</div>
                
                <ul className="card-features">
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Support Crackle Date development</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Removes sponsor banners</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Keeps saves and stats unchanged</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Future dates open without sponsor gates</span>
                  </li>
                </ul>

                <button 
                  type="button" 
                  className="reward-option-btn premium-btn"
                  onClick={onSupporterUpgrade}
                >
                  Support for $1.99
                </button>
              </div>

              {/* Card 2: Sync Account (only if NOT logged in) */}
              {!isLoggedIn && (
                <div className="reward-option-card sync-card">
                  <div className="card-badge sync-badge">RECOMMENDED</div>
                  <div className="card-icon">🔑</div>
                  <h3 className="card-title">Sync Progress</h3>
                  <div className="card-price">Free</div>
                  
                  <ul className="card-features">
                    <li>
                      <span className="check-icon">✓</span>
                      <span>Track streaks & solve stats</span>
                    </li>
                    <li>
                      <span className="check-icon">✓</span>
                      <span>Sync seamlessly across devices</span>
                    </li>
                    <li>
                      <span className="check-icon">✓</span>
                      <span>Save custom puzzle settings</span>
                    </li>
                    <li>
                      <span className="check-icon">✓</span>
                      <span>Permanent progress backup</span>
                    </li>
                  </ul>

                  <button 
                    type="button" 
                    className="reward-option-btn sync-btn"
                    onClick={onOpenAuth}
                  >
                    Create Free Account
                  </button>
                </div>
              )}

              {/* Card 3: Free with Ads */}
              <div className="reward-option-card ad-option-card">
                <div className="card-badge free-badge">FREE</div>
                <div className="card-icon">📺</div>
                <h3 className="card-title">Watch Ad</h3>
                <div className="card-price">{adDurationSeconds} Seconds</div>
                
                <ul className="card-features">
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Quick {adDurationSeconds}-second countdown</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>No subscription required</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Supports independent developer</span>
                  </li>
                  <li>
                    <span className="check-icon">✓</span>
                    <span>Unlock instantly</span>
                  </li>
                </ul>

                <button 
                  type="button" 
                  className="reward-option-btn ad-btn"
                  onClick={startAd}
                >
                  Watch Sponsor Ad
                </button>
              </div>

            </div>
          </div>
        )}

        {status === 'playing' && (
          <div className="ad-playback-container">
            <div className="ad-playback-header">
              <span className="ad-playback-badge">Sponsor Advertisement</span>
              <CircularTimer
                timeLeft={timeLeft}
                total={adDurationSeconds}
                onClick={() => setStatus('completed')}
                active={timeLeft === 0}
              />
            </div>

            <div className="adsense-slot-container">
              {/* Google AdSense ins container */}
              <ins 
                className="adsbygoogle"
                style={{ display: 'block', width: '300px', height: '250px', margin: '0 auto' }}
                data-ad-client="ca-pub-demo"
                data-ad-slot="1234567890"
              />
              
              {/* Fallback visual container that matches state of the art */}
              <div className="adsense-fallback-placeholder">
                <div className="spinner"></div>
                <p className="placeholder-brand">Crackle Date Sponsor</p>
                <p className="placeholder-sub">Ad loading or blocked by extension...</p>
              </div>
            </div>
            
            <p className="ad-playback-footer">
              Your unlock will be available after the timer completes. Thank you for supporting Crackle Date.
            </p>
          </div>
        )}

        {status === 'completed' && (
          <div className="ad-playback-completed">
            <div className="completed-icon">✓</div>
            <h3>Reward Ready!</h3>
            <p>Sponsor advertisement complete. Continue below.</p>
            <button 
              type="button" 
              className="reward-claim-btn"
              onClick={onSuccess}
            >
              {claimLabel}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function VictoryPanel({
  displayDate,
  summary,
  solutions,
  savedSolutions,
  badges,
  onPlayAnother,
  onUnlockTomorrow,
  onShare,
  onShareIndividual,
  onShowSavedSolutions,
  onShowCalendar,
  isFutureUnlocked,
  hasTomorrow,
  isArchived,
  onGoToToday,
}: {
  displayDate: string;
  summary: DailyDashboardSummary | null;
  solutions: SavedSolution[];
  savedSolutions: StoredSolutions;
  badges: SolutionBadge[];
  onPlayAnother: () => void;
  onUnlockTomorrow?: () => void;
  onShare: () => void;
  onShareIndividual: (sol: SavedSolution) => void;
  onShowSavedSolutions: () => void;
  onShowCalendar: () => void;
  isFutureUnlocked: boolean;
  hasTomorrow: boolean;
  isArchived: boolean;
  onGoToToday: () => void;
}) {
  const nextBadgeTarget = nextBadgeTargetFromBadges(badges);
  const victoryMessage = summary
    ? successMessage(summary.latestValue)
    : solutions.length === 1
      ? "You solved today's puzzle. Awesome work!"
      : `You found ${solutions.length} solutions for this date!`;

  return (
    <div className="victory-panel-card">
      <div className="victory-badge-row">
        <span className="victory-badge-pill">🎉 Puzzle Cracked!</span>
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

      {nextBadgeTarget && (
        <section className="next-badge-target" aria-labelledby="next-badge-target-title">
          <span className="next-badge-label">Next Badge</span>
          <h3 id="next-badge-target-title">{nextBadgeTarget.title}</h3>
          <p>{nextBadgeTarget.description}</p>
          <strong>{nextBadgeTarget.actionText}</strong>
        </section>
      )}

      <div className="victory-solutions-section">
        <h3>Your Solutions</h3>
        <ul className="victory-sol-list">
          {solutions.map((sol, index) => {
            const solMode = sol.mode || 'classic';
            const modeLabel =
              solMode === 'classic'
                ? 'Classic'
                : solMode === 'double_equality'
                ? 'Double ='
                : solMode === 'target'
                ? `Target (${sol.targetValue || '10'})`
                : `Single (${sol.targetValue || '10'})`;

            return (
              <li className="victory-sol-item" key={index}>
                <div className="victory-sol-main">
                  <span className="victory-sol-math">
                    <MathEquation equation={sol.equation} />
                  </span>
                  <div className="victory-sol-metadata">
                    <span className="victory-badge-mode">{modeLabel}</span>
                    <span>⏱ {formatTime(sol.seconds)}</span>
                    <span className={`victory-badge-diff difficulty-${sol.difficulty || 'easy'}`}>
                      {sol.difficulty || 'easy'}
                    </span>
                    {sol.usedHint && <span className="victory-badge-hint">💡 Hint</span>}
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
        <button className="auth-primary victory-main-share-btn" type="button" onClick={onShare}>
          <span className="share-icon-inline">
            <ShareIcon />
          </span>
          Share Daily
        </button>

        <div className="victory-secondary-row">
          <button className="auth-secondary" type="button" onClick={onPlayAnother}>
            Keep Playing
          </button>

          <button className="auth-secondary" type="button" onClick={onShowSavedSolutions}>
            Saved Solutions
          </button>

          <button className="auth-secondary" type="button" onClick={onShowCalendar}>
            Calendar
          </button>

          {isArchived && (
            <button className="auth-secondary" type="button" onClick={onGoToToday}>
              Play Today's Puzzle
            </button>
          )}

          {hasTomorrow && onUnlockTomorrow && (
            <button className="auth-secondary unlock-tomorrow-btn-ad" type="button" onClick={onUnlockTomorrow}>
              {isFutureUnlocked ? "Play Tomorrow's Puzzle" : "Unlock Tomorrow's Puzzle (30s Ad)"}
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

function ImportPrompt({
  count,
  onImport,
  onSkip,
}: {
  count: number;
  onImport: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h2 id="import-title">Import local solutions?</h2>
        <p>
          {count === 1
            ? 'Attach 1 saved browser solution to this account.'
            : `Attach ${count} saved browser solutions to this account.`}
        </p>
        <button className="auth-primary" type="button" onClick={onImport}>
          Import
        </button>
        <button className="auth-secondary" type="button" onClick={onSkip}>
          Not now
        </button>
      </section>
    </div>
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

function StatsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-5" />
      <path d="M12 16V8" />
      <path d="M16 16v-3" />
    </svg>
  );
}

function SolutionsPage({
  badges,
  savedSolutions,
}: {
  badges: SolutionBadge[];
  savedSolutions: StoredSolutions;
}) {
  return (
    <section className="solutions-page" aria-labelledby="solutions-page-title">
      <div className="solutions-page-header">
        <div>
          <h1 id="solutions-page-title">Stats</h1>
        </div>
      </div>
      <StatsDashboard savedSolutions={savedSolutions} />
      <BadgesSection badges={badges} />
    </section>
  );
}

function BadgesSection({ badges }: { badges: SolutionBadge[] }) {
  const earnedBadges = badges.filter((badge) => badge.earned);

  if (earnedBadges.length === 0) {
    return null;
  }

  return (
    <section className="badges-section" aria-labelledby="badges-title">
      <div className="badges-header">
        <h2 id="badges-title">Badges</h2>
      </div>

      <div className="badge-grid">
        {earnedBadges.map((badge) => (
          <article
            className="solution-badge"
            key={badge.id}
            aria-label={`${badge.title}, earned ${formatBadgeEarnedDate(badge.earnedDate)}`}
          >
            {badge.iconSrc && (
              <img className="badge-icon" src={badge.iconSrc} alt="" />
            )}
            <strong>{badge.title}</strong>
            <time dateTime={badge.earnedDate}>{formatBadgeEarnedDate(badge.earnedDate)}</time>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatBadgeEarnedDate(dateIdentifier: string | undefined): string {
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
        const solutionMode = solution.mode ?? 'classic';
        const modeLabel =
          solutionMode === 'classic'
            ? 'Classic'
            : solutionMode === 'double_equality'
            ? 'Double Equality'
            : solutionMode === 'target'
            ? `Target (${solution.targetValue ?? '?'})`
            : `Single Expr (${solution.targetValue ?? '?'})`;

        return (
          <li key={`${solution.equation}-${solution.timestamp}`}>
            <div className="solution-row-content">
              <strong>
                <MathEquation equation={solution.equation} className="solution-equation" />
              </strong>
              <span className="solution-meta-row">
                <span className="solution-mode">{modeLabel}</span>
                <span className="solution-divider">·</span>
                <span>{formatTime(solution.seconds)}</span>
                <span className="solution-divider">·</span>
                <span className="solution-value-label">value <RepeatingDecimalValue value={solution.value} /></span>
                {solution.solvedOnOtherDay && <span className="solution-badge archive-badge">Archive</span>}
                {solution.usedHint && <span className="solution-badge hint-badge">Used Hint</span>}
                {solution.difficulty && (
                  <span className={`solution-badge difficulty-${solution.difficulty}`}>
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

function HintIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5.5 5.5 0 0 0 7 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
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

function HowToPlayView({
  onPlay,
}: {
  initiallyShowDetail?: boolean;
  onPlay: () => void;
}) {
  const [detailIndex, setDetailIndex] = useState(0);
  const detailCard = HOW_TO_PLAY_DETAIL_CARDS[detailIndex];

  const goToPreviousDetail = useCallback(() => {
    setDetailIndex((current) =>
      (current - 1 + HOW_TO_PLAY_DETAIL_CARDS.length) % HOW_TO_PLAY_DETAIL_CARDS.length
    );
  }, []);

  const goToNextDetail = useCallback(() => {
    setDetailIndex((current) => (current + 1) % HOW_TO_PLAY_DETAIL_CARDS.length);
  }, []);

  if (!detailCard) {
    return null;
  }

  return (
    <section className="start-panel" aria-labelledby="how-to-play-detail-title">
      <div className="how-to-play-card detailed-how-to-play-card">
        <div className="how-to-play-header">
          <img className="start-icon" src="/app-icon.png" alt="" />
          <div>
            <p className="document-kicker">Crackle Date</p>
            <h1 id="how-to-play-detail-title">Cracked Instructions</h1>
          </div>
        </div>

        <div className="how-to-play-actions">
          <button className="start-action-button play-button" type="button" onClick={onPlay}>
            Back to Game
          </button>
        </div>

        <article className="how-to-play-detail-card" aria-live="polite">
          <img src={detailCard.imageSrc} alt={detailCard.imageAlt} />
          <div className="how-to-play-detail-note">
            <p className="how-to-play-detail-count">
              {detailIndex + 1} of {HOW_TO_PLAY_DETAIL_CARDS.length}
            </p>
            <h2>{detailCard.title}</h2>
            <p>{detailCard.note}</p>
          </div>
        </article>

        <div className="how-to-play-detail-controls" aria-label="Detailed instruction controls">
          <button
            className="selector-arrow-button"
            type="button"
            onClick={goToPreviousDetail}
            aria-label="Previous instruction card"
          >
            ←
          </button>
          <button
            className="selector-arrow-button"
            type="button"
            onClick={goToNextDetail}
            aria-label="Next instruction card"
          >
            →
          </button>
        </div>

      </div>
    </section>
  );
}

function WrittenRulesView({
  onPlay,
  onHowToPlay,
}: {
  onPlay: () => void;
  onHowToPlay: () => void;
}) {
  return (
    <section className="start-panel" aria-labelledby="written-rules-title">
      <div className="how-to-play-card written-rules-card">
        <div className="how-to-play-header">
          <img className="start-icon" src="/app-icon.png" alt="" />
          <div>
            <p className="document-kicker">Crackle Date</p>
            <h1 id="written-rules-title">Rules</h1>
          </div>
        </div>

        <p className="written-rules-intro">
          Use the date digits to make both sides equal. Practice is separate from your daily progress.
        </p>

        <div className="how-to-play-actions">
          <button className="start-action-button play-button" type="button" onClick={onPlay}>
            Back to Game
          </button>
          <button className="start-action-button secondary" type="button" onClick={onHowToPlay}>
            Cracked Instructions
          </button>
        </div>

        <div className="written-rules-list">
          {RULES_SECTIONS.map((section) => (
            <section className="written-rule-section" key={section.title} aria-labelledby={`rules-${section.title.toLowerCase().replaceAll(' ', '-')}`}>
              <h2 id={`rules-${section.title.toLowerCase().replaceAll(' ', '-')}`}>{section.title}</h2>
              <ul>
                {section.rows.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </section>
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
        <button className="calendar-today-button" type="button" onClick={onToday}>
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
          <h2>Equations for {formatBadgeEarnedDate(selectedDate)}</h2>
          <button className="play-date-button" type="button" onClick={onPlay}>
            Play this Date
          </button>
        </div>
        <SolutionsList solutions={savedSolutions[selectedDate] ?? []} onShare={(sol) => onShare(sol, selectedDate)} />
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
      subtitle="Crackle Date is built to be played with local saves, optional accounts, limited sponsor ads, and no public profile."
      meta="Last updated June 25, 2026"
    >
      <DocumentSection
        title="Local Storage"
        rows={[
          {
            label: 'On this device',
            body: 'When signed out, saved solutions, settings, theme choice, difficulty mode, and whether you have started playing are stored locally on your device or in this browser.',
          },
          {
            label: 'Clearing data',
            body: 'You can remove local web data from the Settings page with Clear Data, or by clearing this site in your browser settings.',
          },
        ]}
      />

      <DocumentSection
        title="Optional Accounts"
        rows={[
          {
            label: 'Email login',
            body: 'If you create an account, Crackle Date stores your email address, password hash, email verification status, sessions, preferences, and saved solutions.',
          },
          {
            label: 'Verification',
            body: 'New accounts must verify their email address by link or code before account syncing is enabled.',
          },
        ]}
      />

      <DocumentSection
        title="Anonymous Web Submissions"
        rows={[
          {
            label: 'What is sent',
            body: 'When you submit a web solution, Crackle Date sends the puzzle date, equation, solve time, difficulty mode, platform, app version, and submission time. If you are signed in and verified, the attempt is linked to your account.',
          },
          {
            label: 'What is not sent',
            body: 'Submitted records do not include your name, email address, account ID, passwords, payment information, advertising identifier, or the contents of browser storage.',
          },
          {
            label: 'Server logs',
            body: 'The server may keep basic operational request logs needed to run and secure the site. Solution records are only tied to an account when you are signed in with a verified email.',
          },
        ]}
      />

      <DocumentSection
        title="Ads"
        rows={[
          {
            label: 'Date-based sponsor ads',
            body: 'Past dates can show a banner ad. The current date can show a banner ad after you already have one saved solution for that date. Future dates can ask you to watch a 30-second sponsor ad before opening that date.',
          },
          {
            label: 'Ad technology',
            body: 'Web sponsor ads may be served through a browser ad provider. Depending on the provider and your browser settings, ad delivery can process device, browser, approximate location, and ad interaction signals.',
          },
          {
            label: '$1.99 supporter option',
            body: 'The supporter option is for supporting Crackle Date and removes date-based sponsor ads on this browser.',
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
            body: 'Accounts are only for saving your own puzzle history and settings; there is no public profile, leaderboard, or user-generated content feed.',
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
      subtitle="Quick checks for gameplay, saved data, ads, paid support, display issues, and details to include when something does not behave as expected."
      meta="Last updated June 25, 2026"
    >
      <DocumentSection
        title="Paid Support"
        rows={[
          {
            label: '$1.99 Supporter Option',
            body: 'The supporter option is for supporting Crackle Date and removes date-based sponsor ads on this browser.',
          },
          {
            label: 'Future date unlocks',
            body: 'Future dates can use a 30-second sponsor ad before play. Past dates and extra current-date solves can show a banner ad unless the supporter option is active.',
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
            body: 'If you are signed out, saved solutions and badges are local to this browser. Sign in and verify your email to sync history across visits.',
          },
        ]}
      />

      <DocumentSection
        title="Useful Details"
        rows={[
          {
            label: 'Puzzle date',
            body: 'Include the puzzle date, difficulty mode, and whether the issue happened on the game board, calendar, settings, solutions, or instructions screen.',
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
            label: 'Account optional',
            body: 'Do not send passwords, payment details, private identifiers, or unrelated personal information. Crackle Date does not need those details for support.',
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
    const value = localStorage.getItem(storageKey);
    return value ? (JSON.parse(value) as StoredSolutions) : {};
  } catch {
    return {};
  }
}

function loadThemePreference(): ThemePreference {
  const value = localStorage.getItem(themePreferenceKey);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'light';
}

function loadDifficultyMode(): DifficultyMode {
  return localStorage.getItem(difficultyModeKey) === 'hard' ? 'hard' : 'easy';
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
  if (!seconds) return 'Saved';
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
