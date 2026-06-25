type ThemePreference = 'system' | 'light' | 'dark';
type DifficultyMode = 'easy' | 'hard';
type GameMode = 'classic' | 'double_equality' | 'target' | 'single_expr';
type AuthUser = {
  email: string;
  emailVerified: boolean;
};

export function SettingsPanel({
  themePreference,
  difficultyMode,
  gameMode,
  authUser = null,
  onThemePreferenceChange,
  onDifficultyModeChange,
  onGameModeChange,
  onLogin = () => undefined,
  onLogout = () => undefined,
  onClearData,
  onShowHowToPlay,
  onPractice = () => undefined,
  onShowRules = () => undefined,
  onRestartTutorial = () => undefined,
}: {
  themePreference: ThemePreference;
  difficultyMode: DifficultyMode;
  gameMode: GameMode;
  authUser?: AuthUser | null;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onDifficultyModeChange: (mode: DifficultyMode) => void;
  onGameModeChange: (mode: GameMode) => void;
  onLogin?: () => void;
  onLogout?: () => void;
  onClearData: () => void;
  onShowHowToPlay: () => void;
  onPractice?: () => void;
  onShowRules?: () => void;
  onRestartTutorial?: () => void;
}) {
  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="settings-page-header">
        <div>
          <h1 id="settings-title">Settings</h1>
          <p>{authUser?.emailVerified ? `Synced as ${authUser.email}` : 'Saved on this browser'}</p>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row account-row">
          <span>Account</span>
          {authUser ? (
            <button type="button" onClick={onLogout}>
              Log out
            </button>
          ) : (
            <button type="button" onClick={onLogin}>
              Log in
            </button>
          )}
        </div>

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

        <fieldset className="settings-row">
          <legend>Game Mode</legend>
          <div className="segmented-control">
            {([
              { value: 'classic', label: 'Classic' },
              { value: 'double_equality', label: 'Double =' },
              { value: 'target', label: 'Target' },
              { value: 'single_expr', label: 'Single' },
            ] as const).map((mode) => (
              <label key={mode.value}>
                <input
                  type="radio"
                  name="gameMode"
                  value={mode.value}
                  checked={gameMode === mode.value}
                  onChange={() => onGameModeChange(mode.value)}
                />
                <span>{mode.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <nav className="settings-links" aria-label="Help and policies">
        <button className="settings-link-button" type="button" onClick={onShowHowToPlay}>
          How to Play
        </button>
        <button className="settings-link-button" type="button" onClick={onPractice}>
          Practice
        </button>
        <button className="settings-link-button" type="button" onClick={onShowRules}>
          Rules
        </button>
        <button className="settings-link-button" type="button" onClick={onRestartTutorial}>
          Restart Tutorial
        </button>
        <a href="/privacy/">Privacy</a>
        <a href="/support/">Support</a>
        <button className="clear-data-button" type="button" onClick={onClearData}>
          Clear Data
        </button>
      </nav>

      <div className="settings-support-card" aria-label="$1.99 Supporter Option">
        <strong>$1.99 Supporter Option</strong>
        <span>
          Supports Crackle Date development. Date-based sponsor ads may still appear on archive play, extra current-date solves, and future-date unlocks.
        </span>
      </div>
    </section>
  );
}
