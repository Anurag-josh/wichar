import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

interface Props {
    visible: boolean;
    medicineName: string;
    medicineImageUrl?: string;
    onDismiss: () => void;
    onSnooze: () => void;
}

export function AlarmModal({ visible, medicineName, medicineImageUrl, onDismiss, onSnooze }: Props) {
    return (
        <Modal visible={visible} animationType="fade" transparent={true}>
            <View style={styles.container}>
                <View style={styles.modalContent}>
                    <Text style={styles.title}>Medicine Reminder</Text>
                    <Text style={styles.message}>Time to take: {medicineName}</Text>

                    {medicineImageUrl ? (
                        <Image source={{ uri: medicineImageUrl }} style={styles.largeImage} />
                    ) : (
                        <View style={styles.placeholderImage}>
                            <Text style={styles.placeholderText}>No image uploaded</Text>
                        </View>
                    )}

                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={[styles.button, styles.snoozeButton]} onPress={onSnooze}>
                            <Text style={styles.snoozeButtonText}>Snooze (10m)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.button, styles.dismissButton]} onPress={onDismiss}>
                            <Text style={styles.dismissButtonText}>Dismiss</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modalContent: {
        backgroundColor: '#FFF',
        width: '80%',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#D32F2F',
        marginBottom: 10,
    },
    message: {
        fontSize: 18,
        color: '#333',
        marginBottom: 16,
        textAlign: 'center',
    },
    largeImage: {
        width: 200,
        height: 200,
        borderRadius: 16,
        marginBottom: 24,
    },
    placeholderImage: {
        width: 200,
        height: 200,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    placeholderText: {
        color: '#94A3B8',
        fontSize: 16,
        fontWeight: '600',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginHorizontal: 8,
    },
    snoozeButton: {
        backgroundColor: '#F5F5F5',
        borderWidth: 1,
        borderColor: '#CCC',
    },
    snoozeButtonText: {
        fontSize: 16,
        color: '#666',
        fontWeight: 'bold',
    },
    dismissButton: {
        backgroundColor: '#4CAF50',
    },
    dismissButtonText: {
        fontSize: 16,
        color: '#FFF',
        fontWeight: 'bold',
    },
});
