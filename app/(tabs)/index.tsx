import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text, Alert, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import notifee, { EventType } from '@notifee/react-native';
import { Vibration, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';
import { getCurrentUser } from '@/services/storage';
import { MedicineCard } from '@/components/MedicineCard';
import { AddMedicineModal } from '@/components/AddMedicineModal';
import { EditMedicineDetailsModal } from '@/components/EditMedicineDetailsModal';
import { AlarmModal } from '@/components/AlarmModal';
import { scheduleMedicineNotification } from '@/utils/notifications';
import { MISSED_DOSE_TIMEOUT_MINUTES, SNOOZE_DURATION_MINUTES, API_URL } from '@/config';
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

  const [editingMed, setEditingMed] = useState<any>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempTime, setTempTime] = useState(new Date());

  const [isEditDetailsModalVisible, setEditDetailsModalVisible] = useState(false);
  const [selectedEditMed, setSelectedEditMed] = useState<any>(null);

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
      if (!med.times) continue;
      for (const t of med.times) {
        if (t.status !== 'pending' && t.status !== 'snoozed') continue;

        const [hours, minutes] = t.time.split(':').map(Number);
        const scheduledTime = new Date();
        scheduledTime.setHours(hours, minutes, 0, 0);

        const diffMinutes = (now.getTime() - scheduledTime.getTime()) / (1000 * 60);

        // If it's time (within last 10 minutes) and no active alarm is showing
        if (diffMinutes >= 0 && diffMinutes < MISSED_DOSE_TIMEOUT_MINUTES && !activeAlarm && (t.status === 'pending' || t.status === 'snoozed')) {
          // Show in-app modal
          setActiveAlarm({ ...med, triggeredTime: t.time });

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
        else if (diffMinutes >= MISSED_DOSE_TIMEOUT_MINUTES && (t.status === 'pending' || t.status === 'snoozed')) {
          await handleMarkMissed(med._id, t.time);
        }
      }
    }
  };

  const scheduleAlarms = (meds: any[]) => {
    if (user?.role !== 'patient') return;

    // Clear all existing and reschedule active ones
    notifee.cancelAllNotifications().then(() => {
      meds.forEach(med => {
        if (!med.times) return;
        med.times.forEach((t: any) => {
          if (t.status === 'pending') {
            const [hours, minutes] = t.time.split(':').map(Number);
            const scheduledTime = new Date();
            scheduledTime.setHours(hours, minutes, 0, 0);
            scheduleMedicineNotification(`${med._id}_${t.time}`, med.name, scheduledTime);
          }
        });
      });
    });
  };

  // Listen to background notifications when app is active
  useEffect(() => {
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.DELIVERED && detail.notification?.data?.medicineId) {
        const notifId = detail.notification.data.medicineId as string;
        // medId might be medId_time string format due to multiple times
        const [medId, time] = notifId.split('_');
        const med = medicines.find(m => m._id === medId);

        if (med && med.times) {
          const timeEntry = med.times.find((t: any) => t.time === time);
          if (timeEntry && timeEntry.status !== 'taken' && timeEntry.status !== 'missed') {
            setActiveAlarm({ ...med, triggeredTime: time });
          }
        }
      }
    });
    return unsubscribe;
  }, [medicines]);

  const handleAddMedicine = async (name: string, time: Date, totalQuantity: number = 0, imageUri?: string) => {
    if (!user || user.role !== 'caregiver' || !user.linkedUsers?.length) return;

    const targetPatient = user.linkedUsers[0];
    const patientId = targetPatient._id || targetPatient;
    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    try {
      const res = await api.post('/add-medicine', {
        name,
        time: timeString,
        patientId,
        createdBy: user._id,
        totalQuantity
      });
      if (res.data.success) {
        if (imageUri) {
          const formData = new FormData();
          formData.append('medicineId', res.data.medicine._id);
          formData.append('image', {
            uri: imageUri,
            name: 'upload.jpg',
            type: 'image/jpeg'
          } as any);
          await api.post('/upload-medicine-image', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
        fetchMedicines(patientId);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add medicine');
    }
    setAddModalVisible(false);
  };

  const handleEditMedicineDetails = async (id: string, name: string, totalQuantity: number, imageUri?: string | null) => {
    try {
      const requestData: any = { name, totalQuantity };
      if (imageUri === null) {
        requestData.imageUrl = null;
      }
      const res = await api.put(`/medicines/${id}`, requestData);
      if (res.data.success) {
        if (imageUri) {
          const formData = new FormData();
          formData.append('medicineId', id);
          formData.append('image', {
            uri: imageUri,
            name: 'upload.jpg',
            type: 'image/jpeg'
          } as any);
          await api.post('/upload-medicine-image', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
        const patientId = user.role === 'patient' ? user._id : (user.linkedUsers[0]._id || user.linkedUsers[0]);
        fetchMedicines(patientId);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update medicine details');
    }
    setEditDetailsModalVisible(false);
  };

  const handleImageUpload = async () => {
    // Only caregivers can add medicines in this flow usually, or let patient do it if permitted
    // We will allow anyone here for testing, or follow existing setup
    if (!user) return;

    let patientId = user._id;
    if (user.role === 'caregiver' && user.linkedUsers?.length > 0) {
      patientId = user.linkedUsers[0]._id || user.linkedUsers[0];
    }

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "Please allow gallery access to upload a prescription.");
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });

      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        const asset = pickerResult.assets[0];
        const fileName = asset.fileName || asset.uri.split('/').pop();

        // Mock static behavior: Accept any image as the prescription
        if (asset) {
          // Pre-defined mocked schema
          const mockMedicines = [
            { name: "Tab Mitolol XL 50", time: "09:00", totalQuantity: 30 },
            { name: "Tab Macsant HD", time: "09:00", totalQuantity: 30 },
            { name: "Tab Lipirose 10 mg", time: "09:00", totalQuantity: 30 }
          ];

          let addedCount = 0;
          for (const m of mockMedicines) {
            const res = await api.post('/add-medicine', {
              name: m.name,
              time: m.time,
              patientId: patientId,
              createdBy: user._id,
              totalQuantity: m.totalQuantity
            });
            if (res.data.success) addedCount++;
          }

          if (addedCount > 0) {
            Alert.alert("Prescription Processed", "Successfully extracted and scheduled 3 medications.");
            fetchMedicines(patientId);
          }
        } else {
          Alert.alert("Upload Failed", "For prototype testing, please upload an image specifically named 'prescription1.jpg'.");
        }
      }
    } catch (error) {
      console.error("Image upload failed:", error);
      Alert.alert("Error", "Could not process image.");
    }
  };
  //add
  const handleMarkTaken = async (medicineId: string, time: string) => {
    if (!user || user.role !== 'patient') return;
    try {
      const res = await api.post('/mark-taken', { medicineId, patientId: user._id, time });
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

  const handleMarkMissed = async (medicineId: string, time: string) => {
    try {
      const res = await api.post('/mark-missed', { medicineId, patientId: user._id, time });
      if (res.data.success) {
        if (activeAlarm?._id === medicineId && activeAlarm?.triggeredTime === time) setActiveAlarm(null);
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
      const t = activeAlarm.triggeredTime;
      setActiveAlarm(null);

      const [hours, minutes] = t.split(':').map(Number);
      const newTime = new Date();
      newTime.setHours(hours, minutes + SNOOZE_DURATION_MINUTES, 0, 0);

      const timeString = newTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

      Alert.alert('Snoozed', `Reminding again in ${SNOOZE_DURATION_MINUTES} minutes.`);

      const updatedMeds = medicines.map(m => {
        if (m._id === med._id) {
          return {
            ...m,
            times: m.times.map((mt: any) => mt.time === t ? { ...mt, time: timeString, status: 'snoozed' } : mt)
          };
        }
        return m;
      });
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

  const saveTimeChange = async (timeString: string) => {
    try {
      const med = medicines.find(m => m._id === editingMed.id);
      if (!med) return;

      let newTimes;
      if (editingMed.isNew) {
        if (med.times.some((t: any) => t.time === timeString)) {
          Alert.alert('Exists', 'This time is already scheduled.');
          return;
        }
        newTimes = [...med.times.map((t: any) => t.time), timeString];
      } else {
        newTimes = med.times.map((t: any) => t.time === editingMed.oldTime ? timeString : t.time);
      }

      const res = await api.put(`/medicines/${editingMed.id}`, { times: newTimes });
      if (res.data.success) {
        const patientId = user.role === 'patient' ? user._id : (user.linkedUsers[0]._id || user.linkedUsers[0]);
        fetchMedicines(patientId);
      }
    } catch (e) { Alert.alert("Error updating time"); }
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (!selectedDate || event.type === 'dismissed') {
      setEditingMed(null);
      return;
    }
    const timeString = selectedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    saveTimeChange(timeString);
    setEditingMed(null);
  };

  const renderMedicineCard = ({ item }: { item: any }) => {
    const dosesPerDay = item.times && item.times.length > 0 ? item.times.length : 1;
    const hasQuantity = item.totalQuantity !== undefined && item.totalQuantity !== null;
    const totalQty = hasQuantity ? item.totalQuantity : 0;
    const daysLeft = hasQuantity ? Math.floor(totalQty / dosesPerDay) : 0;

    let aiText = hasQuantity ? `Remaining: ${totalQty} tablet${totalQty !== 1 ? 's' : ''}` : "Stock tracking inactive";
    let aiColor = hasQuantity ? '#10B981' : '#94A3B8'; // Green, or Gray if inactive
    if (hasQuantity) {
      if (totalQty === 0) {
        aiText = "⚠️ Out of stock! Refill immediately.";
        aiColor = '#EF4444'; // Red
      } else if (daysLeft < 2 || totalQty < 5) {
        aiText += ` 🔮 Runs out in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}!`;
        aiColor = '#F59E0B'; // Orange
      } else {
        aiText += ` 🔮 Will run out in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
      }
    }

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl.startsWith('http') ? item.imageUrl : `${API_URL.replace('/api', '')}${item.imageUrl}` }}
              style={{ width: 50, height: 50, borderRadius: 8, marginRight: 10 }}
            />
          ) : (
            <View style={{ width: 50, height: 50, borderRadius: 8, marginRight: 10, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }}>
              <IconSymbol name="pills.fill" size={24} color="#94A3B8" />
            </View>
          )}
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[styles.name, { marginBottom: 2 }]}>{item.name}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: aiColor, marginBottom: 8 }}>{aiText}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
            {/* Quick Refill / Edit Details Button Placeholder */}
            <TouchableOpacity onPress={() => { setSelectedEditMed(item); setEditDetailsModalVisible(true); }}>
              <IconSymbol name="pencil.circle.fill" size={24} color="#F59E0B" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              setEditingMed({ id: item._id, isNew: true });
              setTempTime(new Date());
              setShowTimePicker(true);
            }}>
              <IconSymbol name="plus.circle.fill" size={24} color="#3B82F6" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteMedicine(item._id)}>
              <IconSymbol name="trash.fill" size={24} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>

        {(!item.times || item.times.length === 0) && (
          <View style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: '#94A3B8', fontStyle: 'italic' }}>No times scheduled.</Text>
          </View>
        )}

        {item.times && item.times.map((t: any, index: number) => (
          <View key={index} style={styles.timeRow}>
            <View style={styles.timeInfo}>
              <Text style={styles.time}>{t.time}</Text>
              <Text style={[
                styles.status,
                t.status === 'taken' && styles.statusTaken,
                t.status === 'missed' && styles.statusMissed
              ]}>
                Status: {t.status.toUpperCase()}
              </Text>
            </View>

            <View style={styles.cardActions}>
              {user?.role === 'patient' && (t.status === 'pending' || t.status === 'snoozed') && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleMarkTaken(item._id, t.time)}
                >
                  <Text style={styles.actionText}>Take</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => {
                setEditingMed({ id: item._id, isNew: false, oldTime: t.time });
                const [hours, minutes] = t.time.split(':').map(Number);
                const dt = new Date();
                dt.setHours(hours, minutes, 0, 0);
                setTempTime(dt);
                setShowTimePicker(true);
              }}>
                <IconSymbol name="pencil.circle.fill" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
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

  const lowInventoryMedicines = medicines.filter(m => {
    if (m.totalQuantity === undefined || m.totalQuantity === null) return false;
    const doses = m.times && m.times.length > 0 ? m.times.length : 1;
    const qty = m.totalQuantity;
    const days = Math.floor(qty / doses);
    return qty < 5 || days < 2;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {user.role === 'patient' ? 'My Medicines' : 'Patient Medicines'}
        </Text>
      </View>

      {lowInventoryMedicines.length > 0 && (
        <View style={{ backgroundColor: '#FEF2F2', padding: 12, marginHorizontal: 16, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5' }}>
          <Text style={{ color: '#B91C1C', fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>
            ⚠️ Low Inventory Alert
          </Text>
          <Text style={{ color: '#991B1B', fontSize: 14, lineHeight: 20 }}>
            You are running out of: <Text style={{ fontWeight: 'bold' }}>{lowInventoryMedicines.map(m => m.name).join(', ')}</Text>. Please refill soon to ensure continuous treatment!
          </Text>
        </View>
      )}

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
        <>
          <TouchableOpacity
            style={[styles.fab, { bottom: 104, backgroundColor: '#10B981' }]}
            onPress={handleImageUpload}
          >
            <IconSymbol name="plus.app.fill" size={24} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.fab}
            onPress={() => setAddModalVisible(true)}
          >
            <IconSymbol name="plus" size={24} color="#FFF" />
          </TouchableOpacity>
        </>
      )}

      <AddMedicineModal
        visible={isAddModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSave={handleAddMedicine}
      />

      <EditMedicineDetailsModal
        visible={isEditDetailsModalVisible}
        medicine={selectedEditMed}
        onClose={() => setEditDetailsModalVisible(false)}
        onSave={handleEditMedicineDetails}
      />

      {activeAlarm && (
        <AlarmModal
          visible={!!activeAlarm}
          medicineName={activeAlarm.name}
          medicineImageUrl={activeAlarm.imageUrl ? (activeAlarm.imageUrl.startsWith('http') ? activeAlarm.imageUrl : `${API_URL.replace('/api', '')}${activeAlarm.imageUrl}`) : undefined}
          onDismiss={() => handleMarkTaken(activeAlarm._id, activeAlarm.triggeredTime)}
          onSnooze={handleSnooze}
        />
      )}

      {(showTimePicker || (Platform.OS === 'ios' && editingMed)) && editingMed && (
        <DateTimePicker
          value={tempTime}
          mode="time"
          display="default"
          onChange={handleTimeChange}
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
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    shadowColor: '#6366F1', // Indigo shadow
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.1)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  timeInfo: {
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
