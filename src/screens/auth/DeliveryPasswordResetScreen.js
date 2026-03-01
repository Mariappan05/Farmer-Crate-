/**
 * DeliveryPasswordResetScreen.js
 * React Native conversion of Flutter delivery_password_reset.dart
 *
 * Params: { tempToken, userId }
 * - First-time delivery person password setup
 * - New + Confirm password with visibility toggle
 * - Password strength indicator (8+ chars, uppercase, lowercase, number, special)
 * - Calls deliveryPasswordReset(tempToken, userId, newPassword)
 * - On success navigates to Login with success message
 * - Green gradient background with floating crop icons
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
import { deliveryPasswordReset } from '../../services/authService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
 * Password strength rules
 * ────────────────────────────────────────────────────────────────────────── */
const STRENGTH_RULES = [
  { label: '8+ characters', test: (p) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'Number', test: (p) => /[0-9]/.test(p) },
  { label: 'Special character', test: (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
];

/* ──────────────────────────────────────────────────────────────────────────
 * DeliveryPasswordResetScreen
 * ────────────────────────────────────────────────────────────────────────── */
const DeliveryPasswordResetScreen = ({ navigation, route }) => {
  const { tempToken, userId } = route.params || {};
  const insets = useSafeAreaInsets();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const confirmRef = useRef(null);

  // Entry animations
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900,  easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  /* ── Strength computation ─────────────────────────────────────────────── */
  const passedCount = STRENGTH_RULES.filter((r) => r.test(newPassword)).length;
  const strengthPercent = (passedCount / STRENGTH_RULES.length) * 100;
  const strengthColor =
    strengthPercent <= 20
      ? '#e53935'
      : strengthPercent <= 40
        ? '#FF9800'
        : strengthPercent <= 60
          ? '#FFC107'
          : strengthPercent <= 80
            ? '#8BC34A'
            : '#4CAF50';
  const strengthLabel =
    strengthPercent <= 20
      ? 'Very Weak'
      : strengthPercent <= 40
        ? 'Weak'
        : strengthPercent <= 60
          ? 'Fair'
          : strengthPercent <= 80
            ? 'Good'
            : 'Strong';

  const passwordsMatch = newPassword.length >= 8 && newPassword === confirmPassword;

  /* ── Handle Set Password ──────────────────────────────────────────────── */
  const handleSetPassword = async () => {
    if (!newPassword) {
      Alert.alert('Validation', 'Please enter a new password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Validation', 'Password must be at least 8 characters.');
      return;
    }
    if (!confirmPassword) {
      Alert.alert('Validation', 'Please confirm your password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await deliveryPasswordReset(tempToken, userId, newPassword);
      Alert.alert(
        'Welcome!',
        'Your password has been set successfully. Please login with your new credentials.',
        [{ text: 'Sign In', onPress: () => navigation.replace('Login') }],
      );
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to set password. Please try again.';
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
          {/* Header */}
          <Animated.View style={[styles.headerSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.logoCircle}>
              <MaterialCommunityIcons name="truck-delivery-outline" size={44} color="#388E3C" />
            </View>
            <Text style={styles.title}>Set Your Password</Text>
            <Text style={styles.subtitle}>
              Welcome, Delivery Partner! This is your first login.{'\n'}
              Please create a secure password to continue.
            </Text>
          </Animated.View>

          {/* White form card */}
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.cardTitle}>Create Password</Text>

            {/* New Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>New Password</Text>
              <View style={[styles.inputRow, newPassword.length >= 8 && styles.inputRowValid]}>
                <Ionicons name="lock-closed-outline" size={20} color="#388E3C" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter new password"
                  placeholderTextColor="#9E9E9E"
                  secureTextEntry={!showNew}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TouchableOpacity onPress={() => setShowNew((p) => !p)} style={styles.eyeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showNew ? 'eye-outline' : 'eye-off-outline'} size={20} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Password strength indicator */}
            {newPassword.length > 0 && (
              <View style={styles.strengthSection}>
                <View style={styles.strengthBarBg}>
                  <View style={[styles.strengthBarFill, { width: `${strengthPercent}%`, backgroundColor: strengthColor }]} />
                </View>
                <Text style={[styles.strengthLabelText, { color: strengthColor }]}>{strengthLabel}</Text>
                {STRENGTH_RULES.map((rule, i) => {
                  const passed = rule.test(newPassword);
                  return (
                    <View key={i} style={styles.ruleRow}>
                      <Ionicons
                        name={passed ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={passed ? '#4CAF50' : '#BDBDBD'}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.ruleText, passed && styles.ruleTextPassed]}>{rule.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <View style={[styles.inputRow, passwordsMatch && styles.inputRowValid]}>
                <Ionicons name="lock-closed-outline" size={20} color="#388E3C" style={styles.inputIcon} />
                <TextInput
                  ref={confirmRef}
                  style={styles.textInput}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#9E9E9E"
                  secureTextEntry={!showConfirm}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSetPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirm((p) => !p)} style={styles.eyeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showConfirm ? 'eye-outline' : 'eye-off-outline'} size={20} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Password match indicator */}
            {confirmPassword.length > 0 && (
              <View style={styles.matchRow}>
                <Ionicons
                  name={passwordsMatch ? 'checkmark-circle' : 'close-circle'}
                  size={16}
                  color={passwordsMatch ? '#4CAF50' : '#e53935'}
                />
                <Text style={[styles.matchText, { color: passwordsMatch ? '#4CAF50' : '#e53935' }]}>
                  {passwordsMatch ? ' Passwords match' : ' Passwords do not match'}
                </Text>
              </View>
            )}

            {/* Set Password button */}
            <TouchableOpacity
              style={[styles.setBtn, isLoading && { opacity: 0.7 }]}
              onPress={handleSetPassword}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.setBtnText}>SET PASSWORD</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Back to Login */}
          <Animated.View style={[styles.backRow, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="arrow-back" size={18} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.backLink}>Back to Login</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 * Styles – matches Flutter delivery_password_reset.dart green gradient theme
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
    paddingHorizontal: 16, lineHeight: 21,
  },
  // White card
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 32, padding: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 10,
  },
  cardTitle: {
    fontSize: 24, fontWeight: 'bold', color: '#388E3C',
    marginBottom: 24, textAlign: 'center',
  },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    fontSize: 14, fontWeight: '600', color: '#2E7D32', marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8F9FA', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#E0E0E0',
    paddingHorizontal: 14, height: 56,
  },
  inputRowValid: { borderColor: '#4CAF50' },
  inputIcon: { marginRight: 10 },
  textInput: { flex: 1, fontSize: 15, color: '#212121', height: 56 },
  eyeBtn: { padding: 6 },
  // Strength indicator
  strengthSection: { marginBottom: 16, marginTop: -4 },
  strengthBarBg: {
    height: 6, borderRadius: 3,
    backgroundColor: '#E0E0E0', marginBottom: 6,
    overflow: 'hidden',
  },
  strengthBarFill: { height: 6, borderRadius: 3 },
  strengthLabelText: { fontSize: 12, fontWeight: '700', marginBottom: 8, textAlign: 'right' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  ruleText: { fontSize: 12, color: '#9E9E9E' },
  ruleTextPassed: { color: '#4CAF50' },
  // Match indicator
  matchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: -4 },
  matchText: { fontSize: 13, fontWeight: '500' },
  // Set Password button
  setBtn: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50', borderRadius: 16, height: 56,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
    shadowColor: '#4CAF50', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  setBtnText: {
    color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1.5,
  },
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

export default DeliveryPasswordResetScreen;
