import api from './api';
import { BASE_URL } from './api';
import axios from 'axios';

// ─── Auth ──────────────────────────────────────────────────────────────────

export const login = async (username, password) => {
  const { data } = await axios.post(`${BASE_URL}/auth/login`, { username, password });
  return data;
};

/** POST /api/auth/register  — field names match Flutter signup.dart */
export const signup = async (payload) => {
  const { data } = await axios.post(`${BASE_URL}/auth/register`, payload);
  return data;
};

/** POST /api/auth/send-otp  (forgot-password OTP) */
export const sendOtp = async (email) => {
  const { data } = await axios.post(`${BASE_URL}/auth/send-otp`, { email });
  return data;
};

/** POST /api/auth/verify-otp  (forgot-password flow) */
export const verifyOtp = async (email, otp) => {
  const { data } = await axios.post(`${BASE_URL}/auth/verify-otp`, { email, otp });
  return data;
};

/** POST /api/auth/verify-customer-first-login  (customerFTL flow) */
export const verifyCustomerFirstLoginOtp = async (email, otp, tempToken) => {
  const { data } = await axios.post(`${BASE_URL}/auth/verify-customer-first-login`, {
    email,
    otp,
    tempToken,
  });
  return data;
};

/** POST /api/auth/resend-customer-first-login-otp */
export const resendCustomerFirstLoginOtp = async (email, tempToken) => {
  const { data } = await axios.post(`${BASE_URL}/auth/resend-customer-first-login-otp`, {
    email,
    tempToken,
  });
  return data;
};

/** POST /api/auth/reset-password  (after OTP verified) */
export const resetPassword = async (email, newPassword) => {
  const { data } = await axios.post(`${BASE_URL}/auth/reset-password`, {
    email,
    newPassword,
  });
  return data;
};

/**
 * POST /api/auth/delivery-person-first-login-password
 * Matches Flutter delivery_password_reset.dart payload exactly.
 */
export const deliveryPasswordReset = async (tempToken, userId, newPassword) => {
  const { data } = await axios.post(
    `${BASE_URL}/auth/delivery-person-first-login-password`,
    {
      deliveryPersonId: userId,
      newPassword,
      tempToken,
    },
  );
  return data;
};

// ─── Utility ───────────────────────────────────────────────────────────────

/** Decode a JWT payload without a library */
export const decodeJwtPayload = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let payload = parts[1];
    while (payload.length % 4 !== 0) payload += '=';
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
};

export const updateDeliveryAvailability = async (isAvailable, token) => {
  const { data } = await axios.put(
    `${BASE_URL}/delivery-persons/availability`,
    { is_available: isAvailable },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
};

/** POST /api/auth/google-signin  — sends Google idToken + selected role */
export const googleSignIn = async (idToken, role) => {
  const { data } = await axios.post(`${BASE_URL}/auth/google-signin`, { idToken, role });
  return data;
};

/** POST /api/auth/google-complete-profile  — new Google user completes profile */
export const googleCompleteProfile = async (payload) => {
  const { data } = await axios.post(`${BASE_URL}/auth/google-complete-profile`, payload);
  return data;
};
