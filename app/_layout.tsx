import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initDb } from '../src/db/schema';
import { generateRecurringInstances } from '../src/recurrence/engine';
import {
  requestNotificationPermissions,
  rescheduleAllPendingReminders,
  listenForNotificationResponse,
} from '../src/notifications/scheduler';

export default function RootLayout() {
  useEffect(() => {
    async function bootstrap() {
      await initDb();
      await generateRecurringInstances();
      const granted = await requestNotificationPermissions();
      if (granted) {
        await rescheduleAllPendingReminders();
      }
    }
    bootstrap();
    const unsub = listenForNotificationResponse();
    return unsub;
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
