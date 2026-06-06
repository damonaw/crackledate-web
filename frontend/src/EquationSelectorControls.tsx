import React from 'react';

export type SelectorDirection = -1 | 1;

type EquationSelectorControlsProps = {
  onMove: (direction: SelectorDirection) => void;
};

export function EquationSelectorControls({ onMove }: EquationSelectorControlsProps) {
  return (
    <div className="selector-arrow-controls" aria-label="Move equation selector">
      <button
        className="selector-arrow-button"
        type="button"
        aria-label="Move selector left"
        onClick={() => onMove(-1)}
      >
        ←
      </button>
      <button
        className="selector-arrow-button"
        type="button"
        aria-label="Move selector right"
        onClick={() => onMove(1)}
      >
        →
      </button>
    </div>
  );
}
