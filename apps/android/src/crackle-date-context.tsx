import NetInfo from '@react-native-community/netinfo';
import * as Application from 'expo-application';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { BadgeSolution, SubmissionDifficulty } from '@crackledate/core';
import {
  CrackleDateRepository,
  flushSubmissionQueue,
  type LocalSolution,
} from './storage';
import { openCrackleDateDatabase } from './sqlite-storage';

type SolutionsByDate = Record<string, BadgeSolution[]>;
export type AppTheme = 'light' | 'dark';

type CrackleDateContextValue = {
  allSolutions: LocalSolution[];
  appVersion: string;
  difficulty: SubmissionDifficulty;
  error: string;
  flushQueue: () => Promise<void>;
  hasStarted: boolean;
  isDarkMode: boolean;
  loading: boolean;
  pendingCount: number;
  refreshSolutions: () => Promise<void>;
  repository: CrackleDateRepository | null;
  resetAll: () => Promise<void>;
  selectedDate: Date;
  setDifficulty: (difficulty: SubmissionDifficulty) => Promise<void>;
  setHasStarted: (hasStarted: boolean) => Promise<void>;
  setSelectedDate: (date: Date) => void;
  setTheme: (theme: AppTheme) => Promise<void>;
  solutionsByDate: SolutionsByDate;
  theme: AppTheme;
};

const CrackleDateContext = createContext<CrackleDateContextValue | null>(null);

export function CrackleDateProvider({ children }: { children: ReactNode }) {
  const [repository, setRepository] = useState<CrackleDateRepository | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [difficulty, setDifficultyState] = useState<SubmissionDifficulty>('easy');
  const [theme, setThemeState] = useState<AppTheme>('light');
  const [hasStarted, setHasStartedState] = useState(false);
  const [allSolutions, setAllSolutions] = useState<LocalSolution[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const appVersion = Application.nativeApplicationVersion ?? '1.0.0';

  const refreshQueueCount = useCallback(async (nextRepository = repository) => {
    if (!nextRepository) return;
    const pending = await nextRepository.pendingSubmissions();
    setPendingCount(pending.length);
  }, [repository]);

  const refreshSolutions = useCallback(async (nextRepository = repository) => {
    if (!nextRepository) return;
    setAllSolutions(await nextRepository.allSolutions());
    await refreshQueueCount(nextRepository);
  }, [repository, refreshQueueCount]);

  const flushQueue = useCallback(async () => {
    if (!repository) return;
    try {
      await flushSubmissionQueue(repository);
      await refreshQueueCount(repository);
    } catch {
      await refreshQueueCount(repository);
    }
  }, [refreshQueueCount, repository]);

  useEffect(() => {
    let isMounted = true;
    async function initialize() {
      try {
        const driver = await openCrackleDateDatabase();
        const nextRepository = new CrackleDateRepository(driver);
        await nextRepository.initialize();
        const savedDifficulty = await nextRepository.getSetting('difficulty');
        const savedTheme = await nextRepository.getSetting('theme');
        const savedHasStarted = await nextRepository.getSetting('hasStarted');
        if (!isMounted) return;
        setRepository(nextRepository);
        setDifficultyState(savedDifficulty === 'hard' ? 'hard' : 'easy');
        setThemeState(savedTheme === 'dark' ? 'dark' : 'light');
        setHasStartedState(savedHasStarted === 'true');
        setAllSolutions(await nextRepository.allSolutions());
        setPendingCount((await nextRepository.pendingSubmissions()).length);
      } catch (nextError) {
        if (isMounted) {
          setError(nextError instanceof Error ? nextError.message : 'Could not open local storage.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void initialize();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushQueue();
    });
    const networkSubscription = NetInfo.addEventListener((state) => {
      if (state.isConnected) void flushQueue();
    });
    return () => {
      appStateSubscription.remove();
      networkSubscription();
    };
  }, [flushQueue]);

  const setDifficulty = useCallback(async (nextDifficulty: SubmissionDifficulty) => {
    setDifficultyState(nextDifficulty);
    await repository?.setSetting('difficulty', nextDifficulty);
  }, [repository]);

  const setTheme = useCallback(async (nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    await repository?.setSetting('theme', nextTheme);
  }, [repository]);

  const setHasStarted = useCallback(async (nextHasStarted: boolean) => {
    setHasStartedState(nextHasStarted);
    await repository?.setSetting('hasStarted', String(nextHasStarted));
  }, [repository]);

  const resetAll = useCallback(async () => {
    if (!repository) return;
    await repository.resetAll();
    setDifficultyState('easy');
    setThemeState('light');
    setHasStartedState(false);
    setAllSolutions([]);
    setPendingCount(0);
  }, [repository]);

  const solutionsByDate = useMemo(() => {
    const grouped: SolutionsByDate = {};
    for (const solution of allSolutions) {
      grouped[solution.date] = [
        ...(grouped[solution.date] ?? []),
        { equation: solution.equation, timestamp: solution.solvedAt, value: solution.value },
      ];
    }
    return grouped;
  }, [allSolutions]);

  const value = useMemo<CrackleDateContextValue>(() => ({
    allSolutions,
    appVersion,
    difficulty,
    error,
    flushQueue,
    hasStarted,
    isDarkMode: theme === 'dark',
    loading,
    pendingCount,
    refreshSolutions,
    repository,
    resetAll,
    selectedDate,
    setDifficulty,
    setHasStarted,
    setSelectedDate,
    setTheme,
    solutionsByDate,
    theme,
  }), [
    allSolutions,
    appVersion,
    difficulty,
    error,
    flushQueue,
    hasStarted,
    loading,
    pendingCount,
    refreshSolutions,
    repository,
    resetAll,
    selectedDate,
    setDifficulty,
    setHasStarted,
    setTheme,
    solutionsByDate,
    theme,
  ]);

  return <CrackleDateContext.Provider value={value}>{children}</CrackleDateContext.Provider>;
}

export function useCrackleDate(): CrackleDateContextValue {
  const value = useContext(CrackleDateContext);
  if (!value) {
    throw new Error('useCrackleDate must be used inside CrackleDateProvider');
  }
  return value;
}
