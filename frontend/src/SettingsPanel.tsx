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
  authUser = null,
  onThemePreferenceChange,
  onDifficultyModeChange,
  onLogin = () => undefined,
  onClearData,
  onShowHowToPlay,
  onPractice = () => undefined,
  onShowRules = () => undefined,
  onRestartTutorial = () => undefined,
  onSupport = () => undefined,
  isSupporter = false,
}: {
  themePreference: ThemePreference;
  difficultyMode: DifficultyMode;
  gameMode: GameMode;
  authUser?: AuthUser | null;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onDifficultyModeChange: (mode: DifficultyMode) => void;
  onGameModeChange: (mode: GameMode) => void;
  onLogin?: () => void;
  onClearData: () => void;
  onShowHowToPlay: () => void;
  onPractice?: () => void;
  onShowRules?: () => void;
  onRestartTutorial?: () => void;
  onSupport?: () => void;
  isSupporter?: boolean;
}) {
  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="settings-page-header">
        <div>
          <h1 id="settings-title">Settings</h1>
          <p>
            {authUser
              ? authUser.emailVerified
                ? `Synced as ${authUser.email}`
                : `Signed in as ${authUser.email}. Verify email to sync.`
              : 'Saved on this browser'}
          </p>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row account-row">
          <span>Account</span>
          <button type="button" onClick={onLogin}>
            {authUser ? 'Account' : 'Log in'}
          </button>
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
          Restart Practice Round
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
          {isSupporter
            ? 'Supporter ads are removed on this browser.'
            : 'The supporter option is for supporting Crackle Date and removes date-based sponsor ads on this browser.'}
        </span>
        {!isSupporter && (
          <button className="settings-support-action" type="button" onClick={onSupport}>
            Support for $1.99
          </button>
        )}
      </div>
    </section>
  );
}
