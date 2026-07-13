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

  test('uses the typed validation helper and coordinator instead of raw fetch wiring', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

    expect(appSource).toContain("import { requestValidation } from './validationRequest';");
    expect(appSource).toContain('ValidationRequestCoordinator');
    expect(appSource).not.toContain("fetch('/api/validate'");
  });

  test('keeps validation recoverable with distinct inline copy and one disabled Submit', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

    expect(appSource).toContain('const [validationLoading, setValidationLoading] = useState(false);');
    expect(appSource).toContain('Too many checks at once. Please wait a moment and try again.');
    expect(appSource).toContain('Could not check this equation right now. Your equation is still here—try again.');
    expect(appSource).toContain('result.kind === \'bad_request\'');
    expect(appSource).toContain('result.kind === \'invalid_equation\'');
    expect(appSource).toContain('disabled={validationLoading}');
    expect(appSource).toContain('aria-busy={validationLoading}');
  });

  test('invalidates validation without blocking editor recovery', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

    expect(appSource).toContain('const cancelValidationRequests = useCallback(');
    expect(appSource).toContain('validationRequestCoordinatorRef.current?.invalidate();');
    expect(appSource).toContain('if (currentEquation !== nextEquation) {');
    expect(appSource).toContain('cancelValidationRequests();');
    expect(appSource).not.toContain('disabled={validationLoading || isAutocompleting}');
  });

  test('invalidates each direct full-solution autocomplete token before editing state', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
    const intervalStart = appSource.indexOf('autocompleteIntervalRef.current = setInterval(');
    const intervalStateWrite = appSource.indexOf('setEditorState(', intervalStart);
    const intervalPrefix = appSource.slice(intervalStart, intervalStateWrite);
    const intervalEnd = appSource.indexOf('}, 300);', intervalStart);
    const intervalBody = appSource.slice(intervalStart, intervalEnd);

    expect(intervalStart).toBeGreaterThanOrEqual(0);
    expect(intervalStateWrite).toBeGreaterThan(intervalStart);
    expect(intervalPrefix).toContain('cancelValidationRequests();');
    expect(intervalBody).toContain('const currentEditorState = editorStateRef.current;');
    expect(intervalBody).not.toContain('setEditorState((prev) => {');
  });

  test('retires partial Submit feedback before the next autocomplete token changes the equation', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
    const temporaryFeedback = appSource.indexOf(
      'Could not check this equation right now. Your equation is still here—try again.',
    );
    const intervalStart = appSource.indexOf('autocompleteIntervalRef.current = setInterval(');
    const nextTokenStart = appSource.indexOf('if (tokenToAdd) {', intervalStart);
    const nextTokenWrite = appSource.indexOf('setEditorState(nextEditorState);', nextTokenStart);
    const nextTokenPrefix = appSource.slice(nextTokenStart, nextTokenWrite);
    const cancel = nextTokenPrefix.indexOf('cancelValidationRequests();');
    const retireFeedback = nextTokenPrefix.indexOf("setMessage('');");

    expect(temporaryFeedback).toBeGreaterThanOrEqual(0);
    expect(nextTokenStart).toBeGreaterThan(intervalStart);
    expect(nextTokenWrite).toBeGreaterThan(nextTokenStart);
    expect(cancel).toBeGreaterThanOrEqual(0);
    expect(retireFeedback).toBeGreaterThan(cancel);
  });

  test('retires feedback when full-solution autocomplete initially replaces the equation', () => {
    const appSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
    const initialStateStart = appSource.indexOf('const initialEditorState: EquationEditorState');
    const initialStateWrite = appSource.indexOf('setEditorState(initialEditorState);', initialStateStart);
    const initialStatePrefix = appSource.slice(initialStateStart, initialStateWrite);

    expect(initialStateStart).toBeGreaterThanOrEqual(0);
    expect(initialStateWrite).toBeGreaterThan(initialStateStart);
    expect(initialStatePrefix).toContain("setMessage('');");
  });
});
