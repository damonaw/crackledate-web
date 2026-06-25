import React from 'react';
import { guidedFirstWinCopy } from './guidedFirstWinPolicy';

export function GuidedTutorial({
  onStartGuidedCrack,
  onReadRules,
}: {
  onStartGuidedCrack: () => void;
  onReadRules: () => void;
}) {
  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="guided-first-win-title">
      <div className="tutorial-card guided-first-win-card">
        <div className="tutorial-card-header">
          <h2 id="guided-first-win-title" className="tutorial-card-title">
            {guidedFirstWinCopy.title}
          </h2>
        </div>

        <p className="tutorial-card-text">{guidedFirstWinCopy.body}</p>
        <p className="tutorial-card-text">
          Use each date digit in order. Make the left and right sides equal.
        </p>

        <div className="tutorial-card-footer">
          <div className="tutorial-actions">
            <button
              type="button"
              className="tutorial-button secondary"
              onClick={onReadRules}
            >
              {guidedFirstWinCopy.secondaryAction}
            </button>
            <button
              type="button"
              className="tutorial-button primary"
              onClick={onStartGuidedCrack}
            >
              {guidedFirstWinCopy.primaryAction}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
