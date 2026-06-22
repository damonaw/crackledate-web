import React from 'react';
import { EquationSelectorControls, type SelectorDirection } from './EquationSelectorControls';

type EquationHelperRowProps = {
  showHelperValues: boolean;
  leftValue: React.ReactNode;
  middleValue?: React.ReactNode;
  rightValue: React.ReactNode;
  onMove: (direction: SelectorDirection) => void;
  gameMode?: string;
  targetValue?: string;
};

export function EquationHelperRow({
  showHelperValues,
  leftValue,
  middleValue,
  rightValue,
  onMove,
  gameMode = 'classic',
  targetValue,
}: EquationHelperRowProps) {
  const isSingle = gameMode === 'single_expr';
  const isDoubleEq = gameMode === 'double_equality';

  const containerClasses = ['helper-row'];
  if (isDoubleEq) containerClasses.push('double-equality');
  if (!showHelperValues) containerClasses.push('selector-only');

  return (
    <div className={containerClasses.join(' ')} aria-label="Equation helpers">
      {showHelperValues && (
        <div className="helper-value" aria-live="polite">
          <span className="helper-label">{isSingle ? 'V' : 'L'}</span>
          {leftValue}
        </div>
      )}
      {showHelperValues && isDoubleEq && (
        <div className="helper-value" aria-live="polite">
          <span className="helper-label">M</span>
          {middleValue}
        </div>
      )}
      <EquationSelectorControls onMove={onMove} targetValue={targetValue} />
      {showHelperValues && !isSingle && (
        <div className="helper-value" aria-live="polite">
          <span className="helper-label">R</span>
          {rightValue}
        </div>
      )}
    </div>
  );
}
