import React from 'react';

export function StartScreen({
  onPlay,
  onHowToPlay,
  onPractice,
}: {
  onPlay: () => void;
  onHowToPlay: () => void;
  onPractice: () => void;
}) {
  return (
    <section className="start-panel" aria-labelledby="start-screen-title">
      <div className="start-screen-card">
        <img className="start-screen-icon" src="/app-icon.png" alt="" />
        <div className="start-screen-copy">
          <h1 id="start-screen-title">Crackle Date</h1>
          <p>Crack the date into equal values with Math!</p>
        </div>

        <button className="start-screen-play-button" type="button" onClick={onPlay}>
          Play
        </button>

        <div className="start-screen-actions" aria-label="Start actions">
          <button className="start-screen-action-button" type="button" onClick={onHowToPlay}>
            How to Play
          </button>
          <button className="start-screen-action-button" type="button" onClick={onPractice}>
            Practice Round
          </button>
        </div>
      </div>
    </section>
  );
}
