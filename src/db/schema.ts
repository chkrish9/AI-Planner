import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('ai-planner.db');
  }
  return _db;
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      description TEXT,
      due_date    TEXT,
      due_time    TEXT,
      priority    INTEGER DEFAULT 2,
      status      TEXT DEFAULT 'pending',
      tags        TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      title               TEXT NOT NULL,
      start_datetime      TEXT NOT NULL,
      end_datetime        TEXT,
      location            TEXT,
      recurrence_type     TEXT DEFAULT 'none',
      recurrence_interval INTEGER DEFAULT 1,
      recurrence_days     TEXT,
      recurrence_end_date TEXT,
      parent_event_id     INTEGER,
      created_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_type        TEXT NOT NULL,
      ref_id          INTEGER NOT NULL,
      remind_at       TEXT NOT NULL,
      notification_id TEXT,
      is_fired        INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}
