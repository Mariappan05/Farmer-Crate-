import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_URL = 'https://farmercrate.onrender.com/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 45000, // Render.com free tier can take 30s+ to wake up
  headers: { 'Content-Type': 'application/json' },
});

// Auto-attach token to every request
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch (_) {}
  return config;
});

// Simple retry for network errors (server wake-up on Render.com free tier)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    // Only retry on network error or 5xx, max 2 retries
    const isNetworkErr = !error.response;
    const is5xx = error.response && error.response.status >= 500;
    if ((isNetworkErr || is5xx) && !config._retry) {
      config._retry = 1;
      await sleep(2000); // wait 2s before retry
      try { return await api(config); } catch (_) {}
    }
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Something went wrong';
    const enriched = new Error(msg);
    enriched.response = error?.response;   // preserve so callers can read status/data
    enriched.status   = error?.response?.status;
    return Promise.reject(enriched);
  }
);

export default api;
