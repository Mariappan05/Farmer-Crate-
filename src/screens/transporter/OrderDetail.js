/**
 * OrderDetail.js
 * Full order details with status timeline, assignment, and actions.
 *
 * Features:
 *   - Receives params: { orderId, order? }
 *   - Full order details: products, farmer info, customer info, delivery person info
 *   - Status timeline
 *   - Assign delivery person dropdown (if not assigned)
 *   - Status update buttons
 *   - QR code display
 *   - Call/contact buttons
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { BASE_URL } from '../../services/api';
import { optimizeImageUrl, pickImage, uploadImageToCloudinary } from '../../services/cloudinaryService';
import { useAuth } from '../../context/AuthContext';

const API_ORIGIN = BASE_URL.replace(/\/api$/i, '');

/* ── Constants ────────────────────────────────────────────── */
const TIMELINE_STAGES = [
  { key: 'PENDING',             label: 'Order Placed',           icon: 'cart',                  color: '#FF9800' },
  { key: 'CONFIRMED',           label: 'Farmer Accepted',        icon: 'checkmark-circle',      color: '#2196F3' },
  { key: 'ASSIGNED',            label: 'Transporters Assigned',  icon: 'people',                color: '#9C27B0' },
  { key: 'PICKUP_ASSIGNED',     label: 'Pickup Person Assigned', icon: 'person',                color: '#FF5722' },
  { key: 'PICKUP_IN_PROGRESS',  label: 'Pickup In Progress',     icon: 'bicycle',               color: '#00BCD4' },
  { key: 'PICKED_UP',           label: 'Picked Up from Farmer',  icon: 'cube',                  color: '#00897B' },
  { key: 'RECEIVED',            label: 'Received at Source Office', icon: 'download',            color: '#00897B' },
  { key: 'SHIPPED',             label: 'Shipped to Destination', icon: 'airplane',              color: '#3F51B5' },
  { key: 'IN_TRANSIT',          label: 'In Transit',             icon: 'airplane',              color: '#3F51B5' },
  { key: 'REACHED_DESTINATION', label: 'Received at Destination', icon: 'business',              color: '#673AB7' },
  { key: 'OUT_FOR_DELIVERY',    label: 'Out for Delivery',       icon: 'bicycle',               color: '#00BCD4' },
  { key: 'DELIVERED',           label: 'Delivered',              icon: 'checkmark-done-circle', color: '#4CAF50' },
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
  DELIVERED: 11, COMPLETED: 11,
  CANCELLED: -1,
};

const getStatusColor = (s) => {
  const u = (s || '').toUpperCase();
  if (u === 'DELIVERED' || u === 'COMPLETED') return '#4CAF50';
  if (u === 'OUT_FOR_DELIVERY') return '#00BCD4';
  if (u === 'REACHED_DESTINATION') return '#673AB7';
  if (u === 'IN_TRANSIT' || u === 'SHIPPED') return '#3F51B5';
  if (u === 'PICKED_UP') return '#00897B';
  if (u === 'PICKUP_ASSIGNED') return '#FF5722';
  if (u === 'ASSIGNED') return '#9C27B0';
  if (u === 'CONFIRMED' || u === 'ACCEPTED') return '#2196F3';
  if (u === 'CANCELLED') return '#F44336';
  return '#FF9800';
};

const formatDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const formatCurrency = (a) => '₹' + (parseFloat(a) || 0).toFixed(2);

const pickFirst = (...values) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');
const toNumberOrZero = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toReadableText = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return '';
  return String(value).trim();
};

const parseObjectLike = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const toAbsoluteImageUrl = (value) => {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\\/g, '/');
  if (!cleaned) return null;
  if (/^\/\//.test(cleaned)) return `https:${cleaned}`;
  if (/^https?:\/\//i.test(cleaned) || /^data:image\//i.test(cleaned)) return cleaned;
  return `${API_ORIGIN}${cleaned.startsWith('/') ? '' : '/'}${cleaned}`;
};

const getNameFromAddressPayload = (value) => {
  const source = parseObjectLike(value);
  if (!source) return '';
  return toReadableText(pickFirst(source.full_name, source.name, source.farmer_name, source.customer_name));
};

const normalizeAddress = (value) => {
  if (!value) return '';
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return parsed;
    }
  }
  if (typeof parsed === 'object') {
    return [
      parsed.address_line,
      parsed.address,
      parsed.city,
      parsed.district,
      parsed.state,
      parsed.pincode,
      parsed.phone ? `Ph: ${parsed.phone}` : null,
    ].filter(Boolean).join(', ');
  }
  return String(parsed);
};

const normalizeParty = (raw, fallbackName, fallbackAddress, fallbackPhone) => {
  const source = parseObjectLike(raw) || {};
  const nested = parseObjectLike(source.user) || parseObjectLike(source.profile) || {};
  return {
    name: toReadableText(
      pickFirst(
        source.full_name,
        source.name,
        source.username,
        source.farmer_name,
        source.customer_name,
        nested.full_name,
        nested.name,
        nested.username,
        fallbackName
      )
    ),
    full_name: toReadableText(
      pickFirst(
        source.full_name,
        source.name,
        source.username,
        source.farmer_name,
        source.customer_name,
        nested.full_name,
        nested.name,
        nested.username,
        fallbackName
      )
    ),
    phone: toReadableText(
      pickFirst(
        source.mobile_number,
        source.phone,
        source.mobile,
        source.phone_number,
        nested.mobile_number,
        nested.phone,
        nested.mobile,
        nested.phone_number,
        fallbackPhone
      )
    ),
    mobile: toReadableText(
      pickFirst(
        source.mobile_number,
        source.mobile,
        source.phone,
        source.phone_number,
        nested.mobile_number,
        nested.mobile,
        nested.phone,
        nested.phone_number,
        fallbackPhone
      )
    ),
    address: normalizeAddress(
      pickFirst(
        source.address,
        source.address_line,
        source.location,
        source.farm_address,
        nested.address,
        nested.address_line,
        nested.location,
        fallbackAddress
      )
    ),
    address_line: normalizeAddress(
      pickFirst(source.address_line, source.address, nested.address_line, nested.address, fallbackAddress)
    ),
  };
};

const getPartyImage = (party) => {
  const source = parseObjectLike(party) || {};
  const nested = parseObjectLike(source.user) || parseObjectLike(source.profile) || {};
  const rawImage = pickFirst(
    source.image_url,
    source.image,
    source.profile_image,
    source.profileImage,
    source.photo,
    source.photo_url,
    source.avatar,
    source.avatar_url,
    source.user_image,
    nested.image_url,
    nested.image,
    nested.profile_image,
    nested.profileImage,
    nested.photo,
    nested.photo_url,
    nested.avatar,
    nested.avatar_url,
    nested.user_image
  );

  return toAbsoluteImageUrl(toReadableText(rawImage)) || null;
};

const getPackingProofImages = (order) => {
  const packing =
    order?.packing_image_url ||
    order?.packing_photo_url ||
    order?.package_image_url ||
    order?.package_photo_url ||
    order?.packing?.packing_image_url ||
    order?.packing?.packing_photo_url ||
    null;

  const bill =
    order?.bill_paste_image_url ||
    order?.bill_image_url ||
    order?.bill_photo_url ||
    order?.bill_copy_url ||
    order?.packing?.bill_paste_image_url ||
    order?.packing?.bill_image_url ||
    null;

  return {
    packing,
    bill,
  };
};

/* ── Component ────────────────────────────────────────────── */
const OrderDetail = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const { orderId: paramOrderId, order: initialOrder } = route.params || {};

  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [assigningDP, setAssigningDP] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deliveryPersons, setDeliveryPersons] = useState([]);
  const [permanentVehicles, setPermanentVehicles] = useState([]);
  const [temporaryVehicles, setTemporaryVehicles] = useState([]);
  const [uploadingPackingProof, setUploadingPackingProof] = useState(false);
  const [statusConfirmModal, setStatusConfirmModal] = useState({ visible: false, nextStatus: null });
  const [successModal, setSuccessModal] = useState({ visible: false, title: 'Success', message: '' });
  const [proofPickerModal, setProofPickerModal] = useState({ visible: false, packingUri: null, billUri: null });

  const orderId = paramOrderId || order?.order_id || order?.id;
  const rawStatus = (order?.current_status || order?.status || 'PENDING').toUpperCase();
  const status = rawStatus;
  const myTransporterId = toNumberOrZero(
    authState?.user?.transporter_id || authState?.user?.id || authState?.userId || authState?.user_id
  );
  const sourceTransporterId = toNumberOrZero(
    order?.source_transporter_id || order?.pickup_transporter_id || order?.sourceTransporter?.transporter_id
  );
  const destinationTransporterId = toNumberOrZero(
    order?.destination_transporter_id || order?.delivery_transporter_id || order?.destinationTransporter?.transporter_id
  );
  const isDestinationTransporterView =
    !!myTransporterId &&
    !!destinationTransporterId &&
    myTransporterId === destinationTransporterId &&
    sourceTransporterId !== destinationTransporterId;
  const normalizedDestinationStatus = isDestinationTransporterView && status === 'RECEIVED'
    ? 'REACHED_DESTINATION'
    : status;
  const displayStatus = normalizedDestinationStatus;
  const stageStatus = normalizedDestinationStatus;
  const stageIdx = STATUS_INDEX[stageStatus] ?? 0;
  const isCancelled = stageStatus === 'CANCELLED';
  const isSameTransporterView =
    !!sourceTransporterId &&
    !!destinationTransporterId &&
    sourceTransporterId === destinationTransporterId &&
    myTransporterId === sourceTransporterId;

  /* ── Fetch ──────────────────────────────────────────────── */
  const fetchOrder = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      console.log('[OrderDetail] Starting fetch...');
      console.log('[OrderDetail] orderId:', orderId);
      console.log('[OrderDetail] initialOrder:', initialOrder ? 'exists' : 'null');
      
      if (!orderId && !initialOrder) {
        throw new Error('No order ID provided');
      }
      
      let orderRes = initialOrder;

      if (orderId) {
        const endpoints = [
          `/transporters/orders/${orderId}`,
          `/transporters/orders/${orderId}/track`,
          `/orders/${orderId}`,
        ];

        for (const endpoint of endpoints) {
          try {
            const res = await api.get(endpoint);
            // Handle various response shapes from different endpoints
            const raw = res.data;
            let candidate = null;
            
            // Shape 1: { data: { order: {...} } } (trackOrder)
            if (raw?.data?.order && (raw.data.order.order_id || raw.data.order.id)) {
              candidate = raw.data.order;
            }
            // Shape 2: { data: { order_id, farmer, customer, ... } } (getOrderDetail)
            else if (raw?.data && (raw.data.order_id || raw.data.id)) {
              candidate = raw.data;
            }
            // Shape 3: { order: {...} }
            else if (raw?.order && (raw.order.order_id || raw.order.id)) {
              candidate = raw.order;
            }
            // Shape 4: direct { order_id, ... }
            else if (raw?.order_id || raw?.id) {
              candidate = raw;
            }

            if (candidate && (candidate.order_id || candidate.id)) {
              orderRes = candidate;
              break;
            }
          } catch (_) {
            // Keep trying endpoint fallbacks.
          }
        }
      }

      const [personsRes, vehiclesRes] = await Promise.all([
        api.get('/transporters/delivery-persons').catch(() => ({ data: { data: [] } })),
        api.get('/vehicles').catch(() => ({ data: { data: {} } })),
      ]);
      
      // Set the order (either fresh or initial)
      if (orderRes) {
        const o = orderRes;
        console.log('[OrderDetail] Setting order with ID:', o?.order_id || o?.id);
        if (o) setOrder(o);
      }
      
      // Set delivery persons
      const persons = personsRes.data?.data || personsRes.data?.delivery_persons || personsRes.data || [];
      const personsList = Array.isArray(persons) ? persons : [];
      console.log('[OrderDetail] Loaded', personsList.length, 'delivery persons');
      setDeliveryPersons(personsList);

      const vehicleData = vehiclesRes.data?.data || vehiclesRes.data || {};
      setPermanentVehicles(
        Array.isArray(vehicleData?.permanent_vehicles)
          ? vehicleData.permanent_vehicles
          : []
      );
      setTemporaryVehicles(
        Array.isArray(vehicleData?.temporary_vehicles)
          ? vehicleData.temporary_vehicles
          : []
      );
      
    } catch (e) {
      console.error('[OrderDetail] Unexpected error:', e.message);
      // Only show error if we have no order data at all
      if (!initialOrder) {
        Alert.alert('Error', 'Unable to load order details. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, initialOrder]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  /* ── Status update ──────────────────────────────────────── */
  const assignVehicleAndPerson = async (vehicle, person) => {
    const oid = orderId || order?.order_id || order?.id;
    if (!oid) throw new Error('Order ID missing');

    const vehicleId = vehicle?.vehicle_id || vehicle?.id;
    const vehicleKind = vehicle?._vehicleKind || vehicle?.vehicle_kind || 'permanent';
    const personId = person?.delivery_person_id || person?.id;

    const vehiclePayload = {
      order_id: oid,
      vehicle_id: vehicleId,
      vehicle_type: vehicleKind,
    };
    const personPayload = {
      order_id: oid,
      delivery_person_id: personId,
    };

    const vehicleAttempts = [
      () => api.post('/transporters/assign-vehicle', vehiclePayload),
      () => api.put('/transporters/assign-vehicle', vehiclePayload),
      () => api.post(`/transporters/orders/${oid}/assign-vehicle`, vehiclePayload),
      () => api.put(`/transporters/orders/${oid}/assign-vehicle`, vehiclePayload),
    ];

    const personAttempts = [
      () => api.put(`/transporters/orders/${oid}/assign`, personPayload),
      () => api.post('/transporters/assign-order', personPayload),
      () => api.put('/transporters/assign-order', personPayload),
    ];

    let vehicleError = null;
    for (const run of vehicleAttempts) {
      try {
        await run();
        vehicleError = null;
        break;
      } catch (err) {
        vehicleError = err;
      }
    }
    if (vehicleError) throw vehicleError;

    let personError = null;
    for (const run of personAttempts) {
      try {
        await run();
        personError = null;
        break;
      } catch (err) {
        personError = err;
      }
    }
    if (personError) throw personError;
  };

  const handleAssign = () => {
    const allVehicles = [
      ...(permanentVehicles || []).map((v) => ({ ...v, _vehicleKind: 'permanent' })),
      ...(temporaryVehicles || []).map((v) => ({ ...v, _vehicleKind: 'temporary' })),
    ].filter((v) => v.is_available !== false);

    const available = deliveryPersons.filter((p) => p.is_available !== false);

    if (allVehicles.length === 0) {
      Alert.alert('No Vehicles', 'Add or enable a vehicle first.');
      return;
    }
    if (available.length === 0) {
      Alert.alert('No Available Persons', 'Add delivery persons first.');
      return;
    }

    const vehicleOptions = allVehicles.map((vehicle) => ({
      text: `${vehicle.vehicle_number || 'Vehicle'} (${vehicle._vehicleKind})`,
      onPress: async () => {
        const personOptions = available.map((p) => ({
          text: p.full_name || p.name || 'Person',
          onPress: async () => {
            setAssigningDP(true);
            try {
              await assignVehicleAndPerson(vehicle, p);
              setSuccessModal({
                visible: true,
                title: 'Assigned Successfully',
                message: `Assigned ${vehicle.vehicle_number || 'vehicle'} + ${p.full_name || p.name}`,
              });
              fetchOrder(true);
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to assign');
            } finally {
              setAssigningDP(false);
            }
          },
        }));
        personOptions.push({ text: 'Cancel', style: 'cancel' });
        Alert.alert('Assign Delivery Person', 'Choose delivery person:', personOptions);
      },
    }));
    vehicleOptions.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Assign Vehicle', 'Choose vehicle:', vehicleOptions);
  };

  const uploadPackingProof = async () => {
    setProofPickerModal({ visible: true, packingUri: null, billUri: null });
  };

  const pickProofImage = async (target, fromCamera) => {
    const uri = await pickImage(fromCamera);
    if (!uri) return;
    setProofPickerModal((prev) => ({
      ...prev,
      [`${target}Uri`]: uri,
    }));
  };

  const confirmProofUpload = async () => {
    const oid = orderId || order?.order_id || order?.id;
    if (!oid) return;

    const packingLocalUri = proofPickerModal.packingUri;
    if (!packingLocalUri) return;

    const billLocalUri = proofPickerModal.billUri;
    if (!billLocalUri) return;

    setProofPickerModal((prev) => ({ ...prev, visible: false }));

    setUploadingPackingProof(true);
    try {
      const [packingUrl, billUrl] = await Promise.all([
        uploadImageToCloudinary(packingLocalUri),
        uploadImageToCloudinary(billLocalUri),
      ]);

      if (!packingUrl || !billUrl) {
        throw new Error('Failed to upload packing images');
      }

      const payload = {
        packing_image_url: packingUrl,
        bill_paste_image_url: billUrl,
      };

      const attempts = [
        () => api.put(`/transporters/orders/${oid}/packing`, payload),
        () => api.post(`/transporters/orders/${oid}/packing`, payload),
        () => api.put(`/orders/${oid}/packing`, payload),
        () => api.post(`/orders/${oid}/packing`, payload),
        () => api.put(`/transporters/orders/${oid}`, payload),
      ];

      let saved = false;
      for (const run of attempts) {
        try {
          await run();
          saved = true;
          break;
        } catch (_) {
          // Try next endpoint.
        }
      }

      setOrder((prev) => ({ ...(prev || {}), ...payload }));

      if (!saved) {
        Alert.alert('Uploaded', 'Images uploaded. Backend packing save endpoint unavailable, but images are attached locally in app view.');
      } else {
        setSuccessModal({
          visible: true,
          title: 'Upload Complete',
          message: 'Packing and bill images uploaded successfully',
        });
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to upload packing proof');
    } finally {
      setUploadingPackingProof(false);
    }
  };

  const getNextStatusByScan = () => {
    const currentRaw = (order?.current_status || order?.status || '').toUpperCase();
    const current = currentRaw;
    const isSameTransporter =
      sourceTransporterId > 0 &&
      destinationTransporterId > 0 &&
      sourceTransporterId === destinationTransporterId;
    const isSourceTransporterView =
      !!myTransporterId &&
      !!sourceTransporterId &&
      myTransporterId === sourceTransporterId &&
      sourceTransporterId !== destinationTransporterId;

    // Pickup statuses should ONLY be updated manually, not via QR.
    if (current === 'PICKUP_ASSIGNED' || current === 'PICKUP_IN_PROGRESS' || current === 'PICKED_UP') return null;

    // Destination transporter is QR-only for delivery-side progression.
    if (isDestinationTransporterView && !isSameTransporter) {
      if (current === 'SHIPPED' || current === 'IN_TRANSIT') return 'REACHED_DESTINATION';
      if (current === 'RECEIVED' || current === 'REACHED_DESTINATION') return hasDP ? 'OUT_FOR_DELIVERY' : null;
      return null;
    }

    // Source transporter scans source-side progression.
    if (isSourceTransporterView && !isSameTransporter) {
      if (current === 'RECEIVED') return 'SHIPPED';
      if (current === 'SHIPPED') return 'IN_TRANSIT';
      return null;
    }

    // Same transporter flow keeps full progression.
    if (current === 'RECEIVED') return 'SHIPPED';
    if (current === 'SHIPPED') return 'IN_TRANSIT';
    if (current === 'IN_TRANSIT') return 'REACHED_DESTINATION';
    if (current === 'REACHED_DESTINATION') return hasDP ? 'OUT_FOR_DELIVERY' : null;
    return null;
  };

  // Check if current status is a pickup status (manual-only updates)
  const isPickupStatus = ['PICKUP_ASSIGNED', 'PICKUP_IN_PROGRESS', 'PICKED_UP'].includes(status);
  const getNextPickupStatus = () => {
    if (status === 'PICKUP_ASSIGNED') return 'PICKUP_IN_PROGRESS';
    if (status === 'PICKUP_IN_PROGRESS') return 'PICKED_UP';
    if (status === 'PICKED_UP') return 'RECEIVED';
    return null;
  };

  const handleManualStatusUpdate = async (newStatus) => {
    const oid = orderId || order?.order_id || order?.id;
    if (!oid || !newStatus) return;

    if (isDestinationTransporterView) {
      Alert.alert('Use QR Scan', 'Destination transporter can update status only via QR scan.');
      return;
    }

    setUpdatingStatus(true);
    try {
      try {
        await api.put('/transporters/order-status', { order_id: oid, status: newStatus });
      } catch {
        await api.put('/orders/status', { order_id: oid, status: newStatus });
      }
      setSuccessModal({
        visible: true,
        title: 'Status Updated',
        message: `Order moved to ${newStatus.replace(/_/g, ' ')}`,
      });
      fetchOrder(true);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  /* ── Product image ──────────────────────────────────────── */
  const getProductImage = (item) => {
    const p = item?.product || item;
    if (!p) return null;
    const imgs = p.images;
    if (Array.isArray(imgs) && imgs.length > 0) {
      const primary = imgs.find((i) => i?.is_primary) || imgs[0];
      const url = typeof primary === 'string' ? primary : primary?.image_url || primary?.url;
      return url ? optimizeImageUrl(url, { width: 200 }) : null;
    }
    return p.image_url || p.image || null;
  };

  /* ── Render ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <ActivityIndicator size="large" color="#1B5E20" />
        <Text style={styles.loadingText}>Loading order details...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <Ionicons name="alert-circle-outline" size={50} color="#ccc" />
        <Text style={styles.loadingText}>Order not found</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const items = order.items || order.order_items || (order.product || order.Product ? [{ product: order.product || order.Product, quantity: order.quantity || 1 }] : []);
  const firstItem = items[0] || {};
  const firstProduct = firstItem?.product || firstItem || {};
  const productName = firstProduct?.name || order?.product?.name || order?.Product?.name || 'Product';
  
  // Resolve party objects from different backend shapes
  const farmerRaw =
    order.farmer ||
    order.Farmer ||
    order.farmer_details ||
    order.farmerDetails ||
    order.farmer_profile ||
    order.farmerProfile ||
    order.farmer_user ||
    order.farmerUser ||
    order.pickup_farmer ||
    order.Product?.farmer ||
    order.product?.farmer ||
    firstProduct?.farmer ||
    {};
  const farmer = {
    ...normalizeParty(
      farmerRaw,
      order.farmer_name || order.farmerName || order.farmer_full_name || getNameFromAddressPayload(order.pickup_address) || firstProduct?.farmer_name || firstProduct?.farm_name,
      order.pickup_address || order.farm_address || order.farmer_address || firstProduct?.farmer_address || firstProduct?.farm_address,
      order.farmer_phone || order.farmer_mobile || firstProduct?.farmer_phone || firstProduct?.farmer_mobile
    ),
    image: getPartyImage(farmerRaw) || toAbsoluteImageUrl(order.farmer_image || order.farmer_profile_image || order.farmer_image_url || firstProduct?.farmer_image || firstProduct?.farmer_image_url),
  };

  const customerRaw =
    order.customer ||
    order.Customer ||
    order.customer_details ||
    order.customerDetails ||
    {};
  const customer = {
    ...normalizeParty(
      customerRaw,
      order.customer_name || order.customerName,
      order.delivery_address || order.customer_address,
      order.customer_phone || order.customer_mobile
    ),
    image: getPartyImage(customerRaw),
  };

  // Parse delivery address from JSON if needed
  const deliveryAddressFormatted = (() => {
    const raw = order.delivery_address || customer.address;
    if (!raw) return '';
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object') {
          return [parsed.full_name, parsed.address_line, parsed.address, parsed.city, parsed.district, parsed.state, parsed.pincode, parsed.phone ? `Ph: ${parsed.phone}` : null].filter(Boolean).join(', ');
        }
      } catch { return raw; }
    }
    if (typeof raw === 'object') {
      return [raw.full_name, raw.address_line, raw.address, raw.city, raw.district, raw.state, raw.pincode, raw.phone ? `Ph: ${raw.phone}` : null].filter(Boolean).join(', ');
    }
    return String(raw);
  })();

  const dpRaw =
    order.delivery_person ||
    order.deliveryPerson ||
    order.DeliveryPerson ||
    order.delivery_person_details ||
    order.deliveryPersonDetails ||
    order.delivery_person_info ||
    order.deliveryPartner ||
    order.delivery_partner ||
    order.assignment?.delivery_person ||
    order.delivery_assignment?.delivery_person ||
    order.assigned_delivery_person ||
    {};
  const dp = {
    ...normalizeParty(
      dpRaw,
      order.delivery_person_name || order.deliveryPersonName || order.assigned_delivery_person_name,
      order.delivery_person_address || order.delivery_address,
      order.delivery_person_phone || order.delivery_person_mobile || order.assigned_delivery_person_phone
    ),
    vehicle: toReadableText(
      pickFirst(
        dpRaw.vehicle,
        dpRaw.vehicle_number,
        dpRaw.vehicleNo,
        order.delivery_vehicle_number,
        order.vehicle_number
      )
    ),
    vehicleType: toReadableText(
      pickFirst(
        dpRaw.vehicleType,
        dpRaw.vehicle_type,
        order.delivery_vehicle_type,
        order.vehicle_type
      )
    ),
    image: getPartyImage(dpRaw),
  };

  // Resolve source and destination transporter
  const srcTransRaw = order.source_transporter || order.sourceTransporter || {};
  const dstTransRaw = order.destination_transporter || order.destinationTransporter || {};
  const srcTransporter = {
    ...normalizeParty(srcTransRaw, null, null, null),
    image: getPartyImage(srcTransRaw),
    id: order.source_transporter_id || srcTransRaw?.transporter_id,
  };
  const dstTransporter = {
    ...normalizeParty(dstTransRaw, null, null, null),
    image: getPartyImage(dstTransRaw),
    id: order.destination_transporter_id || dstTransRaw?.transporter_id,
  };
  
  const hasDP = !!(
    order.delivery_person_id ||
    order.assigned_delivery_person_id ||
    dpRaw?.id ||
    dpRaw?.delivery_person_id ||
    dp.name ||
    dp.phone ||
    dp.address ||
    dp.vehicle ||
    dp.vehicleType
  );
  const nextStatusByScan = getNextStatusByScan();
  const packingProof = getPackingProofImages(order);
  const hasPackingAndBillProof = Boolean(packingProof.packing && packingProof.bill);
  const isShippedScanBlocked = nextStatusByScan === 'SHIPPED' && !hasPackingAndBillProof;
  const canUploadPackingProof = nextStatusByScan === 'SHIPPED';
  const canEditPackingProof = nextStatusByScan === 'SHIPPED' && hasPackingAndBillProof;
  const isUploadPackingProofDisabled = uploadingPackingProof || hasPackingAndBillProof;
  const hasAssignedVehicle = !!(order?.permanent_vehicle_id || order?.temp_vehicle_id);
  const canAssignOnThisStage =
    (!isDestinationTransporterView && !hasDP) ||
    (isDestinationTransporterView && stageStatus === 'REACHED_DESTINATION') ||
    (isSameTransporterView && stageStatus === 'REACHED_DESTINATION' && !hasDP);
  const assignBtnLabel = isDestinationTransporterView && stageStatus === 'REACHED_DESTINATION' && hasDP
    ? 'Reassign Delivery Person'
    : 'Assign Vehicle + Delivery Person';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {productName}
          </Text>
          <Text style={styles.headerSub}>{formatDate(order.created_at)}</Text>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: getStatusColor(status) + '30' }]}>
          <Text style={[styles.headerBadgeText, { color: '#fff' }]}>
            {displayStatus.replace(/_/g, ' ')}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrder(true); }} colors={['#1B5E20']} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Products */}
        {items.length > 0 && (
          <View style={styles.card}>
            {items.map((item, idx) => {
              const product = item.product || item;
              const imgUrl = getProductImage(item);
              return (
                <View key={idx} style={styles.productDetailRow}>
                  {imgUrl ? (
                    <Image source={{ uri: imgUrl }} style={styles.productDetailImg} />
                  ) : (
                    <View style={[styles.productDetailImg, styles.productImgPlaceholder]}>
                      <Ionicons name="cube-outline" size={40} color="#aaa" />
                    </View>
                  )}
                  <View style={styles.productDetailInfo}>
                    <Text style={styles.productDetailName}>{product.name || 'Product'}</Text>
                    <View style={styles.productMetaRow}>
                      <View style={styles.productMetaItem}>
                        <Ionicons name="cube-outline" size={16} color="#666" />
                        <Text style={styles.productMetaText}>Qty: {item.quantity || 1}</Text>
                      </View>
                      {product.price && (
                        <View style={styles.productMetaItem}>
                          <Ionicons name="pricetag-outline" size={16} color="#666" />
                          <Text style={styles.productMetaText}>{formatCurrency(product.price)}</Text>
                        </View>
                      )}
                    </View>
                    {order.total_amount && (
                      <View style={styles.productTotalRow}>
                        <Text style={styles.productTotalLabel}>Total Amount</Text>
                        <Text style={styles.productTotalValue}>{formatCurrency(order.total_amount)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Farmer Info */}
        <View style={styles.card}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoIconWrap, { backgroundColor: '#4CAF5015' }]}>
              <Ionicons name="leaf" size={20} color="#4CAF50" />
            </View>
            <Text style={styles.cardTitle}>Farmer Details</Text>
          </View>
          <View style={styles.profileCard}>
            {farmer.image ? (
              <Image source={{ uri: optimizeImageUrl(farmer.image, { width: 80, height: 80 }) }} style={styles.profileAvatarImg} />
            ) : (
              <View style={styles.profileAvatar}>
                <Ionicons name="person" size={32} color="#4CAF50" />
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{farmer.full_name || farmer.name || order.farmer_name || 'Farmer'}</Text>
              {farmer.address && (
                <View style={styles.profileDetailRow}>
                  <Ionicons name="location" size={16} color="#4CAF50" />
                  <Text style={styles.profileDetailText}>{farmer.address}</Text>
                </View>
              )}
              {farmer.phone && (
                <TouchableOpacity 
                  style={[styles.callBtn, { backgroundColor: '#4CAF5015' }]} 
                  onPress={() => Linking.openURL(`tel:${farmer.phone}`)}
                >
                  <Ionicons name="call" size={16} color="#4CAF50" />
                  <Text style={[styles.callBtnText, { color: '#4CAF50' }]}>Call Farmer</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.card}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoIconWrap, { backgroundColor: '#2196F315' }]}>
              <Ionicons name="person" size={20} color="#2196F3" />
            </View>
            <Text style={styles.cardTitle}>Customer Details</Text>
          </View>
          <View style={styles.profileCard}>
            {customer.image ? (
              <Image source={{ uri: optimizeImageUrl(customer.image, { width: 80, height: 80 }) }} style={styles.profileAvatarImg} />
            ) : (
              <View style={styles.profileAvatar}>
                <Ionicons name="person" size={32} color="#2196F3" />
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{customer.full_name || customer.name || order.customer_name || 'N/A'}</Text>
              {deliveryAddressFormatted ? (
                <View style={styles.profileDetailRow}>
                  <Ionicons name="location" size={16} color="#2196F3" />
                  <Text style={styles.profileDetailText}>{deliveryAddressFormatted}</Text>
                </View>
              ) : null}
              {(customer.phone || customer.mobile) && (
                <TouchableOpacity 
                  style={[styles.callBtn, { backgroundColor: '#2196F315' }]} 
                  onPress={() => Linking.openURL(`tel:${customer.phone || customer.mobile}`)}
                >
                  <Ionicons name="call" size={16} color="#2196F3" />
                  <Text style={[styles.callBtnText, { color: '#2196F3' }]}>Call Customer</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Delivery Person Info */}
        {hasDP && (
          <View style={styles.card}>
            <View style={styles.infoHeader}>
              <View style={[styles.infoIconWrap, { backgroundColor: '#9C27B015' }]}>
                <Ionicons name="bicycle" size={20} color="#9C27B0" />
              </View>
              <Text style={styles.cardTitle}>Delivery Person Details</Text>
            </View>
            <View style={styles.profileCard}>
              {dp.image ? (
                <Image source={{ uri: optimizeImageUrl(dp.image, { width: 80, height: 80 }) }} style={styles.profileAvatarImg} />
              ) : (
                <View style={styles.profileAvatar}>
                  <Ionicons name="person" size={32} color="#9C27B0" />
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{dp.name || 'N/A'}</Text>
                {dp.vehicle && (
                  <View style={styles.profileDetailRow}>
                    <Ionicons name="car" size={16} color="#9C27B0" />
                    <Text style={styles.profileDetailText}>{dp.vehicle} • {dp.vehicleType || 'Vehicle'}</Text>
                  </View>
                )}
                {dp.phone && (
                  <TouchableOpacity 
                    style={[styles.callBtn, { backgroundColor: '#9C27B015' }]} 
                    onPress={() => Linking.openURL(`tel:${dp.phone}`)}
                  >
                    <Ionicons name="call" size={16} color="#9C27B0" />
                    <Text style={[styles.callBtnText, { color: '#9C27B0' }]}>Call Delivery Person</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Source Transporter Info */}
        {(srcTransporter.id || srcTransporter.name) && (
          <View style={styles.card}>
            <View style={styles.infoHeader}>
              <View style={[styles.infoIconWrap, { backgroundColor: '#FF572215' }]}>
                <MaterialCommunityIcons name="truck-delivery" size={20} color="#FF5722" />
              </View>
              <Text style={styles.cardTitle}>Source Transporter</Text>
            </View>
            <View style={styles.profileCard}>
              {srcTransporter.image ? (
                <Image source={{ uri: optimizeImageUrl(srcTransporter.image, { width: 80, height: 80 }) }} style={styles.profileAvatarImg} />
              ) : (
                <View style={styles.profileAvatar}>
                  <MaterialCommunityIcons name="truck" size={32} color="#FF5722" />
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{srcTransporter.name || `Transporter #${srcTransporter.id}`}</Text>
                {srcTransporter.address && (
                  <View style={styles.profileDetailRow}>
                    <Ionicons name="location" size={16} color="#FF5722" />
                    <Text style={styles.profileDetailText}>{srcTransporter.address}</Text>
                  </View>
                )}
                {srcTransporter.phone && (
                  <TouchableOpacity 
                    style={[styles.callBtn, { backgroundColor: '#FF572215' }]} 
                    onPress={() => Linking.openURL(`tel:${srcTransporter.phone}`)}
                  >
                    <Ionicons name="call" size={16} color="#FF5722" />
                    <Text style={[styles.callBtnText, { color: '#FF5722' }]}>Call Source Transporter</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Destination Transporter Info */}
        {(dstTransporter.id || dstTransporter.name) && (
          <View style={styles.card}>
            <View style={styles.infoHeader}>
              <View style={[styles.infoIconWrap, { backgroundColor: '#673AB715' }]}>
                <MaterialCommunityIcons name="truck-check" size={20} color="#673AB7" />
              </View>
              <Text style={styles.cardTitle}>Destination Transporter</Text>
            </View>
            <View style={styles.profileCard}>
              {dstTransporter.image ? (
                <Image source={{ uri: optimizeImageUrl(dstTransporter.image, { width: 80, height: 80 }) }} style={styles.profileAvatarImg} />
              ) : (
                <View style={styles.profileAvatar}>
                  <MaterialCommunityIcons name="truck" size={32} color="#673AB7" />
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{dstTransporter.name || `Transporter #${dstTransporter.id}`}</Text>
                {dstTransporter.address && (
                  <View style={styles.profileDetailRow}>
                    <Ionicons name="location" size={16} color="#673AB7" />
                    <Text style={styles.profileDetailText}>{dstTransporter.address}</Text>
                  </View>
                )}
                {dstTransporter.phone && (
                  <TouchableOpacity 
                    style={[styles.callBtn, { backgroundColor: '#673AB715' }]} 
                    onPress={() => Linking.openURL(`tel:${dstTransporter.phone}`)}
                  >
                    <Ionicons name="call" size={16} color="#673AB7" />
                    <Text style={[styles.callBtnText, { color: '#673AB7' }]}>Call Destination Transporter</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {/* QR Code — single display, only shown after ASSIGNED (step 3+) */}
        {stageIdx >= 2 && (order.qr_code || order.qr_image_url) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Order QR Code</Text>
            <Text style={styles.qrNote}>Only assigned transporters and destination delivery person can scan this QR</Text>
            {order.qr_image_url ? (
              <Image source={{ uri: order.qr_image_url }} style={styles.qrImage} resizeMode="contain" />
            ) : order.qr_code ? (
              <View style={styles.qrTextWrap}>
                <MaterialCommunityIcons name="qrcode" size={40} color="#1B5E20" />
                <Text style={styles.qrText}>{order.qr_code}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Packing proof */}
        {(packingProof.packing || packingProof.bill) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Packed Order Proof</Text>
            <View style={styles.packingProofRow}>
              <View style={styles.packingProofCard}>
                <Text style={styles.packingProofLabel}>Packed Parcel</Text>
                {packingProof.packing ? (
                  <Image source={{ uri: optimizeImageUrl(packingProof.packing, { width: 280 }) }} style={styles.packingProofImage} />
                ) : (
                  <View style={[styles.packingProofImage, styles.productImgPlaceholder]}>
                    <Text style={styles.packingProofEmptyText}>Not uploaded</Text>
                  </View>
                )}
              </View>
              <View style={styles.packingProofCard}>
                <Text style={styles.packingProofLabel}>Bill Pasted</Text>
                {packingProof.bill ? (
                  <Image source={{ uri: optimizeImageUrl(packingProof.bill, { width: 280 }) }} style={styles.packingProofImage} />
                ) : (
                  <View style={[styles.packingProofImage, styles.productImgPlaceholder]}>
                    <Text style={styles.packingProofEmptyText}>Not uploaded</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.card}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoIconWrap, { backgroundColor: '#1B5E2015' }]}>
              <Ionicons name="flash" size={20} color="#1B5E20" />
            </View>
            <Text style={styles.cardTitle}>Actions</Text>
          </View>
          <View style={styles.actionsWrap}>
            {/* Assign button — always visible when DP or vehicle not assigned */}
            {canAssignOnThisStage && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#9C27B0' }]}
                onPress={handleAssign}
                disabled={assigningDP}
              >
                {assigningDP ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <View style={styles.actionRowIconWrap}>
                      <Ionicons name="person-add" size={18} color="#fff" />
                    </View>
                    <Text style={styles.actionBtnText}>{assignBtnLabel}</Text>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Pickup delivery person manual status update */}
            {!isDestinationTransporterView && isPickupStatus && getNextPickupStatus() && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#FF5722' }]}
                onPress={() => setStatusConfirmModal({ visible: true, nextStatus: getNextPickupStatus() })}
                disabled={updatingStatus}
              >
                {updatingStatus ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <View style={styles.actionRowIconWrap}>
                      <Ionicons name="hand-left" size={18} color="#fff" />
                    </View>
                    <Text style={styles.actionBtnText}>Update: {getNextPickupStatus()?.replace(/_/g, ' ')}</Text>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
                  </>
                )}
              </TouchableOpacity>
            )}

            {isDestinationTransporterView && (
              <View style={styles.destQrOnlyHint}>
                <Ionicons name="information-circle" size={16} color="#3F51B5" />
                <Text style={styles.destQrOnlyHintText}>Destination transporter scans only up to REACHED DESTINATION; after that assign/reassign delivery person and final completion is by delivery person QR.</Text>
              </View>
            )}

            {/* Packing proof upload */}
            {canUploadPackingProof && (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { backgroundColor: '#FF9800' },
                  isUploadPackingProofDisabled && styles.disabledActionBtn,
                ]}
                onPress={uploadPackingProof}
                disabled={isUploadPackingProofDisabled}
              >
                {uploadingPackingProof ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <View style={styles.actionRowIconWrap}>
                      <Ionicons name="images" size={18} color="#fff" />
                    </View>
                    <Text style={styles.actionBtnText}>
                      {hasPackingAndBillProof ? 'Packing + Bill Uploaded' : 'Upload Packing + Bill Photos'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
                  </>
                )}
              </TouchableOpacity>
            )}

            {canEditPackingProof && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#EF6C00' }]}
                onPress={uploadPackingProof}
                disabled={uploadingPackingProof}
              >
                {uploadingPackingProof ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <View style={styles.actionRowIconWrap}>
                      <Ionicons name="create-outline" size={18} color="#fff" />
                    </View>
                    <Text style={styles.actionBtnText}>Edit Packing + Bill Photos</Text>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* QR scan — only for non-pickup statuses */}
            {nextStatusByScan && (
              <>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { backgroundColor: '#3F51B5' },
                  isShippedScanBlocked && styles.disabledActionBtn,
                ]}
                onPress={() => navigation.navigate('QRScan', { orderId, expectedOrderId: orderId })}
                disabled={isShippedScanBlocked}
              >
                <View style={styles.actionRowIconWrap}>
                  <Ionicons name="qr-code" size={18} color="#fff" />
                </View>
                <Text style={styles.actionBtnText}>Scan QR → {nextStatusByScan.replace(/_/g, ' ')}</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              {isShippedScanBlocked && (
                <Text style={styles.disabledActionHint}>
                  Upload both packing and bill photos to enable Scan QR for SHIPPED.
                </Text>
              )}
              </>
            )}

            {/* Track Order */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#1B5E20' }]}
              onPress={() => navigation.navigate('OrderTracking', { orderId, order })}
            >
              <View style={styles.actionRowIconWrap}>
                <Ionicons name="navigate" size={18} color="#fff" />
              </View>
              <Text style={styles.actionBtnText}>Track Order</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            {/* View Bill */}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#00897B' }]}
              onPress={() => navigation.navigate('BillPreview', { orderId, order })}
            >
              <View style={styles.actionRowIconWrap}>
                <Ionicons name="receipt" size={18} color="#fff" />
              </View>
              <Text style={styles.actionBtnText}>View Bill</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={statusConfirmModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusConfirmModal({ visible: false, nextStatus: null })}
      >
        <View style={styles.statusModalOverlay}>
          <View style={styles.statusModalCard}>
            <View style={styles.statusModalIconWrap}>
              <Ionicons name="swap-horizontal" size={22} color="#FF5722" />
            </View>
            <Text style={styles.statusModalTitle}>Confirm Status Update</Text>
            <Text style={styles.statusModalMessage}>Do you want to update this order status?</Text>
            <View style={styles.statusModalStatusPill}>
              <Text style={styles.statusModalStatusLabel}>Next:</Text>
              <Text style={styles.statusModalStatusValue}>
                {(statusConfirmModal.nextStatus || '').replace(/_/g, ' ')}
              </Text>
            </View>

            <View style={styles.statusModalActions}>
              <TouchableOpacity
                style={styles.statusModalCancelBtn}
                onPress={() => setStatusConfirmModal({ visible: false, nextStatus: null })}
                disabled={updatingStatus}
              >
                <Text style={styles.statusModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statusModalConfirmBtn}
                onPress={() => {
                  const next = statusConfirmModal.nextStatus;
                  setStatusConfirmModal({ visible: false, nextStatus: null });
                  if (next) handleManualStatusUpdate(next);
                }}
                disabled={updatingStatus}
              >
                {updatingStatus ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.statusModalConfirmText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={proofPickerModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setProofPickerModal({ visible: false, packingUri: null, billUri: null })}
      >
        <View style={styles.statusModalOverlay}>
          <View style={styles.proofModalCard}>
            <Text style={styles.proofModalTitle}>Upload Packing Proof</Text>
            <Text style={styles.proofModalSubTitle}>Add both photos before uploading.</Text>

            <View style={styles.proofRow}>
              <View style={styles.proofInfoWrap}>
                <Text style={styles.proofLabel}>Packing Photo</Text>
                <Text style={styles.proofStateText}>{proofPickerModal.packingUri ? 'Selected' : 'Not selected'}</Text>
              </View>
              <View style={styles.proofActionWrap}>
                <TouchableOpacity style={styles.proofSourceBtn} onPress={() => pickProofImage('packing', true)}>
                  <Ionicons name="camera-outline" size={14} color="#1B5E20" />
                  <Text style={styles.proofSourceText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.proofSourceBtn} onPress={() => pickProofImage('packing', false)}>
                  <Ionicons name="images-outline" size={14} color="#1B5E20" />
                  <Text style={styles.proofSourceText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.proofRow}>
              <View style={styles.proofInfoWrap}>
                <Text style={styles.proofLabel}>Bill Photo</Text>
                <Text style={styles.proofStateText}>{proofPickerModal.billUri ? 'Selected' : 'Not selected'}</Text>
              </View>
              <View style={styles.proofActionWrap}>
                <TouchableOpacity style={styles.proofSourceBtn} onPress={() => pickProofImage('bill', true)}>
                  <Ionicons name="camera-outline" size={14} color="#1B5E20" />
                  <Text style={styles.proofSourceText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.proofSourceBtn} onPress={() => pickProofImage('bill', false)}>
                  <Ionicons name="images-outline" size={14} color="#1B5E20" />
                  <Text style={styles.proofSourceText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.statusModalActions}>
              <TouchableOpacity
                style={styles.statusModalCancelBtn}
                onPress={() => setProofPickerModal({ visible: false, packingUri: null, billUri: null })}
                disabled={uploadingPackingProof}
              >
                <Text style={styles.statusModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusModalConfirmBtn,
                  (!proofPickerModal.packingUri || !proofPickerModal.billUri || uploadingPackingProof) && styles.proofDisabledBtn,
                ]}
                onPress={confirmProofUpload}
                disabled={!proofPickerModal.packingUri || !proofPickerModal.billUri || uploadingPackingProof}
              >
                {uploadingPackingProof ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.statusModalConfirmText}>Upload Now</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={successModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessModal({ visible: false, title: 'Success', message: '' })}
      >
        <View style={styles.statusModalOverlay}>
          <View style={styles.successModalCard}>
            <View style={styles.successModalIconWrap}>
              <Ionicons name="checkmark-circle" size={30} color="#16A34A" />
            </View>
            <Text style={styles.successModalTitle}>{successModal.title}</Text>
            <Text style={styles.successModalMessage}>{successModal.message}</Text>
            <TouchableOpacity
              style={styles.successModalOkBtn}
              onPress={() => setSuccessModal({ visible: false, title: 'Success', message: '' })}
            >
              <Text style={styles.successModalOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

/* ── InfoCard Sub-component ───────────────────────────────── */
const InfoCard = ({ title, icon, iconColor, name, phone, address, extra }) => (
  <View style={styles.card}>
    <View style={styles.infoHeader}>
      <View style={[styles.infoIconWrap, { backgroundColor: (iconColor || '#1B5E20') + '15' }]}>
        <Ionicons name={icon} size={20} color={iconColor || '#1B5E20'} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    <Text style={styles.infoName}>{name}</Text>
    {address ? <Text style={styles.infoDetail}>{address}</Text> : null}
    {extra ? <Text style={styles.infoDetail}>{extra}</Text> : null}
    {phone && (
      <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${phone}`)}>
        <Ionicons name="call-outline" size={16} color="#1B5E20" />
        <Text style={styles.callBtnText}>{phone}</Text>
      </TouchableOpacity>
    )}
  </View>
);

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F8F4' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  retryBtn: { marginTop: 16, backgroundColor: '#1B5E20', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingTop: 12, paddingBottom: 16, gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#C8E6C9', fontSize: 12, marginTop: 2 },
  headerBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  headerBadgeText: { fontSize: 11, fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1B5E20', marginBottom: 12 },

  cancelledRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#FFEBEE', borderRadius: 10 },
  cancelledText: { fontSize: 15, fontWeight: '600', color: '#F44336' },

  // Products
  productDetailRow: { flexDirection: 'column', alignItems: 'center' },
  productDetailImg: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  productImgPlaceholder: { backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },
  productDetailInfo: { width: '100%' },
  productDetailName: { fontSize: 20, fontWeight: '700', color: '#1B5E20', marginBottom: 12 },
  productMetaRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  productMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  productMetaText: { fontSize: 14, color: '#666', fontWeight: '500' },
  productTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 12, borderRadius: 8, marginTop: 8 },
  productTotalLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  productTotalValue: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },

  // Info
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  infoIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  infoName: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 4 },
  infoDetail: { fontSize: 13, color: '#666', marginBottom: 2 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#E8F5E9', borderRadius: 10, alignSelf: 'flex-start' },
  callBtnText: { color: '#1B5E20', fontSize: 13, fontWeight: '600' },

  // Details Card
  detailsCard: { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  detailText: { flex: 1, fontSize: 14, color: '#333', fontWeight: '500' },

  // Profile Card
  profileCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  profileAvatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  profileAvatarImg: { width: 70, height: 70, borderRadius: 35 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700', color: '#1B5E20', marginBottom: 8 },
  profileDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  profileDetailText: { fontSize: 14, color: '#666', flex: 1 },

  // QR
  qrNote: { fontSize: 12, color: '#888', marginBottom: 10, fontStyle: 'italic' },
  qrImage: { width: 180, height: 180, alignSelf: 'center', marginVertical: 8 },
  qrTextWrap: { alignItems: 'center', gap: 8, padding: 16 },
  qrText: { fontSize: 14, color: '#333', fontFamily: 'monospace' },

  packingProofRow: { gap: 12 },
  packingProofCard: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 10 },
  packingProofLabel: { fontSize: 13, fontWeight: '700', color: '#1B5E20', marginBottom: 8 },
  packingProofImage: { width: '100%', height: 160, borderRadius: 10, backgroundColor: '#EEE' },
  packingProofEmptyText: { color: '#999', fontSize: 12 },

  // Actions
  actionsWrap: { gap: 10 },
  actionBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabledActionBtn: { opacity: 0.5 },
  disabledActionHint: { fontSize: 12, color: '#6B7280', marginTop: -2, marginLeft: 4 },
  destQrOnlyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F0FF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  destQrOnlyHintText: { color: '#2D4C9C', fontSize: 12, fontWeight: '600' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, marginBottom: 16 },
  actionCard: { flex: 1, minWidth: '45%', aspectRatio: 1.2, borderRadius: 16, padding: 16, justifyContent: 'center', alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
  actionIconWrap: { marginBottom: 8 },
  actionCardText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  actionList: { width: '100%', gap: 10 },
  actionRowBtn: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  actionRowContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionRowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRowText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Status confirmation modal
  statusModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statusModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  statusModalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF0EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statusModalTitle: { fontSize: 18, fontWeight: '800', color: '#1F2937' },
  statusModalMessage: { fontSize: 13, color: '#6B7280', marginTop: 6 },
  statusModalStatusPill: {
    marginTop: 14,
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusModalStatusLabel: { fontSize: 12, color: '#9A3412', fontWeight: '700' },
  statusModalStatusValue: { fontSize: 13, color: '#C2410C', fontWeight: '800' },
  statusModalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  statusModalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusModalCancelText: { color: '#4B5563', fontSize: 14, fontWeight: '700' },
  statusModalConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#FF5722',
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusModalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  proofModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  proofModalTitle: { fontSize: 18, fontWeight: '800', color: '#1F2937' },
  proofModalSubTitle: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 14 },
  proofRow: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  proofInfoWrap: { marginBottom: 8 },
  proofLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  proofStateText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  proofActionWrap: { flexDirection: 'row', gap: 8 },
  proofSourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  proofSourceText: { color: '#1B5E20', fontSize: 12, fontWeight: '700' },
  proofDisabledBtn: { opacity: 0.5 },

  // Success modal
  successModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  successModalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successModalTitle: { fontSize: 19, fontWeight: '800', color: '#14532D' },
  successModalMessage: { fontSize: 14, color: '#4B5563', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  successModalOkBtn: {
    marginTop: 18,
    minWidth: 120,
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 26,
    alignItems: 'center',
  },
  successModalOkText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  modalContent: { backgroundColor: '#fff', borderRadius: 8, padding: 24, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 12 },
  modalMessage: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 24 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24 },
  modalBtnCancel: { fontSize: 14, fontWeight: '600', color: '#666', paddingVertical: 8, paddingHorizontal: 4 },
  modalBtnAdd: { fontSize: 14, fontWeight: '600', color: '#1B5E20', paddingVertical: 8, paddingHorizontal: 4 },

  // Assign Modal
  assignModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  assignModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  assignModalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 20 },
  assignModalHandle: { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  assignModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  assignModalTitle: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  assignModalScroll: { paddingHorizontal: 16, paddingTop: 8 },
  personCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8F5E9', elevation: 1, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  personAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  personAvatarImg: { width: 50, height: 50 },
  personInfo: { flex: 1 },
  personName: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  personDetail: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  personDetailText: { fontSize: 13, color: '#666' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 12 },
});

export default OrderDetail;
