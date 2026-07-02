import { getDb } from './schema';

export type Priority = 1 | 2 | 3;
export type TaskStatus = 'pending' | 'done' | 'cancelled';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RefType = 'task' | 'event';
export type MessageRole = 'user' | 'assistant';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: Priority;
  status: TaskStatus;
  tags: string | null;
  created_at: string;
}

export interface Event {
  id: number;
  title: string;
  start_datetime: string;
  end_datetime: string | null;
  location: string | null;
  recurrence_type: RecurrenceType;
  recurrence_interval: number;
  recurrence_days: string | null;
  recurrence_end_date: string | null;
  parent_event_id: number | null;
  created_at: string;
}

export interface Reminder {
  id: number;
  ref_type: RefType;
  ref_id: number;
  remind_at: string;
  notification_id: string | null;
  is_fired: number;
  created_at: string;
}

export interface Message {
  id: number;
  role: MessageRole;
  content: string;
  created_at: string;
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export async function createTask(params: {
  title: string;
  description?: string;
  due_date?: string;
  due_time?: string;
  priority?: Priority;
  tags?: string[];
}): Promise<Task> {
  const db = await getDb();
  const tags = params.tags ? JSON.stringify(params.tags) : null;
  const result = await db.runAsync(
    `INSERT INTO tasks (title, description, due_date, due_time, priority, tags)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.title,
      params.description ?? null,
      params.due_date ?? null,
      params.due_time ?? null,
      params.priority ?? 2,
      tags,
    ]
  );
  return getTaskById(result.lastInsertRowId);
}

export async function getTaskById(id: number): Promise<Task> {
  const db = await getDb();
  return db.getFirstAsync<Task>('SELECT * FROM tasks WHERE id = ?', [id]) as Promise<Task>;
}

export async function listTasks(params: {
  date?: string;
  status?: TaskStatus;
  priority?: Priority;
} = {}): Promise<Task[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (params.date) {
    conditions.push('due_date = ?');
    args.push(params.date);
  }
  if (params.status) {
    conditions.push('status = ?');
    args.push(params.status);
  } else {
    conditions.push("status != 'cancelled'");
  }
  if (params.priority) {
    conditions.push('priority = ?');
    args.push(params.priority);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.getAllAsync<Task>(`SELECT * FROM tasks ${where} ORDER BY priority ASC, due_date ASC`, args);
}

export async function completeTask(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE tasks SET status = 'done' WHERE id = ?", [id]);
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM tasks WHERE id = ?', [id]);
}

// ── Events ─────────────────────────────────────────────────────────────────

export async function createEvent(params: {
  title: string;
  start_datetime: string;
  end_datetime?: string;
  location?: string;
  recurrence_type?: RecurrenceType;
  recurrence_interval?: number;
  recurrence_days?: number[];
  recurrence_end_date?: string;
  parent_event_id?: number;
}): Promise<Event> {
  const db = await getDb();
  const recurrence_days = params.recurrence_days ? JSON.stringify(params.recurrence_days) : null;
  const result = await db.runAsync(
    `INSERT INTO events (title, start_datetime, end_datetime, location, recurrence_type,
      recurrence_interval, recurrence_days, recurrence_end_date, parent_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.title,
      params.start_datetime,
      params.end_datetime ?? null,
      params.location ?? null,
      params.recurrence_type ?? 'none',
      params.recurrence_interval ?? 1,
      recurrence_days,
      params.recurrence_end_date ?? null,
      params.parent_event_id ?? null,
    ]
  );
  return getEventById(result.lastInsertRowId);
}

export async function getEventById(id: number): Promise<Event> {
  const db = await getDb();
  return db.getFirstAsync<Event>('SELECT * FROM events WHERE id = ?', [id]) as Promise<Event>;
}

export async function listEvents(params: {
  start_date?: string;
  end_date?: string;
} = {}): Promise<Event[]> {
  const db = await getDb();
  if (params.start_date && params.end_date) {
    return db.getAllAsync<Event>(
      `SELECT * FROM events
       WHERE date(start_datetime) BETWEEN ? AND ?
       ORDER BY start_datetime ASC`,
      [params.start_date, params.end_date]
    );
  }
  if (params.start_date) {
    return db.getAllAsync<Event>(
      `SELECT * FROM events WHERE date(start_datetime) = ? ORDER BY start_datetime ASC`,
      [params.start_date]
    );
  }
  return db.getAllAsync<Event>('SELECT * FROM events ORDER BY start_datetime ASC');
}

export async function getParentEvents(): Promise<Event[]> {
  const db = await getDb();
  return db.getAllAsync<Event>(
    `SELECT * FROM events WHERE recurrence_type != 'none' AND parent_event_id IS NULL`
  );
}

export async function instanceExists(parentId: number, date: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM events WHERE parent_event_id = ? AND date(start_datetime) = ?`,
    [parentId, date]
  );
  return (row?.cnt ?? 0) > 0;
}

export async function deleteEvent(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM events WHERE id = ? OR parent_event_id = ?', [id, id]);
}

// ── Reminders ──────────────────────────────────────────────────────────────

export async function createReminder(params: {
  ref_type: RefType;
  ref_id: number;
  remind_at: string;
  notification_id?: string;
}): Promise<Reminder> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO reminders (ref_type, ref_id, remind_at, notification_id)
     VALUES (?, ?, ?, ?)`,
    [params.ref_type, params.ref_id, params.remind_at, params.notification_id ?? null]
  );
  return db.getFirstAsync<Reminder>('SELECT * FROM reminders WHERE id = ?', [
    result.lastInsertRowId,
  ]) as Promise<Reminder>;
}

export async function updateReminderNotificationId(id: number, notificationId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE reminders SET notification_id = ? WHERE id = ?', [notificationId, id]);
}

export async function markReminderFired(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE reminders SET is_fired = 1 WHERE id = ?', [id]);
}

export async function getPendingReminders(): Promise<Reminder[]> {
  const db = await getDb();
  return db.getAllAsync<Reminder>('SELECT * FROM reminders WHERE is_fired = 0');
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function saveMessage(role: MessageRole, content: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO messages (role, content) VALUES (?, ?)', [role, content]);
  // Keep last 100 messages
  await db.runAsync(
    `DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT 100)`
  );
}

export async function getRecentMessages(limit = 50): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Message>(
    `SELECT * FROM messages ORDER BY id DESC LIMIT ?`,
    [limit]
  );
  return rows.reverse();
}

export async function clearMessages(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM messages');
}
