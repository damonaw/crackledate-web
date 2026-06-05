import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { shouldSurfaceEvaluationError } from './editorFeedback';
import { equationToLatex, equationTokensToLatex, type EquationLatexToken } from './mathLatexFormatter';
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

type ValueSegment = {
  text: string;
  isRepeating: boolean;
};

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
  const [activeView, setActiveView] = useState<'game' | 'solutions'>('game');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [tokens, setTokens] = useState<EquationToken[]>([]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [evaluation, setEvaluation] = useState<EvaluationState>({ left: '?', right: '?', equation: '' });
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<FeedbackTone>('success');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [savedSolutions, setSavedSolutions] = useState<StoredSolutions>(loadSolutions);
  const [themePreference, setThemePreference] = useState<ThemePreference>(loadThemePreference);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>(loadDifficultyMode);
  const [showSettings, setShowSettings] = useState(false);

  const equation = useMemo(() => tokensToEquation(tokens), [tokens]);
  const usedDigitIndices = useMemo(() => digitIndicesInUse(tokens), [tokens]);
  const nextDigitIndex = useMemo(
    () => (puzzle ? firstUnusedDigitIndex(tokens, puzzle.digits) : null),
    [puzzle, tokens],
  );
  const todaySolutions = puzzle ? savedSolutions[puzzle.dateIdentifier] ?? [] : [];
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
    if (!showSettings) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSettings(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSettings]);

  useEffect(() => {
    let isCurrent = true;
    fetch(`/api/puzzle?date=${selectedDate}`)
      .then((response) => response.json() as Promise<Puzzle>)
      .then((nextPuzzle) => {
        if (!isCurrent) return;
        setPuzzle(nextPuzzle);
        setTokens([]);
        setCursorIndex(0);
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

  const insertText = useCallback(
    (value: string) => {
      if (!startTime) {
        setStartTime(Date.now());
      }
      setTokens((current) => insertTokenAt(current, cursorIndex, createOperatorToken(value)));
      setCursorIndex((index) => index + 1);
      setMessage('');
    },
    [cursorIndex, startTime],
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
      setTokens((current) => {
        if (isClosingDelimiterToken(current[cursorIndex], closeValue, closeRole)) {
          return current;
        }

        const next = [...current];
        next.splice(
          cursorIndex,
          0,
          createOperatorToken(openValue, openRole),
          createOperatorToken(closeValue, closeRole),
        );
        return next;
      });
      setCursorIndex((index) => index + 1);
      setMessage('');
    },
    [cursorIndex, startTime],
  );

  const insertClosingDelimiter = useCallback(
    (closeValue: string) => {
      if (!startTime) {
        setStartTime(Date.now());
      }
      setTokens((current) => {
        if (current[cursorIndex]?.value === closeValue) {
          return current;
        }

        return insertTokenAt(current, cursorIndex, createOperatorToken(closeValue));
      });
      setCursorIndex((index) => index + 1);
      setMessage('');
    },
    [cursorIndex, startTime],
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
    setTokens((current) => insertTokenAt(current, cursorIndex, createDigitToken(nextDigit, nextDigitIndex)));
    setCursorIndex((index) => index + 1);
    setMessage('');
  }, [cursorIndex, nextDigit, nextDigitIndex, startTime]);

  const backspace = useCallback(() => {
    if (cursorIndex === 0) return;
    setTokens((current) => {
      const left = current[cursorIndex - 1];
      const right = current[cursorIndex];
      if (
        (left?.value === '(' && right?.value === ')') ||
        isAbsoluteValuePair(left, right)
      ) {
        const next = [...current];
        next.splice(cursorIndex - 1, 2);
        return next;
      }

      return current.filter((_, index) => index !== cursorIndex - 1);
    });
    setCursorIndex((index) => Math.max(0, index - 1));
    setMessage('');
  }, [cursorIndex]);

  const clear = useCallback(() => {
    setTokens([]);
    setCursorIndex(0);
    setEvaluation({ left: '?', right: '?', equation: '' });
    setMessage('');
    setStartTime(null);
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

  const showStart = useCallback(() => {
    setIsPlaying(false);
    setActiveView('game');
    setShowSettings(false);
  }, []);

  const showSolutions = useCallback(() => {
    localStorage.setItem(playStartedKey, 'true');
    setIsPlaying(true);
    setActiveView('solutions');
    setShowSettings(false);
  }, []);

  const showGame = useCallback(() => {
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
        activeView === 'solutions' ? 'solutions-shell' : ''
      }`}
    >
      <header className={`top-bar ${isPlaying ? 'game-top-bar' : ''}`}>
        <button className="brand" type="button" onClick={showStart} aria-label="Crackle Date home">
          <img src="/app-icon.png" alt="" />
          <span>Crackle Date</span>
        </button>
        {isPlaying && (
          <DatePickerControl
            className="top-date-picker"
            label={dateInputLabel}
            displayDate={puzzle?.displayDate ?? 'Crackle Date'}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
          />
        )}
        <nav className="site-nav" aria-label="Site">
          <button
            className="settings-trigger"
            type="button"
            aria-label="Settings"
            aria-expanded={showSettings}
            aria-controls="settings-drawer"
            onClick={() => setShowSettings((isVisible) => !isVisible)}
          >
            <SettingsIcon />
          </button>
        </nav>
      </header>

      {showSettings && (
        <SettingsPanel
          themePreference={themePreference}
          difficultyMode={difficultyMode}
          onThemePreferenceChange={setThemePreference}
          onDifficultyModeChange={setDifficultyMode}
          onShowSolutions={showSolutions}
          onClose={() => setShowSettings(false)}
        />
      )}

      {!isPlaying && (
        <StartPage
          puzzle={puzzle}
          solutionCount={todaySolutions.length}
          onPlay={playPuzzle}
        />
      )}

      {isPlaying && activeView === 'game' && (
        <>
          <section className="game-panel" aria-label={`${puzzle?.displayDate ?? 'Crackle Date'} game board`}>
            <EquationEditor tokens={tokens} cursorIndex={cursorIndex} onCursorChange={setCursorIndex} />

            {isEasyMode && (
              <div className="helper-row" aria-live="polite">
                <div className="helper-value">
                  <span className="helper-label">L</span>
                  <RepeatingDecimalValue value={evaluation.left || '?'} />
                </div>
                <div className="helper-value">
                  <span className="helper-label">R</span>
                  <RepeatingDecimalValue value={evaluation.right || '?'} />
                </div>
              </div>
            )}

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
          </section>

          <aside className="solutions-panel" aria-labelledby="solutions-title">
            <h2 id="solutions-title">Saved solutions</h2>
            <SolutionsList solutions={todaySolutions} />
          </aside>
        </>
      )}

      <StatusToast message={feedbackMessage} tone={feedbackTone} />

      {isPlaying && activeView === 'solutions' && (
        <SolutionsPage
          displayDate={puzzle?.displayDate ?? 'Selected date'}
          solutions={todaySolutions}
          onBack={showGame}
        />
      )}
    </main>
  );
}

function StatusToast({ message, tone }: { message: string; tone: FeedbackTone }) {
  if (!message) {
    return null;
  }

  return (
    <div className="toast-region" aria-live={tone === 'error' ? 'assertive' : 'polite'}>
      <div
        className={`status-toast ${tone === 'error' ? 'error' : 'success'}`}
        role={tone === 'error' ? 'alert' : 'status'}
        data-testid="status-toast"
      >
        <span className="status-toast-accent" aria-hidden="true" />
        <span>{message}</span>
      </div>
    </div>
  );
}

function SettingsPanel({
  themePreference,
  difficultyMode,
  onThemePreferenceChange,
  onDifficultyModeChange,
  onShowSolutions,
  onClose,
}: {
  themePreference: ThemePreference;
  difficultyMode: DifficultyMode;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onDifficultyModeChange: (mode: DifficultyMode) => void;
  onShowSolutions: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <button className="settings-backdrop" type="button" aria-label="Close settings" onClick={onClose} />
      <section
        className="settings-drawer"
        id="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-header">
          <div>
            <h2 id="settings-title">Settings</h2>
            <span>Saved on this browser</span>
          </div>
          <button className="settings-close" type="button" aria-label="Close settings" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="settings-group">
          <fieldset className="settings-row">
            <legend>Appearance</legend>
            <div className="segmented-control">
              {(['system', 'light', 'dark'] as const).map((preference) => (
                <label key={preference}>
                  <input
                    type="radio"
                    name="appearance"
                    value={preference}
                    checked={themePreference === preference}
                    onChange={() => onThemePreferenceChange(preference)}
                  />
                  <span>{preference === 'system' ? 'Auto' : preference[0].toUpperCase() + preference.slice(1)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="settings-row">
            <legend>Difficulty</legend>
            <div className="segmented-control">
              {(['easy', 'hard'] as const).map((mode) => (
                <label key={mode}>
                  <input
                    type="radio"
                    name="difficulty"
                    value={mode}
                    checked={difficultyMode === mode}
                    onChange={() => onDifficultyModeChange(mode)}
                  />
                  <span>{mode[0].toUpperCase() + mode.slice(1)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <nav className="settings-links" aria-label="Help and policies">
          <button className="mobile-only-link" type="button" onClick={onShowSolutions}>
            Saved Solutions
          </button>
          <a href="/privacy/">Privacy</a>
          <a href="/support/">Support</a>
        </nav>
      </section>
    </>
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

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SolutionsPage({
  displayDate,
  solutions,
  onBack,
}: {
  displayDate: string;
  solutions: SavedSolution[];
  onBack: () => void;
}) {
  return (
    <section className="solutions-page" aria-labelledby="solutions-page-title">
      <div className="solutions-page-header">
        <div>
          <h1 id="solutions-page-title">Saved Solutions</h1>
          <p>{displayDate}</p>
        </div>
        <button type="button" onClick={onBack}>
          Puzzle
        </button>
      </div>
      <SolutionsList solutions={solutions} />
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
}: {
  equation: string;
  className?: string;
  cursorIndex?: number;
  tokens?: EquationLatexToken[];
  preserveDelimiters?: boolean;
}) {
  const latex = useMemo(
    () =>
      tokens
        ? equationTokensToLatex(tokens, { cursorIndex, preserveDelimiters })
        : equationToLatex(equation, { cursorIndex, preserveDelimiters }),
    [cursorIndex, equation, preserveDelimiters, tokens],
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

function StartPage({
  puzzle,
  solutionCount,
  onPlay,
}: {
  puzzle: Puzzle | null;
  solutionCount: number;
  onPlay: () => void;
}) {
  const [infoMode, setInfoMode] = useState<'rules' | 'stats' | null>(null);

  return (
    <section className="start-panel" aria-labelledby="start-title">
      <div className="start-card">
        <div className="start-copy">
          <h1 id="start-title">Crackle Date</h1>
          <p className="start-date">{puzzle?.displayDate ?? 'Today'}</p>
        </div>

        <button className="play-button" type="button" onClick={onPlay}>
          Play
        </button>

        <div className="start-secondary-actions">
          <button
            type="button"
            aria-pressed={infoMode === 'rules'}
            onClick={() => setInfoMode((mode) => (mode === 'rules' ? null : 'rules'))}
          >
            How to Play
          </button>
          <button
            type="button"
            aria-pressed={infoMode === 'stats'}
            onClick={() => setInfoMode((mode) => (mode === 'stats' ? null : 'stats'))}
          >
            Stats
          </button>
        </div>

        {infoMode && (
          <div className="start-info-card">
            {infoMode === 'rules' ? (
              <>
                <strong>Use the date digits in order.</strong>
                <span>Add operators between digits and make both sides of the equals sign match.</span>
              </>
            ) : (
              <>
                <strong>{solutionCount === 1 ? '1 saved solution' : `${solutionCount} saved solutions`}</strong>
                <span>Stats and solutions are stored locally in this browser.</span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DatePickerControl({
  className,
  label,
  displayDate,
  selectedDate,
  onSelectedDateChange,
}: {
  className: string;
  label: string;
  displayDate: string;
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
}) {
  return (
    <label className={className}>
      <span>{displayDate}</span>
      <input
        type="date"
        aria-label={label}
        value={selectedDate}
        onChange={(event) => onSelectedDateChange(event.target.value)}
      />
    </label>
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
  cursorIndex,
  onCursorChange,
}: {
  tokens: EquationToken[];
  cursorIndex: number;
  onCursorChange: (index: number) => void;
}) {
  if (tokens.length === 0) {
    return (
      <div className="equation-box" aria-label="Equation input" data-testid="equation-editor">
        <CursorSlot index={0} active onCursorChange={onCursorChange} label="Move cursor to start" empty />
      </div>
    );
  }

  const equation = tokensToEquation(tokens);

  return (
    <div className="equation-box" aria-label="Equation input" data-testid="equation-editor">
      <div className="equation-preview" aria-hidden="true">
        <MathEquation equation={equation} tokens={tokens} cursorIndex={cursorIndex} preserveDelimiters />
      </div>
      <div className="equation-hit-layer">
        <CursorSlot index={0} active={cursorIndex === 0} onCursorChange={onCursorChange} label="Move cursor to start" />
        {tokens.map((token, index) => (
          <React.Fragment key={token.id}>
            <button
              className="equation-token"
              type="button"
              onClick={() => onCursorChange(index + 1)}
              aria-label={`Move cursor after ${token.value}`}
              data-testid={`equation-token-${index}`}
            >
              {token.value}
            </button>
            <CursorSlot
              index={index + 1}
              active={cursorIndex === index + 1}
              onCursorChange={onCursorChange}
              label={index === tokens.length - 1 ? 'Move cursor to end' : `Move cursor after ${token.value}`}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function CursorSlot({
  index,
  active,
  onCursorChange,
  label,
  empty = false,
}: {
  index: number;
  active: boolean;
  onCursorChange: (index: number) => void;
  label: string;
  empty?: boolean;
}) {
  return (
    <button
      className={`cursor-slot ${active ? 'active' : ''} ${empty ? 'empty' : ''}`}
      type="button"
      onClick={() => onCursorChange(index)}
      aria-label={label}
      data-testid={`cursor-slot-${index}`}
    >
      <span className="cursor" aria-hidden="true" />
    </button>
  );
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

function createTokenId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createOperatorToken(value: string, role?: EquationToken['role']): EquationToken {
  return { id: createTokenId(), value, role };
}

function createDigitToken(value: number, digitIndex: number): EquationToken {
  return { id: createTokenId(), value: String(value), digitIndex };
}

function insertTokenAt(tokens: EquationToken[], cursorIndex: number, token: EquationToken): EquationToken[] {
  const next = [...tokens];
  next.splice(cursorIndex, 0, token);
  return next;
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

function isAbsoluteValuePair(left: EquationToken | undefined, right: EquationToken | undefined): boolean {
  return left?.value === '|' && left.role === 'absoluteOpen' && right?.value === '|' && right.role === 'absoluteClose';
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

function formatTime(seconds: number): string {
  if (!seconds) return 'Saved';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

createRoot(document.getElementById('root')!).render(<App />);
