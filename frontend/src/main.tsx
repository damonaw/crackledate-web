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
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [equation, setEquation] = useState('');
  const [consumedCount, setConsumedCount] = useState(0);
  const [evaluation, setEvaluation] = useState<EvaluationResponse>({ left: '?', right: '?' });
  const [message, setMessage] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [savedSolutions, setSavedSolutions] = useState<StoredSolutions>(loadSolutions);

  const todaySolutions = puzzle ? savedSolutions[puzzle.dateIdentifier] ?? [] : [];
  const nextDigit = puzzle && consumedCount < puzzle.digits.length ? puzzle.digits[consumedCount] : null;

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

  return (
    <main className="app-shell">
      <header className="top-bar">
        <a className="brand" href="/" aria-label="Crackle Date home">
          Crackle Date
        </a>
        <nav className="site-nav" aria-label="Site">
          <a href="/privacy/">Privacy</a>
          <a href="/support/">Support</a>
        </nav>
      </header>

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

        <div className="helper-row" aria-live="polite">
          <span>L {evaluation.left || '?'}</span>
          <span>R {evaluation.right || '?'}</span>
        </div>

        <button className="next-digit" type="button" onClick={appendDigit} disabled={nextDigit === null}>
          {nextDigit ?? 'Done'}
        </button>

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
    </main>
  );
}

function DigitRail({
  digits,
  delimiterPositions,
  consumedCount,
}: {
  digits: number[];
  delimiterPositions: number[];
  consumedCount: number;
}) {
  const delimiters = new Set(delimiterPositions);
  return (
    <div className="digit-rail" aria-label="Date digits">
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
