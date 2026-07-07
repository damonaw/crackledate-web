import React from 'react';
import { EquationSelectorControls, type SelectorDirection } from './EquationSelectorControls';

type EquationHelperRowProps = {
  showHelperValues: boolean;
  leftValue: React.ReactNode;
  rightValue: React.ReactNode;
  onMove: (direction: SelectorDirection) => void;
};

export function EquationHelperRow({
  showHelperValues,
  leftValue,
  rightValue,
  onMove,
}: EquationHelperRowProps) {
  const containerClasses = ['helper-row'];
  if (!showHelperValues) containerClasses.push('selector-only');

  return (
    <div className={containerClasses.join(' ')} aria-label="Equation helpers">
      {showHelperValues && (
        <div className="helper-value" aria-live="polite">
          <span className="helper-label">L</span>
          {leftValue}
        </div>
      )}
      <EquationSelectorControls onMove={onMove} />
      {showHelperValues && (
        <div className="helper-value" aria-live="polite">
          <span className="helper-label">R</span>
          {rightValue}
        </div>
      )}
    </div>
  );
}
