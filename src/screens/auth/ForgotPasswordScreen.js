/**
 * ForgotPasswordScreen.js
 * React Native conversion of Flutter Forget.dart
 *
 * - Green gradient background with floating crop icons
 * - Email input with validation
 * - Calls sendOtp(email), on success navigates to Otp screen with { email, flow: 'forgotPassword' }
 * - Loading state, animated entrance, back to Login link
 */

import React, { useState, useRef, useEffect } from 'react';
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
import { sendOtp } from '../../services/authService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ──────────────────────────────────────────────────────────────────────────
 * Floating crop icons – consistent with LoginScreen
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
 * ForgotPasswordScreen
 * ────────────────────────────────────────────────────────────────────────── */
const ForgotPasswordScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Entry animations
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900,  easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  /* ── Email validation ─────────────────────────────────────────────────── */
  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  /* ── Handle Send OTP ──────────────────────────────────────────────────── */
  const handleSendOtp = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Please enter your registered email address.');
      return;
    }
    if (!isValidEmail(trimmed)) {
      Alert.alert('Validation', 'Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      await sendOtp(trimmed);
      Alert.alert('OTP Sent', `A 6-digit verification code has been sent to ${trimmed}.`);
      navigation.navigate('Otp', { email: trimmed, flow: 'forgotPassword' });
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to send OTP. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setIsLoading(false);
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
          {/* Header section */}
          <Animated.View style={[styles.headerSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.logoCircle}>
              <Ionicons name="mail-outline" size={44} color="#388E3C" />
            </View>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your registered email address and we'll send you a verification code to reset your password.
            </Text>
          </Animated.View>

          {/* White form card */}
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.cardTitle}>Reset Password</Text>

            {/* Email field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={20} color="#388E3C" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your email"
                  placeholderTextColor="#9E9E9E"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="done"
                  onSubmitEditing={handleSendOtp}
                />
              </View>
            </View>

            {/* Send OTP button */}
            <TouchableOpacity
              style={[styles.sendBtn, isLoading && { opacity: 0.7 }]}
              onPress={handleSendOtp}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="send-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.sendBtnText}>SEND OTP</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Back to Login link */}
          <Animated.View style={[styles.backRow, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.backPrompt}>Remember your password? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.backLink}>Back to Login</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 * Styles – matches Flutter Forget.dart green gradient theme
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
    shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 8 },
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
    paddingHorizontal: 20, lineHeight: 20,
  },
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 32, padding: 32,
    shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 10,
  },
  cardTitle: {
    fontSize: 26, fontWeight: 'bold', color: '#388E3C',
    marginBottom: 24, textAlign: 'center',
  },
  inputGroup: { marginBottom: 24 },
  inputLabel: {
    fontSize: 14, fontWeight: '600', color: '#2E7D32', marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8F9FA', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#E0E0E0',
    paddingHorizontal: 14, height: 56,
  },
  inputIcon: { marginRight: 10 },
  textInput: { flex: 1, fontSize: 15, color: '#212121', height: 56 },
  sendBtn: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50', borderRadius: 16, height: 56,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4CAF50', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  sendBtnText: {
    color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1.5,
  },
  backRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 24,
  },
  backPrompt: { color: 'rgba(255,255,255,0.9)', fontSize: 16 },
  backLink: {
    color: '#FFFFFF', fontSize: 16, fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});

export default ForgotPasswordScreen;
