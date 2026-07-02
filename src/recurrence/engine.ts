import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  parseISO,
  format,
  isBefore,
  getDay,
} from 'date-fns';
import { getParentEvents, createEvent, instanceExists, type Event } from '../db/queries';

const HORIZON_DAYS = 60;

export async function generateRecurringInstances(): Promise<void> {
  const parents = await getParentEvents();
  const horizon = addDays(new Date(), HORIZON_DAYS);

  for (const event of parents) {
    await generateInstancesForEvent(event, horizon);
  }
}

async function generateInstancesForEvent(event: Event, horizon: Date): Promise<void> {
  const baseStart = parseISO(event.start_datetime);
  const baseEnd = event.end_datetime ? parseISO(event.end_datetime) : null;
  const duration = baseEnd ? baseEnd.getTime() - baseStart.getTime() : 0;

  const endDate = event.recurrence_end_date
    ? parseISO(event.recurrence_end_date)
    : horizon;
  const effectiveHorizon = isBefore(endDate, horizon) ? endDate : horizon;

  const interval = event.recurrence_interval ?? 1;
  const recurrenceDays: number[] = event.recurrence_days
    ? JSON.parse(event.recurrence_days)
    : [];

  let cursor = addDays(baseStart, 1); // start from day after the parent

  while (isBefore(cursor, effectiveHorizon)) {
    const dateStr = format(cursor, 'yyyy-MM-dd');
    let shouldCreate = false;

    switch (event.recurrence_type) {
      case 'daily':
        // Every N days from base
        shouldCreate = true;
        break;

      case 'weekly':
        if (recurrenceDays.length > 0) {
          shouldCreate = recurrenceDays.includes(getDay(cursor));
        } else {
          shouldCreate = getDay(cursor) === getDay(baseStart);
        }
        break;

      case 'monthly':
        shouldCreate = cursor.getDate() === baseStart.getDate();
        break;

      case 'yearly':
        shouldCreate =
          cursor.getMonth() === baseStart.getMonth() &&
          cursor.getDate() === baseStart.getDate();
        break;
    }

    if (shouldCreate) {
      const alreadyExists = await instanceExists(event.id, dateStr);
      if (!alreadyExists) {
        const instanceStart = new Date(cursor);
        instanceStart.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
        const startStr = instanceStart.toISOString().replace(/\.\d{3}Z$/, '');

        const endStr = baseEnd
          ? new Date(instanceStart.getTime() + duration).toISOString().replace(/\.\d{3}Z$/, '')
          : undefined;

        await createEvent({
          title: event.title,
          start_datetime: startStr,
          end_datetime: endStr,
          location: event.location ?? undefined,
          recurrence_type: 'none',
          parent_event_id: event.id,
        });
      }
    }

    // Advance cursor
    switch (event.recurrence_type) {
      case 'daily':
        cursor = addDays(cursor, interval);
        break;
      case 'weekly':
        cursor = recurrenceDays.length > 0 ? addDays(cursor, 1) : addWeeks(cursor, interval);
        break;
      case 'monthly':
        cursor = addDays(cursor, 1);
        break;
      case 'yearly':
        cursor = addDays(cursor, 1);
        break;
      default:
        cursor = addDays(cursor, 1);
    }
  }
}
