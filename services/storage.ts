import AsyncStorage from '@react-native-async-storage/async-storage';

export const CURRENT_USER_KEY = 'current_user';

export const saveCurrentUser = async (user: any) => {
    try {
        await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } catch (error) {
        console.error('Error saving user data', error);
    }
};

export const getCurrentUser = async () => {
    try {
        const userStr = await AsyncStorage.getItem(CURRENT_USER_KEY);
        return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
        console.error('Error loading user data', error);
        return null;
    }
};

export const clearCurrentUser = async () => {
    try {
        await AsyncStorage.removeItem(CURRENT_USER_KEY);
    } catch (error) {
        console.error('Error clearing user data', error);
    }
};
