import React from 'react';

export function EquationEmptyState({
  onShowDetailedInstructions,
  onStartPractice,
}: {
  onShowDetailedInstructions: () => void;
  onStartPractice: () => void;
}) {
  const stopEditorPointer = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div className="equation-empty-prompt">
      <span>Not sure where to start?</span>
      <span className="equation-empty-actions">
        <button
          className="equation-empty-help-button"
          type="button"
          onPointerDown={stopEditorPointer}
          onClick={(event) => {
            event.stopPropagation();
            onShowDetailedInstructions();
          }}
        >
          Instructions
        </button>
        <button
          className="equation-empty-practice-button"
          type="button"
          onPointerDown={stopEditorPointer}
          onClick={(event) => {
            event.stopPropagation();
            onStartPractice();
          }}
        >
          Practice Round
        </button>
      </span>
    </div>
  );
}
