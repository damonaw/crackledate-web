import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  deleteAtSelection,
  insertTokensAtSelection,
  normalizeEditorSelection,
  moveSelectionHorizontally,
  type EditorSelection,
  type SlotPlacement,
} from './equationEditing';
import { EquationSelectorControls, type SelectorDirection } from './EquationSelectorControls';
import { shouldSurfaceEvaluationError } from './editorFeedback';
import { equationToLatex, equationTokensToLatex, type EquationLatexToken } from './mathLatexFormatter';
import { statusToastDismissMs } from './notificationTiming';
import { savedSolutionDateSet } from './savedSolutionDates';
import { SettingsPanel } from './SettingsPanel';
import { solutionBadges, type SolutionBadge } from './solutionBadges';
import { submitSolutionRecord, webAppVersion } from './submissions';
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
};

type StoredSolutions = Record<string, SavedSolution[]>;
type ThemePreference = 'system' | 'light' | 'dark';
type DifficultyMode = 'easy' | 'hard';
type FeedbackTone = 'success' | 'error';

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
  s: '√',
  S: '√',
  r: '√',
  R: '√',
};

const storageKey = 'crackledate.web.solutions.v1';
const playStartedKey = 'crackledate.web.play-started.v1';
const themePreferenceKey = 'crackledate.web.theme.v1';
const difficultyModeKey = 'crackledate.web.difficulty.v1';
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
  const [isPlaying, setIsPlaying] = useState(() => localStorage.getItem(playStartedKey) === 'true');
  const [activeView, setActiveView] = useState<'game' | 'calendar' | 'solutions' | 'settings'>('game');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [editorState, setEditorState] = useState<EquationEditorState>(emptyEditorState);
  const [evaluation, setEvaluation] = useState<EvaluationState>({ left: '?', right: '?', equation: '' });
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<FeedbackTone>('success');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [savedSolutions, setSavedSolutions] = useState<StoredSolutions>(loadSolutions);
  const [themePreference, setThemePreference] = useState<ThemePreference>(loadThemePreference);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>(loadDifficultyMode);
  const selectorMoveRef = useRef<SelectorMoveHandler | null>(null);

  const { tokens, selection } = editorState;
  const equation = useMemo(() => tokensToEquation(tokens), [tokens]);
  const usedDigitIndices = useMemo(() => digitIndicesInUse(tokens), [tokens]);
  const nextDigitIndex = useMemo(
    () => (puzzle ? firstUnusedDigitIndex(tokens, puzzle.digits) : null),
    [puzzle, tokens],
  );
  const todaySolutions = puzzle ? savedSolutions[puzzle.dateIdentifier] ?? [] : [];
  const savedSolutionDates = useMemo(() => savedSolutionDateSet(savedSolutions), [savedSolutions]);
  const badges = useMemo(() => solutionBadges(savedSolutions), [savedSolutions]);
  const nextDigit = puzzle && nextDigitIndex !== null ? puzzle.digits[nextDigitIndex] : null;
  const isEasyMode = difficultyMode === 'easy';

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
    let isCurrent = true;
    fetch(`/api/puzzle?date=${selectedDate}`)
      .then((response) => response.json() as Promise<Puzzle>)
      .then((nextPuzzle) => {
        if (!isCurrent) return;
        setPuzzle(nextPuzzle);
        setEditorState(emptyEditorState());
        setEvaluation({ left: '?', right: '?', equation: '' });
        setMessage('');
        setStartTime(null);
      })
      .catch(() => {
        setMessageTone('error');
        setMessage('Could not load the puzzle date.');
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: selectedDate, equation }),
      signal: controller.signal,
    })
      .then((response) => response.json() as Promise<EvaluationResponse>)
      .then((response) => setEvaluation({ ...response, equation }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setEvaluation({ left: '?', right: '?', equation });
        }
      });
    return () => controller.abort();
  }, [equation, selectedDate]);

  const applyEditorEdit = useCallback(
    (
      edit: (
        tokens: EquationToken[],
        selection: EditorSelection,
      ) => { tokens: EquationToken[]; selection: EditorSelection },
    ) => {
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

  const insertPairedDelimiter = useCallback(
    (
      openValue: string,
      closeValue: string,
      openRole?: EquationToken['role'],
      closeRole?: EquationToken['role'],
    ) => {
      if (!startTime) {
        setStartTime(Date.now());
      }
      applyEditorEdit((currentTokens, currentSelection) => {
        if (
          currentSelection.kind === 'slot' &&
          isClosingDelimiterToken(currentTokens[currentSelection.index], closeValue, closeRole)
        ) {
          return {
            tokens: currentTokens,
            selection: { kind: 'slot', index: currentSelection.index + 1 },
          };
        }

        return insertTokensAtSelection(currentTokens, currentSelection, [
          createOperatorToken(openValue, openRole),
          createOperatorToken(closeValue, closeRole),
        ]);
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
        insertPairedDelimiter('|', '|', 'absoluteOpen', 'absoluteClose');
        return;
      }
      if (value === '(') {
        insertPairedDelimiter('(', ')');
        return;
      }
      if (value === ')') {
        insertClosingDelimiter(')');
        return;
      }
      insertText(value);
    },
    [insertClosingDelimiter, insertPairedDelimiter, insertText],
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
    setEditorState(emptyEditorState());
    setEvaluation({ left: '?', right: '?', equation: '' });
    setMessage('');
    setStartTime(null);
  }, []);

  const moveSelectorFromControls = useCallback((direction: SelectorDirection) => {
    selectorMoveRef.current?.(direction);
  }, []);

  const submit = useCallback(async () => {
    if (!puzzle) return;
    const normalizedEquation = equation.trim();
    if (todaySolutions.some((solution) => solution.equation === normalizedEquation)) {
      setMessageTone('error');
      setMessage('Solution already saved for this date.');
      return;
    }

    const response = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: puzzle.dateIdentifier, equation: normalizedEquation }),
    });
    const result = (await response.json()) as ValidationResponse;
    if (!result.valid) {
      setMessageTone('error');
      setMessage(result.errorMessage ?? 'That equation is not valid.');
      return;
    }

    const seconds = startTime ? Math.max(1, Math.round((Date.now() - startTime) / 1000)) : 0;
    const solution: SavedSolution = {
      equation: normalizedEquation,
      timestamp: new Date().toISOString(),
      seconds,
      value: result.leftValue ?? evaluation.left,
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
    });
    clear();
    setMessageTone('success');
    setMessage(`Solved. Both sides equal ${solution.value}.`);
  }, [clear, difficultyMode, equation, evaluation.left, puzzle, startTime, todaySolutions]);

  const dateInputLabel = useMemo(() => {
    if (!puzzle) return 'Puzzle date';
    return `Puzzle date, currently ${puzzle.displayDate}`;
  }, [puzzle]);

  const playPuzzle = useCallback(() => {
    localStorage.setItem(playStartedKey, 'true');
    setIsPlaying(true);
    setActiveView('game');
  }, []);

  const showSolutions = useCallback(() => {
    localStorage.setItem(playStartedKey, 'true');
    setIsPlaying(true);
    setActiveView('solutions');
  }, []);

  const showSettingsPage = useCallback(() => {
    localStorage.setItem(playStartedKey, 'true');
    setIsPlaying(true);
    setActiveView('settings');
  }, []);

  const clearBrowserData = useCallback(() => {
    const confirmed = window.confirm('Clear saved solutions and settings from this browser?');
    if (!confirmed) return;

    localStorage.removeItem(storageKey);
    localStorage.removeItem(playStartedKey);
    localStorage.removeItem(themePreferenceKey);
    localStorage.removeItem(difficultyModeKey);
    setSavedSolutions({});
    setThemePreference('system');
    setDifficultyMode('easy');
    setEditorState(emptyEditorState());
    setEvaluation({ left: '?', right: '?', equation: '' });
    setStartTime(null);
    setIsPlaying(false);
    setActiveView('game');
    setMessageTone('success');
    setMessage('Local data cleared.');
  }, []);

  const showCalendar = useCallback(() => {
    localStorage.setItem(playStartedKey, 'true');
    setIsPlaying(true);
    setActiveView('calendar');
  }, []);

  const showGame = useCallback(() => {
    setActiveView('game');
  }, []);

  const chooseCalendarDate = useCallback((dateIdentifier: string) => {
    setSelectedDate(dateIdentifier);
    setActiveView('game');
  }, []);

  const showEvaluationError = shouldSurfaceEvaluationError(
    tokens,
    nextDigitIndex,
    evaluation.equation === equation ? evaluation.errorMessage ?? '' : '',
  );
  const feedbackMessage = message || (showEvaluationError ? evaluation.errorMessage ?? '' : '');
  const feedbackTone: FeedbackTone = message ? messageTone : 'error';

  return (
    <main
      className={`app-shell ${isPlaying ? 'play-shell' : 'start-shell'} ${
        isPlaying && activeView === 'game' ? 'game-shell' : ''
      } ${activeView === 'calendar' ? 'calendar-shell detail-shell' : ''} ${
        activeView === 'solutions' ? 'solutions-shell detail-shell' : ''
      } ${
        activeView === 'settings' ? 'settings-shell detail-shell' : ''
      }`}
    >
      {isPlaying && (
        <header className="top-bar game-top-bar">
          <DatePickerControl
            className="top-date-picker"
            label={dateInputLabel}
            displayDate={puzzle?.displayDate ?? 'Crackle Date'}
            isActive={activeView === 'calendar'}
            onOpen={activeView === 'calendar' ? showGame : showCalendar}
          />
          <nav className="site-nav" aria-label="Site">
            <button
              className="stats-trigger"
              type="button"
              aria-label="Stats"
              aria-pressed={activeView === 'solutions'}
              onClick={activeView === 'solutions' ? showGame : showSolutions}
            >
              <StatsIcon />
            </button>
            <button
              className="settings-trigger"
              type="button"
              aria-label="Settings"
              aria-pressed={activeView === 'settings'}
              onClick={activeView === 'settings' ? showGame : showSettingsPage}
            >
              <SettingsIcon />
            </button>
          </nav>
        </header>
      )}

      {!isPlaying && (
        <StartPage onPlay={playPuzzle} />
      )}

      {isPlaying && activeView === 'game' && (
        <section className="game-panel" aria-label={`${puzzle?.displayDate ?? 'Crackle Date'} game board`}>
          <div className="expression-area">
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
              selectorMoveRef={selectorMoveRef}
            />

            {isEasyMode && (
              <div className="helper-row" aria-label="Equation helpers">
                <div className="helper-value" aria-live="polite">
                  <span className="helper-label">L</span>
                  <RepeatingDecimalValue value={evaluation.left || '?'} />
                </div>
                <EquationSelectorControls onMove={moveSelectorFromControls} />
                <div className="helper-value" aria-live="polite">
                  <span className="helper-label">R</span>
                  <RepeatingDecimalValue value={evaluation.right || '?'} />
                </div>
              </div>
            )}
          </div>

          <div className="control-area">
            {puzzle && (
              <DigitRail
                digits={puzzle.digits}
                delimiterPositions={puzzle.delimiterPositions}
                usedDigitIndices={usedDigitIndices}
                activeIndex={nextDigitIndex}
                onActiveDigitClick={nextDigit !== null ? appendDigit : undefined}
              />
            )}

            <div className="operator-grid" aria-label="Equation controls">
              {operators.map(([label, value]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => insertOperator(value)}
                  data-operator-value={value}
                >
                  {label}
                </button>
              ))}
              <button className="danger" type="button" onClick={clear}>
                C
              </button>
              <button className="warning" type="button" onClick={backspace} aria-label="Backspace">
                ⌫
              </button>
              <button className="wide" type="button" onClick={() => insertText('=')}>
                =
              </button>
              <button className="submit" type="button" onClick={submit}>
                Submit
              </button>
            </div>
          </div>
        </section>
      )}

      <StatusToast message={feedbackMessage} tone={feedbackTone} />

      {isPlaying && activeView === 'calendar' && (
        <CalendarPage
          selectedDate={selectedDate}
          savedSolutionDates={savedSolutionDates}
          onSelectedDateChange={chooseCalendarDate}
        />
      )}

      {isPlaying && activeView === 'solutions' && (
        <SolutionsPage
          displayDate={puzzle?.displayDate ?? 'Selected date'}
          solutions={todaySolutions}
          badges={badges}
        />
      )}

      {isPlaying && activeView === 'settings' && (
        <SettingsPanel
          themePreference={themePreference}
          difficultyMode={difficultyMode}
          onThemePreferenceChange={setThemePreference}
          onDifficultyModeChange={setDifficultyMode}
          onClearData={clearBrowserData}
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
  displayDate,
  solutions,
  badges,
}: {
  displayDate: string;
  solutions: SavedSolution[];
  badges: SolutionBadge[];
}) {
  return (
    <section className="solutions-page" aria-labelledby="solutions-page-title">
      <div className="solutions-page-header">
        <div>
          <h1 id="solutions-page-title">Saved Solutions</h1>
          <p>{displayDate}</p>
        </div>
      </div>
      <BadgesSection badges={badges} />
      <SolutionsList solutions={solutions} />
    </section>
  );
}

function BadgesSection({ badges }: { badges: SolutionBadge[] }) {
  const earnedCount = badges.filter((badge) => badge.earned).length;

  return (
    <section className="badges-section" aria-labelledby="badges-title">
      <div className="badges-header">
        <div>
          <h2 id="badges-title">Badges</h2>
          <p>
            {earnedCount} of {badges.length} earned
          </p>
        </div>
      </div>

      <div className="badge-grid">
        {badges.map((badge) => (
          <article
            className={`solution-badge ${badge.earned ? 'earned' : 'locked'}`}
            key={badge.id}
            aria-label={`${badge.title}, ${badge.earned ? 'earned' : 'locked'}`}
          >
            <div>
              <strong>{badge.title}</strong>
              <p>{badge.description}</p>
            </div>
            <span className="badge-status">{badge.earned ? 'Earned' : 'Locked'}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function SolutionsList({ solutions }: { solutions: SavedSolution[] }) {
  if (solutions.length === 0) {
    return <p>No solutions saved for this date yet.</p>;
  }

  return (
    <ol>
      {solutions.map((solution) => (
        <li key={`${solution.equation}-${solution.timestamp}`}>
          <strong>
            <MathEquation equation={solution.equation} className="solution-equation" />
          </strong>
          <span>
            {formatTime(solution.seconds)} · value <RepeatingDecimalValue value={solution.value} />
          </span>
        </li>
      ))}
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

function StartPage({ onPlay }: { onPlay: () => void }) {
  const [showInstructions, setShowInstructions] = useState(false);

  if (showInstructions) {
    return (
      <HowToPlayStartView
        onBack={() => setShowInstructions(false)}
        onPlay={onPlay}
      />
    );
  }

  return (
    <section className="start-panel" aria-labelledby="start-title">
      <div className="start-card">
        <div className="start-copy">
          <img className="start-icon" src="/app-icon.png" alt="" />
          <h1 id="start-title">Crackle Date</h1>
          <p className="start-tagline">
            Crack the date into equal values{' '}
            <br />
            with Math!
          </p>
        </div>

        <div className="start-actions" aria-label="Start actions">
          <button
            className="start-action-button"
            type="button"
            onClick={() => setShowInstructions(true)}
          >
            How to Play
          </button>
          <button className="start-action-button play-button" type="button" onClick={onPlay}>
            Play
          </button>
        </div>
      </div>
    </section>
  );
}

function HowToPlayStartView({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const steps = [
    {
      title: 'Use the date digits in order.',
      body: 'Tap the active blue digit to place it in the equation. Digits can only be used from left to right.',
    },
    {
      title: 'Add operators between digits.',
      body: 'Use +, −, ×, ÷, roots, exponents, factorials, parentheses, and absolute value bars to shape each side.',
    },
    {
      title: 'Balance both sides.',
      body: 'Add one equals sign, then make the left and right sides evaluate to the same value.',
    },
    {
      title: 'Submit a correct equation.',
      body: 'Correct solutions are saved locally in this browser and can unlock badges.',
    },
  ];

  return (
    <section className="start-panel" aria-labelledby="how-to-play-title">
      <div className="how-to-play-card">
        <div className="how-to-play-header">
          <img className="start-icon" src="/app-icon.png" alt="" />
          <div>
            <p className="document-kicker">Crackle Date</p>
            <h1 id="how-to-play-title">How to Play</h1>
          </div>
        </div>

        <ol className="how-to-play-list">
          {steps.map((step) => (
            <li className="how-to-play-step" key={step.title}>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="how-to-play-actions">
          <button className="start-action-button secondary-button" type="button" onClick={onBack}>
            Back
          </button>
          <button className="start-action-button play-button" type="button" onClick={onPlay}>
            Play
          </button>
        </div>
      </div>
    </section>
  );
}

function DatePickerControl({
  className,
  label,
  displayDate,
  isActive,
  onOpen,
}: {
  className: string;
  label: string;
  displayDate: string;
  isActive: boolean;
  onOpen: () => void;
}) {
  return (
    <div className={className}>
      <button
        className="date-picker-trigger"
        type="button"
        aria-label={label}
        aria-pressed={isActive}
        onClick={onOpen}
      >
        <span>{displayDate}</span>
      </button>
    </div>
  );
}

function CalendarPage({
  selectedDate,
  savedSolutionDates,
  onSelectedDateChange,
}: {
  selectedDate: string;
  savedSolutionDates: ReadonlySet<string>;
  onSelectedDateChange: (date: string) => void;
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
}: {
  digits: number[];
  delimiterPositions: number[];
  usedDigitIndices?: ReadonlySet<number>;
  activeIndex?: number | null;
  onActiveDigitClick?: () => void;
}) {
  const delimiters = new Set(delimiterPositions);
  return (
    <div className="digit-rail" aria-label="Date digits">
      {digits.map((digit, index) => (
        <React.Fragment key={`${digit}-${index}`}>
          {index === activeIndex && onActiveDigitClick ? (
            <button
              className={digitClassName(index, usedDigitIndices, activeIndex)}
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
  selectorMoveRef,
}: {
  tokens: EquationToken[];
  selection: EditorSelection;
  onSelectionChange: (selection: EditorSelection) => void;
  onBackspace: () => void;
  onInsertValue: (value: string) => void;
  selectorMoveRef?: React.MutableRefObject<SelectorMoveHandler | null>;
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
      }

      if (event.key !== 'Backspace') return;
      event.preventDefault();
      onBackspace();
    },
    [
      onBackspace,
      onInsertValue,
      moveSelector,
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
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Backspace' && keyboardInsertableOperators[event.key] === undefined) {
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
  }, [handleEditorKey, isEditableTarget]);

  if (tokens.length === 0) {
    return (
      <div
        ref={editorRef}
        className="equation-box empty"
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
        <p className="equation-empty-prompt">
          Start building your Crackle Date with the numbers and math operators
        </p>
        <div className="equation-selection-layer" aria-hidden="true">
          <span className="equation-selection-cue empty" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={editorRef}
      className="equation-box"
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
      subtitle="Crackle Date is built to be played without accounts, ads, or cross-app tracking."
      meta="Last updated May 24, 2026"
    >
      <DocumentSection
        title="Local Storage"
        rows={[
          {
            label: 'iOS app',
            body: 'Preferences, tutorial state, statistics, and saved solutions stay on your device using Apple system storage.',
          },
          {
            label: 'Web app',
            body: 'Saved web solutions and settings are stored in this browser so your puzzle history works between visits.',
          },
        ]}
      />

      <DocumentSection
        title="Anonymous Web Submissions"
        rows={[
          {
            label: 'What is sent',
            body: 'When a web solution is completed, the web app sends the puzzle date, equation, resulting value, solve time, difficulty mode, platform, app version, and submission time.',
          },
          {
            label: 'What is not sent',
            body: 'Submitted records do not include your name, email address, account ID, device advertising identifier, or the contents of your browser storage.',
          },
          {
            label: 'Reliability logs',
            body: 'The server keeps basic request logs for reliability and uses rotating client hashes instead of storing raw IP addresses in solution records.',
          },
        ]}
      />

      <DocumentSection
        title="Tracking"
        rows={[
          {
            label: 'No ads',
            body: 'Crackle Date does not show ads, sell personal information, or track you across other apps or websites.',
          },
          {
            label: 'No account',
            body: 'There is no account system, login, profile, leaderboard, or user-generated content feed.',
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
      subtitle="Quick checks and details to include when something does not behave the way you expect."
    >
      <DocumentSection
        title="Common Checks"
        rows={[
          {
            label: 'Equation rejected',
            body: 'Confirm the date digits are used in order and that both sides of the equals sign evaluate to the same value.',
          },
          {
            label: 'Unexpected result',
            body: 'Check for unfinished parentheses, absolute value bars, roots, exponents, or division groups before submitting.',
          },
          {
            label: 'Missing history',
            body: 'Saved web solutions are stored in this browser. Clearing browser storage or switching devices can remove local history.',
          },
        ]}
      />

      <DocumentSection
        title="Useful Details"
        rows={[
          {
            label: 'Puzzle date',
            body: 'Include the puzzle date and whether you were playing easy or hard mode.',
          },
          {
            label: 'Equation',
            body: 'Include the equation you typed, especially if formatting, cursor movement, or evaluation looked wrong.',
          },
          {
            label: 'Device',
            body: 'Include whether you were using the iOS app or web app, plus your device, browser, and operating system when possible.',
          },
        ]}
      />

      <DocumentSection
        title="Privacy Reminder"
        rows={[
          {
            label: 'No account needed',
            body: 'Crackle Date does not need passwords, payment details, or personal account information for support.',
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
  return value === 'light' || value === 'dark' ? value : 'system';
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

function isClosingDelimiterToken(
  token: EquationToken | undefined,
  closeValue: string,
  closeRole?: EquationToken['role'],
): boolean {
  if (!token || token.value !== closeValue) {
    return false;
  }

  return closeRole === undefined || token.role === closeRole;
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
