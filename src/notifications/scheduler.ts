import * as Notifications from 'expo-notifications';
import { parseISO } from 'date-fns';
import { getPendingReminders, markReminderFired, updateReminderNotificationId } from '../db/queries';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleReminder(
  reminderId: number,
  remindAt: string,
  title: string,
  body: string
): Promise<string | null> {
  try {
    const date = parseISO(remindAt);
    if (date <= new Date()) return null; // Already passed

    const notifId = await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { reminderId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });

    await updateReminderNotificationId(reminderId, notifId);
    return notifId;
  } catch {
    return null;
  }
}

export async function cancelReminder(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function rescheduleAllPendingReminders(): Promise<void> {
  const pending = await getPendingReminders();
  const now = new Date();

  for (const reminder of pending) {
    const date = parseISO(reminder.remind_at);
    if (date < now) {
      await markReminderFired(reminder.id);
    } else if (!reminder.notification_id) {
      await scheduleReminder(reminder.id, reminder.remind_at, 'Reminder', "Don't forget!");
    }
  }
}

export function listenForNotificationResponse(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
    const reminderId = response.notification.request.content.data?.reminderId as number | undefined;
    if (reminderId) {
      await markReminderFired(reminderId);
    }
  });
  return () => sub.remove();
}
