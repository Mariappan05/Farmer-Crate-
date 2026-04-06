/**
 * Payment.js
 * Complete checkout screen — faithful conversion of Flutter payment.dart
 *
 * Receives: { cartItems, totalAmount }
 * Features:
 *   - Delivery address form (auto-fill from profile)
 *   - Use Current Location (expo-location)
 *   - South Indian states & districts dropdown
 *   - Price breakdown (subtotal, admin commission 3%, delivery 10% or ₹40)
 *   - Online payment selection (default)
 *   - QR code generation (react-native-qrcode-svg)
 *   - Upload QR to Cloudinary → create order
 *   - Processing overlay animation
 *   - Trust indicators
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import RazorpayCheckout from 'react-native-razorpay';

import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import api from '../../services/api';
import { uploadImageToCloudinary } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ═══════════════════════════════════════════════════════════════════════════
 * SOUTH INDIAN STATES & DISTRICTS DATA
 * ═══════════════════════════════════════════════════════════════════════════ */

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

const ZONES = ['North', 'South', 'East', 'West', 'Central'];

/* ═══════════════════════════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

const generateQRCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'FC-';
  for (let i = 0; i < 10; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PENDING_PAYMENT_SYNC_KEY = 'fc_pending_payment_sync_v1';

const normalizeOrderList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.orders)) return payload.data.orders;
  return [];
};

const loadPendingPaymentSync = async () => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_PAYMENT_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const savePendingPaymentSync = async (items) => {
  try {
    await AsyncStorage.setItem(PENDING_PAYMENT_SYNC_KEY, JSON.stringify(items || []));
  } catch {
    // Ignore storage failures.
  }
};

const getOrderProductId = (item) => {
  const direct = item?.product_id || item?.productId;
  if (direct) return direct;

  if (typeof item?.product === 'number' || typeof item?.product === 'string') {
    return item.product;
  }

  return item?.product?.product_id || item?.product?.id || item?.id;
};

const logPaymentApiError = (stage, error) => {
  const status = error?.status || error?.response?.status;
  const message =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'Unknown error';

  console.error(`[Payment] ${stage} failed:`, message);
  console.error(`[Payment] ${stage} status:`, status);
  try {
    console.error(`[Payment] ${stage} response:`, JSON.stringify(error?.response?.data, null, 2));
  } catch {
    console.error(`[Payment] ${stage} response:`, error?.response?.data);
  }
};

const calculatePricing = (subtotal) => {
  const adminCommission = parseFloat((subtotal * 0.03).toFixed(2));
  const deliveryCharges = subtotal < 500
    ? 40
    : parseFloat((subtotal * 0.10).toFixed(2));
  const total = parseFloat((subtotal + adminCommission + deliveryCharges).toFixed(2));
  return { subtotal, adminCommission, deliveryCharges, total };
};

/* ═══════════════════════════════════════════════════════════════════════════
 * DROPDOWN PICKER MODAL
 * ═══════════════════════════════════════════════════════════════════════════ */

const DropdownModal = ({ visible, title, data, onSelect, onClose }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <TouchableOpacity style={ddStyles.overlay} activeOpacity={1} onPress={onClose}>
      <View style={ddStyles.container}>
        <View style={ddStyles.header}>
          <Text style={ddStyles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={data}
          keyExtractor={(item, i) => `${item}-${i}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={ddStyles.item}
              onPress={() => { onSelect(item); onClose(); }}
            >
              <Text style={ddStyles.itemText}>{item}</Text>
            </TouchableOpacity>
          )}
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: 400 }}
        />
      </View>
    </TouchableOpacity>
  </Modal>
);

const ddStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30, maxHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1B5E20' },
  item: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  itemText: { fontSize: 15, color: '#333' },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * PROCESSING OVERLAY
 * ═══════════════════════════════════════════════════════════════════════════ */

const ProcessingOverlay = ({ visible }) => {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }).start();
    } else {
      spinAnim.setValue(0);
      scaleAnim.setValue(0.8);
    }
  }, [visible]);

  if (!visible) return null;

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={ovStyles.backdrop}>
        <Animated.View style={[ovStyles.card, { transform: [{ scale: scaleAnim }] }]}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <MaterialCommunityIcons name="loading" size={48} color="#1B5E20" />
          </Animated.View>
          <Text style={ovStyles.title}>Processing Order</Text>
          <Text style={ovStyles.subtitle}>Please wait while we place your order...</Text>
          <View style={ovStyles.dots}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[ovStyles.dot, { opacity: 0.4 + i * 0.3 }]} />
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const ovStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 36, alignItems: 'center', width: SCREEN_WIDTH * 0.8 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1B5E20', marginTop: 20, marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 18 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1B5E20' },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TRUST INDICATOR
 * ═══════════════════════════════════════════════════════════════════════════ */

const TrustIndicator = ({ icon, label }) => (
  <View style={tiStyles.item}>
    <View style={tiStyles.iconCircle}>
      <Ionicons name={icon} size={18} color="#1B5E20" />
    </View>
    <Text style={tiStyles.label}>{label}</Text>
  </View>
);

const tiStyles = StyleSheet.create({
  item: { alignItems: 'center', flex: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: 11, color: '#666', textAlign: 'center', fontWeight: '500' },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

const Payment = ({ navigation, route }) => {
  const { cartItems: routeCartItems = [], totalAmount = 0 } = route.params || {};
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const { clearCart, cartItems: contextCartItems, fetchCart } = useCart();
  const qrRef = useRef(null);
  const toastRef = useRef(null);

  const effectiveCartItems = (Array.isArray(routeCartItems) && routeCartItems.length > 0)
    ? routeCartItems
    : (Array.isArray(contextCartItems) ? contextCartItems : []);

  const computedSubtotal = effectiveCartItems.reduce(
    (sum, item) => sum + ((item.price || item.current_price || 0) * (item.quantity || 1)),
    0
  );

  // ── Address form state ──
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [pincode, setPincode] = useState('');
  const [zone, setZone] = useState('');

  // ── Dropdowns ──
  const [stateModalVisible, setStateModalVisible] = useState(false);
  const [districtModalVisible, setDistrictModalVisible] = useState(false);
  const [zoneModalVisible, setZoneModalVisible] = useState(false);

  // ── Payment ──
  const paymentMethod = 'ONLINE';
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // ── QR ──
  const [qrCode, setQrCode] = useState('');
  const [showQR, setShowQR] = useState(false);

  // ── Pricing ──
  const pricing = calculatePricing(totalAmount > 0 ? totalAmount : computedSubtotal);

  // ── Animations ──
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Auto-fill from user profile ──
  useEffect(() => {
    const user = authState?.user;
    if (user) {
      if (user.full_name || user.name) setFullName(user.full_name || user.name || '');
      if (user.phone || user.mobile) setPhone(user.phone || user.mobile || '');
      if (user.address_line || user.address) setAddressLine(user.address_line || user.address || '');
      if (user.city) setCity(user.city);
      if (user.state) setState(user.state);
      if (user.district) setDistrict(user.district);
      if (user.pincode) setPincode(String(user.pincode || '').replace(/\D/g, '').slice(0, 6));
      if (user.zone) setZone(user.zone);
    }
  }, [authState?.user]);

  // ── Auto-request location permission on mount ──
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if ((!Array.isArray(routeCartItems) || routeCartItems.length === 0) && (!contextCartItems || contextCartItems.length === 0)) {
      fetchCart?.();
    }
  }, [routeCartItems, contextCartItems, fetchCart]);

  // ── Reset district when state changes ──
  const availableDistricts = DISTRICTS_BY_STATE[state] || [];

  const handleStateChange = (val) => {
    setState(val);
    setDistrict('');
  };

  // ── Use Current Location (Nominatim API) ──
  const handleUseLocation = async () => {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toastRef.current?.show('Location permission is required.', 'warning');
        return;
      }
      let loc;
      try {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        loc = await Location.getLastKnownPositionAsync();
      }

      if (!loc?.coords) {
        toastRef.current?.show('Unable to get your GPS location. Please try again outdoors.', 'warning');
        return;
      }

      let address = null;
      try {
        const geocoded = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (Array.isArray(geocoded) && geocoded[0]) {
          const g = geocoded[0];
          address = {
            house_number: '',
            road: g.street || g.name || '',
            neighbourhood: '',
            suburb: g.subregion || '',
            city: g.city || g.district || g.subregion || '',
            state: g.region || '',
            state_district: g.district || g.subregion || '',
            county: g.district || '',
            postcode: g.postalCode || '',
          };
        }
      } catch {
        // Fall through to HTTP reverse-geocode fallback.
      }

      if (!address) {
        const resp = await axios.get(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.coords.latitude}&lon=${loc.coords.longitude}`,
          { timeout: 15000 },
        );
        if (resp.data?.address) {
          address = resp.data.address;
        }
      }

      if (address) {
        const a = address;

        // Address line
        const parts = [a.house_number, a.road, a.neighbourhood, a.suburb].filter(Boolean);
        setAddressLine(parts.length > 0 ? parts.join(', ') : (resp.data.display_name || ''));

        // City
        setCity(a.city || a.town || a.village || a.county || '');

        // State — match against SOUTH_INDIAN_STATES fuzzy
        const rawState = (a.state || '').trim();
        const matchedState = SOUTH_INDIAN_STATES.find(
          (s) =>
            rawState.toLowerCase().includes(s.toLowerCase()) ||
            s.toLowerCase().includes(rawState.toLowerCase()),
        );
        const resolvedState = matchedState || '';
        if (resolvedState) setState(resolvedState);

        // District — match against known districts for the detected state
        const rawDistrict = (a.state_district || a.county || a.city || a.town || '').trim();
        if (rawDistrict) {
          const stateDistricts = DISTRICTS_BY_STATE[resolvedState] || [];
          const matchedDistrict = stateDistricts.find(
            (d) =>
              rawDistrict.toLowerCase().includes(d.toLowerCase()) ||
              d.toLowerCase().includes(rawDistrict.toLowerCase()),
          );
          setDistrict(matchedDistrict || rawDistrict);
        }

        // Pincode
        if (a.postcode) setPincode(String(a.postcode).replace(/\D/g, '').slice(0, 6));

        // Zone — try to match suburb/neighbourhood to cardinal direction
        const zoneHint = (a.suburb || a.neighbourhood || a.village || '').toLowerCase();
        const matchedZone = ZONES.find((z) => zoneHint.includes(z.toLowerCase()));
        if (matchedZone) {
          setZone(matchedZone);
        } else if (resolvedState) {
          // South Indian states → default to South
          setZone('South');
        }

        toastRef.current?.show('Location filled successfully!', 'success');
      } else {
        toastRef.current?.show('Could not resolve address. Please fill manually.', 'warning');
      }
    } catch (e) {
      toastRef.current?.show('Could not fetch location. Please enter manually.', 'error');
    } finally {
      setIsLocating(false);
    }
  };

  // ── Validation ──
  const validateForm = () => {
    if (!effectiveCartItems.length) { Alert.alert('Validation', 'Your cart is empty. Please add items before placing order.'); return false; }
    if (!fullName.trim()) { Alert.alert('Validation', 'Please enter your full name.'); return false; }
    if (!phone.trim() || phone.trim().length < 10) { Alert.alert('Validation', 'Please enter a valid 10-digit phone number.'); return false; }
    if (!addressLine.trim()) { Alert.alert('Validation', 'Please enter your delivery address.'); return false; }
    if (!city.trim()) { Alert.alert('Validation', 'Please enter your city.'); return false; }
    if (!state) { Alert.alert('Validation', 'Please select your state.'); return false; }
    if (!district) { Alert.alert('Validation', 'Please select your district.'); return false; }
    if (!pincode.trim() || pincode.trim().length !== 6) { Alert.alert('Validation', 'Please enter a valid 6-digit pincode.'); return false; }
    if (!zone) { Alert.alert('Validation', 'Please select your zone.'); return false; }
    return true;
  };

  // ── Build shared delivery address & pricing ──
  const buildOrderPayload = (qrString = '', qrImageUrl = '') => ({
    items: effectiveCartItems.map((item) => ({
      product_id: getOrderProductId(item),
      quantity: item.quantity || 1,
      price: item.price || item.current_price || 0,
      name: item.product?.name || item.product?.product_name || item.product_name || item.name || '',
      image_url:
        item.product?.image_url ||
        (Array.isArray(item.product?.images) && item.product.images.length > 0
          ? (typeof item.product.images[0] === 'string' ? item.product.images[0] : item.product.images[0]?.image_url || item.product.images[0]?.url || null)
          : null) ||
        item.image_url ||
        item.image ||
        null,
    })),
    delivery_address: { full_name: fullName.trim(), phone: phone.trim(), address_line: addressLine.trim(), city: city.trim(), state, district, pincode: pincode.trim(), zone },
    payment_method: paymentMethod,
    subtotal: pricing.subtotal,
    admin_commission: pricing.adminCommission,
    delivery_charges: pricing.deliveryCharges,
    total_amount: pricing.total,
    qr_code: qrString,
    qr_image_url: qrImageUrl,
  });

  const toPositiveInteger = (value, fallback = 0) => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 0) return fallback;
    return n;
  };

  const restoreProductQuantities = async (orderItems = []) => {
    const qtyByProduct = new Map();

    orderItems.forEach((item) => {
      const productId = getOrderProductId(item);
      const qty = toPositiveInteger(item?.quantity, 1);
      if (!productId || qty <= 0) return;

      const key = String(productId);
      qtyByProduct.set(key, (qtyByProduct.get(key) || 0) + qty);
    });

    for (const [productId, orderedQty] of qtyByProduct.entries()) {
      try {
        const productRes = await api.get(`/products/${productId}`);
        const product = productRes?.data?.data || productRes?.data || {};
        const currentQtyRaw =
          product?.quantity ??
          product?.stock ??
          product?.available_quantity ??
          product?.available_stock ??
          0;
        const currentQty = toPositiveInteger(currentQtyRaw, 0);

        await api.put(`/products/${productId}`, { quantity: currentQty + orderedQty });
      } catch (err) {
        console.warn(
          '[Payment] Failed to restore quantity for product:',
          productId,
          err?.response?.data?.message || err?.message
        );
      }
    }
  };

  const cancelOrderAndRestoreStock = async ({ orderId, items }) => {
    if (!orderId) return false;

    const cancelAttempts = [
      {
        method: 'put',
        endpoint: `/orders/${orderId}/status`,
        payload: { status: 'CANCELLED', reason: 'Payment cancelled by customer', restore_stock: true },
      },
      {
        method: 'put',
        endpoint: '/orders/status',
        payload: { order_id: orderId, status: 'CANCELLED', reason: 'Payment cancelled by customer', restore_stock: true },
      },
      {
        method: 'put',
        endpoint: `/orders/${orderId}/cancel`,
        payload: { reason: 'Payment cancelled by customer', restore_stock: true },
      },
      {
        method: 'post',
        endpoint: `/orders/${orderId}/cancel`,
        payload: { reason: 'Payment cancelled by customer', restore_stock: true },
      },
    ];

    let cancelledOnBackend = false;
    for (const attempt of cancelAttempts) {
      try {
        await api[attempt.method](attempt.endpoint, attempt.payload);
        cancelledOnBackend = true;
        break;
      } catch (err) {
        console.warn(
          '[Payment] Cancel attempt failed:',
          attempt.method.toUpperCase(),
          attempt.endpoint,
          err?.response?.data?.message || err?.message
        );
      }
    }

    // Ensure quantities are restored even if backend cancel endpoint doesn't do stock compensation.
    await restoreProductQuantities(items || []);
    return cancelledOnBackend;
  };

  const findPersistedPaidOrder = async ({ orderId, qrCode, razorpayPaymentId }) => {
    if (orderId) {
      try {
        const byIdRes = await api.get(`/orders/${orderId}`);
        const byIdData = byIdRes?.data?.data || byIdRes?.data || {};
        if (byIdData?.order_id || byIdData?.id) {
          return byIdData;
        }
      } catch {
        // Continue with list-based lookup.
      }
    }

    const lookupEndpoints = ['/orders/my-orders', '/orders'];
    for (const endpoint of lookupEndpoints) {
      try {
        const listRes = await api.get(endpoint);
        const listPayload = listRes?.data?.data || listRes?.data || [];
        const orders = normalizeOrderList(listPayload);

        const matched = orders.find((o) => {
          const byQr =
            qrCode &&
            String(o?.qr_code || '').trim() &&
            String(o?.qr_code || '').trim() === String(qrCode).trim();

          const byPaymentId =
            razorpayPaymentId &&
            String(o?.razorpay_payment_id || o?.payment_id || '').trim() &&
            String(o?.razorpay_payment_id || o?.payment_id || '').trim() === String(razorpayPaymentId).trim();

          const byOrderId =
            orderId &&
            String(o?.order_id || o?.id || '').trim() === String(orderId).trim();

          return byQr || byPaymentId || byOrderId;
        });

        if (matched) return matched;
      } catch {
        // Try next endpoint.
      }
    }

    return null;
  };

  const persistPaidOrderFallback = async ({ payload, rzpResponse }) => {
    // Keep fallback lightweight: only verify whether order already exists.
    // Posting /orders here can trigger another payment-init path and cause long waits.

    // Secondary verification fallback: retry reads with short delay for eventual consistency.
    for (let i = 0; i < 3; i++) {
      const matched = await findPersistedPaidOrder({
        orderId: null,
        qrCode: payload?.qr_code,
        razorpayPaymentId: rzpResponse?.razorpay_payment_id,
      });
      if (matched) return matched;
      await wait(1200);
    }

    return null;
  };

  const enqueuePendingSync = async (entry) => {
    const existing = await loadPendingPaymentSync();
    const deduped = existing.filter((e) => String(e?.qr_code || '') !== String(entry?.qr_code || ''));
    deduped.unshift(entry);
    await savePendingPaymentSync(deduped.slice(0, 20));
  };

  const tryPendingSyncEntry = async (entry) => {
    if (!entry?.payload || !entry?.paymentDetails || !entry?.rzpResponse) return false;

    const orderId = entry?.orderId || entry?.orderData?.order_id || entry?.orderData?.id;
    const completePayload = {
      order_id: orderId,
      razorpay_order_id: entry.paymentDetails?.razorpay_order_id,
      razorpay_payment_id: entry.rzpResponse?.razorpay_payment_id,
      razorpay_signature: entry.rzpResponse?.razorpay_signature,
      order_data: {
        items: entry.payload?.items,
        delivery_address: entry.payload?.delivery_address,
        total_amount: entry.payload?.total_amount,
        subtotal: entry.payload?.subtotal,
        admin_commission: entry.payload?.admin_commission,
        delivery_charges: entry.payload?.delivery_charges,
        qr_code: entry.payload?.qr_code,
        qr_image_url: entry.payload?.qr_image_url,
      },
    };

    try {
      await completePaidOrder({ completePayload, orderId });
    } catch {
      // keep trying fallback below
    }

    let persisted = await findPersistedPaidOrder({
      orderId,
      qrCode: entry?.payload?.qr_code,
      razorpayPaymentId: entry?.rzpResponse?.razorpay_payment_id,
    });

    if (persisted) return true;

    persisted = await persistPaidOrderFallback({
      payload: entry.payload,
      rzpResponse: entry.rzpResponse,
    });

    return !!persisted;
  };

  const flushPendingPaymentSync = async () => {
    const pending = await loadPendingPaymentSync();
    if (!pending.length) return;

    const remaining = [];
    for (const entry of pending) {
      try {
        const ok = await tryPendingSyncEntry(entry);
        if (!ok) remaining.push(entry);
      } catch {
        remaining.push(entry);
      }
    }
    await savePendingPaymentSync(remaining);
  };

  const completePaidOrder = async ({ completePayload, orderId }) => {
    const attempts = [
      { method: 'post', endpoint: '/orders/complete' },
      // Backend currently exposes only POST /api/orders/complete.
    ];

    let lastErr = null;
    for (const attempt of attempts) {
      try {
        const res = await api[attempt.method](attempt.endpoint, completePayload);
        const payload = res?.data?.data || res?.data || {};
        return {
          order_id: payload?.order_id || payload?.order?.order_id || payload?.order?.id || null,
          response: payload,
        };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Unable to complete payment sync');
  };

  // ── Razorpay Online Payment ──
  const handleOnlinePayment = async () => {
    setIsProcessing(true);
    let createdOrderData = null;
    let createdOrderPayload = null;

    try {
      // Step 1: Generate QR code string & capture/upload image (same as COD)
      const qrString = generateQRCode();
      setQrCode(qrString);
      setShowQR(true);

      await new Promise((resolve) => setTimeout(resolve, 600));

      let qrImageUrl = '';
      try {
        if (qrRef.current) {
          const uri = await captureRef(qrRef, { format: 'png', quality: 0.9 });
          const uploadedUrl = await uploadImageToCloudinary(uri);
          if (uploadedUrl) qrImageUrl = uploadedUrl;
        }
      } catch (qrErr) {
        console.log('[Payment] QR capture/upload error:', qrErr);
      }

      console.log('[Payment] QR string:', qrString, '| QR image URL:', qrImageUrl);

      // Step 2: create order on backend (returns payment_details for Razorpay)
      const payload = buildOrderPayload(qrString, qrImageUrl);
      createdOrderPayload = payload;
      console.log('[Payment] Creating order with payload:', JSON.stringify(payload, null, 2));
      let res;
      try {
        res = await api.post('/orders', payload);
      } catch (createErr) {
        logPaymentApiError('Create order', createErr);
        throw createErr;
      }
      const data = res.data?.data || res.data;
      const paymentDetails = data?.payment_details;
      const orderData = data?.order_data || data;
      createdOrderData = orderData;

      if (!paymentDetails?.key_id || !paymentDetails?.razorpay_order_id) {
        // Backend doesn't support Razorpay orders yet — show graceful message
        toastRef.current?.show('Payment gateway is not configured right now. Please try again later.', 'warning', 3500);
        setIsProcessing(false);
        return;
      }

      // Step 3: open Razorpay checkout
      const amountPaise = Math.round(Number(paymentDetails.amount || pricing.total) * 100);
      const options = {
        key: paymentDetails.key_id,
        amount: String(amountPaise),
        currency: paymentDetails.currency || 'INR',
        order_id: paymentDetails.razorpay_order_id,
        name: 'Farmer Crate',
        description: `Order - ${effectiveCartItems.length} item(s)`,
        prefill: { contact: phone.trim(), email: authState?.user?.email || '' },
        theme: { color: '#2E7D32' },
      };

      const rzpResponse = await RazorpayCheckout.open(options);

      // Step 4: verify & complete payment
      // Always use local `payload` as the source of items/delivery_address.
      // Omit payment_method — that column doesn't exist in the DB.
      const completeOrderData = {
        items: payload.items,
        delivery_address: payload.delivery_address,
        total_amount: payload.total_amount,
        subtotal: payload.subtotal,
        admin_commission: payload.admin_commission,
        delivery_charges: payload.delivery_charges,
        qr_code: payload.qr_code,
        qr_image_url: payload.qr_image_url,
      };
      const completePayload = {
        order_id: orderData?.order_id || orderData?.id,
        razorpay_order_id: paymentDetails.razorpay_order_id,
        razorpay_payment_id: rzpResponse.razorpay_payment_id,
        razorpay_signature: rzpResponse.razorpay_signature,
        order_data: completeOrderData,
      };
      console.log('[Payment] Completing payment with payload:', JSON.stringify(completePayload, null, 2));
      let completionWarning = null;
      let finalOrderData = orderData;
      let completedOrderId = orderData?.order_id || orderData?.id || null;
      try {
        const completeResult = await completePaidOrder({
          completePayload,
          orderId: orderData?.order_id || orderData?.id,
        });
        if (completeResult?.order_id) {
          completedOrderId = completeResult.order_id;
          finalOrderData = {
            ...finalOrderData,
            order_id: completeResult.order_id,
          };
        }
      } catch (completeErr) {
        logPaymentApiError('Complete order', completeErr);
        const statusCode = completeErr?.status || completeErr?.response?.status;
        const backendMsg =
          completeErr?.response?.data?.message ||
          completeErr?.response?.data?.error ||
          completeErr?.message ||
          '';

        // Known backend sync issues after payment capture.
        const msgLower = String(backendMsg).toLowerCase();
        const isKnownSyncIssue =
          statusCode === 404 ||
          msgLower.includes('for update cannot be applied to the nullable side of an outer join') ||
          msgLower.includes('error fetching order') ||
          msgLower.includes('cannot put /api/orders/complete') ||
          msgLower.includes('cannot post /api/orders/complete') ||
          msgLower.includes('request failed with status code 404');

        if (isKnownSyncIssue) {
          const persisted = await persistPaidOrderFallback({
            payload,
            rzpResponse,
          });
          if (persisted) {
            finalOrderData = persisted;
            completedOrderId = persisted?.order_id || persisted?.id || completedOrderId;
            completionWarning = 'Payment successful. Your order was saved using fallback sync.';
          } else {
            await enqueuePendingSync({
              payload,
              paymentDetails,
              rzpResponse,
              orderData,
              orderId: orderData?.order_id || orderData?.id,
              qr_code: payload?.qr_code,
              createdAt: Date.now(),
            });
            completionWarning = 'Payment succeeded. Order sync is taking longer than expected and will retry automatically.';
          }
          console.warn('[Payment] /orders/complete sync issue:', backendMsg);
        } else {
          throw completeErr;
        }
      }

      // Mandatory persistence verification before showing success.
      let verifiedOrder = finalOrderData;
      let persistedVerified = false;
      for (let i = 0; i < 5; i++) {
        const persisted = await findPersistedPaidOrder({
          orderId: verifiedOrder?.order_id || verifiedOrder?.id || completedOrderId,
          qrCode: payload?.qr_code,
          razorpayPaymentId: rzpResponse?.razorpay_payment_id,
        });
        if (persisted) {
          verifiedOrder = persisted;
          persistedVerified = true;
          break;
        }
        await wait(1200);
      }

      if (!persistedVerified) {
        console.error('[Payment] Persistence verification failed after retries:', {
          completedOrderId,
          qr_code: payload?.qr_code,
          razorpay_payment_id: rzpResponse?.razorpay_payment_id,
        });
        await enqueuePendingSync({
          payload,
          paymentDetails,
          rzpResponse,
          orderData,
          orderId: orderData?.order_id || orderData?.id,
          qr_code: payload?.qr_code,
          createdAt: Date.now(),
        });
        toastRef.current?.show(
          completionWarning || 'Payment succeeded. Order sync is delayed on server. Please check My Orders shortly.',
          'warning',
          4200
        );
        return;
      }

      // Step 5: clear cart & navigate
      try { await clearCart(); } catch (_) {}
      navigation.replace('OrderConfirm', {
        order: {
          ...verifiedOrder,
          order_id: verifiedOrder?.order_id || verifiedOrder?.id || orderData?.order_id || orderData?.id,
          total_amount: pricing.total,
          payment_method: 'ONLINE',
          payment_status: 'PAID',
          delivery_address: payload.delivery_address,
          items: payload.items,
          subtotal: pricing.subtotal,
          admin_commission: pricing.adminCommission,
          delivery_charges: pricing.deliveryCharges,
          qr_code: qrString,
          qr_image_url: qrImageUrl,
        },
      });
      if (completionWarning) {
        toastRef.current?.show(completionWarning, 'warning', 3500);
      }

      // Best-effort background sync for previously failed paid orders.
      flushPendingPaymentSync().catch(() => {});
    } catch (e) {
      // Razorpay SDK throws a specific error when user cancels
      if (e?.code === 'PAYMENT_CANCELLED' || e?.description === 'Payment cancelled by user.') {
        const createdOrderId = createdOrderData?.order_id || createdOrderData?.id;
        if (createdOrderId && createdOrderPayload?.items?.length) {
          await cancelOrderAndRestoreStock({
            orderId: createdOrderId,
            items: createdOrderPayload.items,
          });
          toastRef.current?.show('Payment cancelled. Order stock has been restored.', 'info');
        } else {
          toastRef.current?.show('Payment cancelled.', 'info');
        }
      } else {
        const msg = e?.description || e?.message || 'Payment failed. Please try again.';
        const isDelayedSyncNotice =
          String(msg).toLowerCase().includes('order sync is delayed') ||
          String(msg).toLowerCase().includes('order sync is taking longer');

        if (isDelayedSyncNotice) {
          console.error('[Payment] Delayed sync notice:', msg);
          toastRef.current?.show(msg, 'warning', 4200);
        } else {
          console.error('[Payment] Online payment error:', msg);
          console.error('[Payment] Error code:', e?.code);
          console.error('[Payment] HTTP status:', e?.response?.status);
          console.error('[Payment] Response data:', JSON.stringify(e?.response?.data, null, 2));
          console.error('[Payment] Full error:', e);
          toastRef.current?.show(msg, 'error', 4000);
        }
      }
    } finally {
      setIsProcessing(false);
      setShowQR(false);
    }
  };

  // ── Place Order ──
  const handlePlaceOrder = async () => {
    if (!validateForm()) return;
    handleOnlinePayment();
  };

  useEffect(() => {
    // Retry stale payment sync records whenever checkout opens.
    flushPendingPaymentSync().catch(() => {});
  }, []);

  /* ─── RENDER ─── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Checkout</Text>
          <Text style={styles.headerSubtitle}>{effectiveCartItems.length} item{effectiveCartItems.length !== 1 ? 's' : ''} in your order</Text>
        </View>
        <Ionicons name="shield-checkmark" size={22} color="#A5D6A7" />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* ── Order Summary Card ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="receipt-outline" size={20} color="#1B5E20" />
                <Text style={styles.cardTitle}>Order Summary</Text>
              </View>
              {effectiveCartItems.map((item, i) => (
                <View key={i} style={styles.summaryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryItemName} numberOfLines={1}>
                      {item.name || item.product_name || 'Product'}
                    </Text>
                    <Text style={styles.summaryItemQty}>Qty: {item.quantity || 1}</Text>
                  </View>
                  <Text style={styles.summaryPrice}>
                    ₹{((item.price || item.current_price || 0) * (item.quantity || 1)).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>

            {/* ── Price Breakdown Card ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="calculator-variant-outline" size={20} color="#1B5E20" />
                <Text style={styles.cardTitle}>Price Breakdown</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Subtotal</Text>
                <Text style={styles.priceValue}>₹{pricing.subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Admin Commission (3%)</Text>
                <Text style={styles.priceValue}>₹{pricing.adminCommission.toFixed(2)}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>
                  Delivery Charges {pricing.subtotal < 500 ? '(Flat ₹40)' : '(10%)'}
                </Text>
                <Text style={styles.priceValue}>₹{pricing.deliveryCharges.toFixed(2)}</Text>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceTotalLabel}>Total Amount</Text>
                <Text style={styles.priceTotalValue}>₹{pricing.total.toFixed(2)}</Text>
              </View>
            </View>

            {/* ── Delivery Address Card ── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeader}>
                  <Ionicons name="location-outline" size={20} color="#1B5E20" />
                  <Text style={styles.cardTitle}>Delivery Address</Text>
                </View>
                <TouchableOpacity
                  style={styles.locationBtn}
                  onPress={handleUseLocation}
                  disabled={isLocating}
                >
                  {isLocating ? (
                    <ActivityIndicator size="small" color="#1B5E20" />
                  ) : (
                    <>
                      <Ionicons name="navigate-outline" size={14} color="#1B5E20" />
                      <Text style={styles.locationBtnText}>Use Current Location</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Full Name */}
              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter full name"
                placeholderTextColor="#aaa"
                value={fullName}
                onChangeText={setFullName}
              />

              {/* Phone */}
              <Text style={styles.inputLabel}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="10-digit mobile number"
                placeholderTextColor="#aaa"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
              />

              {/* Address Line */}
              <Text style={styles.inputLabel}>Address *</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="House/flat number, street, landmark..."
                placeholderTextColor="#aaa"
                value={addressLine}
                onChangeText={setAddressLine}
                multiline
              />

              {/* City */}
              <Text style={styles.inputLabel}>City *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter city"
                placeholderTextColor="#aaa"
                value={city}
                onChangeText={setCity}
              />

              {/* State & District Row */}
              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>State *</Text>
                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() => setStateModalVisible(true)}
                  >
                    <Text style={[styles.dropdownText, !state && { color: '#aaa' }]}>
                      {state || 'Select State'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#888" />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>District *</Text>
                  <TouchableOpacity
                    style={[styles.dropdownBtn, !state && { opacity: 0.5 }]}
                    onPress={() => state && setDistrictModalVisible(true)}
                    disabled={!state}
                  >
                    <Text style={[styles.dropdownText, !district && { color: '#aaa' }]}>
                      {district || 'Select District'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#888" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Pincode & Zone Row */}
              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Pincode *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="6-digit"
                    placeholderTextColor="#aaa"
                    value={pincode}
                    onChangeText={setPincode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Zone *</Text>
                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() => setZoneModalVisible(true)}
                  >
                    <Text style={[styles.dropdownText, !zone && { color: '#aaa' }]}>
                      {zone || 'Select Zone'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#888" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── Payment Method Card ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="card-outline" size={20} color="#1B5E20" />
                <Text style={styles.cardTitle}>Payment Method</Text>
              </View>

              <View style={[styles.payOption, styles.payOptionActive]}>
                <View style={[styles.payIconCircle, paymentMethod === 'ONLINE' && { backgroundColor: '#1B5E20' }]}>
                  <MaterialCommunityIcons
                    name="credit-card-outline"
                    size={22}
                    color={paymentMethod === 'ONLINE' ? '#fff' : '#666'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.payLabel, paymentMethod === 'ONLINE' && styles.payLabelActive]}>
                    Online Payment
                  </Text>
                  <Text style={styles.payDesc}>Pay securely via Razorpay</Text>
                </View>
                <Ionicons
                  name={paymentMethod === 'ONLINE' ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={paymentMethod === 'ONLINE' ? '#1B5E20' : '#ccc'}
                />
              </View>
            </View>

            {/* ── Trust Indicators ── */}
            <View style={styles.trustRow}>
              <TrustIndicator icon="shield-checkmark-outline" label="Secure Payment" />
              <TrustIndicator icon="refresh-circle-outline" label="Money-back Guarantee" />
              <TrustIndicator icon="headset-outline" label="24/7 Support" />
            </View>

            {/* ── Place Order Button ── */}
            <TouchableOpacity
              style={[
                styles.placeOrderBtn,
                isProcessing && { opacity: 0.65 },
              ]}
              onPress={handlePlaceOrder}
              disabled={isProcessing}
              activeOpacity={0.85}
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.placeOrderInner}>
                  <MaterialCommunityIcons name="credit-card-check-outline" size={20} color="#fff" />
                  <Text style={styles.placeOrderText}>
                    Pay Online — ₹{pricing.total.toFixed(2)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.orderNote}>
              By placing this order, you agree to our Terms & Conditions
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── QR Code (hidden, for capture) ── */}
      {showQR && (
        <View style={styles.qrHiddenContainer} ref={qrRef} collapsable={false}>
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>FarmerCrate Order</Text>
            <QRCode
              value={JSON.stringify({
                qr_code: qrCode,
                total: pricing.total,
                payment: paymentMethod,
                items: effectiveCartItems.length,
              })}
              size={200}
              color="#1B5E20"
              backgroundColor="#fff"
            />
            <Text style={styles.qrCodeText}>{qrCode}</Text>
            <Text style={styles.qrAmount}>₹{pricing.total.toFixed(2)}</Text>
          </View>
        </View>
      )}

      {/* ── Toast ── */}
      <ToastMessage ref={toastRef} />

      {/* ── Dropdown Modals ── */}
      <DropdownModal
        visible={stateModalVisible}
        title="Select State"
        data={SOUTH_INDIAN_STATES}
        onSelect={handleStateChange}
        onClose={() => setStateModalVisible(false)}
      />
      <DropdownModal
        visible={districtModalVisible}
        title="Select District"
        data={availableDistricts}
        onSelect={setDistrict}
        onClose={() => setDistrictModalVisible(false)}
      />
      <DropdownModal
        visible={zoneModalVisible}
        title="Select Zone"
        data={ZONES}
        onSelect={setZone}
        onClose={() => setZoneModalVisible(false)}
      />

      {/* ── Processing Overlay ── */}
      <ProcessingOverlay visible={isProcessing} />
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDF6EE',
  },

  /* Header */
  header: {
    backgroundColor: '#1B5E20',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#A5D6A7', marginTop: 2 },

  /* Cards */
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4EEE4',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B5E20',
  },

  /* Location button */
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  locationBtnText: {
    fontSize: 11,
    color: '#1B5E20',
    fontWeight: '600',
  },

  /* Summary */
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  summaryItemName: { fontSize: 14, color: '#333', fontWeight: '500' },
  summaryItemQty: { fontSize: 12, color: '#888', marginTop: 2 },
  summaryPrice: { fontSize: 14, color: '#333', fontWeight: '600' },

  /* Price breakdown */
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  priceLabel: { fontSize: 13, color: '#666' },
  priceValue: { fontSize: 13, color: '#333', fontWeight: '500' },
  priceDivider: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 8 },
  priceTotalLabel: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  priceTotalValue: { fontSize: 18, fontWeight: 'bold', color: '#1B5E20' },

  /* Form inputs */
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 5,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#FBFCFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DDE8DD',
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },

  /* Dropdown */
  dropdownBtn: {
    backgroundColor: '#FBFCFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#DDE8DD',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 14, color: '#333', flex: 1 },

  /* Payment options */
  payOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e8e8e8',
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  payOptionActive: {
    borderColor: '#1B5E20',
    backgroundColor: '#E8F5E9',
  },
  payIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  payLabel: { fontSize: 15, color: '#333', fontWeight: '600' },
  payLabelActive: { color: '#1B5E20' },
  payDesc: { fontSize: 12, color: '#888', marginTop: 2 },

  /* Trust row */
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    marginBottom: 8,
  },

  /* Place order */
  placeOrderBtn: {
    backgroundColor: '#1B5E20',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  placeOrderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  placeOrderText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  orderNote: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
  },

  /* QR hidden container */
  qrHiddenContainer: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    backgroundColor: '#fff',
    padding: 20,
  },
  qrCard: { alignItems: 'center', padding: 20, backgroundColor: '#fff' },
  qrTitle: { fontSize: 18, fontWeight: 'bold', color: '#1B5E20', marginBottom: 16 },
  qrCodeText: { fontSize: 14, color: '#666', marginTop: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  qrAmount: { fontSize: 20, fontWeight: 'bold', color: '#1B5E20', marginTop: 4 },
});

export default Payment;
