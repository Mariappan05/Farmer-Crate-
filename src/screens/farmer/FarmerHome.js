import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Animated,
  StatusBar,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getFarmerOrders } from '../../services/orderService';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Product image map (all keys lowercase) ─────────────────────────────────
const PRODUCT_IMAGES = {
  // ── Grains & Cereals ───────────────────────────────────────────────────────
  'rice':          'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80',
  'wheat':         'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&q=80',
  'maize':         'https://images.unsplash.com/photo-1601593346740-925612772716?w=400&q=80',
  'corn':          'https://images.unsplash.com/photo-1601593346740-925612772716?w=400&q=80',
  'sugarcane':     'https://images.unsplash.com/photo-1559181567-c3190468d910?w=400&q=80',
  'cotton':        'https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=400&q=80',
  'bajra':         'https://images.unsplash.com/photo-1599240211563-17bb1855a92b?w=400&q=80',
  'pearl millet':  'https://images.unsplash.com/photo-1599240211563-17bb1855a92b?w=400&q=80',
  'jowar':         'https://images.unsplash.com/photo-1599240211563-17bb1855a92b?w=400&q=80',
  'sorghum':       'https://images.unsplash.com/photo-1599240211563-17bb1855a92b?w=400&q=80',
  'ragi':          'https://images.unsplash.com/photo-1599240211563-17bb1855a92b?w=400&q=80',
  'finger millet': 'https://images.unsplash.com/photo-1599240211563-17bb1855a92b?w=400&q=80',
  'barley':        'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&q=80',
  // ── Vegetables ─────────────────────────────────────────────────────────────
  'tomato':        'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&q=80',
  'onion':         'https://images.unsplash.com/photo-1508747703725-719777637510?w=400&q=80',
  'potato':        'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400&q=80',
  'brinjal':       'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=400&q=80',
  'eggplant':      'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=400&q=80',
  'spinach':       'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400&q=80',
  'beans':         'https://images.unsplash.com/photo-1569740584898-a2c13e0c0acb?w=400&q=80',
  'green beans':   'https://images.unsplash.com/photo-1569740584898-a2c13e0c0acb?w=400&q=80',
  'radish':        'https://images.unsplash.com/photo-1587411768638-ec71f8e33b78?w=400&q=80',
  'cauliflower':   'https://images.unsplash.com/photo-1568584711271-6c929fb49b60?w=400&q=80',
  'cabbage':       'https://images.unsplash.com/photo-1594282418426-c763b1e7fc2c?w=400&q=80',
  'carrot':        'https://images.unsplash.com/photo-1447175008436-054170180b47?w=400&q=80',
  'peas':          'https://images.unsplash.com/photo-1587049352775-d8b04f8e7b73?w=400&q=80',
  'green peas':    'https://images.unsplash.com/photo-1587049352775-d8b04f8e7b73?w=400&q=80',
  'cucumber':      'https://images.unsplash.com/photo-1558640904-8dfa5a673d1b?w=400&q=80',
  'okra':          'https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=400&q=80',
  'ladyfinger':    'https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=400&q=80',
  'bhindi':        'https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=400&q=80',
  'lady finger':   'https://images.unsplash.com/photo-1615484477778-ca3b77940c25?w=400&q=80',
  'pumpkin':       'https://images.unsplash.com/photo-1570586347200-a590bdc7be84?w=400&q=80',
  'bitter gourd':  'https://images.unsplash.com/photo-1594995846645-ac19e67e7e94?w=400&q=80',
  'karela':        'https://images.unsplash.com/photo-1594995846645-ac19e67e7e94?w=400&q=80',
  'capsicum':      'https://images.unsplash.com/photo-1487530811015-780dfd41e76c?w=400&q=80',
  'bell pepper':   'https://images.unsplash.com/photo-1487530811015-780dfd41e76c?w=400&q=80',
  'sweet potato':  'https://images.unsplash.com/photo-1596097559756-be58a1b38070?w=400&q=80',
  'garlic':        'https://images.unsplash.com/photo-1540148229-3d9e0e2eb5d9?w=400&q=80',
  'beetroot':      'https://images.unsplash.com/photo-1593280359364-5efb88a75ded?w=400&q=80',
  'drumstick':     'https://images.unsplash.com/photo-1594995846645-ac19e67e7e94?w=400&q=80',
  'moringa':       'https://images.unsplash.com/photo-1594995846645-ac19e67e7e94?w=400&q=80',
  // ── Fruits ─────────────────────────────────────────────────────────────────
  'banana':        'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&q=80',
  'mango':         'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&q=80',
  'coconut':       'https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=400&q=80',
  'watermelon':    'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&q=80',
  'papaya':        'https://images.unsplash.com/photo-1591073845745-3a54af3c4e9f?w=400&q=80',
  'grapes':        'https://images.unsplash.com/photo-1530982011226-a1a0c1a56e9a?w=400&q=80',
  'pomegranate':   'https://images.unsplash.com/photo-1571506428038-e42b38a01e8e?w=400&q=80',
  'pineapple':     'https://images.unsplash.com/photo-1589820296156-2454bb8a6ad1?w=400&q=80',
  'guava':         'https://images.unsplash.com/photo-1536511132770-e5058c7e8c46?w=400&q=80',
  'lemon':         'https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=400&q=80',
  'lime':          'https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=400&q=80',
  'orange':        'https://images.unsplash.com/photo-1547514701-42782101795e?w=400&q=80',
  'cashew':        'https://images.unsplash.com/photo-1607099985707-c8168ece7ab2?w=400&q=80',
  'jackfruit':     'https://images.unsplash.com/photo-1580984969071-a8da8d144f56?w=400&q=80',
  'sapota':        'https://images.unsplash.com/photo-1536511132770-e5058c7e8c46?w=400&q=80',
  'chikoo':        'https://images.unsplash.com/photo-1536511132770-e5058c7e8c46?w=400&q=80',
  // ── Oilseeds ──────────────────────────────────────────────────────────────
  'groundnut':     'https://images.unsplash.com/photo-1567892737950-30c4db37cd89?w=400&q=80',
  'peanut':        'https://images.unsplash.com/photo-1567892737950-30c4db37cd89?w=400&q=80',
  'sunflower':     'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=400&q=80',
  'soybean':       'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&q=80',
  'soya':          'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&q=80',
  'mustard':       'https://images.unsplash.com/photo-1566376625003-8b1f38fa3a41?w=400&q=80',
  'sesame':        'https://images.unsplash.com/photo-1599240211121-5c6a0fb2e61a?w=400&q=80',
  'til':           'https://images.unsplash.com/photo-1599240211121-5c6a0fb2e61a?w=400&q=80',
  'castor':        'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&q=80',
  'linseed':       'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&q=80',
  // ── Spices & Herbs ─────────────────────────────────────────────────────────
  'turmeric':      'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&q=80',
  'chilli':        'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=400&q=80',
  'chili':         'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=400&q=80',
  'red chilli':    'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=400&q=80',
  'green chilli':  'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400&q=80',
  'dry chilli':    'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=400&q=80',
  'ginger':        'https://images.unsplash.com/photo-1599909533731-06e56dce5572?w=400&q=80',
  'coriander':     'https://images.unsplash.com/photo-1600348759200-c3e8f478db77?w=400&q=80',
  'pepper':        'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=400&q=80',
  'black pepper':  'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=400&q=80',
  'cardamom':      'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&q=80',
  'cumin':         'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&q=80',
  'jeera':         'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&q=80',
  'fenugreek':     'https://images.unsplash.com/photo-1600348759200-c3e8f478db77?w=400&q=80',
  'methi':         'https://images.unsplash.com/photo-1600348759200-c3e8f478db77?w=400&q=80',
  'clove':         'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&q=80',
  'cinnamon':      'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&q=80',
  // ── Pulses ────────────────────────────────────────────────────────────────
  'pigeon pea':    'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'toor dal':      'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'toor':          'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'tur':           'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'chickpea':      'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'chana':         'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'gram':          'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'lentil':        'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'masoor':        'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'moong':         'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'green gram':    'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'urad':          'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'black gram':    'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'dal':           'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'kidney beans':  'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  'rajma':         'https://images.unsplash.com/photo-1515543904247-7c49e87c4fde?w=400&q=80',
  // ── Livestock & Dairy ──────────────────────────────────────────────────────
  'goat':          'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=400&q=80',
  'sheep':         'https://images.unsplash.com/photo-1484557985045-edf25e08da73?w=400&q=80',
  'cow milk':      'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
  'milk':          'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
  'goat milk':     'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
  'eggs':          'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&q=80',
  'egg':           'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&q=80',
  'chicken':       'https://images.unsplash.com/photo-1612170153139-6f881ff067e0?w=400&q=80',
  'poultry':       'https://images.unsplash.com/photo-1612170153139-6f881ff067e0?w=400&q=80',
  'cow':           'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
  'buffalo':       'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
  'honey':         'https://images.unsplash.com/photo-1587049633312-d628ae50a8ae?w=400&q=80',
  // ── Aquaculture ───────────────────────────────────────────────────────────
  'tilapia':       'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400&q=80',
  'shrimp':        'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=400&q=80',
  'prawn':         'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&q=80',
  'fish':          'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400&q=80',
  'catfish':       'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400&q=80',
  'rohu':          'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400&q=80',
  'catla':         'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400&q=80',
};
const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=80';

// ─── Pexels live image fetch (CatBoost cards) ──────────────────────────────
const PEXELS_API_KEY = 'vvo8puZUX0EvdDXLFfnQQqZAWEFQOGEZAce2E2e9aIfHuR5FeBNgda44';
const _pexelsCache = {}; // in-memory cache, lives for the app session

const fetchPexelsImage = async (product) => {
  const key = (product || '').toLowerCase().trim();
  if (_pexelsCache[key]) return _pexelsCache[key];
  try {
    const query = encodeURIComponent(`${product} farm crop agriculture`);
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=landscape`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const data = await res.json();
    const url = data.photos?.[0]?.src?.medium || null;
    if (url) _pexelsCache[key] = url;
    return url || getProductImage(product);
  } catch (_) {
    return getProductImage(product);
  }
};

// Smart image lookup: exact → partial keyword → default
const getProductImage = (name) => {
  if (!name) return DEFAULT_PRODUCT_IMAGE;
  const key = name.toLowerCase().trim();
  if (PRODUCT_IMAGES[key]) return PRODUCT_IMAGES[key];
  // Try if any stored key is contained in the product name or vice versa
  for (const k of Object.keys(PRODUCT_IMAGES)) {
    if (key.includes(k) || k.includes(key)) return PRODUCT_IMAGES[k];
  }
  return DEFAULT_PRODUCT_IMAGE;
};

const GRADE_CONFIG = {
  Excellent: { bg: '#E8F5E9', text: '#2E7D32', icon: '🏆', bar: '#43A047' },
  Good:      { bg: '#E3F2FD', text: '#1565C0', icon: '✅', bar: '#1976D2' },
  Fair:      { bg: '#FFF8E1', text: '#F57F17', icon: '⚡', bar: '#FFB300' },
};

const MARKET_STYLE = {
  'High Demand': { bg: '#E8F5E9', text: '#2E7D32' },
  'High Supply': { bg: '#FFEBEE', text: '#C62828' },
  'Balanced':    { bg: '#F3E5F5', text: '#6A1B9A' },
};

// Image: shows static image instantly, replaces with Pexels photo once loaded
const RecImage = ({ product }) => {
  const staticUri = getProductImage(product);
  const [uri, setUri] = React.useState(staticUri);

  React.useEffect(() => {
    let cancelled = false;
    fetchPexelsImage(product).then((url) => {
      if (!cancelled && url && url !== staticUri) setUri(url);
    });
    return () => { cancelled = true; };
  }, [product]);

  return (
    <Image
      source={{ uri }}
      style={styles.recImg}
      resizeMode="cover"
      onError={() => setUri(DEFAULT_PRODUCT_IMAGE)}
    />
  );
};

const CARD_WIDTH = SCREEN_WIDTH * 0.82;

const STATUS_COLORS = {
  PENDING: '#FF9800',
  CONFIRMED: '#2196F3',
  ASSIGNED: '#9C27B0',
  SHIPPED: '#00BCD4',
  OUT_FOR_DELIVERY: '#FF5722',
  DELIVERED: '#4CAF50',
  CANCELLED: '#F44336',
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const getNormalizedStatus = (product) => String(product?.status || '').toUpperCase();

const isOutOfStockProduct = (product) => {
  const status = getNormalizedStatus(product);
  const qty = Number(product?.quantity ?? product?.stock ?? product?.available_quantity ?? 0);
  return qty <= 0 || status === 'OUT_OF_STOCK' || status === 'SOLD_OUT';
};

const isPendingProduct = (product) => {
  const status = getNormalizedStatus(product);
  return (
    status === 'PENDING' ||
    status === 'INACTIVE' ||
    status === 'HIDDEN' ||
    product?.is_active === false ||
    product?.is_active === 0
  );
};

const isActiveProduct = (product) => {
  if (product?.isExpired) return false;
  if (isOutOfStockProduct(product)) return false;
  if (isPendingProduct(product)) return false;

  const status = getNormalizedStatus(product);
  const explicitActive =
    status === 'ACTIVE' ||
    status === 'AVAILABLE' ||
    product?.is_active === true ||
    product?.is_active === 1;

  // If backend omits status, keep product visible when stock exists and not pending.
  return explicitActive || !status;
};

const FarmerHome = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({
    totalProducts: 0,
    activeOrders: 0,
    revenue: 0,
    rating: 0,
    activeCount: 0,
    pendingCount: 0,
    outOfStockCount: 0,
    expiredCount: 0,
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const toastRef = useRef(null);

  const [recDistrict, setRecDistrict]   = useState('');
  const [recLoading, setRecLoading]     = useState(true);
  const [recError, setRecError]         = useState(null);
  const [recData, setRecData]           = useState([]);

  // ── Price Prediction state ──────────────────────────────────────────────────
  const [pricePredData, setPricePredData]       = useState([]);
  const [pricePredLoading, setPricePredLoading] = useState(true);
  const [pricePredError, setPricePredError]     = useState(null);

  const farmerName =
    authState?.user?.full_name ||
    authState?.user?.name ||
    authState?.user?.username ||
    'Farmer';

  const fetchData = useCallback(async () => {
    try {
      console.log('[FarmerHome] Fetching products and orders...');
      const [prodRes, orderRes] = await Promise.allSettled([
        api.get('/products/farmer/me'),
        getFarmerOrders(),
      ]);

      console.log('[FarmerHome] Product response:', prodRes);
      console.log('[FarmerHome] Order response:', orderRes);

      const prodList =
        prodRes.status === 'fulfilled'
          ? Array.isArray(prodRes.value.data)
            ? prodRes.value.data
            : prodRes.value.data?.products || prodRes.value.data?.data || []
          : [];
      const orderList =
        orderRes.status === 'fulfilled'
          ? Array.isArray(orderRes.value)
            ? orderRes.value
            : orderRes.value?.orders || orderRes.value?.data || []
          : [];

      console.log('[FarmerHome] Processed products:', prodList);
      console.log('[FarmerHome] Processed orders:', orderList);

      // Mark expired products strictly by expiry_date.
      const currentDate = new Date();
      const productsWithExpiry = prodList.map(prod => {
        if (prod.expiry_date) {
          const expiryDate = new Date(prod.expiry_date);
          const isExpired = expiryDate < currentDate;
          if (isExpired) {
            console.log('[FarmerHome] Product expired:', prod.name, 'expiry date:', prod.expiry_date);
          }
          return { ...prod, isExpired };
        }
        return { ...prod, isExpired: false };
      });
      
      console.log('[FarmerHome] Products with expiry status:', productsWithExpiry);

      setProducts(productsWithExpiry);
      setOrders(orderList);

      const activeCount = productsWithExpiry.filter((p) => {
        const isActive = isActiveProduct(p);
        console.log('[FarmerHome] Product', p.name, 'active check:', { status: p.status, is_active: p.is_active, isExpired: p.isExpired, isActive });
        return isActive;
      }).length;
      
      const pendingCount = productsWithExpiry.filter((p) => {
        const isPending = isPendingProduct(p) && !p.isExpired;
        console.log('[FarmerHome] Product', p.name, 'pending check:', { status: p.status, is_active: p.is_active, isExpired: p.isExpired, isPending });
        return isPending;
      }).length;
      
      const outOfStockCount = productsWithExpiry.filter((p) => {
        const isOutOfStock = isOutOfStockProduct(p) && !p.isExpired;
        console.log('[FarmerHome] Product', p.name, 'out of stock check:', { 
          quantity: p.quantity, 
          stock: p.stock, 
          available_quantity: p.available_quantity, 
          status: p.status, 
          isExpired: p.isExpired,
          isOutOfStock 
        });
        return isOutOfStock;
      }).length;
      
      const expiredCount = productsWithExpiry.filter(p => p.isExpired).length;

      console.log('[FarmerHome] Product counts:', { activeCount, pendingCount, outOfStockCount, expiredCount, total: productsWithExpiry.length });

      const activeOrders = orderList.filter(
        (o) => {
          const isActive = o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && o.status !== 'COMPLETED';
          console.log('[FarmerHome] Order', o.id || o.order_id, 'active check:', { status: o.status, isActive });
          return isActive;
        }
      ).length;
      
      const deliveredOrders = orderList.filter((o) => {
        const isDelivered = o.status === 'DELIVERED' || o.status === 'COMPLETED' || 
                           (o.status === 'ASSIGNED' && (o.payment_status === 'completed' || o.payment_status === 'COMPLETED'));
        console.log('[FarmerHome] Order', o.id || o.order_id, 'delivered check:', { status: o.status, payment_status: o.payment_status, isDelivered });
        return isDelivered;
      });
      
      const revenue = deliveredOrders.reduce(
        (sum, o) => {
          const amount = parseFloat(
            o.farmer_amount || 
            o.farmer_share || 
            o.total_amount || 
            o.total_price || 
            o.total || 
            o.amount || 
            o.price || 
            (o.quantity && o.unit_price ? o.quantity * o.unit_price : 0) ||
            0
          );
          console.log('[FarmerHome] Order revenue:', { 
            orderId: o.id || o.order_id, 
            farmer_amount: o.farmer_amount,
            farmer_share: o.farmer_share,
            total_amount: o.total_amount,
            total_price: o.total_price,
            total: o.total,
            amount: o.amount,
            price: o.price,
            quantity: o.quantity,
            unit_price: o.unit_price,
            calculatedAmount: amount
          });
          return sum + amount;
        },
        0
      );

      console.log('[FarmerHome] Revenue calculation:', { deliveredOrdersCount: deliveredOrders.length, totalRevenue: revenue, deliveredOrders: deliveredOrders.map(o => ({ id: o.id, status: o.status, payment_status: o.payment_status, amount: o.farmer_amount || o.farmer_share || o.total_amount })) });

      // Calculate ratings from both products and orders
      const productRatings = productsWithExpiry
        .filter(p => !p.isExpired)
        .map((p) => {
          const rating = parseFloat(
            p.average_rating || 
            p.rating || 
            p.product_rating || 
            p.user_rating || 
            p.reviews?.average_rating ||
            p.review_rating ||
            p.farmer_rating ||
            0
          );
          console.log('[FarmerHome] Product rating for', p.name, ':', {
            average_rating: p.average_rating,
            rating: p.rating,
            product_rating: p.product_rating,
            user_rating: p.user_rating,
            reviews_avg: p.reviews?.average_rating,
            review_rating: p.review_rating,
            farmer_rating: p.farmer_rating,
            calculatedRating: rating
          });
          return rating;
        })
        .filter((r) => r > 0);
        
      // Also check order ratings/reviews
      const orderRatings = orderList
        .map((o) => {
          const rating = parseFloat(
            o.rating || 
            o.farmer_rating || 
            o.product_rating || 
            o.review?.rating ||
            o.customer_rating ||
            o.order_rating ||
            0
          );
          console.log('[FarmerHome] Order rating for', o.id || o.order_id, ':', {
            rating: o.rating,
            farmer_rating: o.farmer_rating,
            product_rating: o.product_rating,
            review_rating: o.review?.rating,
            customer_rating: o.customer_rating,
            order_rating: o.order_rating,
            calculatedRating: rating
          });
          return rating;
        })
        .filter((r) => r > 0);
        
      const allRatings = [...productRatings, ...orderRatings];
      const avgRating =
        allRatings.length > 0
          ? parseFloat((allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1))
          : 0;
          
      console.log('[FarmerHome] Rating calculation:', { productRatings, orderRatings, allRatings, averageRating: avgRating });

      setStats({
        totalProducts: productsWithExpiry.length,
        activeOrders,
        revenue,
        rating: avgRating,
        activeCount,
        pendingCount,
        outOfStockCount,
        expiredCount,
      });
      
      console.log('[FarmerHome] Final stats:', {
        totalProducts: productsWithExpiry.length,
        activeOrders,
        revenue,
        rating: avgRating,
        activeCount,
        pendingCount,
        outOfStockCount,
        expiredCount,
      });
    } catch (e) {
      console.error('FarmerHome fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchRecommendations = useCallback(async () => {
    console.log('[REC] fetching recommendations...');
    setRecLoading(true);
    setRecError(null);
    try {
      // Resolve farmer district: authState cache first, then profile fetch
      let farmerDistrict =
        authState?.user?.district ||
        authState?.user?.user?.district || '';
      if (!farmerDistrict) {
        try {
          const pRes = await api.get('/farmers/me');
          const p = pRes.data?.data || pRes.data || {};
          farmerDistrict =
            p.district ||
            p.user?.district ||
            p.farmer?.district || '';
        } catch (_) {
          console.warn('[REC] Could not fetch farmer profile for district');
        }
      }
      console.log('[REC] farmer district:', farmerDistrict || '(unknown)');

      const districtParam = farmerDistrict
        ? `&district=${encodeURIComponent(farmerDistrict)}`
        : '';

      const res = await api.get(`/recommendations/farmer?period=weekly${districtParam}`);
      const recs = (res.data?.success)
        ? res.data.recommendations || res.data.weekly_recommendations || []
        : [];
      const district = farmerDistrict || res.data?.district || '';

      console.log('[REC] count:', recs.length);
      setRecData(recs);
      setRecDistrict(district);
      if (!recs.length) {
        setRecError(res.data?.message || 'No recommendations available');
      }
    } catch (e) {
      console.error('[REC] fetch error:', e.message);
      setRecError('Could not load recommendations');
    } finally {
      setRecLoading(false);
    }
  }, [authState]);

  const fetchPricePredictions = useCallback(async () => {
    setPricePredLoading(true);
    setPricePredError(null);
    try {
      const res = await api.get('/price-prediction/farmer/all');
      if (res.data?.success) {
        setPricePredData(res.data.data || []);
      } else {
        setPricePredError(res.data?.message || 'No price data');
      }
    } catch (e) {
      console.error('[PricePred] fetch error:', e.message);
      setPricePredError('Could not load price predictions');
    } finally {
      setPricePredLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchRecommendations();
    fetchPricePredictions();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
    fetchRecommendations();
    fetchPricePredictions();
  };

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date))
    .slice(0, 5);

  const quickActions = [
    {
      label: 'Add Product',
      icon: 'add-circle-outline',
      color: '#4CAF50',
      onPress: () => navigation.navigate('AddProduct'),
    },
    {
      label: 'View Orders',
      icon: 'receipt-outline',
      color: '#2196F3',
      onPress: () => navigation.navigate('Orders'),
    },
    {
      label: 'Edit Products',
      icon: 'create-outline',
      color: '#FF9800',
      onPress: () => navigation.navigate('EditProduct'),
    },
    {
      label: 'Selling History',
      icon: 'time-outline',
      color: '#9C27B0',
      onPress: () => navigation.navigate('History'),
    },
  ];

  const statsCards = [
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: 'cube-outline',
      gradient: ['#4CAF50', '#388E3C'],
    },
    {
      title: 'Active Orders',
      value: stats.activeOrders,
      icon: 'cart-outline',
      gradient: ['#2196F3', '#1565C0'],
    },
    {
      title: 'Revenue',
      value: stats.revenue > 0 ? `₹${stats.revenue.toLocaleString('en-IN')}` : '₹0',
      icon: 'cash-outline',
      gradient: ['#FF9800', '#F57C00'],
    },
    {
      title: 'Rating',
      value: stats.rating > 0 ? `${stats.rating} ★` : 'No Rating',
      icon: 'star-outline',
      gradient: ['#9C27B0', '#7B1FA2'],
    },
  ];

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
            <Text style={styles.farmerName} numberOfLines={1}>
              {farmerName}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="person-circle-outline" size={36} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          {statsCards.map((card, idx) => (
            <LinearGradient
              key={idx}
              colors={card.gradient}
              style={styles.statCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name={card.icon} size={28} color="rgba(255,255,255,0.8)" />
              <Text style={styles.statValue}>{card.value}</Text>
              <Text style={styles.statTitle}>{card.title}</Text>
            </LinearGradient>
          ))}
        </View>

        {/* ── AI Recommendations ─────────────────────────────────────── */}
        <View style={styles.recSection}>
          <LinearGradient colors={['#1B5E20', '#2E7D32']} style={styles.recHeader}>
            <View style={styles.recHeaderLeft}>
              <Text style={styles.recTitle}>🌾 AI Crop Recommendations</Text>
              {recDistrict ? (
                <Text style={styles.recSubtitle}>📍 Based on {recDistrict} district</Text>
              ) : null}
            </View>
            <View style={styles.recBadge}>
              <Text style={styles.recBadgeText}>AI Powered</Text>
            </View>
          </LinearGradient>

          {recLoading ? (
            <View style={styles.recLoader}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.recLoaderText}>Fetching recommendations…</Text>
            </View>
          ) : recError ? (
            <TouchableOpacity style={styles.recError} onPress={fetchRecommendations}>
              <Ionicons name="cloud-offline-outline" size={36} color="#F44336" />
              <Text style={styles.recErrorText}>{recError}</Text>
              <Text style={styles.recRetry}>Tap to retry</Text>
            </TouchableOpacity>
          ) : recData.length === 0 ? (
            <View style={styles.recEmpty}>
              <Ionicons name="leaf-outline" size={40} color="#ccc" />
              <Text style={styles.recEmptyText}>No recommendations yet</Text>
            </View>
          ) : (
            <FlatList
              data={recData}
              horizontal
              keyExtractor={(item, i) => `rec-${item.product}-${i}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recList}
              snapToInterval={CARD_WIDTH + 16}
              decelerationRate="fast"
              renderItem={({ item }) => {
                const grade   = GRADE_CONFIG[item.grade] || GRADE_CONFIG.Fair;
                const mktStyle = MARKET_STYLE[item.market_status] || MARKET_STYLE.Balanced;
                const priceQtl = item.estimated_price_per_quintal || 0;
                const priceKg  = (priceQtl / 100).toFixed(1);
                const suitPct  = Math.round((item.overall_score || 0) * 100);
                const barColor = suitPct >= 80 ? '#43A047' : suitPct >= 60 ? '#FFB300' : '#EF5350';

                // ── Demand-based pricing (merged by backend for already-listed products) ──
                const dp        = item.demand_pricing || null;
                const dpAction  = dp?.action || null;
                const dpColor   = dpAction === 'INCREASE' ? '#1B5E20'
                                : dpAction === 'DECREASE' ? '#B71C1C' : '#4A148C';
                const dpBg      = dpAction === 'INCREASE' ? '#E8F5E9'
                                : dpAction === 'DECREASE' ? '#FFEBEE' : '#F3E5F5';
                const dpIcon    = dpAction === 'INCREASE' ? 'trending-up'
                                : dpAction === 'DECREASE' ? 'trending-down' : 'remove-outline';
                const dpDemandColor = dp?.demand_level === 'HIGH' ? '#B71C1C'
                                    : dp?.demand_level === 'MODERATE' ? '#E65100' : '#1B5E20';
                const dpDemandBg    = dp?.demand_level === 'HIGH' ? '#FFEBEE'
                                    : dp?.demand_level === 'MODERATE' ? '#FFF3E0' : '#E8F5E9';

                return (
                  <View style={styles.recCard}>
                    {/* ── Image with gradient overlay ── */}
                    <View style={styles.recImgContainer}>
                      <RecImage product={item.product} />
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.60)']}
                        style={styles.recImgGradient}
                      />
                      {/* Grade badge — top left */}
                      <View style={[styles.gradeBadge, { backgroundColor: grade.bg }]}>
                        <Text style={[styles.gradeBadgeText, { color: grade.text }]}>
                          {grade.icon} {item.grade}
                        </Text>
                      </View>
                      {/* Category chip — bottom left over gradient */}
                      <View style={styles.categoryChip}>
                        <Ionicons name="leaf-outline" size={10} color="#fff" />
                        <Text style={styles.categoryChipText}>{item.category}</Text>
                      </View>
                    </View>

                    <View style={styles.recCardBody}>
                      {/* Product Name */}
                      <Text style={styles.recProductName} numberOfLines={1}>
                        {item.product}
                      </Text>

                      {/* ── Dual Price Row ── */}
                      <View style={styles.priceBlock}>
                        <View style={styles.priceItem}>
                          <Text style={styles.priceLabelText}>Per kg</Text>
                          <View style={styles.priceValueRow}>
                            <Text style={styles.priceRupee}>₹</Text>
                            <Text style={styles.priceValueText}>{priceKg}</Text>
                          </View>
                        </View>
                        <View style={styles.priceDivider} />
                        <View style={styles.priceItem}>
                          <Text style={styles.priceLabelText}>Per qtl</Text>
                          <View style={styles.priceValueRow}>
                            <Text style={styles.priceRupee}>₹</Text>
                            <Text style={styles.priceValueText}>
                              {priceQtl.toLocaleString('en-IN')}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Market status + suitability score */}
                      <View style={styles.recMetaRow}>
                        <View style={[styles.marketBadge, { backgroundColor: mktStyle.bg }]}>
                          <Text style={[styles.marketBadgeText, { color: mktStyle.text }]}>
                            {item.market_status || 'Balanced'}
                          </Text>
                        </View>
                        <Text style={styles.suitScore}>{suitPct}% Fit</Text>
                      </View>

                      {/* Score bar */}
                      <View style={styles.scoreBarBg}>
                        <View style={[styles.scoreBarFill, { width: `${suitPct}%`, backgroundColor: barColor }]} />
                      </View>

                      {/* ── Two pricing boxes (already-listed products only) ── */}
                      {item.already_posted && dp ? (
                        <View>

                          {/* ══ BOX 1: DEMAND BASED PRICING ══ */}
                          <View style={styles.pricingBox}>
                            {/* Banner */}
                            <LinearGradient
                              colors={['#1565C0', '#1976D2']}
                              style={styles.pricingBanner}
                              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            >
                              <View style={styles.pricingBannerLeft}>
                                <Ionicons name="bar-chart-outline" size={13} color="#fff" />
                                <Text style={styles.pricingBannerTitle}>Demand Based Pricing</Text>
                              </View>
                              <View style={[styles.pricingBannerBadge, { backgroundColor: dpBg }]}>
                                <Ionicons name={dpIcon} size={10} color={dpColor} />
                                <Text style={[styles.pricingBannerBadgeText, { color: dpColor }]}>
                                  {dpAction}
                                </Text>
                              </View>
                            </LinearGradient>

                            {/* Body */}
                            <View style={styles.pricingBody}>
                              {/* Demand level chip */}
                              <View style={[styles.demandLevelChip, { backgroundColor: dpDemandBg, alignSelf: 'flex-start', marginBottom: 7 }]}>
                                <Text style={[styles.demandLevelText, { color: dpDemandColor }]}>
                                  {dp.demand_level} DEMAND
                                </Text>
                              </View>

                              {/* Current → Suggested price */}
                              <View style={styles.demandPriceRow}>
                                <View style={styles.pricingPriceBlock}>
                                  <Text style={styles.pricingPriceLabel}>Current</Text>
                                  <Text style={styles.pricingPriceCurrent}>₹{parseFloat(dp.current_price).toFixed(2)}</Text>
                                </View>
                                <Ionicons name="arrow-forward" size={14} color="#90A4AE" />
                                <View style={styles.pricingPriceBlock}>
                                  <Text style={styles.pricingPriceLabel}>Suggested</Text>
                                  <Text style={[styles.pricingPriceSuggested, { color: dpColor }]}>
                                    ₹{parseFloat(dp.predicted_price).toFixed(2)}
                                  </Text>
                                </View>
                                <View style={[styles.pricingChangePill, { backgroundColor: dpBg }]}>
                                  <Ionicons name={dpIcon} size={10} color={dpColor} />
                                  <Text style={[styles.pricingChangeText, { color: dpColor }]}>
                                    {dp.price_change >= 0 ? '+' : ''}₹{parseFloat(dp.price_change).toFixed(2)}
                                  </Text>
                                </View>
                              </View>

                              {/* Recommendation */}
                              <Text style={styles.pricingRecText} numberOfLines={2}>
                                💡 {dp.recommendation}
                              </Text>
                            </View>
                          </View>

                          {/* ══ BOX 2: SEASONAL BASED PRICING ══ */}
                          <View style={[styles.pricingBox, { marginTop: 8 }]}>
                            {/* Banner */}
                            <LinearGradient
                              colors={dp.in_season ? ['#2E7D32', '#43A047'] : ['#E65100', '#F57C00']}
                              style={styles.pricingBanner}
                              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            >
                              <View style={styles.pricingBannerLeft}>
                                <Ionicons name="sunny-outline" size={13} color="#fff" />
                                <Text style={styles.pricingBannerTitle}>Seasonal Based Pricing</Text>
                              </View>
                              <View style={[styles.pricingBannerBadge, {
                                backgroundColor: dp.in_season ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.25)',
                              }]}>
                                <Text style={styles.pricingBannerBadgeWhite}>
                                  {dp.in_season ? '✅ In Season' : '❌ Off Season'}
                                </Text>
                              </View>
                            </LinearGradient>

                            {/* Body */}
                            <View style={styles.pricingBody}>
                              {/* Season name chip */}
                              {dp.current_season ? (
                                <View style={[styles.demandLevelChip, { backgroundColor: '#E3F2FD', alignSelf: 'flex-start', marginBottom: 7 }]}>
                                  <Text style={[styles.demandLevelText, { color: '#0D47A1' }]}>
                                    🗓️ {dp.current_season}
                                  </Text>
                                </View>
                              ) : null}

                              {/* Seasonal factor + Est price row */}
                              <View style={styles.demandPriceRow}>
                                {dp.seasonal_factor ? (
                                  <View style={styles.pricingPriceBlock}>
                                    <Text style={styles.pricingPriceLabel}>Season factor</Text>
                                    <Text style={[styles.pricingPriceSuggested, { color: dp.in_season ? '#2E7D32' : '#E65100' }]}>
                                      ×{parseFloat(dp.seasonal_factor).toFixed(2)}
                                    </Text>
                                  </View>
                                ) : null}
                                <View style={styles.pricingPriceBlock}>
                                  <Text style={styles.pricingPriceLabel}>Est. price/kg</Text>
                                  <Text style={[styles.pricingPriceSuggested, { color: dp.in_season ? '#2E7D32' : '#E65100' }]}>
                                    ₹{((item.estimated_price_per_quintal || 0) / 100).toFixed(1)}
                                  </Text>
                                </View>
                              </View>

                              {/* Seasonal tip */}
                              <Text style={styles.pricingRecText} numberOfLines={2}>
                                🌾 {dp.in_season
                                  ? `Peak season for ${item.product || item.name} — optimal time to sell for maximum returns.`
                                  : `Off-peak season for ${item.product || item.name} — consider competitive pricing to maintain sales.`}
                              </Text>
                            </View>
                          </View>

                        </View>
                      ) : item.already_posted ? (
                        <View style={styles.alreadyPosted}>
                          <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
                          <Text style={styles.alreadyPostedText}>Already Listed</Text>
                        </View>
                      ) : (
                        <View style={styles.newOpportunity}>
                          <Ionicons name="trending-up-outline" size={12} color="#FF6F00" />
                          <Text style={styles.newOpportunityText}>New Opportunity</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>

        {/* ── Price Prediction ────────────────────────────────────── */}
        <View style={styles.pricePredSection}>
          <LinearGradient colors={['#1565C0', '#1976D2']} style={styles.pricePredHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pricePredTitle}>💰 Smart Price Recommendations</Text>
              <Text style={styles.pricePredSubtitle}>Based on demand, stock & seasonal trends</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('PricePrediction')}
              style={styles.pricePredSeeAll}
              activeOpacity={0.75}
            >
              <Text style={styles.pricePredSeeAllText}>See All</Text>
              <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
            <View style={[styles.pricePredBadge, { marginLeft: 8 }]}>
              <Text style={styles.pricePredBadgeText}>Live</Text>
            </View>
          </LinearGradient>

          {pricePredLoading ? (
            <View style={styles.pricePredLoader}>
              <ActivityIndicator size="large" color="#1976D2" />
              <Text style={styles.pricePredLoaderText}>Analyzing prices…</Text>
            </View>
          ) : pricePredError ? (
            <TouchableOpacity style={styles.pricePredError} onPress={fetchPricePredictions}>
              <Ionicons name="analytics-outline" size={36} color="#FF7043" />
              <Text style={styles.pricePredErrorText}>{pricePredError}</Text>
              <Text style={styles.pricePredRetry}>Tap to retry</Text>
            </TouchableOpacity>
          ) : pricePredData.length === 0 ? (
            <View style={styles.pricePredEmpty}>
              <Ionicons name="pricetag-outline" size={40} color="#ccc" />
              <Text style={styles.pricePredEmptyText}>No products to analyse yet</Text>
            </View>
          ) : (
            <FlatList
              data={pricePredData.slice(0, 5)}
              scrollEnabled={false}
              keyExtractor={(item) => `pp-${item.product_id}`}
              contentContainerStyle={styles.pricePredList}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => {
                const isIncrease = item.action === 'INCREASE';
                const isDecrease = item.action === 'DECREASE';
                const actionColor  = isIncrease ? '#1B5E20' : isDecrease ? '#C62828' : '#4A148C';
                const actionBg     = isIncrease ? '#E8F5E9' : isDecrease ? '#FFEBEE' : '#F3E5F5';
                const actionBorder = isIncrease ? '#4CAF50' : isDecrease ? '#EF5350' : '#9C27B0';
                const actionIcon   = isIncrease ? 'trending-up' : isDecrease ? 'trending-down' : 'remove-outline';
                const actionLabel  = isIncrease ? 'Raise Price' : isDecrease ? 'Lower Price' : 'Keep Price';
                const actionHint   = isIncrease
                  ? 'High demand — you can earn more by raising the price'
                  : isDecrease
                  ? 'Sales are slow — lower price will attract more buyers'
                  : 'Sales are stable — no price change needed';

                const demandColor = item.demand_level === 'HIGH' ? '#B71C1C'
                                  : item.demand_level === 'MODERATE' ? '#E65100' : '#1B5E20';
                const demandBg    = item.demand_level === 'HIGH' ? '#FFEBEE'
                                  : item.demand_level === 'MODERATE' ? '#FFF3E0' : '#E8F5E9';
                const priceDiff   = parseFloat(item.price_change || 0);
                const pricePct    = parseFloat(item.price_change_pct || 0);

                return (
                  <View style={[styles.pricePredCard, { borderLeftColor: actionBorder, borderLeftWidth: 5 }]}>

                    {/* Row 1: Product name + action badge */}
                    <View style={styles.ppRow}>
                      <Text style={styles.ppProductName} numberOfLines={1}>{item.product_name}</Text>
                      <View style={[styles.ppActionBadge, { backgroundColor: actionBg }]}>
                        <Ionicons name={actionIcon} size={13} color={actionColor} />
                        <Text style={[styles.ppActionBadgeText, { color: actionColor }]}>{actionLabel}</Text>
                      </View>
                    </View>

                    {/* Row 2: Why hint */}
                    <Text style={[styles.ppHint, { color: actionColor }]}>{actionHint}</Text>

                    {/* Row 3: Price bar */}
                    <View style={[styles.ppPriceBar, { backgroundColor: actionBg }]}>
                      <View style={styles.ppPriceBarSide}>
                        <Text style={styles.ppPriceBarLabel}>Current</Text>
                        <Text style={styles.ppPriceBarVal}>₹{parseFloat(item.current_price).toFixed(2)}</Text>
                      </View>
                      <View style={styles.ppPriceBarMid}>
                        <Ionicons name={actionIcon} size={16} color={actionColor} />
                        <Text style={[styles.ppPriceBarChange, { color: actionColor }]}>
                          {priceDiff >= 0 ? '+' : ''}₹{priceDiff.toFixed(2)} ({pricePct >= 0 ? '+' : ''}{pricePct.toFixed(1)}%)
                        </Text>
                      </View>
                      <View style={[styles.ppPriceBarSide, { alignItems: 'flex-end' }]}>
                        <Text style={styles.ppPriceBarLabel}>Suggested</Text>
                        <Text style={[styles.ppPriceBarVal, { color: actionColor }]}>₹{parseFloat(item.predicted_price).toFixed(2)}</Text>
                      </View>
                    </View>

                    {/* Row 4: chips — season + demand + stock */}
                    <View style={styles.ppChipsRow}>
                      <View style={[styles.ppChip, { backgroundColor: item.in_season ? '#E8F5E9' : '#FFF3E0' }]}>
                        <Text style={[styles.ppChipText, { color: item.in_season ? '#1B5E20' : '#E65100' }]}>
                          {item.in_season ? '✅' : '🟠'} {item.current_season}
                        </Text>
                      </View>
                      <View style={[styles.ppChip, { backgroundColor: demandBg }]}>
                        <Text style={[styles.ppChipText, { color: demandColor }]}>
                          📊 {item.demand_level} Demand
                        </Text>
                      </View>
                      <View style={[styles.ppChip, { backgroundColor: '#ECEFF1' }]}>
                        <Text style={[styles.ppChipText, { color: '#546E7A' }]}>
                          📦 {item.current_stock} in stock
                        </Text>
                      </View>
                    </View>

                    {/* Row 5: AI tip */}
                    <Text style={styles.ppTip} numberOfLines={2}>
                      💡 {item.recommendation}
                    </Text>
                  </View>
                );
              }}
            />
          )}
        </View>

        {/* ── My Products ────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Products</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AddProduct')}>
              <Text style={styles.seeAll}>+ Add New</Text>
            </TouchableOpacity>
          </View>

          {/* Summary pills */}
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: '#E8F5E9' }]}>
              <View style={[styles.statusDotBig, { backgroundColor: '#4CAF50' }]} />
              <Text style={styles.statusLabel}>Active</Text>
              <Text style={[styles.statusCount, { color: '#4CAF50' }]}>{stats.activeCount}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: '#FFF3E0' }]}>
              <View style={[styles.statusDotBig, { backgroundColor: '#FF9800' }]} />
              <Text style={styles.statusLabel}>Pending</Text>
              <Text style={[styles.statusCount, { color: '#FF9800' }]}>{stats.pendingCount}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: '#FFEBEE' }]}>
              <View style={[styles.statusDotBig, { backgroundColor: '#F44336' }]} />
              <Text style={styles.statusLabel}>Out of Stock</Text>
              <Text style={[styles.statusCount, { color: '#F44336' }]}>{stats.outOfStockCount}</Text>
            </View>
          </View>

          {/* Active products */}
          {(() => {
            const activeProducts = products.filter(isActiveProduct);
            return activeProducts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="cube-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No active products listed yet</Text>
              </View>
            ) : (
              activeProducts.slice(0, 6).map((prod, idx) => {
                const isActive = isActiveProduct(prod);
                const isPending = isPendingProduct(prod);
                const isOutOfStock = isOutOfStockProduct(prod);
                
                const statusColor = isOutOfStock ? '#F44336' : isPending ? '#FF9800' : '#4CAF50';
                const statusLabel = isOutOfStock ? 'Out of Stock' : isPending ? 'Pending' : 'Active';
                const statusBg = isOutOfStock ? '#FFEBEE' : isPending ? '#FFF3E0' : '#E8F5E9';
                
                const rawImg = prod.images?.[0] || prod.image || prod.image_url;
                const imgStr = typeof rawImg === 'string'
                  ? rawImg
                  : rawImg?.url || rawImg?.secure_url || rawImg?.uri || rawImg?.image_url || null;
                
                const imageUri = imgStr
                  ? optimizeImageUrl(imgStr, { width: 90, height: 90 })
                  : getProductImage(prod.name || prod.product_name || '');
                
                const price = parseFloat(
                  prod.price || 
                  prod.base_price || 
                  prod.current_price || 
                  prod.selling_price || 
                  prod.unit_price || 
                  0
                );
                const stock = prod.quantity ?? prod.stock ?? prod.available_quantity ?? '—';
                const rating = parseFloat(
                  prod.average_rating || 
                  prod.rating || 
                  prod.product_rating || 
                  prod.user_rating || 
                  0
                );

                return (
                  <TouchableOpacity
                    key={prod.id || prod._id || idx}
                    style={styles.prodCard}
                    activeOpacity={0.75}
                    onPress={() => navigation.navigate('EditProduct', { product: prod })}
                  >
                    <View style={styles.prodImageBox}>
                      {imageUri ? (
                        <Image
                          source={{ uri: imageUri }}
                          style={styles.prodImage}
                          resizeMode="cover"
                          onError={(error) => {
                            console.log('[FarmerHome] Image load error for', prod.name, ':', error.nativeEvent.error);
                          }}
                        />
                      ) : (
                        <View style={[styles.prodImage, styles.prodImagePlaceholder]}>
                          <Ionicons name="image-outline" size={28} color="#ccc" />
                        </View>
                      )}
                      <View style={[styles.prodStatusDot, { backgroundColor: statusColor }]} />
                    </View>

                    <View style={styles.prodDetails}>
                      <Text style={styles.prodName} numberOfLines={1}>
                        {prod.name || prod.product_name || 'Product'}
                      </Text>
                      <Text style={styles.prodCategory} numberOfLines={1}>
                        {prod.category || prod.category_name || ''}
                      </Text>

                      <View style={styles.prodMetaRow}>
                        <Text style={styles.prodPrice}>₹{price.toFixed(2)}/kg</Text>
                        <View style={[styles.prodStatusChip, { backgroundColor: statusBg }]}>
                          <Text style={[styles.prodStatusText, { color: statusColor }]}>
                            {statusLabel}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.prodStockRow}>
                        <Ionicons name="cube-outline" size={12} color="#607D8B" />
                        <Text style={styles.prodStockText}>Stock: {stock}</Text>
                        {rating > 0 && (
                          <Text style={styles.prodRating}>⭐ {rating.toFixed(1)}</Text>
                        )}
                      </View>
                    </View>

                    <Ionicons name="chevron-forward" size={18} color="#ccc" />
                  </TouchableOpacity>
                );
              })
            );
          })()}

          {/* See all active products link */}
          {(() => {
            const activeProducts = products.filter(isActiveProduct);
            return activeProducts.length > 6 && (
              <TouchableOpacity
                style={styles.prodSeeAllBtn}
                onPress={() => navigation.navigate('EditProduct')}
                activeOpacity={0.75}
              >
                <Text style={styles.prodSeeAllText}>See all {activeProducts.length} active products</Text>
                <Ionicons name="arrow-forward" size={14} color="#4CAF50" />
              </TouchableOpacity>
            );
          })()}
        </View>

        {/* ── Expired Products ──────────────────────────────── */}
        {(() => {
          const expiredProducts = products.filter(p => p.isExpired);
          return expiredProducts.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.expiredSectionTitleRow}>
                  <Ionicons name="time-outline" size={20} color="#9C27B0" />
                  <Text style={[styles.sectionTitle, { color: '#9C27B0' }]}>Expired Products</Text>
                  <View style={styles.expiredBadge}>
                    <Text style={styles.expiredBadgeText}>{expiredProducts.length}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('EditProduct', { filter: 'expired' })}>
                  <Text style={[styles.seeAll, { color: '#9C27B0' }]}>Manage All</Text>
                </TouchableOpacity>
              </View>

              {/* Expired products warning */}
              <View style={styles.expiredWarning}>
                <Ionicons name="warning-outline" size={16} color="#FF6F00" />
                <Text style={styles.expiredWarningText}>
                  These products have passed their expiry date. Consider updating or removing them.
                </Text>
              </View>

              {/* Expired product cards */}
              {expiredProducts.slice(0, 4).map((prod, idx) => {
                const rawImg = prod.images?.[0] || prod.image || prod.image_url;
                const imgStr = typeof rawImg === 'string'
                  ? rawImg
                  : rawImg?.url || rawImg?.secure_url || rawImg?.uri || rawImg?.image_url || null;
                
                const imageUri = imgStr
                  ? optimizeImageUrl(imgStr, { width: 90, height: 90 })
                  : getProductImage(prod.name || prod.product_name || '');
                
                const price = parseFloat(
                  prod.price || 
                  prod.base_price || 
                  prod.current_price || 
                  prod.selling_price || 
                  prod.unit_price || 
                  0
                );
                const stock = prod.quantity ?? prod.stock ?? prod.available_quantity ?? '—';
                
                const expiredDate = prod.expiry_date ? new Date(prod.expiry_date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                }) : 'Unknown';

                return (
                  <TouchableOpacity
                    key={prod.id || prod._id || `expired-${idx}`}
                    style={styles.expiredProdCard}
                    activeOpacity={0.75}
                    onPress={() => navigation.navigate('EditProduct', { product: prod })}
                  >
                    <View style={styles.prodImageBox}>
                      {imageUri ? (
                        <Image
                          source={{ uri: imageUri }}
                          style={[styles.prodImage, styles.prodImageExpired]}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.prodImage, styles.prodImagePlaceholder, styles.prodImageExpired]}>
                          <Ionicons name="image-outline" size={28} color="#ccc" />
                        </View>
                      )}
                      <View style={styles.expiredOverlay}>
                        <Ionicons name="time-outline" size={14} color="#fff" />
                        <Text style={styles.expiredText}>EXPIRED</Text>
                      </View>
                    </View>

                    <View style={styles.prodDetails}>
                      <Text style={styles.prodName} numberOfLines={1}>
                        {prod.name || prod.product_name || 'Product'}
                      </Text>
                      <Text style={styles.expiredDate} numberOfLines={1}>
                        Expired: {expiredDate}
                      </Text>

                      <View style={styles.prodMetaRow}>
                        <Text style={[styles.prodPrice, { color: '#9C27B0' }]}>₹{price.toFixed(2)}/kg</Text>
                        <View style={styles.expiredStatusChip}>
                          <Text style={styles.expiredStatusText}>EXPIRED</Text>
                        </View>
                      </View>

                      <View style={styles.prodStockRow}>
                        <Ionicons name="cube-outline" size={12} color="#9C27B0" />
                        <Text style={[styles.prodStockText, { color: '#9C27B0' }]}>Stock: {stock}</Text>
                      </View>
                    </View>

                    <View style={styles.expiredActions}>
                      <TouchableOpacity 
                        style={styles.expiredActionBtn}
                        onPress={() => navigation.navigate('EditProduct', { product: prod })}
                      >
                        <Ionicons name="create-outline" size={16} color="#9C27B0" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* See all expired products link */}
              {expiredProducts.length > 4 && (
                <TouchableOpacity
                  style={styles.expiredSeeAllBtn}
                  onPress={() => navigation.navigate('EditProduct', { filter: 'expired' })}
                  activeOpacity={0.75}
                >
                  <Text style={styles.expiredSeeAllText}>See all {expiredProducts.length} expired products</Text>
                  <Ionicons name="arrow-forward" size={14} color="#9C27B0" />
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {quickActions.map((action, idx) => (
              <TouchableOpacity key={idx} style={styles.actionCard} onPress={action.onPress} activeOpacity={0.7}>
                <View style={[styles.actionIcon, { backgroundColor: action.color + '18' }]}>
                  <Ionicons name={action.icon} size={26} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Orders */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Orders</Text>
            {orders.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            )}
          </View>
          {recentOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No orders yet</Text>
            </View>
          ) : (
            recentOrders.map((order, idx) => {
              const statusColor = STATUS_COLORS[order.status] || '#888';
              const productName = order.product?.name || order.Product?.name || order.product_name || 'Product Order';
              const customerName = order.customer?.name || order.customer_name || order.user?.full_name || order.user?.name || 'Customer';
              const orderAmount = parseFloat(order.total_amount || order.total_price || order.total || 0);
              const orderDate = order.created_at || order.date || order.order_date;
              
              console.log('[FarmerHome] Order data for', idx, ':', {
                productName,
                customerName,
                orderAmount,
                orderDate,
                status: order.status,
                originalOrder: order
              });
              
              return (
                <TouchableOpacity
                  key={order.id || order.order_id || idx}
                  style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: statusColor }]}
                  onPress={() =>
                    navigation.navigate('FarmerOrderTracking', {
                      orderId: order.id || order.order_id,
                      order,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.orderTop}>
                    <Text style={styles.orderId} numberOfLines={1}>
                      {productName}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                        {(order.status || '').replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.orderCustomer} numberOfLines={1}>
                    {customerName}
                  </Text>
                  <View style={styles.orderBottom}>
                    <Text style={styles.orderAmount}>
                      ₹{orderAmount.toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.orderDate}>
                      {orderDate
                        ? new Date(orderDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </Animated.ScrollView>

      {/* Toast */}
      <ToastMessage ref={toastRef} />
    </View>
  );
};

export default FarmerHome;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },

  /* Header */
  header: { paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  farmerName: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 2 },
  profileBtn: { padding: 4 },

  /* Stats */
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginTop: 16 },
  statCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    margin: 6,
    borderRadius: 16,
    padding: 16,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 8 },
  statTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },

  /* Section */
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1B5E20', marginBottom: 12, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: '#43A047' },
  seeAll: { fontSize: 14, color: '#4CAF50', fontWeight: '600' },

  /* Product Status */
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  statusPill: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statusDotBig: { width: 10, height: 10, borderRadius: 5, marginBottom: 6 },
  statusLabel: { fontSize: 12, color: '#555', marginBottom: 4 },
  statusCount: { fontSize: 20, fontWeight: '700' },

  /* Individual Product Cards */
  prodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  prodImageBox: { position: 'relative', marginRight: 12 },
  prodImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  prodImageExpired: {
    opacity: 0.6,
  },
  prodImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  prodStatusDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  expiredOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(156, 39, 176, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    gap: 2,
  },
  expiredText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* Expired Products Section */
  expiredSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expiredBadge: {
    backgroundColor: '#9C27B0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  expiredBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  expiredWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6F00',
    gap: 8,
  },
  expiredWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#E65100',
    lineHeight: 18,
  },
  expiredProdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#9C27B0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#9C27B0',
  },
  expiredDate: {
    fontSize: 11,
    color: '#9C27B0',
    marginBottom: 6,
    fontWeight: '600',
  },
  expiredStatusChip: {
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  expiredStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9C27B0',
  },
  expiredActions: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3E5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expiredSeeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#CE93D8',
    borderRadius: 12,
    marginTop: 4,
    gap: 6,
    backgroundColor: '#F3E5F5',
  },
  expiredSeeAllText: {
    fontSize: 14,
    color: '#9C27B0',
    fontWeight: '600',
  },
  prodDetails: { flex: 1 },
  prodName: { fontSize: 15, fontWeight: '700', color: '#212121', marginBottom: 2 },
  prodCategory: { fontSize: 12, color: '#888', marginBottom: 6 },
  prodMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  prodPrice: { fontSize: 14, fontWeight: '700', color: '#1B5E20' },
  prodStatusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  prodStatusText: { fontSize: 11, fontWeight: '700' },
  prodStockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prodStockText: { fontSize: 12, color: '#607D8B', marginLeft: 3 },
  prodRating: { fontSize: 12, color: '#F57F17', marginLeft: 8 },
  prodSeeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    borderRadius: 12,
    marginTop: 4,
    gap: 6,
  },
  prodSeeAllText: { fontSize: 14, color: '#4CAF50', fontWeight: '600' },

  /* Quick Actions */
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  actionIcon: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#333' },

  /* Recent Orders */
  emptyBox: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { marginTop: 8, fontSize: 14, color: '#999' },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 15, fontWeight: '700', color: '#333' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  orderCustomer: { fontSize: 13, color: '#666', marginTop: 6 },
  orderBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' },
  orderAmount: { fontSize: 16, fontWeight: '700', color: '#1B5E20' },
  orderDate: { fontSize: 12, color: '#999' },

  /* ── Weekly Recommendations ─────────── */
  recSection: { marginTop: 22, marginHorizontal: 0 },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 14,
  },
  recHeaderLeft: { flex: 1 },
  recTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  recSubtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3 },
  recBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  recBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  recList: { paddingHorizontal: 16, paddingBottom: 10 },
  recLoader: { alignItems: 'center', paddingVertical: 30 },
  recLoaderText: { color: '#888', fontSize: 13, marginTop: 10 },
  recError: { alignItems: 'center', paddingVertical: 28 },
  recErrorText: { color: '#F44336', fontSize: 14, marginTop: 8 },
  recRetry: { color: '#4CAF50', fontSize: 13, marginTop: 4, textDecorationLine: 'underline' },
  recEmpty: { alignItems: 'center', paddingVertical: 28 },
  recEmptyText: { color: '#aaa', fontSize: 14, marginTop: 8 },

  /* ── Card ── */
  recCard: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 22,
    marginRight: 16,
    elevation: 6,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  recImgContainer: { width: '100%', height: 150, position: 'relative' },
  recImg: { width: '100%', height: '100%' },
  recImgGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 65 },
  gradeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  gradeBadgeText: { fontSize: 11, fontWeight: '700' },
  categoryChip: {
    position: 'absolute',
    bottom: 9,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  categoryChipText: { color: '#fff', fontSize: 10, fontWeight: '600' },

  recCardBody: { padding: 12 },
  recProductName: { fontSize: 16, fontWeight: '800', color: '#1B5E20', marginBottom: 10 },

  /* Dual price block */
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F8E9',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  priceItem: { flex: 1, alignItems: 'center' },
  priceLabelText: { fontSize: 10, color: '#777', marginBottom: 2, fontWeight: '500' },
  priceValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  priceRupee: { fontSize: 12, fontWeight: '700', color: '#2E7D32', marginRight: 1 },
  priceValueText: { fontSize: 15, fontWeight: '800', color: '#1B5E20' },
  priceDivider: { width: 1, height: 30, backgroundColor: '#C8E6C9', marginHorizontal: 6 },

  /* Meta row */
  recMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  marketBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  marketBadgeText: { fontSize: 10, fontWeight: '700' },
  suitScore: { fontSize: 11, fontWeight: '700', color: '#555' },

  /* Score bar */
  scoreBarBg: {
    height: 5,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  scoreBarFill: { height: '100%', borderRadius: 3 },

  /* Tags */
  alreadyPosted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  alreadyPostedText: { fontSize: 11, color: '#2E7D32', fontWeight: '700', marginLeft: 4 },
  newOpportunity: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  newOpportunityText: { fontSize: 11, color: '#E65100', fontWeight: '700', marginLeft: 4 },

  /* ── Demand-Based Price Box (recommendation card — already listed products) ── */
  demandPriceBox: {
    backgroundColor: '#F0F4FF',
    borderRadius: 10,
    padding: 9,
    borderWidth: 1,
    borderColor: '#C5CAE9',
    marginTop: 4,
  },
  demandPriceHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  demandPriceLabel: { fontSize: 10, color: '#3949AB', fontWeight: '800' },
  demandActionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  demandActionText: { fontSize: 9, fontWeight: '800' },
  demandPriceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5,
  },
  demandCurrPrice: { fontSize: 12, color: '#546E7A', fontWeight: '600' },
  demandSuggestedPrice: { fontSize: 13, fontWeight: '800' },
  demandChangeText: { fontSize: 11, fontWeight: '700', marginLeft: 'auto' },
  demandMetaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5,
  },
  demandLevelChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  demandLevelText: { fontSize: 9, fontWeight: '800' },
  demandSeasonText: { fontSize: 10, color: '#78909C' },
  demandRecText: { fontSize: 10.5, color: '#4E342E', lineHeight: 15, fontStyle: 'italic' },

  /* ── Pricing Boxes (Demand + Seasonal) ── */
  pricingBox: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginTop: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  pricingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pricingBannerLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  pricingBannerTitle: {
    color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.3,
  },
  pricingBannerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  pricingBannerBadgeText: { fontSize: 9, fontWeight: '800' },
  pricingBannerBadgeWhite: { fontSize: 10, fontWeight: '800', color: '#fff' },
  pricingBody: {
    backgroundColor: '#fff', padding: 10,
  },
  pricingPriceBlock: { alignItems: 'center', flex: 1 },
  pricingPriceLabel: { fontSize: 9, color: '#90A4AE', fontWeight: '600', marginBottom: 2 },
  pricingPriceCurrent: { fontSize: 13, fontWeight: '700', color: '#546E7A' },
  pricingPriceSuggested: { fontSize: 14, fontWeight: '800' },
  pricingChangePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, marginLeft: 4,
  },
  pricingChangeText: { fontSize: 10, fontWeight: '800' },
  pricingRecText: {
    fontSize: 10.5, color: '#4E342E', lineHeight: 15, fontStyle: 'italic', marginTop: 7,
  },

  /* ── Period Tabs ── */
  periodTabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#F1F8E9',
    borderRadius: 14,
    padding: 4,
  },
  periodTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 11,
  },
  periodTabActive: {
    backgroundColor: '#2E7D32',
    elevation: 3,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  periodTabLabel: { fontSize: 12, fontWeight: '700', color: '#555' },
  periodTabLabelActive: { color: '#fff' },
  periodTabSub: { fontSize: 9, color: '#999', marginTop: 2 },
  periodTabSubActive: { color: 'rgba(255,255,255,0.75)' },

  /* ── Price Prediction Section ─────────────────────────────── */
  pricePredSection: { marginTop: 22, marginHorizontal: 0 },
  pricePredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 14,
  },
  pricePredTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  pricePredSubtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3 },
  pricePredSeeAll: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10,
    paddingVertical: 5, borderRadius: 14,
  },
  pricePredSeeAllText: { color: 'rgba(255,255,255,0.95)', fontSize: 11, fontWeight: '700' },
  pricePredBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  pricePredBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pricePredList: { paddingHorizontal: 16, paddingBottom: 16 },
  pricePredLoader: { alignItems: 'center', paddingVertical: 30 },
  pricePredLoaderText: { color: '#888', fontSize: 13, marginTop: 10 },
  pricePredError: { alignItems: 'center', paddingVertical: 28 },
  pricePredErrorText: { color: '#FF7043', fontSize: 14, marginTop: 8 },
  pricePredRetry: { color: '#1976D2', fontSize: 13, marginTop: 4, textDecorationLine: 'underline' },
  pricePredEmpty: { alignItems: 'center', paddingVertical: 28 },
  pricePredEmptyText: { color: '#aaa', fontSize: 14, marginTop: 8 },

  /* ── Price Prediction Card (full-width, minimal) ── */
  pricePredCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    elevation: 3,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
  },
  ppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ppProductName:    { fontSize: 16, fontWeight: '800', color: '#1A237E', flex: 1, marginRight: 8 },
  ppActionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, flexShrink: 0,
  },
  ppActionBadgeText: { fontSize: 12, fontWeight: '800' },
  ppHint:           { fontSize: 12, fontWeight: '500', marginBottom: 10, lineHeight: 17 },

  /* Price bar */
  ppPriceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  ppPriceBarSide:   { flex: 1 },
  ppPriceBarLabel:  { fontSize: 10, color: '#78909C', fontWeight: '600', marginBottom: 2 },
  ppPriceBarVal:    { fontSize: 18, fontWeight: '900', color: '#263238' },
  ppPriceBarMid:    { flex: 1, alignItems: 'center', gap: 3 },
  ppPriceBarChange: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  /* Chips row */
  ppChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  ppChip: {
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, alignSelf: 'flex-start',
  },
  ppChipText: { fontSize: 11, fontWeight: '700' },

  /* AI tip */
  ppTip: {
    fontSize: 12, color: '#4E342E', lineHeight: 17,
    backgroundColor: '#FFF8E1', borderRadius: 8,
    padding: 9, fontWeight: '500',
  },
});
