/**
 * OtpScreen.js
 * React Native conversion of Flutter Otp.dart
 *
 * Params: { email, flow, tempToken? }
 *   flow = 'forgotPassword'     → verifyOtp → ResetPassword
 *   flow = 'customerFirstLogin' → verifyCustomerFirstLoginOtp → save session → Customer home
 *
 * Features:
 * - 6-digit OTP individual boxes with auto-focus
 * - 60-second resend countdown
 * - Green gradient background with floating crop icons
 * - Animated digit boxes entrance
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
  Easing,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import {
  verifyOtp,
  sendOtp,
  verifyCustomerFirstLoginOtp,
  resendCustomerFirstLoginOtp,
} from '../../services/authService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const NUM_DIGITS = 6;
const RESEND_SECONDS = 60;

/* ──────────────────────────────────────────────────────────────────────────
 * Floating crop icons
 * ────────────────────────────────────────────────────────────────────────── */
const CROP_ICONS = [
  { icon: 'leaf',              family: 'Ionicons',               size: 28, startX: 0.08, startY: 0.12, driftX: 18,  driftY: -22, duration: 4200 },
  { icon: 'grain',             family: 'MaterialCommunityIcons', size: 24, startX: 0.85, startY: 0.08, driftX: -14, driftY: 20,  duration: 5000 },
  { icon: 'flower-outline',    family: 'MaterialCommunityIcons', size: 26, startX: 0.72, startY: 0.32, driftX: 12,  driftY: -16, duration: 3800 },
  { icon: 'sprout',            family: 'MaterialCommunityIcons', size: 22, startX: 0.15, startY: 0.55, driftX: -10, driftY: 18,  duration: 4600 },
  { icon: 'water-outline',     family: 'Ionicons',               size: 20, startX: 0.90, startY: 0.60, driftX: -16, driftY: -12, duration: 3500 },
  { icon: 'nutrition-outline', family: 'Ionicons',               size: 24, startX: 0.50, startY: 0.05, driftX: 8,   driftY: 22,  duration: 4900 },
  { icon: 'tree-outline',      family: 'MaterialCommunityIcons', size: 26, startX: 0.30, startY: 0.85, driftX: 14,  driftY: -20, duration: 4100 },
  { icon: 'sunny-outline',     family: 'Ionicons',               size: 22, startX: 0.65, startY: 0.75, driftX: -12, driftY: 14,  duration: 5200 },
];

const FloatingCropIcon = ({ config }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: config.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: config.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, []);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, config.driftX] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, config.driftY] });
  const opacity   = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, 0.35, 0.15] });
  const Icon = config.family === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;
  return (
    <Animated.View style={{ position: 'absolute', left: config.startX * SCREEN_WIDTH, top: config.startY * SCREEN_HEIGHT, transform: [{ translateX }, { translateY }], opacity }}>
      <Icon name={config.icon} size={config.size} color="#FFFFFF" />
    </Animated.View>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 * OtpScreen
 * ────────────────────────────────────────────────────────────────────────── */
const OtpScreen = ({ navigation, route }) => {
  const { email, flow, tempToken } = route.params || {};
  const isCustomerFirstLogin = flow === 'customerFirstLogin';

  const { saveSession } = useAuth();
  const insets = useSafeAreaInsets();

  const [otp, setOtp] = useState(Array(NUM_DIGITS).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);
  const [isResending, setIsResending] = useState(false);

  const inputRefs = useRef([]);
  const timerRef = useRef(null);
  const hasAutoSubmitted = useRef(false);

  // Entry animation
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Individual box animations (staggered entrance)
  const boxAnims = useRef(
    Array.from({ length: NUM_DIGITS }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    // Main entrance
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900,  easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    // Staggered box entrance
    Animated.stagger(
      80,
      boxAnims.map((a) =>
        Animated.spring(a, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
      ),
    ).start();

    startTimer();
    setTimeout(() => inputRefs.current[0]?.focus(), 400);
    return () => clearInterval(timerRef.current);
  }, []);

  /* ── Timer ────────────────────────────────────────────────────────────── */
  const startTimer = () => {
    clearInterval(timerRef.current);
    setResendTimer(RESEND_SECONDS);
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  /* ── Auto-submit when 6 digits entered ────────────────────────────────── */
  useEffect(() => {
    const otpStr = otp.join('');
    if (otpStr.length === NUM_DIGITS && !otpStr.includes('') && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      handleVerify(otpStr);
    }
    if (otpStr.length < NUM_DIGITS) hasAutoSubmitted.current = false;
  }, [otp]);

  /* ── Input handling ───────────────────────────────────────────────────── */
  const handleChange = (value, index) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < NUM_DIGITS - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    }
  };

  const resetOtpInputs = () => {
    setOtp(Array(NUM_DIGITS).fill(''));
    hasAutoSubmitted.current = false;
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  };

  /* ── Verify OTP ───────────────────────────────────────────────────────── */
  const handleVerify = useCallback(
    async (otpOverride) => {
      const otpStr = otpOverride || otp.join('');
      if (otpStr.length < NUM_DIGITS) {
        Alert.alert('Validation', 'Please enter the full 6-digit OTP.');
        return;
      }

      setIsLoading(true);
      try {
        if (isCustomerFirstLogin) {
          // customerFirstLogin flow
          const data = await verifyCustomerFirstLoginOtp(email, otpStr, tempToken);
          if (data.success || data.token) {
            const expiryMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
            await saveSession({
              token: data.token,
              role: data.user?.role || 'customer',
              userId: data.user?.id || data.user?._id,
              user: data.user,
              expiryMs,
            });
            // Auth state change triggers AppNavigator to show Customer screens
          } else {
            Alert.alert('Invalid OTP', data.message || 'OTP verification failed. Please try again.');
            resetOtpInputs();
          }
        } else {
          // forgotPassword flow
          const data = await verifyOtp(email, otpStr);
          if (data.success !== false) {
            navigation.replace('ResetPassword', { email });
          } else {
            Alert.alert('Invalid OTP', data.message || 'OTP verification failed. Please try again.');
            resetOtpInputs();
          }
        }
      } catch (error) {
        const msg =
          error?.response?.data?.message ||
          error?.message ||
          'Verification failed. Please try again.';
        Alert.alert('Error', msg);
        resetOtpInputs();
      } finally {
        setIsLoading(false);
      }
    },
    [otp, email, flow, tempToken],
  );

  /* ── Resend OTP ───────────────────────────────────────────────────────── */
  const handleResend = async () => {
    if (resendTimer > 0 || isResending) return;
    setIsResending(true);
    try {
      if (isCustomerFirstLogin) {
        await resendCustomerFirstLoginOtp(email, tempToken);
      } else {
        await sendOtp(email);
      }
      Alert.alert('OTP Resent', `A new OTP has been sent to ${email}.`);
      startTimer();
      resetOtpInputs();
    } catch (error) {
      const msg = error?.response?.data?.message || error?.message || 'Could not resend OTP.';
      Alert.alert('Error', msg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />

      {/* Green gradient simulation */}
      <View style={styles.gradientTop} />
      <View style={styles.gradientBottom} />

      {/* Decorative circles */}
      <View style={styles.circleTopLeft} />
      <View style={styles.circleBottomRight} />
      <View style={styles.circleTopRight} />

      {/* Floating crop icons */}
      {CROP_ICONS.map((cfg, idx) => (
        <FloatingCropIcon key={idx} config={cfg} />
      ))}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View style={[styles.headerSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.logoCircle}>
              <Ionicons name="keypad-outline" size={44} color="#388E3C" />
            </View>
            <Text style={styles.title}>Verify OTP</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to{'\n'}
              <Text style={styles.emailHighlight}>{email}</Text>
            </Text>
          </Animated.View>

          {/* White form card */}
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.cardTitle}>Enter Verification Code</Text>

            {/* OTP digit boxes */}
            <View style={styles.otpRow}>
              {otp.map((digit, i) => {
                const scale = boxAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
                const boxOpacity = boxAnims[i];
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.otpBoxWrapper,
                      { opacity: boxOpacity, transform: [{ scale }] },
                    ]}
                  >
                    <TextInput
                      ref={(ref) => (inputRefs.current[i] = ref)}
                      style={[
                        styles.otpInput,
                        digit ? styles.otpInputFilled : null,
                        isLoading && styles.otpInputDisabled,
                      ]}
                      value={digit}
                      onChangeText={(val) => handleChange(val, i)}
                      onKeyPress={(e) => handleKeyPress(e, i)}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                      editable={!isLoading}
                    />
                  </Animated.View>
                );
              })}
            </View>

            {/* Verify button */}
            <TouchableOpacity
              style={[styles.verifyBtn, isLoading && { opacity: 0.7 }]}
              onPress={() => handleVerify()}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.verifyBtnText}>VERIFY OTP</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Resend section */}
            <View style={styles.resendSection}>
              {resendTimer > 0 ? (
                <View style={styles.timerRow}>
                  <Ionicons name="time-outline" size={16} color="#9E9E9E" style={{ marginRight: 4 }} />
                  <Text style={styles.timerText}>Resend OTP in {resendTimer}s</Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={isResending}
                  activeOpacity={0.7}
                  style={styles.resendBtn}
                >
                  {isResending ? (
                    <ActivityIndicator size="small" color="#388E3C" />
                  ) : (
                    <>
                      <Ionicons name="refresh-outline" size={16} color="#388E3C" style={{ marginRight: 4 }} />
                      <Text style={styles.resendText}>Resend OTP</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          {/* Back to Login link */}
          <Animated.View style={[styles.backRow, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="arrow-back" size={18} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.backLink}>Go Back</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 * Styles – matches Flutter Otp.dart green gradient theme
 * ────────────────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#43A047' },
  gradientTop: {
    ...StyleSheet.absoluteFillObject,
    height: SCREEN_HEIGHT * 0.5,
    backgroundColor: '#2E7D32',
  },
  gradientBottom: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.5,
    left: 0, right: 0, bottom: 0,
    backgroundColor: '#66BB6A',
  },
  circleTopLeft: {
    position: 'absolute', top: -60, left: -60,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  circleBottomRight: {
    position: 'absolute', bottom: -40, right: -40,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  circleTopRight: {
    position: 'absolute', top: 40, right: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  scrollContent: {
    paddingHorizontal: 24,
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
  },
  headerSection: { alignItems: 'center', marginBottom: 28 },
  logoCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 30, fontWeight: 'bold', color: '#FFFFFF',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.85)',
    marginTop: 8, textAlign: 'center',
    paddingHorizontal: 10, lineHeight: 21,
  },
  emailHighlight: { color: '#FFFFFF', fontWeight: 'bold' },
  // White card
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 32, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 10,
  },
  cardTitle: {
    fontSize: 22, fontWeight: 'bold', color: '#388E3C',
    marginBottom: 24, textAlign: 'center',
  },
  // OTP boxes
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 28,
  },
  otpBoxWrapper: { /* animated wrapper */ },
  otpInput: {
    width: 48, height: 58,
    borderRadius: 14, textAlign: 'center',
    fontSize: 24, fontWeight: 'bold', color: '#1B5E20',
    backgroundColor: '#F8F9FA',
    borderWidth: 2, borderColor: '#E0E0E0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  otpInputFilled: {
    borderColor: '#4CAF50', backgroundColor: '#E8F5E9',
  },
  otpInputDisabled: { opacity: 0.5 },
  // Verify button
  verifyBtn: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50', borderRadius: 16, height: 56,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4CAF50', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  verifyBtnText: {
    color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1.5,
  },
  // Resend
  resendSection: { alignItems: 'center', marginTop: 20 },
  timerRow: { flexDirection: 'row', alignItems: 'center' },
  timerText: { color: '#9E9E9E', fontSize: 14, fontWeight: '500' },
  resendBtn: { flexDirection: 'row', alignItems: 'center', padding: 4 },
  resendText: { color: '#388E3C', fontSize: 15, fontWeight: '700' },
  // Back
  backRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 24,
  },
  backLink: {
    color: '#FFFFFF', fontSize: 16, fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});

export default OtpScreen;
