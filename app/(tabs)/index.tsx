import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import notifee, { EventType } from '@notifee/react-native';
import { Vibration } from 'react-native';
import api from '@/services/api';
import { getCurrentUser } from '@/services/storage';
import { MedicineCard } from '@/components/MedicineCard';
import { AddMedicineModal } from '@/components/AddMedicineModal';
import { AlarmModal } from '@/components/AlarmModal';
import { scheduleMedicineNotification } from '@/utils/notifications';
import { MISSED_DOSE_TIMEOUT_MINUTES, SNOOZE_DURATION_MINUTES } from '@/config';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Audio } from 'expo-av';

let currentAlarmSound: Audio.Sound | null = null;

export default function HomeScreen() {
  const [user, setUser] = useState<any>(null);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Alarm state
  const [activeAlarm, setActiveAlarm] = useState<any>(null);

  const loadData = async () => {
    setRefreshing(true);
    const currentUser = await getCurrentUser();
    setUser(currentUser);

    if (currentUser) {
      if (currentUser.role === 'patient') {
        fetchMedicines(currentUser._id);
      } else if (currentUser.role === 'caregiver' && currentUser.linkedUsers?.length > 0) {
        const patientId = currentUser.linkedUsers[0]._id || currentUser.linkedUsers[0];
        fetchMedicines(patientId);
      } else {
        setMedicines([]);
      }
    } else {
      setMedicines([]);
    }
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const fetchMedicines = async (patientId: string) => {
    try {
      const res = await api.get(`/medicines?patientId=${patientId}`);
      if (res.data.success) {
        setMedicines(res.data.medicines);
        scheduleAlarms(res.data.medicines);
      }
    } catch (error) {
      console.error('Failed to fetch medicines', error);
    }
  };

  // Check alarm times and poll for new medicines every 10 seconds
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (user) {
      interval = setInterval(() => {
        if (user.role === 'patient') {
          // Poll for new additions from caregiver
          fetchMedicines(user._id);
          // Check local times against scheduled meds
          checkAlarms();
        } else if (user.role === 'caregiver' && user.linkedUsers?.length > 0) {
          const patientId = user.linkedUsers[0]._id || user.linkedUsers[0];
          fetchMedicines(patientId);
        }
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [medicines, user]);

  const checkAlarms = async () => {
    const now = new Date();

    // Ensure Audio session is configured to interrupt and play on loud
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (err) {
      console.warn('Audio mode config failed', err);
    }

    for (const med of medicines) {
      if (med.status !== 'pending' && med.status !== 'snoozed') continue;

      const [hours, minutes] = med.time.split(':').map(Number);
      const scheduledTime = new Date();
      scheduledTime.setHours(hours, minutes, 0, 0);

      const diffMinutes = (now.getTime() - scheduledTime.getTime()) / (1000 * 60);

      // If it's time (within last 10 minutes) and no active alarm is showing
      if (diffMinutes >= 0 && diffMinutes < MISSED_DOSE_TIMEOUT_MINUTES && !activeAlarm && (med.status === 'pending' || med.status === 'snoozed')) {
        // Show in-app modal
        setActiveAlarm(med);

        // Ensure infinite vibration
        Vibration.vibrate([1000, 1000], true);

        // Force sound overlay
        if (currentAlarmSound) {
          await currentAlarmSound.unloadAsync();
          currentAlarmSound = null;
        }
        try {
          const { sound } = await Audio.Sound.createAsync(
            require('@/assets/alarm.ogg')
          );
          currentAlarmSound = sound;

          sound.setOnPlaybackStatusUpdate(async (status) => {
            if (status.isLoaded && status.didJustFinish) {
              await sound.replayAsync();
            }
          });

          await sound.setVolumeAsync(1.0);
          await sound.playAsync();
        } catch (err) {
          console.error('Failed to load sound', err);
        }
      }
      // If missed the 10-minute window
      else if (diffMinutes >= MISSED_DOSE_TIMEOUT_MINUTES && (med.status === 'pending' || med.status === 'snoozed')) {
        await handleMarkMissed(med._id);
      }
    }
  };

  const scheduleAlarms = (meds: any[]) => {
    if (user?.role !== 'patient') return;

    // Clear all existing and reschedule active ones
    notifee.cancelAllNotifications().then(() => {
      meds.forEach(med => {
        if (med.status === 'pending') {
          const [hours, minutes] = med.time.split(':').map(Number);
          const scheduledTime = new Date();
          scheduledTime.setHours(hours, minutes, 0, 0);
          scheduleMedicineNotification(med._id, med.name, scheduledTime);
        }
      });
    });
  };

  // Listen to background notifications when app is active
  useEffect(() => {
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.DELIVERED && detail.notification?.data?.medicineId) {
        const medId = detail.notification.data.medicineId as string;
        const med = medicines.find(m => m._id === medId);
        if (med && med.status !== 'taken' && med.status !== 'missed') {
          setActiveAlarm(med);
        }
      }
    });
    return unsubscribe;
  }, [medicines]);

  const handleAddMedicine = async (name: string, time: Date) => {
    if (!user || user.role !== 'caregiver' || !user.linkedUsers?.length) return;

    const targetPatient = user.linkedUsers[0];
    const patientId = targetPatient._id || targetPatient;
    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    try {
      const res = await api.post('/add-medicine', {
        name,
        time: timeString,
        patientId,
        createdBy: user._id
      });
      if (res.data.success) {
        fetchMedicines(patientId);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add medicine');
    }
    setAddModalVisible(false);
  };

  const handleMarkTaken = async (medicineId: string) => {
    if (!user || user.role !== 'patient') return;
    try {
      const res = await api.post('/mark-taken', { medicineId, patientId: user._id });
      if (res.data.success) {
        Vibration.cancel();
        if (currentAlarmSound) {
          await currentAlarmSound.stopAsync();
          await currentAlarmSound.unloadAsync();
          currentAlarmSound = null;
        }
        setActiveAlarm(null);
        fetchMedicines(user._id);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleMarkMissed = async (medicineId: string) => {
    try {
      const res = await api.post('/mark-missed', { medicineId, patientId: user._id });
      if (res.data.success) {
        if (activeAlarm?._id === medicineId) setActiveAlarm(null);
        fetchMedicines(user._id);
      }
    } catch (error) {
      console.error('Failed to mark missed', error);
    }
  };

  const handleSnooze = async () => {
    if (!activeAlarm) return;
    try {
      Vibration.cancel();
      if (currentAlarmSound) {
        await currentAlarmSound.stopAsync();
        await currentAlarmSound.unloadAsync();
        currentAlarmSound = null;
      }
      const med = activeAlarm;
      setActiveAlarm(null);
      // For a real app we'd reschedule the local notification + update backend to 'snoozed'
      // To simulate: Add snooze duration to the scheduled time
      const [hours, minutes] = med.time.split(':').map(Number);
      const newTime = new Date();
      newTime.setHours(hours, minutes + SNOOZE_DURATION_MINUTES, 0, 0);

      const timeString = newTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

      // We will just optimistically update the state for testing
      Alert.alert('Snoozed', `Reminding again in ${SNOOZE_DURATION_MINUTES} minutes.`);

      // Update local state temporarily for testing instead of full backend update for snooze
      const updatedMeds = medicines.map(m => m._id === med._id ? { ...m, time: timeString, status: 'snoozed' } : m);
      setMedicines(updatedMeds);

    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteMedicine = async (medicineId: string) => {
    Alert.alert(
      "Delete Alarm",
      "Are you sure you want to delete this medicine alarm?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await api.delete(`/medicines/${medicineId}`);
              if (res.data.success) {
                if (user.role === 'caregiver' && user.linkedUsers?.length > 0) {
                  const patientId = user.linkedUsers[0]._id || user.linkedUsers[0];
                  fetchMedicines(patientId);
                } else {
                  fetchMedicines(user._id);
                }
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete medicine');
            }
          }
        }
      ]
    );
  };

  const renderMedicineCard = ({ item }: { item: any }) => {
    return (
      <View style={styles.card}>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.time}>{item.time}</Text>
          <Text style={[
            styles.status,
            item.status === 'taken' && styles.statusTaken,
            item.status === 'missed' && styles.statusMissed
          ]}>
            Status: {item.status.toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardActions}>
          {user?.role === 'patient' && (item.status === 'pending' || item.status === 'snoozed') && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleMarkTaken(item._id)}
            >
              <Text style={styles.actionText}>Take</Text>
            </TouchableOpacity>
          )}

          {user?.role === 'caregiver' && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteMedicine(item._id)}
            >
              <IconSymbol name="trash.fill" size={20} color="#FF3B30" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Please setup a user in Settings tab.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {user.role === 'patient' ? 'My Medicines' : 'Patient Medicines'}
        </Text>
      </View>

      <FlatList
        data={medicines}
        keyExtractor={(item) => item._id}
        renderItem={renderMedicineCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadData} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No medicines found.</Text>
            {user.role === 'caregiver' && (
              <Text style={styles.emptySubtext}>Tap the + button to add one.</Text>
            )}
          </View>
        }
      />

      {user.role === 'caregiver' && (
        <TouchableOpacity style={styles.fab} onPress={() => setAddModalVisible(true)}>
          <IconSymbol name="plus" size={24} color="#FFF" />
          <Text style={styles.fabText}>Add</Text>
        </TouchableOpacity>
      )}

      <AddMedicineModal
        visible={isAddModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSave={handleAddMedicine}
      />

      {activeAlarm && (
        <AlarmModal
          visible={!!activeAlarm}
          medicineName={activeAlarm.name}
          onDismiss={() => handleMarkTaken(activeAlarm._id)}
          onSnooze={handleSnooze}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8', // Softer, modern background
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 24,
    backgroundColor: '#E0F2FE', // Light blue background
    borderBottomWidth: 1,
    borderBottomColor: '#BAE6FD', // Slightly darker blue border
    shadowColor: '#0EA5E9', // Soft blue shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1E293B', // Slate grey
    letterSpacing: -0.5,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#6366F1', // Indigo shadow
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.1)',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A', // Deep Slate
    marginBottom: 6,
  },
  time: {
    fontSize: 18,
    color: '#64748B', // Muted slate
    fontWeight: '600',
    marginBottom: 4,
  },
  status: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusTaken: {
    color: '#10B981', // Emerald green
  },
  statusMissed: {
    color: '#EF4444', // Ruby red
  },
  actionButton: {
    backgroundColor: '#6366F1', // Vibrant Indigo
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  cardActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 10,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FEF2F2', // Soft red background
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteButtonText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 6,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 30,
    backgroundColor: '#3B82F6', // Blue core
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
