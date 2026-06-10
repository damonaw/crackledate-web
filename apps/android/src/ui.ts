import { StyleSheet } from 'react-native';

export const operatorButtons = [
  { label: '+', value: '+' },
  { label: '−', value: '-' },
  { label: '×', value: '×' },
  { label: '÷', value: '÷' },
  { label: 'xʸ', value: '^' },
  { label: '√', value: '√' },
  { label: '!', value: '!' },
  { label: '|', value: '|' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
];

export const colors = {
  background: '#ffffff',
  groupedBackground: '#f2f2f7',
  secondaryBackground: '#f2f2f7',
  tertiaryBackground: '#ffffff',
  label: '#000000',
  secondaryLabel: '#5f6368',
  separator: 'rgba(60,60,67,0.22)',
  glassBorder: 'rgba(60,60,67,0.18)',
  glassFill: 'rgba(242,242,247,0.76)',
  blue: '#007aff',
  blueSoft: 'rgba(0,122,255,0.18)',
  green: '#34c759',
  greenSoft: 'rgba(52,199,89,0.16)',
  red: '#ff3b30',
  redSoft: 'rgba(255,59,48,0.16)',
  orange: '#ff9500',
  orangeSoft: 'rgba(255,149,0,0.16)',
  gray: '#8e8e93',
};

export const darkColors = {
  background: '#000000',
  groupedBackground: '#111113',
  secondaryBackground: '#1c1c1e',
  tertiaryBackground: '#1c1c1e',
  label: '#f5f5f7',
  secondaryLabel: '#aeaeb2',
  separator: 'rgba(84,84,88,0.58)',
  glassBorder: 'rgba(84,84,88,0.48)',
  glassFill: 'rgba(44,44,46,0.82)',
  blue: colors.blue,
  blueSoft: 'rgba(0,122,255,0.24)',
  green: colors.green,
  greenSoft: 'rgba(52,199,89,0.22)',
  red: colors.red,
  redSoft: 'rgba(255,59,48,0.2)',
  orange: colors.orange,
  orangeSoft: 'rgba(255,149,0,0.2)',
  gray: '#98989d',
};

export type CalendarDay = {
  date: Date;
  dateIdentifier: string;
  day: number;
  isCurrentMonth: boolean;
};

export const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
export const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`;
}

export function dateIdentifier(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromIdentifier(identifier: string): Date {
  const [year, month, day] = identifier.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function calendarDaysForMonth(month: Date): CalendarDay[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  return Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(year, monthIndex, offset - firstWeekday + 1);
    return {
      date,
      dateIdentifier: dateIdentifier(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === monthIndex,
    };
  });
}

export const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    gap: 14,
    padding: 12,
    paddingBottom: 28,
  },
  screenOnDark: {
    backgroundColor: darkColors.background,
  },
  gameScreen: {
    backgroundColor: colors.background,
    gap: 12,
    padding: 12,
    paddingBottom: 28,
  },
  mobileGameScreen: {
    backgroundColor: colors.background,
    flexGrow: 1,
    gap: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 28,
  },
  mobileGameScreenOnDark: {
    backgroundColor: '#000000',
  },
  detailScreen: {
    backgroundColor: colors.background,
    gap: 14,
    padding: 12,
    paddingBottom: 56,
  },
  startScreen: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.label,
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 45,
  },
  detailTitle: {
    color: colors.label,
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 28,
  },
  sectionTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.secondaryLabel,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  panel: {
    backgroundColor: colors.tertiaryBackground,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    gap: 18,
    padding: 18,
  },
  panelOnDark: {
    backgroundColor: darkColors.tertiaryBackground,
    borderColor: darkColors.glassBorder,
  },
  textOnDark: {
    color: darkColors.label,
  },
  secondaryTextOnDark: {
    color: darkColors.secondaryLabel,
  },
  nativeHeaderHome: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  nativeHeaderLogo: {
    borderRadius: 8,
    height: 30,
    width: 30,
  },
  nativeHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 0,
  },
  nativeHeaderAction: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 44,
  },
  startCard: {
    alignItems: 'center',
    backgroundColor: colors.tertiaryBackground,
    borderColor: colors.glassBorder,
    borderRadius: 18,
    borderWidth: 1,
    gap: 28,
    maxWidth: 420,
    padding: 28,
    width: '100%',
  },
  startCopy: {
    alignItems: 'center',
    gap: 12,
  },
  startIcon: {
    borderRadius: 18,
    height: 82,
    width: 82,
  },
  startTitle: {
    color: colors.label,
    fontSize: 42,
    fontWeight: '800',
    lineHeight: 46,
    textAlign: 'center',
  },
  startTagline: {
    color: colors.secondaryLabel,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 25,
    textAlign: 'center',
  },
  startActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  startActionButton: {
    alignItems: 'center',
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  startActionText: {
    color: colors.label,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  playButton: {
    backgroundColor: colors.green,
    borderColor: 'rgba(52,199,89,0.35)',
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  mobileTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: 14,
  },
  toolbarHomeButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  appIcon: {
    borderRadius: 14,
    height: 44,
    width: 44,
  },
  toolbarActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 7,
    justifyContent: 'flex-end',
  },
  toolbarButton: {
    alignItems: 'center',
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  toolbarButtonDark: {
    backgroundColor: '#1c1c1e',
    borderColor: 'rgba(28,28,30,0.28)',
  },
  toolbarButtonOnDark: {
    backgroundColor: 'rgba(44,44,46,0.82)',
    borderColor: 'rgba(84,84,88,0.58)',
  },
  toolbarButtonLightTarget: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,176,0,0.28)',
  },
  toolbarIconText: {
    color: colors.label,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 24,
    textAlign: 'center',
  },
  toolbarIconTextDark: {
    color: '#ffffff',
  },
  toolbarIconTextOnDark: {
    color: '#f5f5f7',
  },
  toolbarIconTextLightTarget: {
    color: '#d99a00',
  },
  gamePanel: {
    backgroundColor: 'transparent',
    gap: 12,
  },
  mobileGamePanel: {
    backgroundColor: 'transparent',
    flex: 1,
    gap: 12,
    justifyContent: 'space-between',
  },
  expressionArea: {
    gap: 12,
  },
  controlArea: {
    gap: 8,
  },
  label: {
    color: colors.secondaryLabel,
    fontSize: 15,
    fontWeight: '800',
  },
  digitRail: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    minHeight: 70,
  },
  digitRailGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  digitSlot: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    height: 70,
    justifyContent: 'center',
    minWidth: 24,
  },
  activeDigit: {
    backgroundColor: colors.blue,
    borderColor: 'rgba(0,122,255,0.72)',
    width: 70,
  },
  usedDigit: {
    opacity: 0.34,
  },
  delimiter: {
    color: colors.secondaryLabel,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 40,
  },
  delimiterOnDark: {
    color: '#98989d',
  },
  digitText: {
    color: colors.secondaryLabel,
    fontSize: 31,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 38,
  },
  digitTextOnDark: {
    color: '#98989d',
  },
  activeDigitText: {
    color: '#ffffff',
  },
  equationBox: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 112,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  equationBoxDark: {
    backgroundColor: '#1c1c1e',
  },
  emptyPrompt: {
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
  },
  equationText: {
    color: colors.label,
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
    textAlign: 'center',
  },
  equationTextOnDark: {
    color: '#f5f5f7',
  },
  emptyEquationText: {
    color: colors.secondaryLabel,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  emptyEquationTextOnDark: {
    color: '#aeaeb2',
  },
  helpPill: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderColor: 'rgba(0,122,255,0.32)',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 26,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  helpPillText: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  equationTokenRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    minHeight: 82,
  },
  equationTokenGroup: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  equationTokenPressable: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 28,
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  selectedEquationToken: {
    backgroundColor: colors.blueSoft,
    borderColor: 'rgba(0,122,255,0.46)',
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  equationSlot: {
    alignItems: 'center',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    minWidth: 16,
  },
  equationCursor: {
    color: colors.blue,
    fontSize: 34,
    fontWeight: '600',
    lineHeight: 40,
    marginHorizontal: 1,
  },
  equationCursorOnDark: {
    color: '#4da3ff',
  },
  equationPowerOperator: {
    fontSize: 19,
    lineHeight: 25,
    transform: [{ translateY: -6 }],
  },
  equationSuperscript: {
    fontSize: 18,
    lineHeight: 24,
    transform: [{ translateY: -9 }],
  },
  equationRootToken: {
    fontSize: 33,
    lineHeight: 38,
  },
  equationEqualsToken: {
    paddingHorizontal: 3,
  },
  latexEquationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    minHeight: 88,
  },
  latexInlineGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  latexTokenPressable: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 22,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  latexTokenPressableScript: {
    minHeight: 24,
    minWidth: 14,
    paddingHorizontal: 1,
  },
  selectedLatexToken: {
    backgroundColor: colors.blueSoft,
    borderColor: 'rgba(0,122,255,0.46)',
    borderRadius: 7,
    borderWidth: 1,
  },
  latexText: {
    color: colors.label,
    fontSize: 31,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 37,
    textAlign: 'center',
  },
  latexCompactText: {
    fontSize: 25,
    lineHeight: 31,
  },
  latexScriptText: {
    fontSize: 18,
    lineHeight: 22,
  },
  latexOperatorToken: {
    marginHorizontal: 2,
  },
  latexEqualsToken: {
    marginHorizontal: 7,
  },
  latexSlot: {
    alignItems: 'center',
    borderRadius: 6,
    height: 42,
    justifyContent: 'center',
    minWidth: 2,
  },
  selectedLatexSlot: {
    minWidth: 12,
  },
  latexSlotCompact: {
    height: 30,
    minWidth: 2,
  },
  latexSlotScript: {
    height: 24,
    minWidth: 2,
  },
  latexCursor: {
    color: colors.blue,
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 38,
    marginHorizontal: 1,
  },
  latexCursorScript: {
    fontSize: 22,
    lineHeight: 26,
  },
  latexPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
  },
  latexPostfixGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  latexPostfixOperatorToken: {
    marginLeft: -2,
    minWidth: 12,
    paddingHorizontal: 0,
  },
  latexFractionCluster: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  latexFraction: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
    minWidth: 42,
  },
  latexFractionPart: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 30,
  },
  latexFractionEdgeSlot: {
    minWidth: 5,
  },
  latexFractionBarButton: {
    alignItems: 'stretch',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
    width: '100%',
  },
  selectedLatexFractionBarButton: {
    backgroundColor: colors.blueSoft,
  },
  latexFractionBar: {
    backgroundColor: colors.label,
    borderRadius: 999,
    height: 2,
    minWidth: 34,
  },
  latexFractionBarOnDark: {
    backgroundColor: darkColors.label,
  },
  latexFractionBarSelected: {
    backgroundColor: colors.blue,
  },
  latexPowerGroup: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  latexExponent: {
    marginLeft: -4,
    marginTop: 0,
  },
  latexPowerOperatorTouch: {
    alignItems: 'center',
    borderRadius: 7,
    height: 24,
    justifyContent: 'center',
    marginLeft: -4,
    marginRight: -3,
    minWidth: 4,
  },
  latexPowerOperatorText: {
    color: colors.blue,
  },
  latexRootGroup: {
    alignItems: 'stretch',
    flexDirection: 'row',
    marginHorizontal: 2,
  },
  latexRootSymbol: {
    fontSize: 36,
    lineHeight: 40,
  },
  latexRadicandGroup: {
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingTop: 2,
  },
  latexRootBar: {
    backgroundColor: colors.label,
    borderRadius: 999,
    height: 2,
    marginBottom: -1,
  },
  latexRootBarOnDark: {
    backgroundColor: darkColors.label,
  },
  latexRadicand: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  previewText: {
    color: colors.label,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  helperRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  mobileHelperRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  helperValue: {
    backgroundColor: colors.glassFill,
    borderRadius: 8,
    color: colors.label,
    flexShrink: 1,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 20,
    minHeight: 34,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  helperValueOnDark: {
    backgroundColor: '#1c1c1e',
    color: '#f5f5f7',
  },
  helperLabel: {
    color: colors.secondaryLabel,
    fontWeight: '700',
  },
  helperLabelOnDark: {
    color: '#98989d',
  },
  helperEquals: {
    color: colors.secondaryLabel,
    fontSize: 15,
    fontWeight: '800',
  },
  selectorArrowControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  selectorArrowButton: {
    alignItems: 'center',
    backgroundColor: colors.glassFill,
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  selectorArrowButtonOnDark: {
    backgroundColor: '#1c1c1e',
    borderColor: 'rgba(84,84,88,0.58)',
  },
  selectorArrowText: {
    color: colors.label,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
  },
  selectorArrowTextOnDark: {
    color: '#f5f5f7',
  },
  controlGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  controlButton: {
    alignItems: 'center',
    backgroundColor: colors.tertiaryBackground,
    borderColor: 'rgba(142,142,147,0.25)',
    borderRadius: 14,
    borderWidth: 1,
    height: 70,
    justifyContent: 'center',
    width: 70,
  },
  controlButtonOnDark: {
    backgroundColor: '#1c1c1e',
    borderColor: 'rgba(84,84,88,0.46)',
  },
  controlButtonText: {
    color: colors.label,
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 34,
  },
  controlButtonTextOnDark: {
    color: '#f5f5f7',
  },
  disabledButton: {
    opacity: 0.45,
  },
  wideButton: {
    borderRadius: 12,
    width: 152,
  },
  submitButton: {
    backgroundColor: colors.green,
    borderColor: 'rgba(52,199,89,0.35)',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  clearButton: {
    backgroundColor: colors.redSoft,
    borderColor: 'rgba(255,59,48,0.28)',
  },
  clearButtonText: {
    color: colors.red,
  },
  backspaceButton: {
    backgroundColor: colors.orangeSoft,
    borderColor: 'rgba(255,149,0,0.28)',
  },
  backspaceButtonText: {
    color: colors.orange,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.label,
    borderColor: colors.label,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonOnDark: {
    backgroundColor: darkColors.glassFill,
    borderColor: darkColors.glassBorder,
  },
  secondaryButtonText: {
    color: colors.label,
    fontSize: 15,
    fontWeight: '700',
  },
  selectedButton: {
    backgroundColor: colors.blue,
    borderColor: 'rgba(0,122,255,0.42)',
  },
  selectedButtonText: {
    color: '#ffffff',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: colors.redSoft,
    borderColor: 'rgba(255,59,48,0.28)',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dangerButtonText: {
    color: colors.red,
    fontSize: 15,
    fontWeight: '700',
  },
  smallButton: {
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallButtonOnDark: {
    backgroundColor: darkColors.glassFill,
    borderColor: darkColors.glassBorder,
  },
  smallButtonText: {
    color: colors.label,
    fontWeight: '700',
  },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  navButton: {
    backgroundColor: colors.tertiaryBackground,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 58,
    minWidth: '46%',
    padding: 14,
    justifyContent: 'center',
  },
  navButtonText: {
    color: colors.label,
    fontSize: 16,
    fontWeight: '700',
  },
  listRow: {
    borderTopColor: colors.separator,
    borderTopWidth: 1,
    gap: 6,
    paddingVertical: 12,
  },
  listRowOnDark: {
    borderTopColor: darkColors.separator,
  },
  listTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 22,
  },
  muted: {
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 21,
  },
  mutedOnDark: {
    color: '#aeaeb2',
  },
  message: {
    color: colors.label,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  messageOnDark: {
    color: '#f5f5f7',
  },
  error: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: colors.tertiaryBackground,
    borderColor: 'rgba(142,142,147,0.22)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusCardOnDark: {
    backgroundColor: '#1c1c1e',
    borderColor: 'rgba(84,84,88,0.46)',
  },
  statusAccent: {
    backgroundColor: colors.green,
    borderRadius: 999,
    height: 26,
    width: 4,
  },
  statusAccentError: {
    backgroundColor: colors.red,
  },
  settingsGroup: {
    backgroundColor: colors.tertiaryBackground,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingsGroupOnDark: {
    backgroundColor: darkColors.tertiaryBackground,
    borderColor: darkColors.glassBorder,
  },
  settingsRow: {
    alignItems: 'center',
    borderTopColor: colors.separator,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  settingsRowOnDark: {
    borderTopColor: darkColors.separator,
  },
  firstSettingsRow: {
    borderTopWidth: 0,
  },
  borderedSettingsRow: {
    borderTopWidth: 1,
  },
  segmentedControl: {
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flex: 1,
    padding: 2,
  },
  segmentedControlOnDark: {
    backgroundColor: darkColors.secondaryBackground,
    borderColor: darkColors.separator,
  },
  segmentedOption: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  segmentedOptionSelected: {
    backgroundColor: colors.blue,
  },
  segmentedText: {
    color: colors.secondaryLabel,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentedTextSelected: {
    color: '#ffffff',
  },
  linkList: {
    backgroundColor: colors.tertiaryBackground,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  linkListOnDark: {
    backgroundColor: darkColors.tertiaryBackground,
    borderColor: darkColors.glassBorder,
  },
  linkRow: {
    alignItems: 'center',
    borderTopColor: colors.separator,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  linkRowOnDark: {
    borderTopColor: darkColors.separator,
  },
  linkChevron: {
    color: colors.secondaryLabel,
    fontSize: 23,
    lineHeight: 24,
  },
  calendar: {
    backgroundColor: colors.tertiaryBackground,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  calendarOnDark: {
    backgroundColor: darkColors.tertiaryBackground,
    borderColor: darkColors.glassBorder,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  calendarArrow: {
    alignItems: 'center',
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  calendarArrowOnDark: {
    backgroundColor: darkColors.glassFill,
    borderColor: darkColors.glassBorder,
  },
  calendarArrowText: {
    color: colors.label,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
  },
  calendarMonth: {
    color: colors.label,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 5,
  },
  weekdayCell: {
    alignItems: 'center',
    flex: 1,
    minHeight: 24,
    justifyContent: 'center',
  },
  weekdayText: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: '700',
  },
  datePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  datePickerDay: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    position: 'relative',
    width: '13.35%',
  },
  datePickerDayOutside: {
    opacity: 0.38,
  },
  datePickerDayToday: {
    borderColor: 'rgba(0,122,255,0.45)',
  },
  datePickerDaySelected: {
    backgroundColor: colors.blue,
    borderColor: 'rgba(0,122,255,0.68)',
  },
  datePickerDayText: {
    color: colors.label,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  datePickerDayTextOnDark: {
    color: darkColors.label,
  },
  datePickerDayTextToday: {
    color: colors.blue,
  },
  datePickerDayTextSelected: {
    color: '#ffffff',
  },
  savedDot: {
    backgroundColor: colors.green,
    borderColor: colors.tertiaryBackground,
    borderRadius: 4,
    borderWidth: 1.5,
    bottom: 6,
    height: 8,
    position: 'absolute',
    right: 6,
    width: 8,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  badgeCard: {
    alignItems: 'center',
    flexBasis: '30%',
    flexGrow: 1,
    gap: 6,
    minWidth: 104,
    paddingVertical: 8,
  },
  badgeIcon: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 49,
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  badgeIconOnDark: {
    backgroundColor: darkColors.secondaryBackground,
    borderColor: darkColors.separator,
  },
  badgeIconEarned: {
    backgroundColor: colors.blueSoft,
    borderColor: 'rgba(0,122,255,0.42)',
  },
  badgeIconText: {
    color: colors.secondaryLabel,
    fontSize: 28,
    fontWeight: '800',
  },
  badgeIconTextEarned: {
    color: colors.blue,
  },
  badgeTitle: {
    color: colors.label,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  badgeMeta: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 15,
    textAlign: 'center',
  },
  documentHero: {
    backgroundColor: colors.tertiaryBackground,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  documentHeroOnDark: {
    backgroundColor: darkColors.tertiaryBackground,
    borderColor: darkColors.glassBorder,
  },
  documentKicker: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  documentMeta: {
    alignSelf: 'flex-start',
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.glassBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  documentMetaOnDark: {
    backgroundColor: darkColors.secondaryBackground,
    borderColor: darkColors.glassBorder,
    color: darkColors.secondaryLabel,
  },
  instructionStep: {
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  instructionStepOnDark: {
    backgroundColor: darkColors.secondaryBackground,
    borderColor: darkColors.separator,
  },
  instructionCard: {
    backgroundColor: colors.tertiaryBackground,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
  },
  instructionImage: {
    alignSelf: 'center',
    backgroundColor: colors.secondaryBackground,
    height: 540,
    width: '100%',
  },
  instructionNote: {
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  instructionControls: {
    flexDirection: 'row',
    gap: 10,
  },
  branding: {
    alignItems: 'center',
    backgroundColor: colors.label,
    borderColor: 'rgba(0,0,0,0.18)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  brandingOnDark: {
    backgroundColor: '#050505',
    borderColor: darkColors.glassBorder,
  },
  brandingMark: {
    alignItems: 'center',
    borderColor: colors.tertiaryBackground,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  brandingText: {
    color: colors.tertiaryBackground,
    fontSize: 15,
    fontWeight: '600',
  },
  brandingLogo: {
    height: 34,
    width: 34,
  },
});
