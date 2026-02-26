import Constants from 'expo-constants';

// For production (e.g., when building for stores)
const PROD_API_URL = 'https://prakashmedical-server.onrender.com/api';

// For development
const getDevApiUrl = () => {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
        const ipAddress = hostUri.split(':')[0];
        return `http://${ipAddress}:5000/api`;
    }
    return 'http://localhost:5000/api'; // Fallback
};

export const API_URL = __DEV__ ? getDevApiUrl() : PROD_API_URL;

export const MISSED_DOSE_TIMEOUT_MINUTES = 10;
export const SNOOZE_DURATION_MINUTES = 10;
export const NOTIFICATION_POLL_INTERVAL_MS = 30000;
