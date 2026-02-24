import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Medicine } from '@/store/useMedicineStore';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface Props {
    medicine: Medicine;
    onDelete: (id: string) => void;
}

export function MedicineCard({ medicine, onDelete }: Props) {
    const timeDate = new Date(medicine.time);
    const formattedTime = timeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <View style={styles.card}>
            <View style={styles.info}>
                <Text style={styles.name}>{medicine.name}</Text>
                <Text style={styles.time}>{formattedTime}</Text>
            </View>
            <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(medicine.id)}>
                <IconSymbol name="house.fill" size={24} color="#FF3B30" />
                <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>Delete</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginVertical: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    info: {
        flex: 1,
    },
    name: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333333',
        marginBottom: 4,
    },
    time: {
        fontSize: 16,
        color: '#666666',
    },
    deleteButton: {
        padding: 8,
    },
});
