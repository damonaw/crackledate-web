import React, { useState, useEffect, useCallback } from 'react';

type TutorialStep = {
  targetSelector: string | null;
  title: string;
  note: string;
};

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    targetSelector: '.game-panel',
    title: 'Welcome to Crackle Date!',
    note: 'Let\'s learn how to play this daily math puzzle in a few quick steps.',
  },
  {
    targetSelector: '.digit-rail',
    title: "Today's Digits",
    note: 'These are the digits of today\'s date. You must use ALL of them in your equation.',
  },
  {
    targetSelector: '.digit-rail button.active, .digit-rail .active',
    title: 'The Active Digit',
    note: 'The highlighted digit is the next one you must place. Digits must be used in order, from left to right.',
  },
  {
    targetSelector: '.expression-area',
    title: 'Your Equation Builder',
    note: 'Your mathematical expression is constructed here. You can click on slots or use the arrows to move your cursor.',
  },
  {
    targetSelector: '.operator-grid',
    title: 'Math Operations',
    note: 'Use these buttons to insert math operators (+, -, *, /, ^, √) and parentheses to build your formula.',
  },
  {
    targetSelector: '.helper-row',
    title: 'Balance Both Sides',
    note: 'Include exactly one equals sign (=). The calculated values for the Left (L) and Right (R) sides must be equal!',
  },
  {
    targetSelector: 'button.submit',
    title: 'Submit and Win!',
    note: 'When both sides match and all digits are used, click Submit to solve today\'s puzzle!',
  },
];

function useElementRect(selector: string | null, stepIndex: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const updateRect = useCallback(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const element = document.querySelector(selector);
    if (element) {
      setRect(element.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [selector]);

  useEffect(() => {
    updateRect();
    
    // Periodically update rect for a short duration to handle layout settling
    let frameId: number;
    let count = 0;
    const tick = () => {
      updateRect();
      count++;
      if (count < 20) {
        frameId = requestAnimationFrame(tick);
      }
    };
    frameId = requestAnimationFrame(tick);

    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [selector, stepIndex, updateRect]);

  return rect;
}

export function GuidedTutorial({
  onClose,
}: {
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = TUTORIAL_STEPS[stepIndex];
  const rect = useElementRect(currentStep.targetSelector, stepIndex);

  const handleNext = () => {
    if (stepIndex < TUTORIAL_STEPS.length - 1) {
      setStepIndex((idx) => idx + 1);
    } else {
      onClose();
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((idx) => idx - 1);
    }
  };

  // Determine card positioning: place at top if highlighted element is in the bottom half of the screen
  const isHighlightInBottomHalf = rect ? (rect.top + rect.height / 2 > window.innerHeight / 2) : false;
  const cardStyle: React.CSSProperties = rect
    ? isHighlightInBottomHalf
      ? { top: '30px', bottom: 'auto' }
      : { bottom: '30px', top: 'auto' }
    : { bottom: '30px', top: 'auto' };

  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      {/* Spotlight highlight element */}
      {rect && (
        <div
          className="tutorial-spotlight"
          style={{
            position: 'fixed',
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: '12px',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
            border: '2.5px solid var(--accent-color, #ff2d55)',
            zIndex: 9998,
            pointerEvents: 'none',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      )}

      {/* Floating Instruction Card */}
      <div className="tutorial-card" style={cardStyle}>
        <div className="tutorial-card-header">
          <h2 id="tutorial-title" className="tutorial-card-title">
            {currentStep.title}
          </h2>
          <button
            type="button"
            className="tutorial-skip-button"
            onClick={onClose}
            aria-label="Skip tutorial"
          >
            Skip
          </button>
        </div>

        <p className="tutorial-card-text">{currentStep.note}</p>

        <div className="tutorial-card-footer">
          {/* Progress dots */}
          <div className="tutorial-progress-dots" aria-label={`Step ${stepIndex + 1} of ${TUTORIAL_STEPS.length}`}>
            {TUTORIAL_STEPS.map((_, idx) => (
              <span
                key={idx}
                className={`tutorial-progress-dot ${idx === stepIndex ? 'active' : ''}`}
              />
            ))}
          </div>

          <div className="tutorial-actions">
            {stepIndex > 0 && (
              <button
                type="button"
                className="tutorial-button secondary"
                onClick={handleBack}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="tutorial-button primary"
              onClick={handleNext}
            >
              {stepIndex === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
