/**
 * SignupScreen.js
 * Complete multi-step React Native signup form — faithful conversion of Flutter signup.dart
 *
 * Steps: 0 = Role Selection, 1 = Personal Info, 2 = Address, 3 = Review
 * API:   POST /api/auth/register
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
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
  Animated,
  Easing,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import axios from 'axios';
import { signup } from '../../services/authService';
import ToastMessage from '../../utils/Toast';
import LocationPickerModal from './LocationPickerModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ═══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════════════════════════ */

const STEPS = ['Role', 'Personal Info', 'Address', 'Review'];

const ROLES = [
  { key: 'farmer',      label: 'Farmer',      icon: 'leaf',              family: 'Ionicons',              color: '#4CAF50' },
  { key: 'customer',    label: 'Customer',     icon: 'cart',              family: 'Ionicons',              color: '#2196F3' },
  { key: 'transporter', label: 'Transporter',  icon: 'truck-delivery',   family: 'MaterialCommunityIcons', color: '#FF9800' },
];

const SOUTH_INDIAN_STATES = [
  'Tamil Nadu',
  'Kerala',
  'Karnataka',
  'Andhra Pradesh',
  'Telangana',
  'Puducherry',
];

const DISTRICTS_BY_STATE = {
  'Tamil Nadu': [
    'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem',
    'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Dindigul',
    'Thanjavur', 'Ranipet', 'Sivagangai', 'Karur', 'Namakkal',
    'Tiruppur', 'Cuddalore', 'Kanchipuram', 'Tiruvallur', 'Villupuram',
    'Nagapattinam', 'Krishnagiri', 'Dharmapuri', 'Ramanathapuram',
    'Virudhunagar', 'Theni', 'Ariyalur', 'Perambalur', 'Nilgiris',
    'Pudukkottai', 'Kallakurichi', 'Tenkasi', 'Tirupattur',
    'Chengalpattu', 'Tiruvarur', 'Mayiladuthurai',
  ],
  'Kerala': [
    'Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam',
    'Palakkad', 'Alappuzha', 'Malappuram', 'Kannur', 'Kottayam',
    'Idukki', 'Pathanamthitta', 'Ernakulam', 'Wayanad', 'Kasaragod',
  ],
  'Karnataka': [
    'Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi-Dharwad', 'Belagavi',
    'Kalaburagi', 'Davanagere', 'Ballari', 'Vijayapura', 'Shivamogga',
    'Tumakuru', 'Raichur', 'Bidar', 'Mandya', 'Hassan',
    'Chitradurga', 'Udupi', 'Chikkamagaluru', 'Kodagu', 'Yadgir',
    'Haveri', 'Gadag', 'Chamarajanagar', 'Bagalkot', 'Ramanagara',
    'Chikkaballapur', 'Koppal', 'Dharwad',
  ],
  'Andhra Pradesh': [
    'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool',
    'Tirupati', 'Rajahmundry', 'Kakinada', 'Kadapa', 'Anantapur',
    'Eluru', 'Ongole', 'Srikakulam', 'Vizianagaram', 'Chittoor',
    'Prakasam', 'West Godavari', 'East Godavari', 'Krishna', 'Palnadu',
    'Bapatla', 'Anakapalli', 'Alluri Sitharama Raju', 'Konaseema',
    'NTR', 'Sri Sathya Sai', 'Annamayya',
  ],
  'Telangana': [
    'Hyderabad', 'Warangal', 'Nizamabad', 'Khammam', 'Karimnagar',
    'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet',
    'Siddipet', 'Miryalaguda', 'Jagtial', 'Mancherial', 'Nirmal',
    'Kamareddy', 'Medak', 'Wanaparthy', 'Nagarkurnool',
    'Jogulamba Gadwal', 'Sangareddy', 'Medchal-Malkajgiri', 'Vikarabad',
    'Rangareddy', 'Yadadri Bhuvanagiri', 'Jayashankar Bhupalpally',
    'Mulugu', 'Narayanpet', 'Mahabubabad', 'Jangaon', 'Peddapalli',
    'Rajanna Sircilla', 'Kumuram Bheem Asifabad',
  ],
  'Puducherry': [
    'Puducherry', 'Karaikal', 'Mahe', 'Yanam',
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * Decorative floating circles — matches Flutter's gradient + circles
 * ═══════════════════════════════════════════════════════════════════════════ */

const CIRCLE_CONFIGS = [
  { size: 180, x: -40,  y: -50,  opacity: 0.08, duration: 5000, driftX: 12,  driftY: -10 },
  { size: 120, x: SCREEN_WIDTH - 80, y: 60, opacity: 0.06, duration: 4200, driftX: -14, driftY: 8 },
  { size: 90,  x: 30,   y: SCREEN_HEIGHT * 0.4, opacity: 0.05, duration: 4600, driftX: 10, driftY: -14 },
  { size: 150, x: SCREEN_WIDTH - 100, y: SCREEN_HEIGHT * 0.6, opacity: 0.07, duration: 3800, driftX: -8, driftY: 12 },
  { size: 70,  x: SCREEN_WIDTH * 0.5, y: 20, opacity: 0.05, duration: 5200, driftX: 6, driftY: -8 },
];

const FloatingCircle = ({ config }) => {
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

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, config.driftX] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, config.driftY] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: config.x,
        top: config.y,
        width: config.size,
        height: config.size,
        borderRadius: config.size / 2,
        backgroundColor: '#FFFFFF',
        opacity: config.opacity,
        transform: [{ translateX }, { translateY }],
      }}
    />
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Floating crop icons (same pattern as LoginScreen)
 * ═══════════════════════════════════════════════════════════════════════════ */

const CROP_ICONS = [
  { icon: 'leaf',           family: 'Ionicons',               size: 24, startX: 0.06, startY: 0.10, driftX: 14,  driftY: -18, duration: 4200 },
  { icon: 'grain',          family: 'MaterialCommunityIcons', size: 20, startX: 0.88, startY: 0.06, driftX: -10, driftY: 16,  duration: 5000 },
  { icon: 'flower-outline', family: 'MaterialCommunityIcons', size: 22, startX: 0.75, startY: 0.28, driftX: 10,  driftY: -12, duration: 3800 },
  { icon: 'sprout',         family: 'MaterialCommunityIcons', size: 18, startX: 0.12, startY: 0.50, driftX: -8,  driftY: 14,  duration: 4600 },
  { icon: 'water-outline',  family: 'Ionicons',               size: 16, startX: 0.92, startY: 0.55, driftX: -12, driftY: -10, duration: 3500 },
  { icon: 'sunny-outline',  family: 'Ionicons',               size: 18, startX: 0.50, startY: 0.04, driftX: 6,   driftY: 18,  duration: 4900 },
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

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, config.driftX] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, config.driftY] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.12, 0.28, 0.12] });

  const Icon = config.family === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;

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
      <Icon name={config.icon} size={config.size} color="#FFFFFF" />
    </Animated.View>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Custom Dropdown component (replaces Picker for cleaner green-themed UI)
 * ═══════════════════════════════════════════════════════════════════════════ */

const Dropdown = ({ label, value, options, placeholder, onSelect, error }) => {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.dropdownTrigger, error && styles.inputError]}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.dropdownTriggerText, !value && { color: '#9E9E9E' }]}>
          {value || placeholder || `Select ${label}`}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#888" />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select {label}</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    item === value && styles.modalOptionSelected,
                  ]}
                  onPress={() => {
                    onSelect(item);
                    setVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      item === value && styles.modalOptionTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                  {item === value && (
                    <Ionicons name="checkmark-circle" size={20} color="#2E7D32" />
                  )}
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: SCREEN_HEIGHT * 0.5 }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * VALIDATION
 * ═══════════════════════════════════════════════════════════════════════════ */

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validatePhone = (phone) => /^[0-9]{10}$/.test(phone.replace(/\s/g, ''));

const validatePassword = (pw) => {
  const checks = {
    minLength:    pw.length >= 8,
    uppercase:    /[A-Z]/.test(pw),
    lowercase:    /[a-z]/.test(pw),
    number:       /[0-9]/.test(pw),
    specialChar:  /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw),
  };
  return checks;
};

const isPasswordValid = (pw) => {
  const c = validatePassword(pw);
  return c.minLength && c.uppercase && c.lowercase && c.number && c.specialChar;
};

/* ═══════════════════════════════════════════════════════════════════════════
 * SIGNUP SCREEN
 * ═══════════════════════════════════════════════════════════════════════════ */

const SignupScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const toastRef = useRef(null);

  /* ── State ──────────────────────────────────────────────────────────── */
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Form data
  const [role, setRole] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Address
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [pincode, setPincode] = useState('');
  const [zone, setZone] = useState('');

  // Location helper state
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  // Farmer-specific
  const [farmName, setFarmName] = useState('');

  // Transporter-specific
  const [companyName, setCompanyName] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [voterIdNumber, setVoterIdNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');

  // Validation errors (per-step)
  const [errors, setErrors] = useState({});

  // Refs
  const scrollRef = useRef(null);
  const skipDistrictResetRef = useRef(false);

  /* ── Animations ─────────────────────────────────────────────────────── */
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const stepAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Animate step transitions
  const animateStep = useCallback((nextStep) => {
    const direction = nextStep > currentStep ? 1 : -1;
    // Slide out
    Animated.parallel([
      Animated.timing(stepAnim, {
        toValue: -direction * 50,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0.3,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentStep(nextStep);
      stepAnim.setValue(direction * 50);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      // Slide in
      Animated.parallel([
        Animated.timing(stepAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    });

    // Progress bar animation
    Animated.timing(progressAnim, {
      toValue: nextStep,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [currentStep, stepAnim, fadeAnim, progressAnim]);

  // Reset district when state changes (skip when map/GPS sets both simultaneously)
  useEffect(() => {
    if (skipDistrictResetRef.current) {
      skipDistrictResetRef.current = false;
      return;
    }
    setDistrict('');
  }, [state]);

  /* ── Location helpers ───────────────────────────────────────────────── */
  const handleMapConfirm = useCallback((fields) => {
    if (fields.address)  setAddressLine(fields.address);
    if (fields.city)     setCity(fields.city);
    if (fields.pincode)  setPincode(fields.pincode);
    if (fields.zone)     setZone(fields.zone);
    if (fields.state) {
      // If a district is also coming from the map, flag the effect to skip clearing it
      if (fields.district) skipDistrictResetRef.current = true;
      setState(fields.state);
    }
    if (fields.district) setDistrict(fields.district);
    setShowMapPicker(false);
  }, []);

  const getCurrentLocation = useCallback(async () => {
    console.log('[SignupScreen] GPS button pressed');
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      const res = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        { headers: { 'User-Agent': 'FarmerCrate/1.0' } },
      );
      if (res.data?.address) {
        const a = res.data.address;
        setAddressLine(res.data.display_name || '');
        setPincode(a.postcode || '');
        const zone = a.suburb || a.neighbourhood || a.quarter || a.locality || a.hamlet || a.village || a.road || '';
        setZone(zone);
        const detectedDistrict = a.state_district || a.district || a.county || '';
        if (detectedDistrict) skipDistrictResetRef.current = true;
        setState(a.state || '');
        setDistrict(detectedDistrict);
        setCity(a.city || a.town || a.village || a.municipality || '');
        console.log('[SignupScreen] GPS location filled:', res.data.display_name);
      } else {
        Alert.alert('Error', 'Could not parse address from your location.');
      }
    } catch (e) {
      console.error('[SignupScreen] GPS error:', e?.message, e);
      Alert.alert('GPS Error', e?.message || 'Could not detect location.');
    } finally {
      setLocationLoading(false);
    }
  }, []);

  /* ── Validation per step ────────────────────────────────────────────── */

  const validateStep0 = () => {
    if (!role) {
      setErrors({ role: 'Please select a role to continue' });
      return false;
    }
    setErrors({});
    return true;
  };

  const validateStep1 = () => {
    const e = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (!email.trim()) {
      e.email = 'Email is required';
    } else if (!validateEmail(email.trim())) {
      e.email = 'Enter a valid email address';
    }
    if (!phone.trim()) {
      e.phone = 'Phone number is required';
    } else if (!validatePhone(phone.trim())) {
      e.phone = 'Enter a valid 10-digit phone number';
    }
    if (!username.trim()) e.username = 'Username is required';
    if (!password) {
      e.password = 'Password is required';
    } else if (!isPasswordValid(password)) {
      e.password = 'Password does not meet all requirements';
    }
    if (!confirmPassword) {
      e.confirmPassword = 'Confirm your password';
    } else if (password !== confirmPassword) {
      e.confirmPassword = 'Passwords do not match';
    }
    // Role-specific
    if (role === 'farmer' && !farmName.trim()) {
      e.farmName = 'Farm name is required';
    }
    if (role === 'transporter') {
      if (!companyName.trim()) e.companyName = 'Company name is required';
      if (!vehicleType.trim()) e.vehicleType = 'Vehicle type is required';
      if (!aadharNumber.trim()) e.aadharNumber = 'Aadhar number is required';
      if (!panNumber.trim()) e.panNumber = 'PAN number is required';
      if (!voterIdNumber.trim()) e.voterIdNumber = 'Voter ID number is required';
      if (!licenseNumber.trim()) e.licenseNumber = 'License number is required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e = {};
    if (!addressLine.trim()) e.addressLine = 'Address is required';
    if (!city.trim()) e.city = 'City is required';
    if (!state) e.state = 'State is required';
    if (!district) e.district = 'District is required';
    if (!pincode.trim()) {
      e.pincode = 'Pincode is required';
    } else if (!/^[0-9]{6}$/.test(pincode.trim())) {
      e.pincode = 'Enter a valid 6-digit pincode';
    }
    if (!zone.trim()) e.zone = 'Zone is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── Navigation between steps ───────────────────────────────────────── */

  const goNext = () => {
    let valid = false;
    if (currentStep === 0) valid = validateStep0();
    else if (currentStep === 1) valid = validateStep1();
    else if (currentStep === 2) valid = validateStep2();
    else valid = true;

    if (valid && currentStep < 3) {
      animateStep(currentStep + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setErrors({});
      animateStep(currentStep - 1);
    } else {
      navigation.goBack();
    }
  };

  /* ── Submit ─────────────────────────────────────────────────────────── */

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      // Build address string: include city and address line
      const fullAddress = [addressLine.trim(), city.trim()].filter(Boolean).join(', ');

      // Base payload with field names the backend expects
      const payload = {
        role,
        name:           fullName.trim(),
        email:          email.trim(),
        password,
        mobile_number:  phone.trim(),   // farmer + customer use mobile_number
        address:        fullAddress,
        city:           city.trim(),
        state:          state.trim(),
        district:       district.trim(),
        pincode:        pincode.trim(),
        zone:           zone.trim(),
      };

      if (role === 'farmer') {
        payload.farm_name = farmName.trim();
      }

      if (role === 'transporter') {
        // Transporter model uses mobileNumber (camelCase)
        payload.mobileNumber   = phone.trim();
        delete payload.mobile_number;
        payload.company_name   = companyName.trim();
        payload.vehicle_type   = vehicleType.trim();
        payload.aadhar_number  = aadharNumber.trim();
        payload.pan_number     = panNumber.trim();
        payload.voter_id_number = voterIdNumber.trim();
        payload.license_number = licenseNumber.trim();
      }

      const data = await signup(payload);

      if (data.success === true || data.success === 'true' || data.message) {
        const msg =
          role === 'farmer' || role === 'transporter'
            ? 'Your account has been created! Please wait for admin verification to access your account.'
            : 'Your account has been created successfully!';

        toastRef.current?.show(msg, 'success');
        setTimeout(() => navigation.replace('Login'), 2500);
      } else {
        toastRef.current?.show(data.message || 'Registration failed. Please try again.', 'error');
      }
    } catch (e) {
      const status   = e?.response?.status;
      const serverMsg = e?.response?.data?.message || e.message || 'Something went wrong.';

      if (status === 409 || status === 400) {
        // Duplicate email / mobile or validation error from the server
        Alert.alert('Registration Failed', serverMsg);
      } else {
        toastRef.current?.show(serverMsg, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Available districts for selected state ─────────────────────────── */

  const availableDistricts = state ? (DISTRICTS_BY_STATE[state] || []) : [];

  /* ═══════════════════════════════════════════════════════════════════════
   * RENDERERS – Reusable field components
   * ═══════════════════════════════════════════════════════════════════════ */

  const renderInput = ({ label, value, onChangeText, icon, error, placeholder, ...rest }) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrapper, error && styles.inputError]}>
        {icon && <Ionicons name={icon} size={18} color="#4CAF50" style={{ marginRight: 10 }} />}
        <TextInput
          style={styles.textInput}
          placeholder={placeholder || `Enter ${label.toLowerCase()}`}
          placeholderTextColor="#B0BEC5"
          value={value}
          onChangeText={onChangeText}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );

  const renderPasswordField = ({ label, value, onChangeText, show, onToggle, error }) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrapper, error && styles.inputError]}>
        <Ionicons name="lock-closed-outline" size={18} color="#4CAF50" style={{ marginRight: 10 }} />
        <TextInput
          style={[styles.textInput, { flex: 1 }]}
          placeholder={`Enter ${label.toLowerCase()}`}
          placeholderTextColor="#B0BEC5"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={onToggle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={show ? 'eye-outline' : 'eye-off-outline'} size={20} color="#888" />
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );

  /* ═══════════════════════════════════════════════════════════════════════
   * STEP 0: ROLE SELECTION
   * ═══════════════════════════════════════════════════════════════════════ */

  const renderRoleStep = () => (
    <View>
      <Text style={styles.stepTitle}>Choose Your Role</Text>
      <Text style={styles.stepSubtitle}>Select how you want to use FarmerCrate</Text>

      <View style={styles.roleGrid}>
        {ROLES.map((r) => {
          const selected = role === r.key;
          const Icon = r.family === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.roleCard, selected && styles.roleCardSelected]}
              onPress={() => { setRole(r.key); setErrors({}); }}
              activeOpacity={0.7}
            >
              <View style={[styles.roleIconCircle, { backgroundColor: selected ? r.color : '#F1F8E9' }]}>
                <Icon name={r.icon} size={32} color={selected ? '#FFF' : r.color} />
              </View>
              <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>{r.label}</Text>
              {selected && (
                <View style={styles.roleCheck}>
                  <Ionicons name="checkmark-circle" size={22} color="#2E7D32" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {errors.role ? <Text style={[styles.errorText, { textAlign: 'center', marginTop: 4 }]}>{errors.role}</Text> : null}
    </View>
  );

  /* ═══════════════════════════════════════════════════════════════════════
   * STEP 1: PERSONAL INFORMATION
   * ═══════════════════════════════════════════════════════════════════════ */

  const renderPasswordStrength = () => {
    if (!password) return null;
    const checks = validatePassword(password);
    const items = [
      { key: 'minLength',   label: 'At least 8 characters',       ok: checks.minLength },
      { key: 'uppercase',   label: 'One uppercase letter',        ok: checks.uppercase },
      { key: 'lowercase',   label: 'One lowercase letter',        ok: checks.lowercase },
      { key: 'number',      label: 'One number',                  ok: checks.number },
      { key: 'specialChar', label: 'One special character',       ok: checks.specialChar },
    ];
    return (
      <View style={styles.pwStrengthBox}>
        {items.map((it) => (
          <View key={it.key} style={styles.pwRow}>
            <Ionicons
              name={it.ok ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={it.ok ? '#4CAF50' : '#EF5350'}
            />
            <Text style={[styles.pwRowText, it.ok && { color: '#4CAF50' }]}>{it.label}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderPersonalInfoStep = () => (
    <View>
      <Text style={styles.stepTitle}>Personal Information</Text>
      <Text style={styles.stepSubtitle}>Tell us about yourself</Text>

      {renderInput({
        label: 'Full Name',
        value: fullName,
        onChangeText: setFullName,
        icon: 'person-outline',
        error: errors.fullName,
        autoCapitalize: 'words',
      })}

      {renderInput({
        label: 'Email',
        value: email,
        onChangeText: setEmail,
        icon: 'mail-outline',
        error: errors.email,
        keyboardType: 'email-address',
        autoCapitalize: 'none',
      })}

      {renderInput({
        label: 'Phone Number',
        value: phone,
        onChangeText: (v) => setPhone(v.replace(/[^0-9]/g, '').slice(0, 10)),
        icon: 'call-outline',
        error: errors.phone,
        keyboardType: 'phone-pad',
        maxLength: 10,
      })}

      {renderInput({
        label: 'Username',
        value: username,
        onChangeText: setUsername,
        icon: 'at-outline',
        error: errors.username,
        autoCapitalize: 'none',
      })}

      {renderPasswordField({
        label: 'Password',
        value: password,
        onChangeText: setPassword,
        show: showPassword,
        onToggle: () => setShowPassword(!showPassword),
        error: errors.password,
      })}

      {renderPasswordStrength()}

      {renderPasswordField({
        label: 'Confirm Password',
        value: confirmPassword,
        onChangeText: setConfirmPassword,
        show: showConfirmPassword,
        onToggle: () => setShowConfirmPassword(!showConfirmPassword),
        error: errors.confirmPassword,
      })}

      {/* ── Farmer-specific ── */}
      {role === 'farmer' && (
        <View style={styles.roleSpecificSection}>
          <View style={styles.roleSpecificHeader}>
            <Ionicons name="leaf" size={18} color="#4CAF50" />
            <Text style={styles.roleSpecificTitle}>Farmer Details</Text>
          </View>
          {renderInput({
            label: 'Farm Name',
            value: farmName,
            onChangeText: setFarmName,
            icon: 'home-outline',
            error: errors.farmName,
            autoCapitalize: 'words',
          })}
        </View>
      )}

      {/* ── Transporter-specific ── */}
      {role === 'transporter' && (
        <View style={styles.roleSpecificSection}>
          <View style={styles.roleSpecificHeader}>
            <MaterialCommunityIcons name="truck-delivery" size={18} color="#FF9800" />
            <Text style={styles.roleSpecificTitle}>Transporter Details</Text>
          </View>
          {renderInput({
            label: 'Company Name',
            value: companyName,
            onChangeText: setCompanyName,
            icon: 'business-outline',
            error: errors.companyName,
            autoCapitalize: 'words',
          })}
          {renderInput({
            label: 'Vehicle Type',
            value: vehicleType,
            onChangeText: setVehicleType,
            icon: 'car-outline',
            error: errors.vehicleType,
            placeholder: 'e.g. Truck, Van, Mini-truck',
          })}
          {renderInput({
            label: 'Aadhar Number',
            value: aadharNumber,
            onChangeText: (v) => setAadharNumber(v.replace(/[^0-9]/g, '').slice(0, 12)),
            icon: 'card-outline',
            error: errors.aadharNumber,
            keyboardType: 'numeric',
            maxLength: 12,
          })}
          {renderInput({
            label: 'PAN Number',
            value: panNumber,
            onChangeText: setPanNumber,
            icon: 'document-text-outline',
            error: errors.panNumber,
            autoCapitalize: 'characters',
            maxLength: 10,
          })}
          {renderInput({
            label: 'Voter ID Number',
            value: voterIdNumber,
            onChangeText: setVoterIdNumber,
            icon: 'id-card-outline',
            error: errors.voterIdNumber,
            autoCapitalize: 'characters',
          })}
          {renderInput({
            label: 'License Number',
            value: licenseNumber,
            onChangeText: setLicenseNumber,
            icon: 'document-outline',
            error: errors.licenseNumber,
            autoCapitalize: 'characters',
          })}
        </View>
      )}
    </View>
  );

  /* ═══════════════════════════════════════════════════════════════════════
   * STEP 2: ADDRESS
   * ═══════════════════════════════════════════════════════════════════════ */

  const renderAddressStep = () => (
    <View>
      <Text style={styles.stepTitle}>Address Details</Text>
      <Text style={styles.stepSubtitle}>Where are you located?</Text>

      {/* ── Location auto-fill buttons ── */}
      <View style={styles.locationBtnRow}>
        <TouchableOpacity
          style={[styles.locationBtn, styles.locationBtnGps]}
          onPress={getCurrentLocation}
          disabled={locationLoading}
          activeOpacity={0.85}
        >
          {locationLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="locate" size={18} color="#fff" />}
          <Text style={styles.locationBtnText} numberOfLines={1}>
            {locationLoading ? 'Detecting…' : 'Use GPS'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.locationBtn, styles.locationBtnMap]}
          onPress={() => {
            try {
              console.log('[SignupScreen] Opening location picker modal');
              setShowMapPicker(true);
            } catch (e) {
              console.error('[SignupScreen] Failed to open map picker:', e?.message, e);
              Alert.alert('Error', 'Could not open map picker: ' + e?.message);
            }
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="map" size={18} color="#fff" />
          <Text style={styles.locationBtnText} numberOfLines={1}>Pick on Map</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.orDivider}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>OR FILL MANUALLY</Text>
        <View style={styles.orLine} />
      </View>

      {renderInput({
        label: 'Address Line',
        value: addressLine,
        onChangeText: setAddressLine,
        icon: 'location-outline',
        error: errors.addressLine,
        multiline: true,
        numberOfLines: 2,
      })}

      {renderInput({
        label: 'City',
        value: city,
        onChangeText: setCity,
        icon: 'business-outline',
        error: errors.city,
        autoCapitalize: 'words',
      })}

      {/* State Dropdown */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>State</Text>
        <Dropdown
          label="State"
          value={state}
          options={SOUTH_INDIAN_STATES}
          placeholder="Select your state"
          onSelect={(v) => setState(v)}
          error={errors.state}
        />
        {errors.state ? <Text style={styles.errorText}>{errors.state}</Text> : null}
      </View>

      {/* District Dropdown (dependent on state) */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>District</Text>
        <Dropdown
          label="District"
          value={district}
          options={availableDistricts}
          placeholder={state ? 'Select your district' : 'Select a state first'}
          onSelect={(v) => setDistrict(v)}
          error={errors.district}
        />
        {errors.district ? <Text style={styles.errorText}>{errors.district}</Text> : null}
      </View>

      {renderInput({
        label: 'Pincode',
        value: pincode,
        onChangeText: (v) => setPincode(v.replace(/[^0-9]/g, '').slice(0, 6)),
        icon: 'locate-outline',
        error: errors.pincode,
        keyboardType: 'numeric',
        maxLength: 6,
      })}

      {renderInput({
        label: 'Zone',
        value: zone,
        onChangeText: setZone,
        icon: 'map-outline',
        error: errors.zone,
        placeholder: 'e.g. South, North, East, West',
        autoCapitalize: 'words',
      })}
    </View>
  );

  /* ═══════════════════════════════════════════════════════════════════════
   * STEP 3: REVIEW
   * ═══════════════════════════════════════════════════════════════════════ */

  const ReviewRow = ({ label, value }) => (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value || '—'}</Text>
    </View>
  );

  const renderReviewStep = () => (
    <View>
      <Text style={styles.stepTitle}>Review & Submit</Text>
      <Text style={styles.stepSubtitle}>Please verify your information</Text>

      {/* Role */}
      <View style={styles.reviewSection}>
        <View style={styles.reviewSectionHeader}>
          <Ionicons name="person-circle-outline" size={20} color="#2E7D32" />
          <Text style={styles.reviewSectionTitle}>Role</Text>
        </View>
        <ReviewRow label="Role" value={role.charAt(0).toUpperCase() + role.slice(1)} />
      </View>

      {/* Personal Info */}
      <View style={styles.reviewSection}>
        <View style={styles.reviewSectionHeader}>
          <Ionicons name="information-circle-outline" size={20} color="#2E7D32" />
          <Text style={styles.reviewSectionTitle}>Personal Information</Text>
        </View>
        <ReviewRow label="Full Name" value={fullName} />
        <ReviewRow label="Email" value={email} />
        <ReviewRow label="Phone" value={phone} />
        <ReviewRow label="Username" value={username} />
        <ReviewRow label="Password" value={'•'.repeat(password.length)} />

        {role === 'farmer' && <ReviewRow label="Farm Name" value={farmName} />}

        {role === 'transporter' && (
          <>
            <ReviewRow label="Company Name" value={companyName} />
            <ReviewRow label="Vehicle Type" value={vehicleType} />
            <ReviewRow label="Aadhar Number" value={aadharNumber} />
            <ReviewRow label="PAN Number" value={panNumber} />
            <ReviewRow label="Voter ID Number" value={voterIdNumber} />
            <ReviewRow label="License Number" value={licenseNumber} />
          </>
        )}
      </View>

      {/* Address */}
      <View style={styles.reviewSection}>
        <View style={styles.reviewSectionHeader}>
          <Ionicons name="location-outline" size={20} color="#2E7D32" />
          <Text style={styles.reviewSectionTitle}>Address</Text>
        </View>
        <ReviewRow label="Address" value={addressLine} />
        <ReviewRow label="City" value={city} />
        <ReviewRow label="State" value={state} />
        <ReviewRow label="District" value={district} />
        <ReviewRow label="Pincode" value={pincode} />
        <ReviewRow label="Zone" value={zone} />
      </View>
    </View>
  );

  /* ═══════════════════════════════════════════════════════════════════════
   * PROGRESS INDICATOR
   * ═══════════════════════════════════════════════════════════════════════ */

  const renderProgressBar = () => {
    const progressWidth = progressAnim.interpolate({
      inputRange: [0, 3],
      outputRange: ['0%', '100%'],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.progressContainer}>
        {/* Step dots */}
        <View style={styles.stepsRow}>
          {STEPS.map((label, i) => {
            const isActive = i <= currentStep;
            const isCurrent = i === currentStep;
            return (
              <View key={label} style={styles.stepDotGroup}>
                <View style={[
                  styles.stepDot,
                  isActive && styles.stepDotActive,
                  isCurrent && styles.stepDotCurrent,
                ]}>
                  {i < currentStep ? (
                    <Ionicons name="checkmark" size={12} color="#FFF" />
                  ) : (
                    <Text style={[styles.stepDotText, isActive && { color: '#FFF' }]}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[styles.stepDotLabel, isActive && { color: '#FFF', fontWeight: '600' }]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
        {/* Progress bar track */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </View>
    );
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * MAIN RENDER
   * ═══════════════════════════════════════════════════════════════════════ */

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderRoleStep();
      case 1: return renderPersonalInfoStep();
      case 2: return renderAddressStep();
      case 3: return renderReviewStep();
      default: return null;
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* ── Green gradient background ── */}
      <View style={styles.bgGradient}>
        <View style={styles.bgGradientTop} />
        <View style={styles.bgGradientBottom} />
        {/* Decorative circles */}
        {CIRCLE_CONFIGS.map((c, i) => (
          <FloatingCircle key={`circle-${i}`} config={c} />
        ))}
        {/* Floating crop icons */}
        {CROP_ICONS.map((c, i) => (
          <FloatingCropIcon key={`crop-${i}`} config={c} />
        ))}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Create Account</Text>
            <Text style={styles.headerSubtitle}>Join FarmerCrate today</Text>
          </View>
          <View style={styles.headerLogo}>
            <Image
              source={require('../../../assets/FarmerCrate_Logo.jpg')}
              style={styles.headerLogoImg}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* ── Progress ── */}
        {renderProgressBar()}

        {/* ── Scrollable form content ── */}
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 120 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateX: stepAnim }],
            }}
          >
            <View style={styles.formCard}>
              {renderCurrentStep()}
            </View>
          </Animated.View>
        </ScrollView>

        {/* ── Bottom navigation buttons ── */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {currentStep > 0 && (
            <TouchableOpacity style={styles.prevBtn} onPress={goBack} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={20} color="#2E7D32" />
              <Text style={styles.prevBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />

          {currentStep < 3 ? (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.7}>
              <Text style={styles.nextBtnText}>Next</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                  <Text style={styles.submitBtnText}>Create Account</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Already have account link ── */}
        {currentStep === 0 && (
          <TouchableOpacity
            style={[styles.loginLink, { paddingBottom: insets.bottom + 4 }]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginLinkText}>
              Already have an account?{' '}
              <Text style={styles.loginLinkBold}>Login</Text>
            </Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
      <LocationPickerModal
        visible={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onConfirm={handleMapConfirm}
      />
      <ToastMessage ref={toastRef} />
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1B5E20',
  },

  /* ── Background ── */
  bgGradient: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  bgGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.5,
    backgroundColor: '#1B5E20',
  },
  bgGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.55,
    backgroundColor: '#2E7D32',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  headerLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    marginLeft: 10,
  },
  headerLogoImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },

  /* ── Progress ── */
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stepDotGroup: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepDotActive: {
    backgroundColor: '#4CAF50',
  },
  stepDotCurrent: {
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#4CAF50',
  },
  stepDotText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
  stepDotLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#81C784',
    borderRadius: 2,
  },

  /* ── Scroll area ── */
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  /* ── Form card ── */
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },

  /* ── Step titles ── */
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#78909C',
    marginBottom: 24,
  },

  /* ── Role cards ── */
  roleGrid: {
    gap: 14,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E8F5E9',
  },
  roleCardSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2E7D32',
  },
  roleIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  roleLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#546E7A',
    flex: 1,
  },
  roleLabelSelected: {
    color: '#1B5E20',
    fontWeight: 'bold',
  },
  roleCheck: {
    marginLeft: 8,
  },

  /* ── Field styles ── */
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#37474F',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    paddingHorizontal: 14,
    minHeight: 50,
  },
  inputError: {
    borderColor: '#EF5350',
    backgroundColor: '#FFF8F8',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#263238',
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  errorText: {
    fontSize: 12,
    color: '#EF5350',
    marginTop: 5,
    marginLeft: 4,
  },

  /* ── Password strength ── */
  pwStrengthBox: {
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
    marginTop: -8,
  },
  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pwRowText: {
    fontSize: 12,
    color: '#78909C',
    marginLeft: 8,
  },

  /* ── Role-specific section ── */
  roleSpecificSection: {
    marginTop: 8,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#E8F5E9',
  },
  roleSpecificHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  roleSpecificTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginLeft: 8,
  },

  /* ── Dropdown ── */
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    paddingHorizontal: 14,
    minHeight: 50,
  },
  dropdownTriggerText: {
    fontSize: 15,
    color: '#263238',
    flex: 1,
  },

  /* ── Modal dropdown ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 20,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F8F8',
  },
  modalOptionSelected: {
    backgroundColor: '#E8F5E9',
  },
  modalOptionText: {
    fontSize: 15,
    color: '#37474F',
  },
  modalOptionTextSelected: {
    color: '#1B5E20',
    fontWeight: '600',
  },

  /* ── Location auto-fill buttons (address step) ── */
  locationBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  locationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 7,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  locationBtnGps: { backgroundColor: '#2E7D32' },
  locationBtnMap: { backgroundColor: '#1565C0' },
  locationBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  orLine: { flex: 1, height: 1, backgroundColor: '#DDD' },
  orText: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1 },

  /* ── Review ── */
  reviewSection: {
    marginBottom: 20,
    backgroundColor: '#F8FBF5',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  reviewSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5E9',
  },
  reviewSectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginLeft: 8,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  reviewLabel: {
    fontSize: 13,
    color: '#78909C',
    flex: 1,
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#263238',
    flex: 1.5,
    textAlign: 'right',
  },

  /* ── Bottom bar ── */
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: 'rgba(27,94,32,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 6,
  },
  prevBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },

  /* ── Login link ── */
  loginLink: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(27,94,32,0.95)',
  },
  loginLinkText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  loginLinkBold: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});

export default SignupScreen;