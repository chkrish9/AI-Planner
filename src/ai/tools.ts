import { format } from 'date-fns';
import {
  createTask,
  createEvent,
  createReminder,
  listTasks,
  listEvents,
  completeTask,
  deleteTask,
  deleteEvent,
  type Priority,
  type TaskStatus,
  type RecurrenceType,
} from '../db/queries';
import { scheduleReminder } from '../notifications/scheduler';

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const AI_TOOLS: AnthropicTool[] = [
  {
    name: 'add_task',
    description: 'Add a new task or to-do item for the user.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title of the task' },
        description: { type: 'string', description: 'Optional longer description' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        due_time: { type: 'string', description: 'Due time in HH:MM (24h) format' },
        priority: { type: 'number', description: '1=high, 2=medium, 3=low', enum: [1, 2, 3] },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags/categories' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_event',
    description:
      'Add a calendar event. Use this for time-bound items like meetings, appointments, or recurring activities.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        start_datetime: {
          type: 'string',
          description: 'Start datetime in ISO-8601 format (YYYY-MM-DDThh:mm:00)',
        },
        end_datetime: { type: 'string', description: 'End datetime in ISO-8601 format' },
        location: { type: 'string', description: 'Location of the event' },
        recurrence_type: {
          type: 'string',
          description: 'How often the event repeats',
          enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
        },
        recurrence_interval: {
          type: 'number',
          description: 'Repeat every N days/weeks/months. Default 1.',
        },
        recurrence_days: {
          type: 'array',
          items: { type: 'number' },
          description: 'For weekly recurrence: day numbers [0=Sun,1=Mon,...,6=Sat]',
        },
        recurrence_end_date: {
          type: 'string',
          description: 'Date when recurrence stops (YYYY-MM-DD). Omit for infinite.',
        },
      },
      required: ['title', 'start_datetime'],
    },
  },
  {
    name: 'add_reminder',
    description: 'Schedule a push notification reminder for a task or event.',
    input_schema: {
      type: 'object',
      properties: {
        ref_type: {
          type: 'string',
          enum: ['task', 'event'],
          description: 'Whether this is for a task or event',
        },
        ref_id: { type: 'number', description: 'ID of the task or event' },
        remind_at: {
          type: 'string',
          description: 'When to send the reminder (ISO-8601 datetime)',
        },
      },
      required: ['ref_type', 'ref_id', 'remind_at'],
    },
  },
  {
    name: 'list_tasks',
    description: "List the user's tasks. Filter by date, status, or priority.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Filter by due date (YYYY-MM-DD)' },
        status: {
          type: 'string',
          enum: ['pending', 'done', 'cancelled'],
          description: 'Filter by status',
        },
        priority: { type: 'number', enum: [1, 2, 3], description: '1=high, 2=medium, 3=low' },
      },
    },
  },
  {
    name: 'list_events',
    description: 'List calendar events in a date range.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD). Defaults to today.' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD). Defaults to start_date.' },
      },
    },
  },
  {
    name: 'plan_day',
    description:
      'Get a full structured plan for a day — all tasks and events organized by time.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date to plan (YYYY-MM-DD). Defaults to today.' },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Task ID to mark as completed' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_item',
    description: 'Delete a task or event (and all its recurring instances).',
    input_schema: {
      type: 'object',
      properties: {
        ref_type: { type: 'string', enum: ['task', 'event'] },
        id: { type: 'number', description: 'ID of the task or event to delete' },
      },
      required: ['ref_type', 'id'],
    },
  },
];

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'add_task': {
        const task = await createTask({
          title: input.title as string,
          description: input.description as string | undefined,
          due_date: input.due_date as string | undefined,
          due_time: input.due_time as string | undefined,
          priority: input.priority as Priority | undefined,
          tags: input.tags as string[] | undefined,
        });
        return { success: true, data: task };
      }

      case 'add_event': {
        const event = await createEvent({
          title: input.title as string,
          start_datetime: input.start_datetime as string,
          end_datetime: input.end_datetime as string | undefined,
          location: input.location as string | undefined,
          recurrence_type: input.recurrence_type as RecurrenceType | undefined,
          recurrence_interval: input.recurrence_interval as number | undefined,
          recurrence_days: input.recurrence_days as number[] | undefined,
          recurrence_end_date: input.recurrence_end_date as string | undefined,
        });
        return { success: true, data: event };
      }

      case 'add_reminder': {
        const remind_at = input.remind_at as string;
        const reminder = await createReminder({
          ref_type: input.ref_type as 'task' | 'event',
          ref_id: input.ref_id as number,
          remind_at,
        });
        const notifId = await scheduleReminder(
          reminder.id,
          remind_at,
          'Reminder',
          "Don't forget!"
        );
        return { success: true, data: { ...reminder, notification_id: notifId } };
      }

      case 'list_tasks': {
        const tasks = await listTasks({
          date: input.date as string | undefined,
          status: input.status as TaskStatus | undefined,
          priority: input.priority as Priority | undefined,
        });
        return { success: true, data: tasks };
      }

      case 'list_events': {
        const today = format(new Date(), 'yyyy-MM-dd');
        const start = (input.start_date as string | undefined) ?? today;
        const end = (input.end_date as string | undefined) ?? start;
        const events = await listEvents({ start_date: start, end_date: end });
        return { success: true, data: events };
      }

      case 'plan_day': {
        const date = (input.date as string | undefined) ?? format(new Date(), 'yyyy-MM-dd');
        const [tasks, events] = await Promise.all([
          listTasks({ date }),
          listEvents({ start_date: date, end_date: date }),
        ]);
        return { success: true, data: { date, tasks, events } };
      }

      case 'complete_task': {
        await completeTask(input.id as number);
        return { success: true, data: { id: input.id, status: 'done' } };
      }

      case 'delete_item': {
        if (input.ref_type === 'task') {
          await deleteTask(input.id as number);
        } else {
          await deleteEvent(input.id as number);
        }
        return { success: true, data: { deleted: input.id } };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
