import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import api from '@/services/api';
import { saveCurrentUser, getCurrentUser, clearCurrentUser } from '@/services/storage';

export default function SettingsScreen() {
  const [user, setUser] = useState<any>(null);

  const [nameInput, setNameInput] = useState('');
  const [roleInput, setRoleInput] = useState<'patient' | 'caregiver'>('patient');

  const [linkCodeInput, setLinkCodeInput] = useState('');

  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const savedUser = await getCurrentUser();
    setUser(savedUser);
    if (savedUser?.role === 'caregiver') {
      fetchNotifications(savedUser._id);
    }
  };

  const fetchNotifications = async (userId: string) => {
    try {
      const res = await api.get(`/notifications?userId=${userId}`);
      if (res.data.success) {
        setNotifications(res.data.notifications);
      }
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    }
  };

  const handleCreateUser = async () => {
    if (!nameInput) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }
    if (roleInput === 'caregiver' && !linkCodeInput) {
      Alert.alert('Error', 'Please enter the Patient Link Code');
      return;
    }
    try {
      const res = await api.post('/create-user', { name: nameInput, role: roleInput });
      if (res.data.success) {
        let newUser = res.data.user;

        if (roleInput === 'caregiver' && linkCodeInput) {
          try {
            const linkRes = await api.post('/link-user', {
              requesterId: newUser._id,
              linkCode: linkCodeInput.toUpperCase()
            });
            if (linkRes.data.success) {
              newUser = linkRes.data.requester; // Use the populated requester from backend
              Alert.alert('Success', `Account created and linked to ${linkRes.data.linkedUser.name}`);
            } else {
              Alert.alert('Warning', res.data.error || 'User created, but failed to link code.');
            }
          } catch (linkError: any) {
            Alert.alert('Warning', linkError.response?.data?.error || 'User created, but failed to link code.');
          }
        } else {
          Alert.alert('Success', 'Profile created successfully');
        }

        await saveCurrentUser(newUser);
        setUser(newUser);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create user');
    }
  };

  const handleLinkUser = async () => {
    if (!linkCodeInput || !user) {
      Alert.alert('Error', 'Please enter a valid link code and ensure you are logged in');
      return;
    }
    try {
      const res = await api.post('/link-user', {
        requesterId: user._id,
        linkCode: linkCodeInput.toUpperCase()
      });
      if (res.data.success) {
        Alert.alert('Success', `Successfully linked to ${res.data.linkedUser.name}`);
        // Reload user to update linked users
        // Although the backend doesn't return the full updated requester, we could refetch it here or just add it locally
        setUser({ ...user, linkedUsers: [...user.linkedUsers, res.data.linkedUser._id] });
        await saveCurrentUser({ ...user, linkedUsers: [...user.linkedUsers, res.data.linkedUser._id] });
      } else {
        Alert.alert('Error', res.data.error || 'Failed to link user');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to link user');
    }
  };

  const copyToClipboard = async () => {
    if (user?.linkCode) {
      await Clipboard.setStringAsync(user.linkCode);
      Alert.alert('Success', 'Link code copied to clipboard');
    }
  };

  const handleLogout = async () => {
    await clearCurrentUser();
    setUser(null);
    setNotifications([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>Settings & Profiler</Text>

        {!user ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Section 1 — Create Test User</Text>
            <TextInput
              style={styles.input}
              placeholder="Name (e.g., Mother, Son)"
              value={nameInput}
              onChangeText={setNameInput}
            />
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[styles.roleButton, roleInput === 'patient' && styles.roleActive]}
                onPress={() => setRoleInput('patient')}
              >
                <Text style={[styles.roleText, roleInput === 'patient' && styles.roleTextActive]}>Patient</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleButton, roleInput === 'caregiver' && styles.roleActive]}
                onPress={() => setRoleInput('caregiver')}
              >
                <Text style={[styles.roleText, roleInput === 'caregiver' && styles.roleTextActive]}>Caregiver</Text>
              </TouchableOpacity>
            </View>

            {roleInput === 'caregiver' && (
              <TextInput
                style={styles.input}
                placeholder="Enter Patient's 6-character Link Code"
                value={linkCodeInput}
                onChangeText={setLinkCodeInput}
                autoCapitalize="characters"
                maxLength={6}
              />
            )}
            <TouchableOpacity style={styles.primaryButton} onPress={handleCreateUser}>
              <Text style={styles.buttonText}>Create User</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Section 2 — Your Profile Info</Text>
              <Text style={styles.infoText}>Name: <Text style={styles.bold}>{user.name}</Text></Text>
              <Text style={styles.infoText}>Role: <Text style={styles.bold}>{user.role}</Text></Text>
              <Text style={styles.infoText}>ID: {user._id}</Text>
              {user.role === 'patient' && (
                <View style={styles.linkCodeRow}>
                  <Text style={styles.linkCodeText}>Link Code: {user.linkCode}</Text>
                  <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
                    <Text style={styles.copyButtonText}>Copy</Text>
                  </TouchableOpacity>
                </View>
              )}

              {user.role === 'caregiver' && user.linkedUsers && user.linkedUsers.length > 0 && (
                <View style={styles.linkedUsersContainer}>
                  <Text style={styles.infoText}>Linked Patients:</Text>
                  {user.linkedUsers.map((linkedUser: any) => (
                    <Text key={linkedUser._id || linkedUser} style={styles.bold}>
                      {linkedUser.name || 'Unknown Patient'}
                    </Text>
                  ))}
                </View>
              )}
              <TouchableOpacity style={styles.secondaryButton} onPress={handleLogout}>
                <Text style={styles.secondaryButtonText}>Logout / Create New</Text>
              </TouchableOpacity>
            </View>

            {/* Section removed to simplify caregiver flow */}
            {user.role === 'caregiver' && (
              <View style={styles.section}>
                <View style={styles.notificationHeader}>
                  <Text style={styles.sectionTitle}>Section 4 — Notifications</Text>
                  <TouchableOpacity onPress={() => fetchNotifications(user._id)}>
                    <Text style={styles.refreshText}>Refresh</Text>
                  </TouchableOpacity>
                </View>

                {notifications.length === 0 ? (
                  <Text style={styles.emptyText}>No notifications yet.</Text>
                ) : (
                  notifications.map(notif => (
                    <View key={notif._id} style={[styles.notificationCard, notif.read ? styles.notifRead : styles.notifUnread]}>
                      <Text style={styles.notifMessage}>{notif.message}</Text>
                      <Text style={styles.notifDate}>{new Date(notif.createdAt).toLocaleTimeString()} - {new Date(notif.createdAt).toLocaleDateString()}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  roleContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  roleButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  roleActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  roleText: {
    fontSize: 16,
    color: '#666',
  },
  roleTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#FF3B30',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 16,
    color: '#444',
    marginBottom: 8,
  },
  bold: {
    fontWeight: 'bold',
    color: '#111',
  },
  linkCodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0F8FF',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#D0E8FF',
  },
  linkCodeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0055A4',
    letterSpacing: 1,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  linkedUsersContainer: {
    backgroundColor: '#F0F8FF',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#D0E8FF',
  },
  copyButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  refreshText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 10,
  },
  notificationCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  notifRead: {
    backgroundColor: '#F9F9F9',
    borderLeftColor: '#CCC',
  },
  notifUnread: {
    backgroundColor: '#FFF0F0',
    borderLeftColor: '#FF3B30',
  },
  notifMessage: {
    fontSize: 15,
    color: '#333',
    marginBottom: 4,
  },
  notifDate: {
    fontSize: 12,
    color: '#888',
  }
});
