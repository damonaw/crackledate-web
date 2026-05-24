import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [equation, setEquation] = useState('');
  const [consumedCount, setConsumedCount] = useState(0);
  const [evaluation, setEvaluation] = useState<EvaluationResponse>({ left: '?', right: '?' });
  const [message, setMessage] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [savedSolutions, setSavedSolutions] = useState<StoredSolutions>(loadSolutions);
  const [themePreference, setThemePreference] = useState<ThemePreference>(loadThemePreference);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>(loadDifficultyMode);
  const [showSettings, setShowSettings] = useState(false);

  const todaySolutions = puzzle ? savedSolutions[puzzle.dateIdentifier] ?? [] : [];
  const nextDigit = puzzle && consumedCount < puzzle.digits.length ? puzzle.digits[consumedCount] : null;
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
        setEquation('');
        setConsumedCount(0);
        setEvaluation({ left: '?', right: '?' });
        setMessage('');
        setStartTime(null);
      })
      .catch(() => setMessage('Could not load the puzzle date.'));
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

  const appendText = useCallback(
    (value: string) => {
      if (!startTime) {
        setStartTime(Date.now());
      }
      setEquation((current) => current + value);
      setMessage('');
    },
    [startTime],
  );

  const appendDigit = useCallback(() => {
    if (nextDigit === null) return;
    appendText(String(nextDigit));
    setConsumedCount((count) => count + 1);
  }, [appendText, nextDigit]);

  const backspace = useCallback(() => {
    setEquation((current) => {
      if (!current) return current;
      const last = current.at(-1);
      if (last && /\d/.test(last)) {
        setConsumedCount((count) => Math.max(0, count - 1));
      }
      return current.slice(0, -1);
    });
    setMessage('');
  }, []);

  const clear = useCallback(() => {
    setEquation('');
    setConsumedCount(0);
    setEvaluation({ left: '?', right: '?' });
    setMessage('');
    setStartTime(null);
  }, []);

  const submit = useCallback(async () => {
    if (!puzzle) return;
    const normalizedEquation = equation.trim();
    if (todaySolutions.some((solution) => solution.equation === normalizedEquation)) {
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
  }, []);

  const showStart = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return (
    <main className={`app-shell ${isPlaying ? 'play-shell' : 'start-shell'}`}>
      <header className="top-bar">
        <button className="brand" type="button" onClick={showStart} aria-label="Crackle Date home">
          <img src="/app-icon.png" alt="" />
          <span>Crackle Date</span>
        </button>
        <nav className="site-nav" aria-label="Site">
          <button
            type="button"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((isVisible) => !isVisible)}
          >
            Settings
          </button>
          <a href="/privacy/">Privacy</a>
          <a href="/support/">Support</a>
        </nav>
      </header>

      {showSettings && (
        <SettingsPanel
          themePreference={themePreference}
          difficultyMode={difficultyMode}
          onThemePreferenceChange={setThemePreference}
          onDifficultyModeChange={setDifficultyMode}
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

      {isPlaying && (
        <>
          <section className="game-panel" aria-labelledby="game-title">
            <div className="game-heading">
              <div>
                <h1 id="game-title">{puzzle?.displayDate ?? 'Crackle Date'}</h1>
                <p>Use the date digits in order to build matching equations.</p>
              </div>
              <label className="date-picker">
                <span>{dateInputLabel}</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
            </div>

            {puzzle && (
              <DigitRail
                digits={puzzle.digits}
                delimiterPositions={puzzle.delimiterPositions}
                consumedCount={consumedCount}
              />
            )}

            <div className="equation-box" aria-label="Equation input">
              <span>{equation}</span>
              <span className="cursor" aria-hidden="true" />
            </div>

            {isEasyMode && (
              <div className="helper-row" aria-live="polite">
                <span>L {evaluation.left || '?'}</span>
                <span>R {evaluation.right || '?'}</span>
              </div>
            )}

            {nextDigit !== null && (
              <button className="next-digit" type="button" onClick={appendDigit}>
                {nextDigit}
              </button>
            )}

            <div className="operator-grid" aria-label="Equation controls">
              {operators.map(([label, value]) => (
                <button key={value} type="button" onClick={() => appendText(value)}>
                  {label}
                </button>
              ))}
              <button className="danger" type="button" onClick={clear}>
                C
              </button>
              <button className="warning" type="button" onClick={backspace} aria-label="Backspace">
                ⌫
              </button>
              <button className="wide" type="button" onClick={() => appendText('=')}>
                =
              </button>
              <button className="submit" type="button" onClick={submit}>
                Submit
              </button>
            </div>

            {message && <p className="status-message">{message}</p>}
            {evaluation.errorMessage && !message && <p className="status-message error">{evaluation.errorMessage}</p>}
          </section>

          <aside className="solutions-panel" aria-labelledby="solutions-title">
            <h2 id="solutions-title">Saved solutions</h2>
            {todaySolutions.length === 0 ? (
              <p>No solutions saved for this date yet.</p>
            ) : (
              <ol>
                {todaySolutions.map((solution) => (
                  <li key={`${solution.equation}-${solution.timestamp}`}>
                    <strong>{solution.equation}</strong>
                    <span>
                      {formatTime(solution.seconds)} · value {solution.value}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </>
      )}
    </main>
  );
}

function SettingsPanel({
  themePreference,
  difficultyMode,
  onThemePreferenceChange,
  onDifficultyModeChange,
}: {
  themePreference: ThemePreference;
  difficultyMode: DifficultyMode;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onDifficultyModeChange: (mode: DifficultyMode) => void;
}) {
  return (
    <section className="settings-panel" aria-label="Settings">
      <fieldset>
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
              <span>{preference[0].toUpperCase() + preference.slice(1)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Mode</legend>
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
    </section>
  );
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
            consumedCount={-1}
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
  consumedCount,
  variant = 'game',
}: {
  digits: number[];
  delimiterPositions: number[];
  consumedCount: number;
  variant?: 'game' | 'start';
}) {
  const delimiters = new Set(delimiterPositions);
  return (
    <div className={`digit-rail ${variant === 'start' ? 'start-digits' : ''}`} aria-label="Date digits">
      {digits.map((digit, index) => (
        <React.Fragment key={`${digit}-${index}`}>
          <span className={index < consumedCount ? 'used' : index === consumedCount ? 'active' : ''}>{digit}</span>
          {delimiters.has(index) && <i aria-hidden="true" />}
        </React.Fragment>
      ))}
    </div>
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
