/**
 * OrderTracking.js
 * Full 10-step order tracking for transporter view.
 *
 * Steps:
 *  1. PENDING           - Customer ordered
 *  2. ASSIGNED          - Farmer accepted and transporters assigned
 *  3. PICKUP_ASSIGNED   - Source transporter assigned pickup delivery person
 *  4. PICKED_UP         - Pickup delivery person picked up from farmer
 *  5. RECEIVED          - Source transporter received at source office
 *  6. SHIPPED           - Source transporter assigned vehicle and shipped
 *  7. IN_TRANSIT        - Package moving to destination transporter
 *  8. REACHED_DESTINATION - Destination transporter received package
 *  9. OUT_FOR_DELIVERY  - Destination transporter assigned final delivery person
 * 10. DELIVERED         - Delivery person delivered to customer
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Animated,
  Easing,
  StatusBar,
  Dimensions,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { BASE_URL } from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import { getOrderById } from '../../services/orderService';

const TRACKING_STAGES = [
  { key: 'PENDING',              label: 'Order Placed',            icon: 'cart-outline',                  mc: null,                    color: '#FF9800' },
  { key: 'CONFIRMED',            label: 'Farmer Accepted',         icon: 'checkmark-circle-outline',      mc: null,                    color: '#2196F3' },
  { key: 'ASSIGNED',             label: 'Transporters Assigned',   icon: null,                            mc: 'truck-check-outline',   color: '#9C27B0' },
  { key: 'PICKUP_ASSIGNED',      label: 'Pickup Person Assigned',  icon: 'person-outline',                mc: null,                    color: '#FF5722' },
  { key: 'PICKUP_IN_PROGRESS',   label: 'Pickup In Progress',      icon: 'bicycle-outline',               mc: null,                    color: '#00BCD4' },
  { key: 'PICKED_UP',            label: 'Picked Up from Farmer',   icon: null,                            mc: 'store-check-outline',   color: '#00897B' },
  { key: 'RECEIVED',             label: 'Received at Source Office', icon: null,                           mc: 'package-variant-closed', color: '#00897B' },
  { key: 'SHIPPED',              label: 'Shipped from Source',     icon: null,                            mc: 'cube-send',             color: '#3F51B5' },
  { key: 'IN_TRANSIT',           label: 'In Transit to Destination', icon: null,                           mc: 'truck-fast-outline',    color: '#3F51B5' },
  { key: 'REACHED_DESTINATION',  label: 'Received at Destination', icon: null,                            mc: 'warehouse',             color: '#673AB7' },
  { key: 'OUT_FOR_DELIVERY',     label: 'Out for Delivery',        icon: 'bicycle-outline',               mc: null,                    color: '#00BCD4' },
  { key: 'DELIVERED',            label: 'Delivered to Customer',   icon: 'checkmark-done-circle-outline', mc: null,                    color: '#4CAF50' },
];

const STATUS_INDEX = {
  PENDING: 0, PLACED: 0,
  CONFIRMED: 1, ACCEPTED: 1,
  ASSIGNED: 2,
  PICKUP_ASSIGNED: 3,
  PICKUP_IN_PROGRESS: 4,
  PICKED_UP: 5,
  RECEIVED: 6,
  SHIPPED: 7,
  IN_TRANSIT: 8,
  REACHED_DESTINATION: 9,
  OUT_FOR_DELIVERY: 10,
  DELIVERED: 11,
  COMPLETED: 11,
  CANCELLED: -1,
};

const normalizeStatusToken = (status) => {
  const s = String(status || '').toUpperCase();
  if (s === 'OUT_OF_DELIVERY') return 'OUT_FOR_DELIVERY';
  return s;
};

const hasDestinationTransitEvidence = (trackingEntries = []) => {
  if (!Array.isArray(trackingEntries) || trackingEntries.length === 0) return false;
  return trackingEntries.some((entry) => {
    const s = normalizeStatusToken(entry?.status || entry?.current_status);
    return ['IN_TRANSIT', 'REACHED_DESTINATION', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(s);
  });
};

const resolveTrackingStatus = (status, trackingEntries = [], order = null) => {
  const normalized = normalizeStatusToken(status);

  if (normalized === 'RECEIVED') {
    const transporterRole = String(order?.transporter_role || '').toUpperCase();
    const destinationAssigned = Boolean(order?.destination_transporter_id || order?.delivery_transporter_id);
    if (hasDestinationTransitEvidence(trackingEntries) || transporterRole === 'DELIVERY' || destinationAssigned) {
      return 'REACHED_DESTINATION';
    }
  }

  return normalized;
};

const getStageIndex = (status) =>
  STATUS_INDEX[(status || '').toUpperCase()] ?? 0;

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatCurrency = (a) => '₹' + (parseFloat(a) || 0).toFixed(2);

const toAbsoluteImageUrl = (value) => {
  if (!value || typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:image/')) {
    return raw;
  }

  const origin = String(BASE_URL || '').replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  if (!origin) return raw;

  if (raw.startsWith('/')) {
    return `${origin}${raw}`;
  }

  return `${origin}/${raw}`;
};

const formatAddress = (rawAddress) => {
  if (!rawAddress) return null;

  let parsed = rawAddress;
  if (typeof rawAddress === 'string') {
    try {
      parsed = JSON.parse(rawAddress);
    } catch {
      parsed = rawAddress;
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    return [
      parsed.address_line,
      parsed.city,
      parsed.district,
      parsed.state,
      parsed.pincode,
      parsed.zone,
    ].filter(Boolean).join(', ');
  }

  return String(parsed);
};

const pickFirst = (...values) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

const extractEntityPayload = (payload, keys = []) => {
  if (!payload) return null;
  for (const key of keys) {
    if (payload?.[key]) return payload[key];
  }
  if (payload?.data) {
    for (const key of keys) {
      if (payload.data?.[key]) return payload.data[key];
    }
    if (typeof payload.data === 'object') return payload.data;
  }
  return typeof payload === 'object' ? payload : null;
};

const pickEntity = (obj, keys = []) => {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    if (obj?.[key]) return obj[key];
  }
  return null;
};

const normalizeProfile = (raw) => {
  if (!raw || typeof raw !== 'object') return {};
  return {
    name: pickFirst(raw.name, raw.full_name, raw.username, raw.user_name),
    phone: pickFirst(raw.mobile_number, raw.phone, raw.mobile, raw.phone_number),
    image_url: pickFirst(raw.image_url, raw.profile_image, raw.image, raw.avatar, raw.profile),
    address: pickFirst(raw.address, raw.location),
    zone: pickFirst(raw.zone),
    district: pickFirst(raw.district),
    state: pickFirst(raw.state),
    vehicle_type: pickFirst(raw.vehicle_type),
    vehicle_number: pickFirst(raw.vehicle_number),
  };
};

const fetchProfileByEndpoints = async (endpoints, entityKeys = []) => {
  for (const endpoint of endpoints) {
    if (!endpoint) continue;
    try {
      const res = await api.get(endpoint);
      const payload = res?.data?.data || res?.data || null;
      const entity = extractEntityPayload(payload, entityKeys);
      if (entity && typeof entity === 'object') {
        return normalizeProfile(entity);
      }
    } catch {
      // Try next endpoint
    }
  }
  return {};
};

const fetchFarmerProfileFromProduct = async (productId) => {
  if (!productId) return {};
  try {
    const res = await api.get(`/products/${productId}`);
    const payload = res?.data?.data || res?.data || {};
    const product = payload?.product || payload;
    const farmer = product?.farmer || product?.Farmer;
    return normalizeProfile(farmer);
  } catch {
    return {};
  }
};

const fetchFarmerMeProfile = async () => {
  try {
    const res = await api.get('/farmers/me');
    const payload = res?.data?.data || res?.data || {};
    const farmer = payload?.farmer || payload?.user || payload;
    return normalizeProfile(farmer);
  } catch {
    return {};
  }
};

const enrichOrderParticipants = async (order) => {
  if (!order) return order;

  const customerId = order?.customer_id || order?.customer?.customer_id;
  const deliveryPersonId = order?.delivery_person_id || order?.delivery_person?.delivery_person_id;
  const sourceTransporterId = order?.source_transporter_id || order?.source_transporter?.transporter_id;
  const destinationTransporterId = order?.destination_transporter_id || order?.destination_transporter?.transporter_id;
  const farmerId =
    order?.farmer_id ||
    order?.farmer?.farmer_id ||
    order?.product?.farmer_id ||
    order?.Product?.farmer_id;
  const productId = order?.product_id || order?.product?.product_id || order?.Product?.product_id;

  const [customerProfile, deliveryProfile, srcTransporterProfile, dstTransporterProfile, farmerProfile, farmerProfileFromProduct, farmerMeProfile] = await Promise.all([
    customerId
      ? fetchProfileByEndpoints([
          `/customers/${customerId}`,
          `/customer/${customerId}`,
          `/admin/customers/${customerId}`,
        ], ['customer', 'user'])
      : Promise.resolve({}),
    deliveryPersonId
      ? fetchProfileByEndpoints([
          `/delivery-persons/${deliveryPersonId}`,
          `/delivery-person/${deliveryPersonId}`,
          `/admin/delivery-persons/${deliveryPersonId}`,
        ], ['delivery_person', 'deliveryPerson', 'user'])
      : Promise.resolve({}),
    sourceTransporterId
      ? fetchProfileByEndpoints([
          `/transporters/${sourceTransporterId}`,
          `/admin/transporters/${sourceTransporterId}`,
          `/farmers/transporters/${sourceTransporterId}`,
        ], ['transporter', 'user'])
      : Promise.resolve({}),
    destinationTransporterId
      ? fetchProfileByEndpoints([
          `/transporters/${destinationTransporterId}`,
          `/admin/transporters/${destinationTransporterId}`,
          `/farmers/transporters/${destinationTransporterId}`,
        ], ['transporter', 'user'])
      : Promise.resolve({}),
    farmerId
      ? fetchProfileByEndpoints([
          `/farmers/${farmerId}`,
          `/admin/farmers/${farmerId}`,
        ], ['farmer', 'user'])
      : Promise.resolve({}),
    fetchFarmerProfileFromProduct(productId),
    fetchFarmerMeProfile(),
  ]);

  return {
    ...order,
    farmer: {
      ...farmerMeProfile,
      ...farmerProfileFromProduct,
      ...farmerProfile,
      ...(order?.farmer || {}),
    },
    customer: { ...(order?.customer || {}), ...customerProfile },
    delivery_person: { ...(order?.delivery_person || {}), ...deliveryProfile },
    source_transporter: { ...(order?.source_transporter || {}), ...srcTransporterProfile },
    destination_transporter: { ...(order?.destination_transporter || {}), ...dstTransporterProfile },
  };
};

const getProductImage = (item) => {
  const p = item?.product || item;
  if (!p) return null;
  const imgs = p.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const primary = imgs.find((i) => i?.is_primary) || imgs[0];
    return typeof primary === 'string' ? primary : primary?.image_url || primary?.url || null;
  }
  return p.image_url || p.image || null;
};

const getPackingProofImages = (order) => ({
  packing:
    order?.packing_image_url ||
    order?.packing_photo_url ||
    order?.package_image_url ||
    order?.package_photo_url ||
    order?.packing?.packing_image_url ||
    null,
  bill:
    order?.bill_paste_image_url ||
    order?.bill_image_url ||
    order?.bill_photo_url ||
    order?.bill_copy_url ||
    order?.packing?.bill_image_url ||
    order?.packing?.bill_paste_image_url ||
    null,
});

  const isTerminalOrderStatus = (status) => {
    const s = String(status || '').toUpperCase();
    return ['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(s);
  };

/* --------------------------------------------------------------------------
 * ANIMATED VEHICLE
 * ------------------------------------------------------------------------ */
const AnimatedVehicle = ({ progress }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: progress, duration: 800,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -3, duration: 400, useNativeDriver: false }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
      ])
    ).start();
  }, [progress]);

  const left = slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '90%'] });

  return (
    <View style={trackStyles.vehicleTrack}>
      <View style={trackStyles.trackLine}>
        <Animated.View style={[trackStyles.trackFill, { width: slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      <Animated.View style={[trackStyles.vehicleIcon, { left, transform: [{ translateY: bounceAnim }] }]}>
        <MaterialCommunityIcons name="truck-fast" size={28} color="#1B5E20" />
      </Animated.View>
    </View>
  );
};

/* ── Timeline Step ────────────────────────────────────────── */
const TimelineStep = ({ stage, index, currentIndex, isLast }) => {
  const isCompleted = index <= currentIndex;
  const isActive = index === currentIndex;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.15, duration: 600, useNativeDriver: false }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
        ])
      ).start();
    }
  }, [isActive]);

  return (
    <View style={s.stepRow}>
      <View style={s.stepLeft}>
        <Animated.View style={[
          s.stepDot,
          isCompleted && { backgroundColor: stage.color },
          isActive && { transform: [{ scale: scaleAnim }], borderWidth: 3, borderColor: stage.color + '40' },
        ]}>
          {stage.mc
            ? <MaterialCommunityIcons name={stage.mc} size={16} color={isCompleted ? '#fff' : '#bbb'} />
            : <Ionicons name={isCompleted ? stage.icon.replace('-outline', '') : stage.icon} size={16} color={isCompleted ? '#fff' : '#bbb'} />
          }
        </Animated.View>
        {!isLast && (
          <View style={[s.connector, isCompleted && index < currentIndex && { backgroundColor: stage.color }]} />
        )}
      </View>
      <View style={[s.stepContent, isActive && s.stepContentActive]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.stepLabel, isActive && { color: stage.color, fontWeight: '700' }]}>
            {stage.label}
          </Text>
          {isActive && <Text style={[s.stepSub, { color: stage.color }]}>Current Status</Text>}
          {isCompleted && !isActive && <Text style={[s.stepSub, { color: '#4CAF50' }]}>Completed</Text>}
          {!isCompleted && !isActive && <Text style={[s.stepSub, { color: '#bbb' }]}>Upcoming</Text>}
        </View>
      </View>
    </View>
  );
};

/* ── Info Card ────────────────────────────────────────────── */
const InfoCard = ({ icon, mc, title, name, details, phone, image, iconColor }) => {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const resolvedImage = toAbsoluteImageUrl(image);
  const showImage = Boolean(resolvedImage && !imageLoadFailed);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [resolvedImage]);

  return (
  <View style={s.infoCard}>
    {showImage ? (
      <Image
        source={{ uri: optimizeImageUrl(resolvedImage, { width: 44, height: 44 }) }}
        style={s.infoAvatarImg}
        onError={() => setImageLoadFailed(true)}
      />
    ) : (
      <View style={[s.infoIconWrap, iconColor ? { backgroundColor: iconColor + '15' } : null]}>
        {mc
          ? <MaterialCommunityIcons name={mc} size={22} color={iconColor || '#1B5E20'} />
          : <Ionicons name={icon} size={22} color={iconColor || '#1B5E20'} />
        }
      </View>
    )}
    <View style={{ flex: 1 }}>
      <Text style={s.infoTitle}>{title}</Text>
      <Text style={s.infoName}>{name || 'N/A'}</Text>
      {details ? <Text style={s.infoDetail}>{details}</Text> : null}
    </View>
    {phone && (
      <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL('tel:' + phone)}>
        <Ionicons name="call-outline" size={18} color={iconColor || '#1B5E20'} />
      </TouchableOpacity>
    )}
  </View>
);
};

/* ── Main Component ───────────────────────────────────────── */
const OrderTracking = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { orderId, order: initialOrder } = route.params || {};
  const [order, setOrder] = useState(initialOrder || null);
  const [trackingEntries, setTrackingEntries] = useState([]);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef(null);

  const effectiveStatus = resolveTrackingStatus(order?.current_status || order?.status, trackingEntries, order);
  const currentIndex = getStageIndex(effectiveStatus);
  const isCancelled = effectiveStatus === 'CANCELLED';
  const progress = isCancelled ? 0 : Math.min(1, currentIndex / (TRACKING_STAGES.length - 1));
  const currentStatus = String(effectiveStatus || '').toUpperCase();
  const normalizedStatus = currentStatus;
  const nextStatusMap = {
    SHIPPED: 'IN_TRANSIT',
    IN_TRANSIT: 'REACHED_DESTINATION',
    REACHED_DESTINATION: 'OUT_FOR_DELIVERY',
  };
  const nextStatus = nextStatusMap[normalizedStatus] || null;

  const fetchOrder = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const id = orderId || order?.order_id || order?.id;
      if (!id) return;

      // Try stable order endpoints first, keep /track as optional fallback.
      let o = null;
      const endpoints = [
        `/farmers/orders/${id}/track`,
        `/orders/details/${id}`,
        `/transporters/orders/${id}`,
        `/transporters/orders/${id}/track`,
        `/orders/${id}`,
      ];
      for (const endpoint of endpoints) {
        try {
          const res = await api.get(endpoint);
          const payload = res.data?.data || res.data?.order || res.data;
          const candidate = payload?.order || payload;
          if (candidate && (candidate.order_id || candidate.id)) {
            const candidateProduct = pickEntity(candidate, ['product', 'Product']);
            const candidateFarmer =
              pickEntity(candidate, ['farmer', 'Farmer']) ||
              pickEntity(candidateProduct, ['farmer', 'Farmer']);
            const candidateCustomer = pickEntity(candidate, ['customer', 'Customer']);
            const candidateDelivery = pickEntity(candidate, ['delivery_person', 'DeliveryPerson', 'assigned_delivery_person']);
            const candidateSourceTransporter = pickEntity(candidate, ['source_transporter', 'sourceTransporter', 'SourceTransporter']);
            const candidateDestinationTransporter = pickEntity(candidate, ['destination_transporter', 'destinationTransporter', 'DestinationTransporter']);

            // Merge carefully to not lose nested objects from initialOrder
            o = { 
              ...(initialOrder || {}), 
              ...candidate,
              product: candidateProduct || initialOrder?.product || initialOrder?.Product,
              farmer: candidateFarmer || initialOrder?.farmer || initialOrder?.Farmer,
              customer: candidateCustomer || initialOrder?.customer || initialOrder?.Customer,
              delivery_person: candidateDelivery || initialOrder?.delivery_person || initialOrder?.DeliveryPerson,
              source_transporter: candidateSourceTransporter || initialOrder?.source_transporter || initialOrder?.SourceTransporter,
              destination_transporter: candidateDestinationTransporter || initialOrder?.destination_transporter || initialOrder?.DestinationTransporter
            };
            break;
          }
        } catch (_) {
          // continue fallback chain
        }
      }

      if (!o) {
        const data = await getOrderById(id);
        const candidate = data?.data || data?.order || data;
        if (candidate) {
          const candidateProduct = pickEntity(candidate, ['product', 'Product']);
          const candidateFarmer =
            pickEntity(candidate, ['farmer', 'Farmer']) ||
            pickEntity(candidateProduct, ['farmer', 'Farmer']);
          const candidateCustomer = pickEntity(candidate, ['customer', 'Customer']);
          const candidateDelivery = pickEntity(candidate, ['delivery_person', 'DeliveryPerson', 'assigned_delivery_person']);
          const candidateSourceTransporter = pickEntity(candidate, ['source_transporter', 'sourceTransporter', 'SourceTransporter']);
          const candidateDestinationTransporter = pickEntity(candidate, ['destination_transporter', 'destinationTransporter', 'DestinationTransporter']);

          o = { 
            ...(initialOrder || {}), 
            ...candidate,
            product: candidateProduct || initialOrder?.product || initialOrder?.Product,
            farmer: candidateFarmer || initialOrder?.farmer || initialOrder?.Farmer,
            customer: candidateCustomer || initialOrder?.customer || initialOrder?.Customer,
            delivery_person: candidateDelivery || initialOrder?.delivery_person || initialOrder?.DeliveryPerson,
            source_transporter: candidateSourceTransporter || initialOrder?.source_transporter || initialOrder?.SourceTransporter,
            destination_transporter: candidateDestinationTransporter || initialOrder?.destination_transporter || initialOrder?.DestinationTransporter
          };
        }
      }

      if (!o && initialOrder) {
        // Keep route-provided order as source of truth if detail fetch is unavailable.
        o = initialOrder;
      }

      if (o) {
        const enrichedOrder = await enrichOrderParticipants(o);
        setOrder(enrichedOrder);
      }

      try {
        const trackRes = await api.get(`/orders/tracking/${id}`);
        const trackPayload = trackRes.data?.data || trackRes.data?.tracking || trackRes.data || [];
        setTrackingEntries(Array.isArray(trackPayload) ? trackPayload : []);
      } catch {
        setTrackingEntries([]);
      }

      setError(null);
    } catch (e) {
      if (!initialOrder) {
        console.error('[OrderTracking] Fetch tracking error:', e.message);
      } else {
        console.warn('[OrderTracking] Detail refresh skipped:', e?.message || 'Failed to refresh order details');
      }
      if (!order) setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (initialOrder) {
      console.log('[OrderTracking] Using route order data:', JSON.stringify(initialOrder, null, 2));
      setOrder(initialOrder);
      setLoading(false);
      if (!isTerminalOrderStatus(initialOrder?.current_status || initialOrder?.status)) {
        fetchOrder(true);
      }
      return;
    }

    fetchOrder();
  }, []);

  useEffect(() => {
    if (isTerminalOrderStatus(order?.current_status || order?.status)) {
      return;
    }
    intervalRef.current = setInterval(() => fetchOrder(true), 40000);
    return () => clearInterval(intervalRef.current);
  }, [fetchOrder]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress, duration: 1000,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [progress]);

  const items = order?.items || order?.order_items || [];
  const productName = order?.product_name || order?.product?.name || items[0]?.product?.name || items[0]?.product_name || 'Product';
  const farmer =
    order?.farmer ||
    order?.Farmer ||
    order?.product?.farmer ||
    order?.product?.Farmer ||
    order?.Product?.farmer ||
    order?.Product?.Farmer ||
    items[0]?.farmer ||
    items[0]?.product?.farmer ||
    {};
  const customer = order?.customer || order?.Customer || order?.buyer || {};
  const deliveryPerson = order?.delivery_person || order?.DeliveryPerson || order?.assigned_delivery_person || {};
  const srcTransporter = order?.source_transporter || order?.sourceTransporter || order?.SourceTransporter || {};
  const dstTransporter = order?.destination_transporter || order?.destinationTransporter || order?.DestinationTransporter || {};
  const packingProof = getPackingProofImages(order);

  const farmerName =
    farmer.name ||
    farmer.full_name ||
    farmer.username ||
    order?.farmer_name ||
    (order?.farmer_id ? `Farmer #${order.farmer_id}` : 'Farmer');
  const farmerPhone = farmer.phone || farmer.mobile || farmer.mobile_number || farmer.phone_number || order?.farmer_phone;
  const farmerImage = farmer.image_url || farmer.image || farmer.profile_image || farmer.avatar || order?.farmer_image_url || null;

  const customerName = customer.name || customer.full_name || customer.username || order?.customer_name;
  const customerPhone = customer.phone || customer.mobile || customer.mobile_number || customer.phone_number || order?.customer_phone;
  const customerImage = customer.image_url || customer.image || customer.profile_image || customer.avatar || order?.customer_image_url || null;

  const deliveryPersonName =
    deliveryPerson.name ||
    deliveryPerson.full_name ||
    deliveryPerson.username ||
    order?.delivery_person_name ||
    (order?.delivery_person_id ? `Delivery Person #${order.delivery_person_id}` : 'Delivery Person');
  const deliveryPersonPhone = deliveryPerson.phone || deliveryPerson.mobile || deliveryPerson.mobile_number || deliveryPerson.phone_number || order?.delivery_person_phone;
  const deliveryPersonImage = deliveryPerson.image_url || deliveryPerson.image || deliveryPerson.profile_image || deliveryPerson.avatar || order?.delivery_person_image_url || null;

  const sourceTransporterName =
    srcTransporter.name ||
    srcTransporter.full_name ||
    order?.source_transporter_name ||
    `Transporter #${order?.source_transporter_id || srcTransporter?.transporter_id || 'N/A'}`;
  const sourceTransporterPhone = srcTransporter.phone || srcTransporter.mobile || srcTransporter.mobile_number || srcTransporter.phone_number || order?.source_transporter_phone;
  const sourceTransporterImage = srcTransporter.image_url || srcTransporter.image || srcTransporter.profile_image || srcTransporter.avatar || order?.source_transporter_image_url || null;

  const destinationTransporterName =
    dstTransporter.name ||
    dstTransporter.full_name ||
    order?.destination_transporter_name ||
    `Transporter #${order?.destination_transporter_id || dstTransporter?.transporter_id || 'N/A'}`;
  const destinationTransporterPhone = dstTransporter.phone || dstTransporter.mobile || dstTransporter.mobile_number || dstTransporter.phone_number || order?.destination_transporter_phone;
  const destinationTransporterImage = dstTransporter.image_url || dstTransporter.image || dstTransporter.profile_image || dstTransporter.avatar || order?.destination_transporter_image_url || null;

  /* -- Loading state ----------------------------------------- */
  if (loading && !order) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Track Order</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={{ color: '#888', marginTop: 12 }}>Loading tracking info...</Text>
        </View>
      </View>
    );
  }

  if (error && !order) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Track Order</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={64} color="#F44336" />
          <Text style={{ color: '#333', marginTop: 12, fontSize: 16, fontWeight: '600' }}>Unable to load</Text>
          <Text style={{ color: '#888', marginTop: 4, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity onPress={() => fetchOrder()} style={s.retryBtn}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <View style={s.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{productName}</Text>
        <TouchableOpacity onPress={() => fetchOrder(true)}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchOrder(true); }}
            colors={['#1B5E20']}
          />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* Order Info */}
        <View style={s.orderCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={s.orderIdText}>{productName}</Text>
              <Text style={s.orderDateText}>{formatDate(order?.created_at)}</Text>
            </View>
            <View style={[s.statusChip, {
              backgroundColor: isCancelled ? '#FFEBEE'
                : (TRACKING_STAGES[currentIndex]?.color || '#4CAF50') + '20',
            }]}>
              <Text style={[s.statusChipText, {
                color: isCancelled ? '#F44336'
                  : (TRACKING_STAGES[currentIndex]?.color || '#4CAF50'),
              }]}>
                {isCancelled ? 'Cancelled' : TRACKING_STAGES[currentIndex]?.label || order?.current_status}
              </Text>
            </View>
          </View>
          {order?.total_amount && (
            <Text style={s.orderTotal}>Total: {formatCurrency(order.total_amount)}</Text>
          )}
        </View>

        {/* Cancelled */}
        {isCancelled && (
          <View style={s.cancelledCard}>
            <Ionicons name="close-circle" size={48} color="#F44336" />
            <Text style={s.cancelledTitle}>Order Cancelled</Text>
          </View>
        )}

        {/* Vehicle animation */}
        {!isCancelled && <AnimatedVehicle progress={progress} />}

        {/* Progress */}
        {!isCancelled && (
          <View style={s.progressRow}>
            <Text style={s.progressLabel}>Delivery Progress</Text>
            <Text style={s.progressPercent}>{Math.round(progress * 100)}%</Text>
          </View>
        )}

        {/* Timeline */}
        {!isCancelled && (
          <View style={s.timelineCard}>
            <Text style={s.sectionTitle}>Order Timeline (10 Steps)</Text>
            {TRACKING_STAGES.map((stage, idx) => (
              <TimelineStep
                key={stage.key}
                stage={stage}
                index={idx}
                currentIndex={currentIndex}
                isLast={idx === TRACKING_STAGES.length - 1}
              />
            ))}
          </View>
        )}

        {/* Packing Proof Images */}
        {(order?.packing_image_url || order?.bill_paste_image_url) && (
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>📸 Packing Proof</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {order?.packing_image_url && (
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Image
                    source={{ uri: order.packing_image_url }}
                    style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f0f0f0' }}
                    resizeMode="cover"
                  />
                  <Text style={{ fontSize: 11, color: '#888', marginTop: 4, fontWeight: '600' }}>Packing Image</Text>
                </View>
              )}
              {order?.bill_paste_image_url && (
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Image
                    source={{ uri: order.bill_paste_image_url }}
                    style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f0f0f0' }}
                    resizeMode="cover"
                  />
                  <Text style={{ fontSize: 11, color: '#888', marginTop: 4, fontWeight: '600' }}>Bill Image</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Products */}
        {items.length > 0 && (
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>Products</Text>
            {items.map((item, idx) => {
              const img = getProductImage(item);
              return (
                <View key={idx} style={s.productRow}>
                  {img
                    ? <Image source={{ uri: optimizeImageUrl(img, { width: 64 }) }} style={s.productImg} />
                    : <View style={[s.productImg, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }]}>
                        <Ionicons name="leaf-outline" size={22} color="#aaa" />
                      </View>
                  }
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.productName} numberOfLines={1}>
                      {item.product_name || item.product?.name || 'Product'}
                    </Text>
                    <Text style={s.productMeta}>Qty: {item.quantity || 1}</Text>
                    <Text style={s.productPrice}>
                      {formatCurrency(item.total || (item.price || 0) * (item.quantity || 1))}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Farmer Info */}
        <InfoCard
          icon="leaf-outline"
          iconColor="#4CAF50"
          title="Farmer"
          name={farmerName}
          details={farmer.farm_name || farmer.location || farmer.city || formatAddress(order?.pickup_address)}
          phone={farmerPhone}
          image={farmerImage}
        />

        {/* Customer Info */}
        <InfoCard
          icon="person-outline"
          iconColor="#2196F3"
          title="Customer"
          name={customerName}
          details={formatAddress(order?.delivery_address) || customer.city || formatAddress(customer.address)}
          phone={customerPhone}
          image={customerImage}
        />

        {/* Delivery Person Info */}
        <InfoCard
          icon="bicycle-outline"
          iconColor="#9C27B0"
          title="Delivery Person"
          name={deliveryPersonName}
          details={[deliveryPerson.vehicle_number, deliveryPerson.vehicle_type].filter(Boolean).join(' • ') || order?.vehicle_number}
          phone={deliveryPersonPhone}
          image={deliveryPersonImage}
        />

        {/* Source Transporter */}
        <InfoCard
          mc="truck-delivery-outline"
          iconColor="#FF5722"
          title="Source Transporter"
          name={sourceTransporterName}
          details={[srcTransporter.address, srcTransporter.zone, srcTransporter.district, srcTransporter.state].filter(Boolean).join(', ') || srcTransporter.email}
          phone={sourceTransporterPhone}
          image={sourceTransporterImage}
        />

        {/* Destination Transporter */}
        <InfoCard
          mc="truck-check-outline"
          iconColor="#673AB7"
          title="Destination Transporter"
          name={destinationTransporterName}
          details={[dstTransporter.address, dstTransporter.zone, dstTransporter.district, dstTransporter.state].filter(Boolean).join(', ') || dstTransporter.email}
          phone={destinationTransporterPhone}
          image={destinationTransporterImage}
        />

        {(packingProof.packing || packingProof.bill) && (
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>Packed Order Proof</Text>
            <View style={{ gap: 12 }}>
              <View>
                <Text style={trackStyles.proofLabel}>Packed Parcel</Text>
                {packingProof.packing ? (
                  <Image source={{ uri: optimizeImageUrl(packingProof.packing, { width: 280 }) }} style={trackStyles.proofImage} />
                ) : (
                  <View style={[trackStyles.proofImage, trackStyles.proofEmpty]}>
                    <Text style={trackStyles.proofEmptyText}>Not uploaded</Text>
                  </View>
                )}
              </View>
              <View>
                <Text style={trackStyles.proofLabel}>Bill Pasted</Text>
                {packingProof.bill ? (
                  <Image source={{ uri: optimizeImageUrl(packingProof.bill, { width: 280 }) }} style={trackStyles.proofImage} />
                ) : (
                  <View style={[trackStyles.proofImage, trackStyles.proofEmpty]}>
                    <Text style={trackStyles.proofEmptyText}>Not uploaded</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Delivery address */}
        {(order?.delivery_address || order?.shipping_address) && (
          <View style={trackStyles.addressCard}>
            <Ionicons name="location-outline" size={20} color="#1B5E20" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={trackStyles.addressTitle}>Delivery Address</Text>
              <Text style={trackStyles.addressText}>{formatAddress(order.delivery_address || order.shipping_address)}</Text>
            </View>
          </View>
        )}

        {/* Pickup address */}
        {(order?.pickup_address || order?.farmer_address) && (
          <View style={trackStyles.addressCard}>
            <Ionicons name="location-outline" size={20} color="#FF9800" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={trackStyles.addressTitle}>Pickup Address</Text>
              <Text style={trackStyles.addressText}>{order.pickup_address || order.farmer_address}</Text>
            </View>
          </View>
        )}

        {/* QR / Bill actions */}
        <View style={trackStyles.actionRow}>
          {nextStatus && (
            <TouchableOpacity
              style={trackStyles.actionBtn}
              onPress={() => navigation.navigate('QRScan', { orderId: order?.order_id || order?.id, expectedOrderId: order?.order_id || order?.id })}
            >
              <Ionicons name="qr-code-outline" size={20} color="#1B5E20" />
              <Text style={trackStyles.actionBtnText}>Scan QR</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={trackStyles.actionBtn}
            onPress={() => navigation.navigate('BillPreview', { orderId: order?.order_id || order?.id, order })}
          >
            <Ionicons name="receipt-outline" size={20} color="#1B5E20" />
            <Text style={trackStyles.actionBtnText}>View Bill</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.refreshNote}>Auto-refreshes every 40 seconds</Text>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  headerBar: {
    backgroundColor: '#1B5E20', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1, marginHorizontal: 8 },
  retryBtn: { marginTop: 16, backgroundColor: '#1B5E20', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },

  orderCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 3 } }),
  },
  orderIdText: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  orderDateText: { fontSize: 13, color: '#888', marginTop: 2 },
  orderTotal: { fontSize: 15, fontWeight: '600', color: '#1B5E20', marginTop: 8 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusChipText: { fontSize: 12, fontWeight: '600' },

  cancelledCard: { alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 16, padding: 24, marginBottom: 16 },
  cancelledTitle: { fontSize: 18, fontWeight: '700', color: '#F44336', marginTop: 12 },

  vehicleTrack: { height: 48, marginBottom: 8, justifyContent: 'center' },
  trackLine: { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 3 },
  vehicleIcon: { position: 'absolute', top: 2 },

  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressLabel: { fontSize: 14, color: '#888' },
  progressPercent: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },

  qrBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1B5E20', borderRadius: 14, paddingVertical: 14, marginBottom: 16,
    ...Platform.select({ ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 }, android: { elevation: 4 } }),
  },
  qrBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  timelineCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 3 } }),
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 16 },

  stepRow: { flexDirection: 'row', minHeight: 60 },
  stepLeft: { alignItems: 'center', width: 44, marginRight: 8 },
  stepDot: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#E0E0E0',
    justifyContent: 'center', alignItems: 'center', zIndex: 1,
  },
  connector: { width: 3, flex: 1, backgroundColor: '#E0E0E0', marginVertical: 2 },
  stepContent: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4,
  },
  stepContentActive: { backgroundColor: '#F1F8E9' },
  stepLabel: { fontSize: 13, fontWeight: '500', color: '#666' },
  stepSub: { fontSize: 11, marginTop: 2 },

  sectionCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 3 } }),
  },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  productImg: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#f0f0f0' },
  productName: { fontSize: 14, fontWeight: '600', color: '#333' },
  productMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  productPrice: { fontSize: 14, fontWeight: '700', color: '#1B5E20', marginTop: 2 },

  infoCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, padding: 14, marginBottom: 12,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }, android: { elevation: 2 } }),
  },
  infoIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  infoAvatarImg: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#eee' },
  infoTitle: { fontSize: 11, color: '#888', fontWeight: '500', textTransform: 'uppercase' },
  infoName: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
  infoDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  addressTitle: { fontSize: 11, color: '#888', fontWeight: '500', textTransform: 'uppercase' },
  addressText: { fontSize: 14, color: '#333', marginTop: 2, lineHeight: 20 },

  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
  },
  billBtnText: { fontSize: 15, fontWeight: '600', color: '#1B5E20' },
  proofLabel: { fontSize: 13, fontWeight: '700', color: '#1B5E20', marginBottom: 8 },
  proofImage: { width: '100%', height: 150, borderRadius: 10, backgroundColor: '#EEE' },
  proofEmpty: { alignItems: 'center', justifyContent: 'center' },
  proofEmptyText: { color: '#999', fontSize: 12 },
  refreshNote: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 8 },
});

const trackStyles = s;

export default OrderTracking;
