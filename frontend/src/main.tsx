import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { equationToLatex } from './mathLatexFormatter';
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

type EquationToken = {
  id: string;
  value: string;
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
  const [evaluation, setEvaluation] = useState<EvaluationResponse>({ left: '?', right: '?' });
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
    let isCurrent = true;
    fetch(`/api/puzzle?date=${selectedDate}`)
      .then((response) => response.json() as Promise<Puzzle>)
      .then((nextPuzzle) => {
        if (!isCurrent) return;
        setPuzzle(nextPuzzle);
        setTokens([]);
        setCursorIndex(0);
        setEvaluation({ left: '?', right: '?' });
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
      .then(setEvaluation)
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setEvaluation({ left: '?', right: '?' });
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
    setTokens((current) => current.filter((_, index) => index !== cursorIndex - 1));
    setCursorIndex((index) => Math.max(0, index - 1));
    setMessage('');
  }, [cursorIndex]);

  const clear = useCallback(() => {
    setTokens([]);
    setCursorIndex(0);
    setEvaluation({ left: '?', right: '?' });
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
    setMessageTone('success');
    setMessage(`Solved. Both sides equal ${solution.value}.`);
    clear();
  }, [clear, equation, evaluation.left, puzzle, startTime, todaySolutions]);

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

  const feedbackMessage = message || evaluation.errorMessage;
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
          <label className="top-date-picker">
            <span>{puzzle?.displayDate ?? 'Crackle Date'}</span>
            <input
              type="date"
              aria-label={dateInputLabel}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
        )}
        <nav className="site-nav" aria-label="Site">
          <button
            type="button"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((isVisible) => !isVisible)}
          >
            Settings
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
        />
      )}

      {!isPlaying && (
        <StartPage
          puzzle={puzzle}
          selectedDate={selectedDate}
          dateInputLabel={dateInputLabel}
          solutionCount={todaySolutions.length}
          onDateChange={setSelectedDate}
          onPlay={playPuzzle}
        />
      )}

      {isPlaying && activeView === 'game' && (
        <>
          <section className="game-panel" aria-label={`${puzzle?.displayDate ?? 'Crackle Date'} game board`}>
            {puzzle && (
              <DigitRail
                digits={puzzle.digits}
                delimiterPositions={puzzle.delimiterPositions}
                usedDigitIndices={usedDigitIndices}
                activeIndex={nextDigitIndex}
              />
            )}

            <EquationEditor tokens={tokens} cursorIndex={cursorIndex} onCursorChange={setCursorIndex} />

            {feedbackMessage && (
              <p className={`status-message ${feedbackTone === 'error' ? 'error' : ''}`} aria-live="polite">
                {feedbackMessage}
              </p>
            )}

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

            {nextDigit !== null && (
              <button className="next-digit" type="button" onClick={appendDigit} data-testid="next-digit">
                {nextDigit}
              </button>
            )}

            <div className="operator-grid" aria-label="Equation controls">
              {operators.map(([label, value]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => insertText(value)}
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

function SettingsPanel({
  themePreference,
  difficultyMode,
  onThemePreferenceChange,
  onDifficultyModeChange,
  onShowSolutions,
}: {
  themePreference: ThemePreference;
  difficultyMode: DifficultyMode;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onDifficultyModeChange: (mode: DifficultyMode) => void;
  onShowSolutions: () => void;
}) {
  return (
    <section className="settings-panel" aria-label="Settings">
      <div className="settings-header">
        <h2>Settings</h2>
        <span>Saved on this browser</span>
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
}: {
  equation: string;
  className?: string;
  cursorIndex?: number;
}) {
  const latex = useMemo(() => equationToLatex(equation, { cursorIndex }), [cursorIndex, equation]);
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
  selectedDate,
  dateInputLabel,
  solutionCount,
  onDateChange,
  onPlay,
}: {
  puzzle: Puzzle | null;
  selectedDate: string;
  dateInputLabel: string;
  solutionCount: number;
  onDateChange: (date: string) => void;
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

        {puzzle && (
          <DigitRail
            digits={puzzle.digits}
            delimiterPositions={puzzle.delimiterPositions}
            variant="start"
          />
        )}

        <p className="start-subtitle">
          Use today&apos;s digits in order to build matching equations.
        </p>

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

        <label className="date-picker start-date-picker">
          <span>{dateInputLabel}</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}

function DigitRail({
  digits,
  delimiterPositions,
  usedDigitIndices = emptyDigitIndices,
  activeIndex = null,
  variant = 'game',
}: {
  digits: number[];
  delimiterPositions: number[];
  usedDigitIndices?: ReadonlySet<number>;
  activeIndex?: number | null;
  variant?: 'game' | 'start';
}) {
  const delimiters = new Set(delimiterPositions);
  return (
    <div className={`digit-rail ${variant === 'start' ? 'start-digits' : ''}`} aria-label="Date digits">
      {digits.map((digit, index) => (
        <React.Fragment key={`${digit}-${index}`}>
          <span className={digitClassName(index, usedDigitIndices, activeIndex)}>{digit}</span>
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
        <MathEquation equation={equation} cursorIndex={cursorIndex} />
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
    <main className="document-page">
      <PageNav />
      <h1>Privacy Policy</h1>
      <p className="meta">Last updated May 24, 2026</p>
      <section>
        <p>
          Crackle Date is designed as an offline daily math puzzle without advertising, tracking,
          user accounts, or external content.
        </p>
        <h2>Information stored on your device</h2>
        <p>
          The app stores tutorial state, preferences, statistics, and saved solutions locally using
          Apple system storage. The web version stores saved web solutions in your browser.
        </p>
        <h2>Data collection</h2>
        <p>
          Crackle Date does not collect personal data from the app, does not use analytics SDKs, and
          does not send puzzle progress or settings to a user account.
        </p>
        <h2>Tracking and advertising</h2>
        <p>Crackle Date does not show ads, sell personal information, or track you across apps.</p>
      </section>
    </main>
  );
}

function SupportPage() {
  return (
    <main className="document-page">
      <PageNav />
      <h1>Support</h1>
      <section>
        <p>
          For help with Crackle Date, include your app version, device model, iOS version, the date
          puzzle you are solving, and what happened.
        </p>
        <h2>Common checks</h2>
        <ul>
          <li>Use the rules screen if an equation is rejected unexpectedly.</li>
          <li>Check Settings to clear saved solutions and stats history.</li>
          <li>Crackle Date does not require an account or network connection for app gameplay.</li>
        </ul>
      </section>
    </main>
  );
}

function PageNav() {
  return (
    <nav className="page-nav" aria-label="Site">
      <a href="/">Play</a>
      <a href="/privacy/">Privacy</a>
      <a href="/support/">Support</a>
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

function createOperatorToken(value: string): EquationToken {
  return { id: createTokenId(), value };
}

function createDigitToken(value: number, digitIndex: number): EquationToken {
  return { id: createTokenId(), value: String(value), digitIndex };
}

function insertTokenAt(tokens: EquationToken[], cursorIndex: number, token: EquationToken): EquationToken[] {
  const next = [...tokens];
  next.splice(cursorIndex, 0, token);
  return next;
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
