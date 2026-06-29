import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('validation feedback surface', () => {
  test('game board renders equation validation feedback inline near the editor', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

    expect(appSource).toContain('function EquationFeedbackBanner');
    expect(appSource).toContain('<EquationFeedbackBanner message={inlineEquationFeedback}');
    expect(appSource).toContain('aria-live={tone === \'error\' ? \'assertive\' : \'polite\'}');
    expect(appSource).toContain("const toastFeedbackMessage = inlineEquationFeedback ? '' : feedbackMessage;");
    expect(appSource).toContain('<StatusToast message={toastFeedbackMessage}');
    expect(styles).toContain('.equation-feedback');
    expect(styles).toContain('.equation-feedback.error');
  });
});
