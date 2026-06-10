import * as SQLite from 'expo-sqlite';
import type { SolutionSubmission, SubmissionDifficulty } from '@crackledate/core';
import type { LocalSolution, QueuedSubmission, StorageDriver } from './storage';

type RowSolution = {
  id: number;
  puzzle_date: string;
  equation: string;
  value: string;
  seconds: number;
  difficulty: SubmissionDifficulty;
  solved_at: string;
};

type RowSubmission = {
  id: number;
  payload_json: string;
  attempts: number;
  last_attempt_at: string | null;
};

export async function openCrackleDateDatabase(): Promise<StorageDriver> {
  const database = await SQLite.openDatabaseAsync('crackle-date.db');
  return new ExpoSQLiteStorageDriver(database);
}

export class ExpoSQLiteStorageDriver implements StorageDriver {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

  async initialize(): Promise<void> {
    await this.database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS solutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        puzzle_date TEXT NOT NULL,
        equation TEXT NOT NULL,
        value TEXT NOT NULL,
        seconds INTEGER NOT NULL,
        difficulty TEXT NOT NULL,
        solved_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_solutions_puzzle_date ON solutions(puzzle_date);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS submission_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT
      );
    `);
  }

  async insertSolution(solution: Omit<LocalSolution, 'id'>): Promise<LocalSolution> {
    const result = await this.database.runAsync(
      `INSERT INTO solutions (puzzle_date, equation, value, seconds, difficulty, solved_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      solution.date,
      solution.equation,
      solution.value,
      solution.seconds,
      solution.difficulty,
      solution.solvedAt,
    );
    return { ...solution, id: result.lastInsertRowId };
  }

  async allSolutions(): Promise<LocalSolution[]> {
    const rows = await this.database.getAllAsync<RowSolution>(
      'SELECT * FROM solutions ORDER BY solved_at DESC, id DESC',
    );
    return rows.map(solutionFromRow);
  }

  async solutionsForDate(date: string): Promise<LocalSolution[]> {
    const rows = await this.database.getAllAsync<RowSolution>(
      'SELECT * FROM solutions WHERE puzzle_date = ? ORDER BY solved_at ASC, id ASC',
      date,
    );
    return rows.map(solutionFromRow);
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      value,
    );
  }

  async getSetting(key: string): Promise<string | null> {
    const row = await this.database.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    return row?.value ?? null;
  }

  async enqueueSubmission(payload: SolutionSubmission): Promise<QueuedSubmission> {
    const payloadJson = JSON.stringify(payload);
    const result = await this.database.runAsync(
      'INSERT INTO submission_queue (payload_json, attempts) VALUES (?, 0)',
      payloadJson,
    );
    return { id: result.lastInsertRowId, payload, attempts: 0, lastAttemptAt: null };
  }

  async pendingSubmissions(): Promise<QueuedSubmission[]> {
    const rows = await this.database.getAllAsync<RowSubmission>(
      'SELECT * FROM submission_queue ORDER BY id ASC LIMIT 50',
    );
    return rows.map(submissionFromRow);
  }

  async deleteSubmission(id: number): Promise<void> {
    await this.database.runAsync('DELETE FROM submission_queue WHERE id = ?', id);
  }

  async markSubmissionAttempt(id: number, attemptedAt: string): Promise<void> {
    await this.database.runAsync(
      'UPDATE submission_queue SET attempts = attempts + 1, last_attempt_at = ? WHERE id = ?',
      attemptedAt,
      id,
    );
  }

  async resetAll(): Promise<void> {
    await this.database.execAsync(`
      DELETE FROM solutions;
      DELETE FROM settings;
      DELETE FROM submission_queue;
      DELETE FROM sqlite_sequence WHERE name IN ('solutions', 'submission_queue');
    `);
  }
}

function solutionFromRow(row: RowSolution): LocalSolution {
  return {
    id: row.id,
    date: row.puzzle_date,
    equation: row.equation,
    value: row.value,
    seconds: row.seconds,
    difficulty: row.difficulty,
    solvedAt: row.solved_at,
  };
}

function submissionFromRow(row: RowSubmission): QueuedSubmission {
  return {
    id: row.id,
    payload: JSON.parse(row.payload_json) as SolutionSubmission,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at,
  };
}
