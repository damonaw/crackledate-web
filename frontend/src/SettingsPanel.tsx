type ThemePreference = 'system' | 'light' | 'dark';
type DifficultyMode = 'easy' | 'hard';

export function SettingsPanel({
  themePreference,
  difficultyMode,
  onThemePreferenceChange,
  onDifficultyModeChange,
  onClearData,
  onShowHowToPlay,
  onPractice = () => undefined,
}: {
  themePreference: ThemePreference;
  difficultyMode: DifficultyMode;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onDifficultyModeChange: (mode: DifficultyMode) => void;
  onClearData: () => void;
  onShowHowToPlay: () => void;
  onPractice?: () => void;
}) {
  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="settings-page-header">
        <div>
          <h1 id="settings-title">Settings</h1>
          <p>Saved on this browser</p>
        </div>
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
          <p className="settings-note">Difficulty changes the daily puzzle challenge. Your choice applies to future puzzles.</p>
        </fieldset>
      </div>

      <nav className="settings-links" aria-label="Help and policies">
        <button className="settings-link-button" type="button" onClick={onShowHowToPlay}>
          How to Play &amp; Rules
        </button>
        <button className="settings-link-button" type="button" onClick={onPractice}>
          Practice / Restart Practice Round
        </button>
        <a href="/privacy/">Privacy</a>
        <a href="/support/">Support</a>
        <button className="clear-data-button" type="button" onClick={onClearData}>
          Clear Data
        </button>
      </nav>

    </section>
  );
}
