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
import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';

/* ── Constants ────────────────────────────────────────────── */
const TIMELINE_STAGES = [
  { key: 'PLACED', label: 'Order Placed', icon: 'cart', color: '#FF9800' },
  { key: 'CONFIRMED', label: 'Confirmed', icon: 'checkmark-circle', color: '#2196F3' },
  { key: 'ASSIGNED', label: 'Assigned', icon: 'people', color: '#9C27B0' },
  { key: 'SHIPPED', label: 'Shipped', icon: 'airplane', color: '#3F51B5' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: 'bicycle', color: '#00BCD4' },
  { key: 'DELIVERED', label: 'Delivered', icon: 'checkmark-done-circle', color: '#4CAF50' },
];

const STATUS_INDEX = {
  PENDING: 0, PLACED: 0, CONFIRMED: 1, ASSIGNED: 2, PROCESSING: 2,
  SHIPPED: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5, COMPLETED: 5, CANCELLED: -1,
};

const getStatusColor = (s) => {
  const u = (s || '').toUpperCase();
  if (u === 'DELIVERED' || u === 'COMPLETED') return '#4CAF50';
  if (u === 'SHIPPED') return '#3F51B5';
  if (u === 'OUT_FOR_DELIVERY') return '#00BCD4';
  if (u === 'ASSIGNED') return '#9C27B0';
  if (u === 'CONFIRMED') return '#2196F3';
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

const pickFirst = (...values) => {
  for (const v of values) {
    if (v === 0) return v;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) return t;
    } else if (v !== undefined && v !== null && v !== '') {
      return v;
    }
  }
  return '';
};

const toReadableText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        const parsedText = toReadableText(parsed);
        return parsedText || trimmed;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(toReadableText).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    const picked = pickFirst(
      value.full_name,
      value.name,
      value.username,
      value.farm_name,
      value.company_name,
      value.address,
      value.address_line,
      [value.street, value.city, value.district, value.state, value.pincode].filter(Boolean).join(', ')
    );
    return picked ? toReadableText(picked) : '';
  }
  return '';
};

const normalizeParty = (entity, fallbackName, fallbackAddress, fallbackPhone) => {
  const nestedUser = entity?.user || {};
  const d = { ...nestedUser, ...(entity || {}) };

  return {
    name: toReadableText(pickFirst(d.full_name, d.name, d.username, fallbackName)),
    phone: toReadableText(pickFirst(d.phone, d.mobile, d.mobile_number, d.phone_number, fallbackPhone)),
    address: toReadableText(
      pickFirst(
        d.address,
        d.address_line,
        d.location,
        d.city,
        [d.street, d.city, d.district, d.state, d.pincode].filter(Boolean),
        fallbackAddress
      )
    ),
  };
};

const getPartyImage = (entity) => {
  const nestedUser = entity?.user || {};
  return pickFirst(
    entity?.image,
    entity?.image_url,
    entity?.profile_image,
    entity?.avatar,
    nestedUser?.image,
    nestedUser?.image_url,
    nestedUser?.profile_image,
    nestedUser?.avatar
  ) || null;
};

/* ── Component ────────────────────────────────────────────── */
const OrderDetail = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { orderId: paramOrderId, order: initialOrder } = route.params || {};

  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [assigningDP, setAssigningDP] = useState(false);
  const [deliveryPersons, setDeliveryPersons] = useState([]);
  const [showNoPersonsModal, setShowNoPersonsModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const orderId = paramOrderId || order?.order_id || order?.id;
  const status = (order?.current_status || order?.status || 'PENDING').toUpperCase();
  const stageIdx = STATUS_INDEX[status] ?? 0;
  const isCancelled = status === 'CANCELLED';

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
      
      // Try to fetch fresh data, but don't fail if it doesn't work
      if (orderId) {
        try {
          console.log(`[OrderDetail] Trying GET /transporters/orders/${orderId}/track`);
          const res = await api.get(`/transporters/orders/${orderId}/track`);
          
          // Check if response has data
          if (res.data?.success && res.data?.data) {
            console.log('[OrderDetail] Track response received');
            const trackData = res.data.data;
            const freshOrder = trackData.order || trackData;
            
            // Only use fresh data if it's valid
            if (freshOrder && (freshOrder.order_id || freshOrder.id)) {
              orderRes = freshOrder;
              console.log('[OrderDetail] Using fresh order data from track endpoint');
            } else {
              console.log('[OrderDetail] Track response invalid, using initialOrder');
            }
          } else {
            console.log('[OrderDetail] Track response has no data, using initialOrder');
          }
        } catch (err) {
          console.log('[OrderDetail] Track endpoint error:', err.message);
          console.log('[OrderDetail] Status:', err.response?.status);
          console.log('[OrderDetail] Backend message:', err.response?.data?.message);
          
          // If it's a permission or not found error, the order might not belong to this transporter
          if (err.response?.status === 403) {
            console.log('[OrderDetail] Permission denied - order may not belong to this transporter');
          } else if (err.response?.status === 404) {
            console.log('[OrderDetail] Order not found in backend');
          }
          
          console.log('[OrderDetail] Continuing with initialOrder (this is normal)');
        }
      }
      
      // Fetch delivery persons
      const personsRes = await api.get('/transporters/delivery-persons').catch((err) => {
        console.log('[OrderDetail] Delivery persons API error:', err.message);
        return { data: { data: [] } };
      });
      
      // Set the order (either fresh or initial)
      if (orderRes) {
        const o = orderRes?.data || orderRes?.order || orderRes;
        console.log('[OrderDetail] Setting order with ID:', o?.order_id || o?.id);
        if (o) setOrder(o);
      }
      
      // Set delivery persons
      const persons = personsRes.data?.data || personsRes.data?.delivery_persons || personsRes.data || [];
      const personsList = Array.isArray(persons) ? persons : [];
      console.log('[OrderDetail] Loaded', personsList.length, 'delivery persons');
      setDeliveryPersons(personsList);
      
    } catch (e) {
      console.error('[OrderDetail] Unexpected error:', e.message);
      // Only show error if we have no order data at all
      if (!order && !initialOrder) {
        Alert.alert('Error', 'Unable to load order details. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, initialOrder, order]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const getNextStatusByScan = () => {
    const current = status;
    const role = (order?.transporter_role || '').toUpperCase();
    if (role === 'PICKUP_SHIPPING' && current === 'ASSIGNED') return 'SHIPPED';
    if (role === 'DELIVERY' && current === 'SHIPPED') return 'RECEIVED';
    return null;
  };

  /* ── Assign ─────────────────────────────────────────────── */
  const handleAssign = async () => {
    setAssigningDP(true);
    try {
      const personsRes = await api.get('/transporters/delivery-persons');
      const persons = personsRes.data?.data || personsRes.data?.delivery_persons || personsRes.data || [];
      const personsList = Array.isArray(persons) ? persons : [];
      
      console.log('[OrderDetail] Fetched delivery persons:', personsList);
      
      if (personsList.length === 0) {
        setShowNoPersonsModal(true);
        return;
      }
      
      setDeliveryPersons(personsList);
      setShowAssignModal(true);
    } catch (err) {
      console.error('[OrderDetail] Error fetching delivery persons:', err);
      Alert.alert('Error', 'Failed to fetch delivery persons. Please try again.');
    } finally {
      setAssigningDP(false);
    }
  };

  const assignDeliveryPerson = async (person) => {
    setAssigningDP(true);
    setShowAssignModal(false);
    try {
      const deliveryPersonId = person.delivery_person_id || person.id;
      console.log('[OrderDetail] Assigning person:', deliveryPersonId, 'to order:', orderId);
      
      const payload = { 
        order_id: orderId,
        delivery_person_id: deliveryPersonId,
        permanent_vehicle_id: person.permanent_vehicle_id || null
      };
      
      console.log('[OrderDetail] Calling POST /transporters/manual-receive-order');
      const response = await api.post('/transporters/manual-receive-order', payload);
      
      console.log('[OrderDetail] Assignment successful:', response.data);
      Alert.alert('Success', `Assigned ${person.name || person.full_name}`);
      await fetchOrder(true);
    } catch (e) {
      console.error('[OrderDetail] Assignment error:', e);
      console.error('[OrderDetail] Error response:', e.response?.data);
      
      const errorMessage = e.response?.data?.message || e.message;
      
      if (errorMessage.includes('already assigned')) {
        Alert.alert(
          'Already Assigned',
          'This order is already assigned to a delivery person. You cannot reassign it.'
        );
      } else if (errorMessage.includes('not assigned to this transporter')) {
        Alert.alert(
          'Permission Denied',
          'This order is not assigned to your company. Please contact support.'
        );
      } else if (errorMessage.includes('maximum capacity')) {
        Alert.alert(
          'Capacity Full',
          errorMessage
        );
      } else {
        Alert.alert(
          'Assignment Failed',
          errorMessage || 'Failed to assign delivery person. Please try again.'
        );
      }
    } finally {
      setAssigningDP(false);
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
  
  // Resolve party objects from different backend shapes
  const farmerRaw =
    order.farmer ||
    order.Farmer ||
    order.farmer_details ||
    order.farmerDetails ||
    order.pickup_farmer ||
    order.Product?.farmer ||
    order.product?.farmer ||
    firstProduct?.farmer ||
    {};
  const farmer = {
    ...normalizeParty(
      farmerRaw,
      order.farmer_name || order.farmerName || firstProduct?.farmer_name || firstProduct?.farm_name,
      order.pickup_address || order.farm_address || order.farmer_address || firstProduct?.farmer_address || firstProduct?.farm_address,
      order.farmer_phone || order.farmer_mobile || firstProduct?.farmer_phone || firstProduct?.farmer_mobile
    ),
    image: getPartyImage(farmerRaw),
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
            {items.length > 0 ? (items[0].product?.name || items[0].name || `Order #${orderId}`) : `Order #${orderId}`}
          </Text>
          <Text style={styles.headerSub}>{formatDate(order.created_at)}</Text>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: getStatusColor(status) + '30' }]}>
          <Text style={[styles.headerBadgeText, { color: '#fff' }]}>
            {status.replace(/_/g, ' ')}
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
              <Text style={styles.profileName}>{farmer.name || 'N/A'}</Text>
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
        {(customer.name || customer.address || customer.phone) && (
          <View style={styles.card}>
            <View style={styles.infoHeader}>
              <View style={[styles.infoIconWrap, { backgroundColor: '#2196F315' }]}>
                <Ionicons name="location" size={20} color="#2196F3" />
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
                <Text style={styles.profileName}>{customer.name || 'N/A'}</Text>
                {customer.address && (
                  <View style={styles.profileDetailRow}>
                    <Ionicons name="location" size={16} color="#2196F3" />
                    <Text style={styles.profileDetailText}>{customer.address}</Text>
                  </View>
                )}
                {customer.phone && (
                  <TouchableOpacity
                    style={[styles.callBtn, { backgroundColor: '#2196F315' }]}
                    onPress={() => Linking.openURL(`tel:${customer.phone}`)}
                  >
                    <Ionicons name="call" size={16} color="#2196F3" />
                    <Text style={[styles.callBtnText, { color: '#2196F3' }]}>Call Customer</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

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
                {dp.address && (
                  <View style={styles.profileDetailRow}>
                    <Ionicons name="location" size={16} color="#9C27B0" />
                    <Text style={styles.profileDetailText}>{dp.address}</Text>
                  </View>
                )}
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

        {/* QR Code */}
        {(order.qr_code || order.qr_image_url) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>QR Code</Text>
            {order.qr_image_url ? (
              <Image source={{ uri: order.qr_image_url }} style={styles.qrImage} resizeMode="contain" />
            ) : (
              <View style={styles.qrTextWrap}>
                <MaterialCommunityIcons name="qrcode" size={40} color="#1B5E20" />
                <Text style={styles.qrText}>{order.qr_code}</Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsGrid}>
          {!hasDP ? (
            // Show all 4 buttons when no delivery person assigned
            <>
              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: '#9C27B0' }]}
                onPress={handleAssign}
                disabled={assigningDP}
              >
                {assigningDP ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <View style={styles.actionIconWrap}>
                      <Ionicons name="person-add" size={28} color="#fff" />
                    </View>
                    <Text style={styles.actionCardText}>Assign Delivery Person</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: '#00BCD4' }]}
                onPress={() => navigation.navigate('QRScan', {
                  orderId,
                  order,
                  updateStatusOnScan: true,
                  expectedOrderId: orderId,
                })}
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name="qr-code" size={28} color="#fff" />
                </View>
                <Text style={styles.actionCardText}>Scan QR Code</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: '#1B5E20' }]}
                onPress={() => navigation.navigate('TransporterOrderTracking', { orderId, order })}
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name="navigate" size={28} color="#fff" />
                </View>
                <Text style={styles.actionCardText}>Track Order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: '#FF9800' }]}
                onPress={() => navigation.navigate('BillPreview', { orderId, order })}
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name="receipt" size={28} color="#fff" />
                </View>
                <Text style={styles.actionCardText}>View Bill</Text>
              </TouchableOpacity>
            </>
          ) : (
            // Show only 3 actions when delivery person is assigned (no assign button)
            <View style={styles.actionList}>
              <TouchableOpacity
                style={[styles.actionRowBtn, { backgroundColor: '#00BCD4' }]}
                onPress={() => navigation.navigate('QRScan', {
                  orderId,
                  order,
                  updateStatusOnScan: true,
                  expectedOrderId: orderId,
                })}
              >
                <View style={styles.actionRowContent}>
                  <View style={styles.actionRowIconWrap}>
                    <Ionicons name="qr-code" size={22} color="#fff" />
                  </View>
                  <Text style={styles.actionRowText}>Scan QR Code</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRowBtn, { backgroundColor: '#1B5E20' }]}
                onPress={() => navigation.navigate('TransporterOrderTracking', { orderId, order })}
              >
                <View style={styles.actionRowContent}>
                  <View style={styles.actionRowIconWrap}>
                    <Ionicons name="navigate" size={22} color="#fff" />
                  </View>
                  <Text style={styles.actionRowText}>Track Order</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRowBtn, { backgroundColor: '#FF9800' }]}
                onPress={() => navigation.navigate('BillPreview', { orderId, order })}
              >
                <View style={styles.actionRowContent}>
                  <View style={styles.actionRowIconWrap}>
                    <Ionicons name="receipt" size={22} color="#fff" />
                  </View>
                  <Text style={styles.actionRowText}>View Bill</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* No Delivery Persons Modal */}
      <Modal visible={showNoPersonsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>No Delivery Persons</Text>
            <Text style={styles.modalMessage}>
              You have not added any delivery persons yet. Please add delivery persons first.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowNoPersonsModal(false)}>
                <Text style={styles.modalBtnCancel}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowNoPersonsModal(false); navigation.navigate('AddDeliveryPerson'); }}>
                <Text style={styles.modalBtnAdd}>ADD NOW</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assign Delivery Person Modal */}
      <Modal visible={showAssignModal} transparent animationType="slide">
        <View style={styles.assignModalOverlay}>
          <TouchableOpacity 
            style={styles.assignModalBackdrop} 
            activeOpacity={1} 
            onPress={() => setShowAssignModal(false)}
          />
          <View style={styles.assignModalSheet}>
            <View style={styles.assignModalHandle} />
            <View style={styles.assignModalHeader}>
              <Text style={styles.assignModalTitle}>Select Delivery Person</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.assignModalScroll} showsVerticalScrollIndicator={false}>
              {deliveryPersons.filter(p => p.is_available !== false && p.is_available !== 0).map((person) => (
                <TouchableOpacity
                  key={person.delivery_person_id}
                  style={styles.personCard}
                  onPress={() => assignDeliveryPerson(person)}
                  disabled={assigningDP}
                >
                  <View style={styles.personAvatar}>
                    {person.image_url ? (
                      <Image source={{ uri: person.image_url }} style={styles.personAvatarImg} />
                    ) : (
                      <Ionicons name="person" size={24} color="#1B5E20" />
                    )}
                  </View>
                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{person.name || person.full_name || 'Delivery Person'}</Text>
                    {person.mobile_number && (
                      <View style={styles.personDetail}>
                        <Ionicons name="call-outline" size={14} color="#666" />
                        <Text style={styles.personDetailText}>{person.mobile_number}</Text>
                      </View>
                    )}
                    {person.vehicle_number && (
                      <View style={styles.personDetail}>
                        <Ionicons name="car-outline" size={14} color="#666" />
                        <Text style={styles.personDetailText}>{person.vehicle_number} • {person.vehicle_type || 'Vehicle'}</Text>
                      </View>
                    )}
                    {person.total_deliveries !== undefined && (
                      <View style={styles.personDetail}>
                        <Ionicons name="checkmark-circle-outline" size={14} color="#4CAF50" />
                        <Text style={styles.personDetailText}>{person.total_deliveries} deliveries</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
              ))}
              {deliveryPersons.filter(p => p.is_available !== false && p.is_available !== 0).length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>No available delivery persons</Text>
                </View>
              )}
            </ScrollView>
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
  qrImage: { width: 180, height: 180, alignSelf: 'center', marginVertical: 8 },
  qrTextWrap: { alignItems: 'center', gap: 8, padding: 16 },
  qrText: { fontSize: 14, color: '#333', fontFamily: 'monospace' },

  // Actions
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
