import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { Vibration } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { useMedicineStore } from '@/store/useMedicineStore';
import { requestNotificationPermissions, scheduleMedicineNotification, configureAndroidChannel } from '@/utils/notifications';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

notifee.onBackgroundEvent(async ({ type, detail }) => {
  const isAlarm = detail.notification?.android?.channelId?.startsWith('medicine-alarms');

  if (type === EventType.DELIVERED && isAlarm) {
    Vibration.vibrate([1000, 1000], true);
  }

  if ((type === EventType.DISMISSED || type === EventType.ACTION_PRESS) && isAlarm) {
    Vibration.cancel();
  }

  if (type === EventType.ACTION_PRESS) {
    const { notification, pressAction } = detail;
    const medicineId = notification?.data?.medicineId as string | undefined;

    if (medicineId && notification?.id) {
      await notifee.cancelNotification(notification.id);

      if (pressAction?.id === 'snooze') {
        const snoozeDate = new Date();
        snoozeDate.setMinutes(snoozeDate.getMinutes() + 5);
        const med = useMedicineStore.getState().medicines.find((m) => m.id === medicineId);
        if (med) {
          const newIdentifier = await scheduleMedicineNotification(medicineId, med.name, snoozeDate);
          useMedicineStore.getState().updateMedicine(medicineId, { notificationId: newIdentifier });
        }
      }
    }
  }
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const updateMedicine = useMedicineStore((state) => state.updateMedicine);

  useEffect(() => {
    async function initNotifications() {
      const hasPermission = await requestNotificationPermissions();
      if (hasPermission) {
        await configureAndroidChannel();
      }
    }
    initNotifications();

    const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
      const isAlarm = detail.notification?.android?.channelId?.startsWith('medicine-alarms');

      if (type === EventType.DELIVERED && isAlarm) {
        Vibration.vibrate([1000, 1000], true);
      }

      if ((type === EventType.DISMISSED || type === EventType.ACTION_PRESS) && isAlarm) {
        Vibration.cancel();
      }

      if (type === EventType.ACTION_PRESS) {
        const { notification, pressAction } = detail;
        const medicineId = notification?.data?.medicineId as string | undefined;

        if (medicineId && notification?.id) {
          await notifee.cancelNotification(notification.id);

          if (pressAction?.id === 'snooze') {
            const snoozeDate = new Date();
            snoozeDate.setMinutes(snoozeDate.getMinutes() + 5);
            const med = useMedicineStore.getState().medicines.find((m) => m.id === medicineId);
            if (med) {
              const newIdentifier = await scheduleMedicineNotification(medicineId, med.name, snoozeDate);
              updateMedicine(medicineId, { notificationId: newIdentifier });
            }
          }
        }
      }
    });

    return () => unsubscribe();
  }, [updateMedicine]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
