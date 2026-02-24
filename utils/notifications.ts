import notifee, { AndroidImportance, AndroidVisibility, TriggerType } from '@notifee/react-native';

export async function requestNotificationPermissions() {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus;
}

export async function configureAndroidChannel() {
    await notifee.createChannel({
        id: 'medicine-alarms-sound',
        name: 'Medicine Alarms',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        vibration: true,
        visibility: AndroidVisibility.PUBLIC,
    });
}

export async function scheduleMedicineNotification(id: string, name: string, date: Date) {
    const triggerDate = new Date(date);
    if (triggerDate.getTime() < Date.now()) {
        triggerDate.setDate(triggerDate.getDate() + 1);
    }

    const trigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: triggerDate.getTime(),
        alarmManager: true,
    };

    const notificationId = await notifee.createTriggerNotification(
        {
            title: 'Medicine Reminder',
            body: `Time to take ${name}`,
            data: { medicineId: id },
            android: {
                channelId: 'medicine-alarms-sound',
                importance: AndroidImportance.HIGH,
                pressAction: {
                    id: 'default',
                },
                actions: [
                    {
                        title: 'Snooze',
                        pressAction: { id: 'snooze' }
                    },
                    {
                        title: 'Dismiss',
                        pressAction: { id: 'dismiss' }
                    }
                ],
            },
        },
        trigger as any
    );

    return notificationId;
}

export async function cancelMedicineNotification(notificationId: string) {
    await notifee.cancelNotification(notificationId);
}
