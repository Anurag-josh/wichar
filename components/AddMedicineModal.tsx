import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';

interface Props {
    visible: boolean;
    onClose: () => void;
    onSave: (name: string, time: Date, totalQuantity: number, imageUri?: string) => void;
}
//add
export function AddMedicineModal({ visible, onClose, onSave }: Props) {
    const [name, setName] = useState('');
    const [totalQuantity, setTotalQuantity] = useState('');
    const [time, setTime] = useState(new Date());
    const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
    const [imageUri, setImageUri] = useState<string | null>(null);

    const handleSave = () => {
        if (name.trim() === '') return;
        const quantityNum = parseInt(totalQuantity) || 0;
        onSave(name.trim(), time, quantityNum, imageUri || undefined);
        setName('');
        setTotalQuantity('');
        setImageUri(null);
        setTime(new Date());
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
        });

        if (!result.canceled && result.assets.length > 0) {
            setImageUri(result.assets[0].uri);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.modalContent}>
                    <Text style={styles.title}>Add New Medicine</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Medicine Name"
                        value={name}
                        onChangeText={setName}
                        placeholderTextColor="#999"
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Total Quantity (e.g. 30)"
                        value={totalQuantity}
                        onChangeText={setTotalQuantity}
                        keyboardType="numeric"
                        placeholderTextColor="#999"
                    />

                    <View style={styles.timePickerContainer}>
                        <Text style={styles.label}>Scheduled Time:</Text>
                        {Platform.OS !== 'ios' && (
                            <TouchableOpacity style={styles.timeButton} onPress={() => setShowPicker(true)}>
                                <Text style={styles.timeButtonText}>
                                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {(showPicker || Platform.OS === 'ios') && (
                            <DateTimePicker
                                value={time}
                                mode="time"
                                display="default"
                                onChange={(event, selectedDate) => {
                                    if (Platform.OS === 'android') setShowPicker(false);
                                    if (selectedDate) setTime(selectedDate);
                                }}
                            />
                        )}
                    </View>

                    <TouchableOpacity style={styles.imageButton} onPress={pickImage}>
                        <Text style={styles.imageButtonText}>{imageUri ? 'Change Medicine Image' : 'Upload Medicine Image (Optional)'}</Text>
                    </TouchableOpacity>
                    {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} />}

                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.saveButton]}
                            onPress={handleSave}
                            disabled={name.trim() === ''}
                        >
                            <Text style={styles.saveButtonText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333333',
        marginBottom: 20,
        textAlign: 'center',
    },
    input: {
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        padding: 16,
        fontSize: 18,
        marginBottom: 20,
        color: '#333333',
    },
    timePickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    label: {
        fontSize: 18,
        color: '#333333',
    },
    timeButton: {
        backgroundColor: '#F5F5F5',
        padding: 12,
        borderRadius: 8,
    },
    timeButtonText: {
        fontSize: 18,
        color: '#007AFF',
        fontWeight: '600',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    button: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginHorizontal: 8,
    },
    cancelButton: {
        backgroundColor: '#F5F5F5',
    },
    saveButton: {
        backgroundColor: '#007AFF',
    },
    cancelButtonText: {
        fontSize: 18,
        color: '#666666',
        fontWeight: '600',
    },
    saveButtonText: {
        fontSize: 18,
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    imageButton: {
        backgroundColor: '#E0E7FF',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 10,
    },
    imageButtonText: {
        fontSize: 16,
        color: '#4F46E5',
        fontWeight: '600',
    },
    previewImage: {
        width: 100,
        height: 100,
        borderRadius: 8,
        alignSelf: 'center',
        marginBottom: 20,
    },
});
