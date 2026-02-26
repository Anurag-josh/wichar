import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '@/config';

interface Props {
    visible: boolean;
    medicine: any; // The medicine object to edit
    onClose: () => void;
    onSave: (id: string, name: string, totalQuantity: number, imageUri?: string | null) => void;
}

export function EditMedicineDetailsModal({ visible, medicine, onClose, onSave }: Props) {
    const [name, setName] = useState('');
    const [totalQuantity, setTotalQuantity] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [removedImage, setRemovedImage] = useState(false);

    // Update local state when a new medicine is passed in
    useEffect(() => {
        if (medicine) {
            setName(medicine.name || '');
            setTotalQuantity(medicine.totalQuantity !== undefined ? String(medicine.totalQuantity) : '0');
            if (medicine.imageUrl) {
                // Ensure proper URL construction
                const fullUrl = medicine.imageUrl.startsWith('http')
                    ? medicine.imageUrl
                    : `${API_URL.replace('/api', '')}${medicine.imageUrl}`;
                setOriginalImage(fullUrl);
                setImageUri(null); // No new local image picked
                setRemovedImage(false);
            } else {
                setOriginalImage(null);
                setImageUri(null);
                setRemovedImage(false);
            }
        }
    }, [medicine]);

    const handleSave = () => {
        if (name.trim() === '' || !medicine) return;
        const quantityNum = parseInt(totalQuantity) || 0;

        let finalImageUri: string | null | undefined = undefined;
        if (removedImage && !imageUri) {
            finalImageUri = null; // Explicitly remove
        } else if (imageUri) {
            finalImageUri = imageUri; // Try uploading new image
        }

        onSave(medicine._id, name.trim(), Math.max(0, quantityNum), finalImageUri);
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
        });

        if (!result.canceled && result.assets.length > 0) {
            setImageUri(result.assets[0].uri);
            setRemovedImage(false);
        }
    };

    const handleRemoveImage = () => {
        setImageUri(null);
        setRemovedImage(true);
    };


    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.modalContent}>
                    <Text style={styles.title}>Edit Medicine & Refill</Text>

                    <Text style={styles.label}>Medicine Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Medicine Name"
                        value={name}
                        onChangeText={setName}
                        placeholderTextColor="#999"
                    />

                    <Text style={styles.label}>Available Inventory (Total Pills)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Total Quantity (e.g. 30)"
                        value={totalQuantity}
                        onChangeText={setTotalQuantity}
                        keyboardType="numeric"
                        placeholderTextColor="#999"
                    />

                    <Text style={styles.label}>Medicine Image</Text>
                    <View style={styles.imageSection}>
                        {(imageUri || (!removedImage && originalImage)) ? (
                            <View style={styles.previewContainer}>
                                <Image source={{ uri: imageUri || originalImage! }} style={styles.previewImage} />
                                <View style={styles.imageActions}>
                                    <TouchableOpacity style={[styles.imageButton, { flex: 1, marginRight: 5 }]} onPress={pickImage}>
                                        <Text style={styles.imageButtonText}>Change</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.imageButton, styles.removeButton, { flex: 1, marginLeft: 5 }]} onPress={handleRemoveImage}>
                                        <Text style={styles.removeButtonText}>Remove</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.imageButton} onPress={pickImage}>
                                <Text style={styles.imageButtonText}>Upload Medicine Image</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.saveButton]}
                            onPress={handleSave}
                            disabled={name.trim() === ''}
                        >
                            <Text style={styles.saveButtonText}>Save Details</Text>
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
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748B',
        marginBottom: 8,
        marginLeft: 4
    },
    input: {
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        padding: 16,
        fontSize: 18,
        marginBottom: 20,
        color: '#333333',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10
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
        backgroundColor: '#10B981', // green for refill focus
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
    imageSection: {
        marginBottom: 20,
    },
    previewContainer: {
        alignItems: 'center',
    },
    previewImage: {
        width: 120,
        height: 120,
        borderRadius: 8,
        marginBottom: 10,
    },
    imageActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    imageButton: {
        backgroundColor: '#E0E7FF',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    imageButtonText: {
        fontSize: 14,
        color: '#4F46E5',
        fontWeight: '600',
    },
    removeButton: {
        backgroundColor: '#FEE2E2',
    },
    removeButtonText: {
        fontSize: 14,
        color: '#DC2626',
        fontWeight: '600',
    },
});
