import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

export interface Medicine {
    id: string;
    name: string;
    time: string; // ISO string representing the scheduled time
    notificationId?: string;
}

export interface AppSettings {
    alarmSoundEnabled: boolean;
    snoozeDuration: number; // in minutes
    isDarkMode: boolean;
}

interface MedicineState {
    medicines: Medicine[];
    settings: AppSettings;
    addMedicine: (medicine: Medicine) => void;
    removeMedicine: (id: string) => void;
    updateMedicine: (id: string, updates: Partial<Medicine>) => void;
    updateSettings: (settings: Partial<AppSettings>) => void;
}

const defaultSettings: AppSettings = {
    alarmSoundEnabled: true,
    snoozeDuration: 5,
    isDarkMode: false,
};

export const useMedicineStore = create<MedicineState>()(
    persist(
        (set) => ({
            medicines: [],
            settings: defaultSettings,
            addMedicine: (medicine) =>
                set((state) => ({
                    medicines: [...state.medicines, medicine],
                })),
            removeMedicine: (id) =>
                set((state) => ({
                    medicines: state.medicines.filter((m) => m.id !== id),
                })),
            updateMedicine: (id, updates) =>
                set((state) => ({
                    medicines: state.medicines.map((m) => (m.id === id ? { ...m, ...updates } : m)),
                })),
            updateSettings: (newSettings) =>
                set((state) => ({
                    settings: { ...state.settings, ...newSettings },
                })),
        }),
        {
            name: 'medicine-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
