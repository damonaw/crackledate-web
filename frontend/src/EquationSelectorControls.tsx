import React from 'react';

export type SelectorDirection = -1 | 1;

type EquationSelectorControlsProps = {
  onMove: (direction: SelectorDirection) => void;
  targetValue?: string;
};

export function EquationSelectorControls({ onMove, targetValue }: EquationSelectorControlsProps) {
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
      {targetValue && (
        <div className="target-badge-mini" aria-label={`Target value is ${targetValue}`}>
          {targetValue}
        </div>
      )}
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
