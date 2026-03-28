import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
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
import { Colors, Font, Radius, Spacing, shadowStyle } from '../../utils/theme';

const API_ORIGIN = BASE_URL.replace(/\/api$/i, '');

const toAbsoluteImageUrl = (value) => {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\\/g, '/');
  if (!cleaned) return null;
  if (/^\/\//.test(cleaned)) return `https:${cleaned}`;
  if (/^https?:\/\//i.test(cleaned) || /^data:image\//i.test(cleaned)) return cleaned;
  return `${API_ORIGIN}${cleaned.startsWith('/') ? '' : '/'}${cleaned}`;
};

const STATUS_COLORS = {
  PENDING: '#FF9800',
  PLACED: '#FF9800',
  CONFIRMED: '#2196F3',
  ASSIGNED: '#9C27B0',
  PICKUP_ASSIGNED: '#FF5722',
  PICKUP_IN_PROGRESS: '#00BCD4',
  SHIPPED: '#3F51B5',
  PICKED_UP: '#00897B',
  RECEIVED: '#00897B',
  IN_TRANSIT: '#3F51B5',
  REACHED_DESTINATION: '#673AB7',
  OUT_FOR_DELIVERY: '#00BCD4',
  DELIVERED: '#4CAF50',
  COMPLETED: '#4CAF50',
  CANCELLED: '#F44336',
};

// Unified 10-step flow
const STATUS_FLOW = [
  'PENDING',
  'ASSIGNED',
  'PICKUP_ASSIGNED',
  'PICKED_UP',
  'RECEIVED',
  'SHIPPED',
  'IN_TRANSIT',
  'REACHED_DESTINATION',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

const STATUS_NORMALIZE = {
  COMPLETED: 'DELIVERED',
  ACCEPTED: 'ASSIGNED',
  CONFIRMED: 'ASSIGNED',
  PLACED: 'PENDING',
  PICKUP_IN_PROGRESS: 'PICKUP_ASSIGNED',
  PICKUP_COMPLETE: 'PICKED_UP',
  REACHED: 'REACHED_DESTINATION',
};

const isPickupOrder = (order) => {
  const deliveryType = (order?.delivery_type || '').toUpperCase();
  if (deliveryType === 'PICKUP') return true;
  if (deliveryType === 'DELIVERY') return false;

  const status = (order?.current_status || order?.status || '').toUpperCase();
  return ['ASSIGNED', 'PLACED', 'RECEIVED', 'SHIPPED', 'PICKUP_ASSIGNED', 'PICKUP_IN_PROGRESS', 'PICKED_UP', 'IN_TRANSIT'].includes(status);
};

const formatAddress = (rawAddress) => {
  if (!rawAddress) return null;

  let parsed = rawAddress;
  if (typeof rawAddress === 'string') {
    try {
      parsed = JSON.parse(rawAddress);
    } catch {
      return rawAddress;
    }
  }

  if (typeof parsed !== 'object') return String(parsed);

  return [
    parsed.full_name,
    parsed.address_line,
    parsed.landmark,
    parsed.city,
    parsed.district,
    parsed.state,
    parsed.pincode,
    parsed.zone,
  ]
    .filter(Boolean)
    .join(', ');
};

const pickFirst = (...values) => values.find((value) => !!value);

const buildFarmerProfile = (order) => {
  const farmer =
    order?.farmer ||
    order?.pickup_farmer ||
    order?.source_farmer ||
    order?.product?.farmer ||
    order?.Product?.farmer ||
    null;
  const name = pickFirst(
    farmer?.name,
    farmer?.full_name,
    order?.farmer_name,
    order?.pickup_farmer_name,
    order?.source_farmer_name,
    order?.source_name,
    'Farmer'
  );
  const phone = pickFirst(
    farmer?.phone,
    farmer?.mobile_number,
    farmer?.phone_number,
    farmer?.mobile,
    order?.farmer_mobile,
    order?.farmer_mobile_number,
    order?.pickup_farmer_mobile,
    order?.pickup_farmer_mobile_number,
    order?.farmer_phone,
    order?.pickup_farmer_phone,
    order?.source_phone,
    null
  );
  const address = formatAddress(
    pickFirst(
      farmer?.address,
      farmer?.farm_address,
      farmer?.address_line,
      order?.farmer_address,
      order?.pickup_address,
      order?.farm_address,
      order?.source_address,
      order?.source_transporter_address,
      null
    )
  );
  const image = toAbsoluteImageUrl(
    pickFirst(
      farmer?.image_url,
      farmer?.profile_image,
      farmer?.image,
      farmer?.photo,
      order?.farmer_image_url,
      order?.farmer_image,
      order?.pickup_farmer_image,
      order?.source_farmer_image
    )
  );

  return { name, phone, address, image };
};

const buildCustomerProfile = (order) => {
  const customer = order?.customer || order?.delivery_customer || order?.destination_customer || null;
  const name = pickFirst(
    customer?.name,
    customer?.full_name,
    order?.customer_name,
    order?.delivery_customer_name,
    order?.destination_customer_name,
    'Customer'
  );
  const phone = pickFirst(
    customer?.phone,
    customer?.mobile_number,
    customer?.phone_number,
    order?.customer_phone,
    order?.delivery_customer_phone,
    null
  );
  const address = formatAddress(
    pickFirst(
      customer?.address,
      customer?.address_line,
      order?.delivery_address,
      order?.destination_address,
      order?.destination_transporter_address,
      null
    )
  );
  const image = toAbsoluteImageUrl(
    pickFirst(
      customer?.image_url,
      customer?.profile_image,
      customer?.image,
      customer?.photo,
      order?.customer_image_url,
      order?.customer_image,
      order?.delivery_customer_image,
      order?.destination_customer_image
    )
  );

  return { name, phone, address, image };
};

// Pickup uses manual updates, destination uses QR.
const PICKUP_STATUS_ACTIONS = {
  ASSIGNED: { label: 'Update Pickup Status', icon: 'create-outline', route: 'OrderUpdate' },
  PICKUP_ASSIGNED: { label: 'Update Pickup Status', icon: 'create-outline', route: 'OrderUpdate' },
  PICKUP_IN_PROGRESS: { label: 'Update Pickup Status', icon: 'create-outline', route: 'OrderUpdate' },
};

const DELIVERY_STATUS_ACTIONS = {
  REACHED_DESTINATION: { label: 'Scan QR to Start Delivery', icon: 'qr-code-outline', route: 'Scanner' },
  OUT_FOR_DELIVERY: { label: 'Scan QR to Confirm Delivery', icon: 'qr-code-outline', route: 'Scanner' },
};

const OrderDetails = ({ navigation, route }) => {
  const { order: initialOrder, orderId: paramOrderId } = route.params || {};
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);

  const orderId = paramOrderId || initialOrder?.order_id || initialOrder?.id;

  // ─── Fetch order ──────────────────────────────────────────────────────
  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api.get(`/orders/${orderId}`);
      const data = res.data?.data || res.data;
      setOrder(data);
    } catch (e) {
      // Fallback: fetch from delivery orders
      try {
        const res2 = await api.get('/delivery-persons/orders');
        const allOrders = res2.data?.data || res2.data?.orders || [];
        const found = allOrders.find((o) => o.order_id === orderId || o.id === orderId);
        if (found) setOrder(found);
      } catch {
        console.log('Fetch order error:', e.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrder();
  };

  // ─── Status (Manual for pickup, QR-only for destination) ────────────────
  const rawStatus = (order?.current_status || order?.status || '').toUpperCase();
  const currentStatus = STATUS_NORMALIZE[rawStatus] || rawStatus;
  const pickupOnlyOrder = isPickupOrder(order);
  const action = pickupOnlyOrder
    ? PICKUP_STATUS_ACTIONS[currentStatus]
    : DELIVERY_STATUS_ACTIONS[currentStatus];

  // Navigate to appropriate screen based on action route
  const handleAction = () => {
    if (action.route === 'Scanner') {
      navigation.navigate('DeliveryTabs', {
        screen: 'Scanner',
        params: {
          expectedOrderId: orderId,
          expectedStatus: currentStatus,
        },
      });
    } else {
      navigation.navigate('OrderUpdate', {
        orderId: orderId,
        order: order,
      });
    }
  };

  // ─── Phone & Map actions ──────────────────────────────────────────────
  const callPerson = async (phone) => {
    if (!phone) {
      Alert.alert('No Phone', 'Phone number not available');
      return;
    }

    const rawPhone = String(phone).trim();
    const hasPlusPrefix = rawPhone.startsWith('+');
    const digits = rawPhone.replace(/\D/g, '');
    const normalizedPhone = hasPlusPrefix ? `+${digits}` : digits;

    if (!normalizedPhone) {
      Alert.alert('Invalid Number', 'Phone number format is invalid');
      return;
    }

    const telUrl = `tel:${normalizedPhone}`;
    const telPromptUrl = `telprompt:${normalizedPhone}`;

    try {
      // Prefer direct openURL because canOpenURL can be unreliable for tel on some Android devices.
      await Linking.openURL(telUrl);
    } catch {
      try {
        await Linking.openURL(telPromptUrl);
      } catch {
        Alert.alert('Call Failed', 'Could not open phone dialer');
      }
    }
  };

  const openMap = (address) => {
    if (!address) return;
    const query = encodeURIComponent(address);
    Linking.openURL(`https://maps.google.com/maps?q=${query}`).catch(() =>
      Alert.alert('Error', 'Cannot open maps')
    );
  };

  // ─── Timeline ─────────────────────────────────────────────────────────
  const renderTimeline = () => {
    const currentIdx = STATUS_FLOW.indexOf(currentStatus);
    return (
      <View style={styles.timelineContainer}>
        {STATUS_FLOW.map((status, i) => {
          const isActive = i <= currentIdx;
          const isCurrent = status === currentStatus;
          const color = isActive ? (STATUS_COLORS[status] || '#4CAF50') : '#ddd';
          return (
            <View key={status} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View
                  style={[
                    styles.timelineDot,
                    {
                      backgroundColor: isActive ? color : '#fff',
                      borderColor: color,
                      borderWidth: isActive ? 0 : 2,
                    },
                    isCurrent && styles.timelineDotCurrent,
                  ]}
                >
                  {isActive && (
                    <Ionicons
                      name={i < currentIdx ? 'checkmark' : 'ellipse'}
                      size={i < currentIdx ? 14 : 8}
                      color="#fff"
                    />
                  )}
                </View>
                {i < STATUS_FLOW.length - 1 && (
                  <View
                    style={[
                      styles.timelineLine,
                      { backgroundColor: i < currentIdx ? '#4CAF50' : '#e0e0e0' },
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.timelineText,
                  isActive && styles.timelineTextActive,
                  isCurrent && styles.timelineTextCurrent,
                ]}
              >
                {status.replace(/_/g, ' ')}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[currentStatus] || '#888';
  const farmerProfile = buildFarmerProfile(order);
  const customerProfile = buildCustomerProfile(order);

  // Order items
  const items = order?.items || order?.order_items || [];
  const singleProduct = order?.product || null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={Colors.gradientHeroDark} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {currentStatus.replace(/_/g, ' ')}
            </Text>
          </View>
          <Text style={styles.statusSub}>
            Order placed on {order?.order_date ? new Date(order.order_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
          </Text>
        </View>

        {/* Pickup Info (Farmer) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="store-outline" size={20} color="#1B5E20" />
            <Text style={styles.cardTitle}>Pickup From</Text>
          </View>
          <View style={styles.personHeader}>
            {farmerProfile.image ? (
              <Image source={{ uri: farmerProfile.image }} style={styles.personAvatar} />
            ) : (
              <View style={styles.personAvatarFallback}>
                <Ionicons name="person-outline" size={20} color="#1B5E20" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{farmerProfile.name}</Text>
              <Text style={styles.personRole}>Farmer</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color="#888" />
            <Text style={styles.infoText}>
              {farmerProfile.address || 'Address not available'}
            </Text>
          </View>
          {farmerProfile.phone && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color="#888" />
              <Text style={styles.infoText}>
                {farmerProfile.phone}
              </Text>
            </View>
          )}
          <View style={styles.actionBtnRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#E3F2FD' }]}
              onPress={() => openMap(farmerProfile.address)}
            >
              <Ionicons name="navigate-outline" size={18} color="#2196F3" />
              <Text style={[styles.actionBtnText, { color: '#2196F3' }]}>Directions</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#E8F5E9' }]}
              onPress={() => callPerson(farmerProfile.phone)}
            >
              <Ionicons name="call-outline" size={18} color="#4CAF50" />
              <Text style={[styles.actionBtnText, { color: '#4CAF50' }]}>Call Farmer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Info (Customer) */}
        {!pickupOnlyOrder && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="person-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Deliver To</Text>
            </View>
            <View style={styles.personHeader}>
              {customerProfile.image ? (
                <Image source={{ uri: customerProfile.image }} style={styles.personAvatar} />
              ) : (
                <View style={styles.personAvatarFallback}>
                  <Ionicons name="person-outline" size={20} color="#1B5E20" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{customerProfile.name}</Text>
                <Text style={styles.personRole}>Customer</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color="#888" />
              <Text style={styles.infoText}>
                {customerProfile.address || 'Address not available'}
              </Text>
            </View>
            {customerProfile.phone && (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={16} color="#888" />
                <Text style={styles.infoText}>
                  {customerProfile.phone}
                </Text>
              </View>
            )}
            <View style={styles.actionBtnRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#E3F2FD' }]}
                onPress={() => openMap(customerProfile.address)}
              >
                <Ionicons name="navigate-outline" size={18} color="#2196F3" />
                <Text style={[styles.actionBtnText, { color: '#2196F3' }]}>Directions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#FFF3E0' }]}
                onPress={() => callPerson(customerProfile.phone)}
              >
                <Ionicons name="call-outline" size={18} color="#FF9800" />
                <Text style={[styles.actionBtnText, { color: '#FF9800' }]}>Call Customer</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Order Items / Products */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="package-variant" size={20} color="#1B5E20" />
            <Text style={styles.cardTitle}>Order Items</Text>
          </View>

          {items.length > 0 ? (
            items.map((item, i) => (
              <View key={i} style={styles.productRow}>
                {item.image_url && (
                  <Image source={{ uri: item.image_url }} style={styles.productImage} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{item.product_name || item.name || 'Product'}</Text>
                  <Text style={styles.productQty}>
                    Qty: {item.quantity || 1} {item.unit && `(${item.unit})`}
                  </Text>
                </View>
                <Text style={styles.productPrice}>
                  ₹{Number(item.total_price || item.price || 0).toFixed(2)}
                </Text>
              </View>
            ))
          ) : singleProduct ? (
            <View style={styles.productRow}>
              {singleProduct.image_url && (
                <Image source={{ uri: singleProduct.image_url }} style={styles.productImage} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{singleProduct.name || 'Product'}</Text>
                <Text style={styles.productQty}>Qty: {order?.quantity || 1}</Text>
              </View>
              <Text style={styles.productPrice}>
                ₹{Number(order?.total_price || order?.total_amount || 0).toFixed(2)}
              </Text>
            </View>
          ) : (
            <Text style={styles.noItems}>Product details not available</Text>
          )}

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>
              ₹{Number(order?.total_price || order?.total_amount || order?.grand_total || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.paymentRow}>
            <Ionicons name="card-outline" size={16} color="#888" />
            <Text style={styles.paymentText}>
              Payment: {order?.payment_method || order?.payment_status || 'COD'}
            </Text>
          </View>
        </View>

        {/* QR Code */}
        {(order?.qr_code || order?.qr_image_url) && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="qr-code-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Order QR Code</Text>
            </View>
            {order?.qr_image_url ? (
              <View style={styles.qrContainer}>
                <Image source={{ uri: order.qr_image_url }} style={styles.qrImage} resizeMode="contain" />
              </View>
            ) : (
              <View style={styles.qrContainer}>
                <Text style={styles.qrText}>{order.qr_code}</Text>
              </View>
            )}
          </View>
        )}

        {/* Status Timeline */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="git-branch-outline" size={20} color="#1B5E20" />
            <Text style={styles.cardTitle}>Order Timeline (10 Steps)</Text>
          </View>
          {renderTimeline()}
        </View>

        {/* Action button: routes to Scanner for destination, OrderUpdate for pickup */}
        {action && currentStatus !== 'DELIVERED' && currentStatus !== 'CANCELLED' && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.primaryActionBtn}
              onPress={handleAction}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={Colors.gradientHeroDark}
                style={styles.primaryActionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name={action.icon} size={22} color="#fff" />
                <Text style={styles.primaryActionText}>{action.label}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: Radius.xxl,
    borderBottomRightRadius: Radius.xxl,
  },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: Font.xl, fontWeight: Font.weightBold, color: Colors.textOnDark, marginLeft: 12 },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Status card
  statusCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
    ...shadowStyle('sm'),
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: Font.xl, fontWeight: Font.weightExtraBold, textTransform: 'uppercase' },
  statusSub: { fontSize: Font.sm, color: Colors.textMuted, marginTop: 8 },

  // Cards
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 14,
    ...shadowStyle('sm'),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: Font.base, fontWeight: Font.weightExtraBold, color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },

  personHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  personAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EAF4EA' },
  personAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EAF4EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  personName: { fontSize: Font.lg, fontWeight: Font.weightExtraBold, color: Colors.textPrimary, marginBottom: 2 },
  personRole: { fontSize: Font.xs, color: Colors.textMuted, fontWeight: Font.weightSemiBold },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  infoText: { flex: 1, fontSize: Font.sm, color: Colors.textSecondary, lineHeight: 19 },

  // Action buttons row
  actionBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.md,
    paddingVertical: 10,
  },
  actionBtnText: { fontSize: Font.sm, fontWeight: Font.weightSemiBold },

  // Products
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: 12,
  },
  productImage: { width: 50, height: 50, borderRadius: 10 },
  productName: { fontSize: Font.base, fontWeight: Font.weightSemiBold, color: Colors.textPrimary },
  productQty: { fontSize: Font.sm, color: Colors.textMuted, marginTop: 2 },
  productPrice: { fontSize: Font.md, fontWeight: Font.weightExtraBold, color: Colors.primary },
  noItems: { fontSize: Font.sm, color: Colors.textLight, textAlign: 'center', padding: 16 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    marginTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: Colors.primarySoft,
  },
  totalLabel: { fontSize: Font.base, fontWeight: Font.weightExtraBold, color: Colors.textPrimary },
  totalValue: { fontSize: Font.xxl, fontWeight: Font.weightExtraBold, color: Colors.primary },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  paymentText: { fontSize: Font.sm, color: Colors.textMuted },

  // QR Code
  qrContainer: { alignItems: 'center', padding: 16 },
  qrImage: { width: 180, height: 180 },
  qrText: { fontSize: Font.base, fontFamily: 'monospace', color: Colors.textSecondary, textAlign: 'center' },

  // Timeline
  timelineContainer: { paddingLeft: 4 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 40 },
  timelineLeft: { alignItems: 'center', width: 28, marginRight: 12 },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotCurrent: {
    width: 26,
    height: 26,
    borderRadius: 13,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  timelineLine: { width: 2, flex: 1, marginVertical: 2 },
  timelineText: { fontSize: Font.sm, color: Colors.textLight, paddingTop: 3, flex: 1 },
  timelineTextActive: { color: Colors.textSecondary, fontWeight: Font.weightMedium },
  timelineTextCurrent: { color: Colors.primary, fontWeight: Font.weightBold, fontSize: Font.sm },

  // Actions
  actionsContainer: { gap: 12, marginTop: 8 },
  primaryActionBtn: { borderRadius: Radius.lg, overflow: 'hidden', ...shadowStyle('md') },
  primaryActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  primaryActionText: { color: Colors.textOnDark, fontSize: Font.lg, fontWeight: Font.weightExtraBold },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: Radius.lg,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  secondaryActionText: { color: '#FF9800', fontSize: Font.md, fontWeight: Font.weightBold },
});

export default OrderDetails;
