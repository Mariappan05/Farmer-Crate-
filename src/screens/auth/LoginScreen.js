/**
 * LoginScreen.js
 * Faithful React Native conversion of Flutter auth/Signin.dart
 *
 * API: POST /api/auth/login  { username, password }
 *   requiresPasswordChange + tempToken  → DeliveryPasswordReset (first-time delivery)
 *   requiresOTP + tempToken             → Otp screen (customerFTL first-login flow)
 *   Normal login                        → saveSession → AppNavigator routes by role
 *   Delivery role                       → availability dialog (matches Flutter dialog)
 *   farmer / transporter pending        → blocked with alert
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
  Modal,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
  Easing,
  Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CustomButton from '../../components/CustomButton';

// Guard: native module may not be present in Expo Go / first-run before
// `expo run:android` rebuild. Wrap in require() to avoid hard crash.
let GoogleSignin = null;
let statusCodes = {};
try {
  const GoogleSignInModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = GoogleSignInModule.GoogleSignin;
  statusCodes = GoogleSignInModule.statusCodes;
} catch (_e) {
  // Module not available – Google Sign-In will be disabled at runtime.
}
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../context/AuthContext';
import {
  login,
  decodeJwtPayload,
  updateDeliveryAvailability,
  googleSignIn,
} from '../../services/authService';
import ToastMessage from '../../utils/Toast';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = '850075546970-5v0jdspjmtm4ciu5sqrukvlhmohhqon9.apps.googleusercontent.com';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ────────────────────────────────────────────────────────────────────────────
 * Animated floating crop icons – mirrors Flutter's animated crop icons
 * in the green gradient background
 * ──────────────────────────────────────────────────────────────────────────── */
const CROP_ICONS = [
  { icon: 'leaf',            family: 'Ionicons',                 size: 28, startX: 0.08, startY: 0.12, driftX: 18,  driftY: -22, duration: 4200 },
  { icon: 'grain',           family: 'MaterialCommunityIcons',   size: 24, startX: 0.85, startY: 0.08, driftX: -14, driftY: 20,  duration: 5000 },
  { icon: 'flower-outline',  family: 'MaterialCommunityIcons',   size: 26, startX: 0.72, startY: 0.32, driftX: 12,  driftY: -16, duration: 3800 },
  { icon: 'sprout',          family: 'MaterialCommunityIcons',   size: 22, startX: 0.15, startY: 0.55, driftX: -10, driftY: 18,  duration: 4600 },
  { icon: 'water-outline',   family: 'Ionicons',                 size: 20, startX: 0.90, startY: 0.60, driftX: -16, driftY: -12, duration: 3500 },
  { icon: 'nutrition-outline', family: 'Ionicons',               size: 24, startX: 0.50, startY: 0.05, driftX: 8,   driftY: 22,  duration: 4900 },
  { icon: 'tree-outline',    family: 'MaterialCommunityIcons',   size: 26, startX: 0.30, startY: 0.85, driftX: 14,  driftY: -20, duration: 4100 },
  { icon: 'sunny-outline',   family: 'Ionicons',                 size: 22, startX: 0.65, startY: 0.75, driftX: -12, driftY: 14,  duration: 5200 },
];

const FloatingCropIcon = ({ config }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: config.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: config.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, config.driftX],
  });
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, config.driftY],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.15, 0.35, 0.15],
  });

  const IconComponent =
    config.family === 'MaterialCommunityIcons'
      ? MaterialCommunityIcons
      : Ionicons;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: config.startX * SCREEN_WIDTH,
        top: config.startY * SCREEN_HEIGHT,
        transform: [{ translateX }, { translateY }],
        opacity,
      }}
    >
      <IconComponent name={config.icon} size={config.size} color="#FFFFFF" />
    </Animated.View>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * Utility: removed — replaced by imperative ToastMessage ref
 * ──────────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────────
 * LoginScreen
 * ──────────────────────────────────────────────────────────────────────────── */
const LoginScreen = ({ navigation }) => {
  const { saveSession } = useAuth();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Refs for field focus chaining
  const passwordRef = useRef(null);
  const toastRef = useRef(null);

  // Entry animations – mirror Flutter AnimationController (1500 ms fade + slide)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ─── Flutter _showDeliveryAvailabilityDialog equivalent ─────────────────
  const showDeliveryAvailabilityDialog = (token) => {
    Alert.alert(
      'Are you available?',
      'Set your availability status to start receiving delivery orders.',
      [
        {
          text: 'Not Available',
          style: 'cancel',
          onPress: () => {
            updateDeliveryAvailability(false, token).catch(() => {});
            Alert.alert('Status', 'You are offline. No orders will be assigned.');
          },
        },
        {
          text: 'Available',
          onPress: () => {
            updateDeliveryAvailability(true, token).catch(() => {});
            Alert.alert('Status', 'You are now available for deliveries.');
          },
        },
      ],
      { cancelable: false },
    );
  };

  // ─── Flutter _handleLogin equivalent ────────────────────────────────────
  const handleLogin = async () => {
    /* ─ Form validation ─ */
    let valid = true;
    if (!username.trim()) {
      setUsernameError('Please enter your username.');
      valid = false;
    }
    if (!password) {
      setPasswordError('Please enter your password.');
      valid = false;
    }
    if (!valid) return;

    setIsLoading(true);
    try {
      const data = await login(username.trim(), password);

      // ── First-time delivery person: requiresPasswordChange ─────────────
      if (data.requiresPasswordChange && data.tempToken) {
        try {
          const payload = decodeJwtPayload(data.tempToken);
          navigation.replace('DeliveryPasswordReset', {
            tempToken: data.tempToken,
            userId: payload?.delivery_person_id,
          });
        } catch {
          toastRef.current?.show('Error processing login. Please try again.', 'error');
        }
        return;
      }

      // ── First-time customer: requiresOTP (customerFTL flow) ────────────
      if (data.requiresOTP) {
        navigation.replace('Otp', {
          email: data.email,
          isFirstLogin: true,
          tempToken: data.tempToken,
          userName: username.trim(),
        });
        return;
      }

      // ── Normal login ───────────────────────────────────────────────────
      if (data.token && data.user) {
        const user = data.user;
        const role = user.role;

        // Farmer / transporter pending verification → block login
        if (
          (role === 'farmer' || role === 'transporter') &&
          user.verification_status === 'pending'
        ) {
          Alert.alert(
            'Verification Pending',
            data.message ||
              'Your account is under verification. Please wait for admin approval.',
            [{ text: 'OK' }],
          );
          return;
        }

        // Decode JWT for precise expiry; fall back to 24 h
        const decoded = decodeJwtPayload(data.token);
        const expiryMs = decoded?.exp
          ? decoded.exp * 1000
          : Date.now() + 24 * 60 * 60 * 1000;

        // Persist to AsyncStorage + update AuthContext
        await AsyncStorage.setItem('auth_token', data.token);
        await AsyncStorage.setItem('role', role);
        if (user.id != null)
          await AsyncStorage.setItem('user_id', String(user.id));
        await AsyncStorage.setItem('user_data', JSON.stringify(user));
        await AsyncStorage.setItem('token_expiry', String(expiryMs));

        await saveSession({
          token: data.token,
          role,
          userId: user.id,
          user,
          expiryMs,
        });

        // Delivery: show availability dialog after session saved
        if (role === 'delivery') {
          showDeliveryAvailabilityDialog(data.token);
        }
        // AppNavigator reacts to authState.role and routes automatically
      } else {
        toastRef.current?.show(data.message || data.error || 'Invalid credentials. Please try again.', 'error');
      }
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Unable to connect. Please try again.';
      toastRef.current?.show(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Google Sign-In (native – @react-native-google-signin) ─────────────
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rolePickerVisible, setRolePickerVisible] = useState(false);
  const roleResolveRef = useRef(null);

  useEffect(() => {
    if (GoogleSignin) {
      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        offlineAccess: false,
      });
    }
  }, []);

  const handleGoogleToken = async (idToken) => {
    if (!idToken) {
      Alert.alert('Error', 'Failed to get Google ID token');
      setGoogleLoading(false);
      return;
    }
    try {
      const googlePayload = decodeJwtPayload(idToken) || {};
      const data = await googleSignIn(idToken, pendingGoogleRole.current);

      if (data.token) {
        const user = data.user;
        const selectedRole = pendingGoogleRole.current;

        if (
          (selectedRole === 'farmer' || selectedRole === 'transporter') &&
          user?.verification_status === 'pending'
        ) {
          Alert.alert(
            'Verification Pending',
            'Your account is under review by our admin team. You will be notified once approved.',
          );
          return;
        }

        const decoded = decodeJwtPayload(data.token);
        await saveSession({
          token: data.token,
          role: selectedRole,
          userId: user?.id ?? decoded?.userId,
          user,
          expiryMs: decoded?.exp ? decoded.exp * 1000 : undefined,
        });
      } else {
        // New user → profile completion
        navigation.navigate('GoogleProfileCompletion', {
          email: googlePayload.email || '',
          name: googlePayload.name || 'User',
          googleId: googlePayload.sub || '',
          role: pendingGoogleRole.current,
        });
      }
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Google Sign-In failed';
      const existingRole = e?.response?.data?.existingRole;
      if (existingRole) {
        Alert.alert(
          'Role Conflict',
          `This email is already registered as "${existingRole}". Please sign in with that role.`,
        );
      } else {
        Alert.alert('Google Sign-In Failed', msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const pendingGoogleRole = useRef(null);

  // Show a custom role-picker modal and await the user's choice
  const pickRoleModal = () =>
    new Promise((resolve) => {
      roleResolveRef.current = resolve;
      setRolePickerVisible(true);
    });

  const handleGoogleSignIn = async () => {
    if (!GoogleSignin) {
      toastRef.current?.show(
        'Google Sign-In is not available in Expo Go. Please use the installed dev APK.',
        'warning',
      );
      return;
    }
    // Step 1: Ask user to pick a role via custom modal
    const selectedRole = await pickRoleModal();
    if (!selectedRole) return;

    pendingGoogleRole.current = selectedRole;
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signOut(); // ensure fresh sign-in picker
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo?.data?.idToken ?? userInfo?.idToken;
      await handleGoogleToken(idToken);
    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled
      } else if (error.code === statusCodes.IN_PROGRESS) {
        Alert.alert('Sign-In', 'Sign-in already in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services not available');
      } else {
        Alert.alert('Google Sign-In Failed', error.message || 'An error occurred');
      }
      setGoogleLoading(false);
    }
  };

  // ─── UI – mirrors Flutter Signin.dart build() ──────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Enhanced gradient background */}
      <LinearGradient
        colors={['#071A08', '#0D3B10', '#1B5E20', '#2E7D32']}
        locations={[0, 0.3, 0.6, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Decorative circles – Flutter Stack Positioned */}
      <View style={styles.circleTopLeft} />
      <View style={styles.circleBottomRight} />
      <View style={styles.circleTopRight} />
      <View style={styles.circleMid} />

      {/* Animated floating crop icons */}
      {CROP_ICONS.map((cfg, idx) => (
        <FloatingCropIcon key={idx} config={cfg} />
      ))}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo + App name (Flutter CircleAvatar + Text) ── */}
          <Animated.View
            style={[
              styles.headerSection,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.logoCircle}>
              <Image
                source={require('../../../assets/FarmerCrate_Logo.jpg')}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.appName}>Farmer Crate</Text>
            <Text style={styles.appSubtitle}>
              Welcome! Please login to continue
            </Text>
          </Animated.View>

          {/* ── White form card ── */}
          <Animated.View
            style={[
              styles.card,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <Text style={styles.cardTitle}>Sign In</Text>

            {/* Username field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Username</Text>
              <View style={[styles.inputRow, usernameError ? styles.inputRowError : null]}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color="#388E3C"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your username"
                  placeholderTextColor="#9E9E9E"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={(v) => { setUsername(v); if (usernameError) setUsernameError(''); }}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
              {usernameError ? <Text style={styles.inputError}>{usernameError}</Text> : null}
            </View>

            {/* Password field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={[styles.inputRow, passwordError ? styles.inputRowError : null]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#388E3C"
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={passwordRef}
                  style={[styles.textInput, { flex: 1 }]}
                  placeholder="Enter your password"
                  placeholderTextColor="#9E9E9E"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(''); }}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
              {passwordError ? <Text style={styles.inputError}>{passwordError}</Text> : null}
            </View>

            {/* Forgot Password link */}
            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* LOGIN button */}
              <CustomButton
                title="LOGIN"
                onPress={handleLogin}
                loading={isLoading}
                style={styles.loginBtn}
                variant="primary"
              />
            {/* OR divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Sign-In button */}
            <TouchableOpacity
              style={[styles.googleBtn, googleLoading && { opacity: 0.7 }]}
              onPress={handleGoogleSignIn}
              disabled={googleLoading || isLoading}
              activeOpacity={0.85}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#DB4437" />
              ) : (
                <>
                  <Image
                    source={require('../../../assets/icons8-google-logo-50.png')}
                    style={styles.googleLogo}
                    resizeMode="contain"
                  />
                  <Text style={styles.googleBtnText}>Sign in with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* ── Create account link (outside card, like Flutter _buildCreateAccountLink) ── */}
          <Animated.View
            style={[
              styles.signupRow,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <Text style={styles.signupPrompt}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupLink}>Sign Up</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ToastMessage ref={toastRef} />

      {/* ── Google Role Picker Modal ── */}
      <Modal
        visible={rolePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setRolePickerVisible(false); roleResolveRef.current?.(null); }}
      >
        <TouchableOpacity
          style={styles.roleModalOverlay}
          activeOpacity={1}
          onPress={() => { setRolePickerVisible(false); roleResolveRef.current?.(null); }}
        >
          <View style={styles.roleModalSheet}>
            <View style={styles.roleModalHandle} />
            <Text style={styles.roleModalTitle}>Sign in with Google as</Text>
            <Text style={styles.roleModalSub}>Choose how you want to use Farmer Crate</Text>
            {[
              { role: 'customer', label: 'Customer', icon: 'person-outline', color: '#1565C0', bg: '#E3F2FD' },
              { role: 'farmer', label: 'Farmer', icon: 'leaf-outline', color: '#2E7D32', bg: '#E8F5E9' },
              { role: 'transporter', label: 'Transporter', icon: 'car-outline', color: '#E65100', bg: '#FFF3E0' },
            ].map(({ role, label, icon, color, bg }) => (
              <TouchableOpacity
                key={role}
                style={[styles.roleCard, { backgroundColor: bg }]}
                onPress={() => { setRolePickerVisible(false); roleResolveRef.current?.(role); }}
              >
                <View style={[styles.roleIconCircle, { backgroundColor: color }]}>
                  <Ionicons name={icon} size={24} color="#fff" />
                </View>
                <Text style={[styles.roleCardLabel, { color }]}>{label}</Text>
                <Ionicons name="chevron-forward" size={18} color={color} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.roleCancelBtn}
              onPress={() => { setRolePickerVisible(false); roleResolveRef.current?.(null); }}
            >
              <Text style={styles.roleCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#103A12',
  },
  // Flutter Stack: Positioned decorative circles
  circleTopLeft: {
    position: 'absolute',
    top: -70,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  circleBottomRight: {
    position: 'absolute',
    bottom: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  circleTopRight: {
    position: 'absolute',
    top: 50,
    right: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  circleMid: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.38,
    left: -30,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  // Logo / header
  headerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 14,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  logoImg: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.30)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  appSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 6,
    fontWeight: '400',
  },
  // White form card
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 28,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1B5E20',
    marginBottom: 22,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  inputGroup: { marginBottom: 18 },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 7,
    letterSpacing: 0.2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F8F4',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
    paddingHorizontal: 14,
    height: 54,
  },
  inputRowError: {
    borderColor: '#F44336',
    backgroundColor: '#FFF5F5',
  },
  inputError: {
    color: '#F44336',
    fontSize: 12,
    marginTop: 5,
    marginLeft: 4,
    fontWeight: '500',
  },
  inputIcon: { marginRight: 10 },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#212121',
    height: 54,
  },
  eyeBtn: { padding: 6 },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 18,
    paddingVertical: 2,
  },
  forgotText: {
    color: '#2E7D32',
    fontWeight: '700',
    fontSize: 13,
  },
  loginBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.40,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 0,
  },
  loginBtnGradient: {
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E8F5E9' },
  dividerText: { marginHorizontal: 12, color: '#9E9E9E', fontWeight: '600', fontSize: 12 },
  // Google sign-in
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    height: 54,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  googleBtnText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
  googleLogo: {
    width: 24,
    height: 24,
    marginRight: 10,
  },
  // Sign-up link row
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  signupPrompt: { color: 'rgba(255,255,255,0.88)', fontSize: 15 },
  signupLink: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  /* ── Google Role Picker Modal ── */
  roleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  roleModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },
  roleModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginBottom: 20,
  },
  roleModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1B5E20',
    textAlign: 'center',
  },
  roleModalSub: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  roleIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleCardLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  roleCancelBtn: {
    marginTop: 6,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#E8F5E9',
  },
  roleCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
});

export default LoginScreen;
