import React from 'react';

export function EquationEmptyState({
  onShowDetailedInstructions,
}: {
  onShowDetailedInstructions: () => void;
}) {
  return (
    <p className="equation-empty-prompt">
      Not sure where to start, get some{' '}
      <button
        className="equation-empty-help-button"
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onShowDetailedInstructions();
        }}
      >
        cracked instructions
      </button>
    </p>
  );
}
