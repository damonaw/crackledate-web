import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

describe('hint loading surface', () => {
  test('renders a durable inline loading panel while hints are loading', () => {
    expect(source).toContain('hintLoading &&');
    expect(source).toContain('className="hint-panel hint-loading"');
    expect(source).toContain('Finding a hint...');
  });

  test('routes explicit and reactive hints through one coordinator', () => {
    expect(source).toContain('new HintRequestCoordinator');
    expect(source).toContain('.requestExplicit(');
    expect(source).toContain('.requestReactive(');
    expect(source).toContain('requestHint(');
    expect(source).not.toMatch(/fetch\(`\/api\/hint/);
  });

  test('invalidates hint work across editor, navigation, date, close, reset, and unmount boundaries', () => {
    expect(source).toContain('const cancelHintRequests = useCallback');
    expect(source).toContain('const navigateTo = useCallback');
    expect(source).toContain('const selectPuzzleDate = useCallback');
    expect(source).toContain('const closeHint = useCallback');
    expect(source).toMatch(/const clear = useCallback\(\(\) => \{\s+cancelHintRequests\(\);/);
    expect(source).toMatch(/const clearBrowserData = useCallback\(\(\) => \{\s+cancelHintRequests\(\);/);
    expect(source).toContain('return () => cancelHintRequests();');
  });

  test('keeps reactive request effect dependencies primitive', () => {
    expect(source).toContain(
      '[activeView, equation, hintOpen, hintPlayMode, hintPuzzleDate, isAutocompleting]',
    );
  });

  test('retires stale hint data and only advances data bound to the current identity', () => {
    expect(source).toMatch(
      /const cancelHintRequests = useCallback\(\(\) => \{[\s\S]*?setHintData\(null\);[\s\S]*?setIsDeadEnd\(false\);/,
    );
    expect(source).toContain('const currentHintData = hintDataForIdentity(');
    expect(source).toContain('hintClickAction({ hintOpen, currentHintData })');
    expect(source).toContain('bindHintDataToIdentity(identity, result.hint)');
    expect(source).toContain('applyHintStep(nextStep, currentHintData)');
    expect(source).not.toContain('applyHintStep(nextStep, hintData)');
  });

  test('shows reactive loading without rendering retired hint contents', () => {
    expect(source).toContain('onStart: () => setHintLoading(true)');
    expect(source).toContain('onFinish: () => setHintLoading(false)');
    expect(source).toContain('!hintLoading && hintOpen && isDeadEnd');
    expect(source).toContain('!hintLoading && hintOpen && !isDeadEnd && currentHintData');
  });

  test('retires hint data only after an editor edit actually changes state', () => {
    const applyEditorEditStart = source.indexOf('const applyEditorEdit = useCallback');
    const insertTextStart = source.indexOf('const insertText = useCallback', applyEditorEditStart);
    const applyEditorEditSource = source.slice(applyEditorEditStart, insertTextStart);

    expect(source).toContain('const editorStateRef = useRef(editorState);');
    expect(applyEditorEditSource).toContain(
      'if (editorStatesEqual(currentEditorState, nextEditorState)) return;',
    );
    expect(applyEditorEditSource.indexOf('editorStatesEqual(')).toBeLessThan(
      applyEditorEditSource.indexOf('cancelHintRequests();'),
    );
    expect(applyEditorEditSource).toContain('editorStateRef.current = nextEditorState;');
    expect(applyEditorEditSource).not.toContain('setEditorState((current) =>');
  });
});
