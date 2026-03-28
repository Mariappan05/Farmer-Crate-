import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
  Image,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { BASE_URL } from '../../services/api';
import { Colors, Font, Radius, Spacing, shadowStyle } from '../../utils/theme';

const STATUS_COLORS = {
  DELIVERED: '#4CAF50',
  COMPLETED: '#4CAF50',
  CANCELLED: '#F44336',
  FAILED: '#F44336',
  OUT_FOR_DELIVERY: '#FF9800',
  IN_TRANSIT: '#00BCD4',
  SHIPPED: '#2196F3',
  PICKUP_IN_PROGRESS: '#9C27B0',
  ASSIGNED: '#607D8B',
};

const HISTORY_STATUSES = [
  'PICKED_UP',
  'RECEIVED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'REACHED_DESTINATION',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
  'TRANSFERRED',
];

const normalizeOrders = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.orders)) return payload.data.orders;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
};

const normalizeStatus = (order) => (order?.current_status || order?.status || '').toUpperCase();

const pickFirst = (...values) => values.find((value) => !!value);

const API_ORIGIN = BASE_URL.replace(/\/api$/i, '');

const toAbsoluteImageUrl = (value) => {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\\/g, '/');
  if (!cleaned) return null;
  if (/^\/\//.test(cleaned)) return `https:${cleaned}`;
  if (/^https?:\/\//i.test(cleaned) || /^data:image\//i.test(cleaned)) return cleaned;
  return `${API_ORIGIN}${cleaned.startsWith('/') ? '' : '/'}${cleaned}`;
};

const getProductImageCandidates = (order) => {
  const product = order?.product || order?.Product || {};
  const productImages = Array.isArray(product.images) ? product.images : [];
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const firstItem = orderItems[0] || {};

  const primaryImage = productImages.find((img) => img?.is_primary === true);
  const firstProductImage = productImages[0];

  const rawCandidates = [
      product?.image_url,
      product?.image,
      product?.photo,
      primaryImage?.image_url,
      primaryImage?.url,
      firstProductImage?.image_url,
      firstProductImage?.url,
      firstItem?.product?.image_url,
      firstItem?.product?.image,
      firstItem?.image_url,
      order?.product_image,
      order?.image_url,
      order?.image
  ];

  return rawCandidates
    .map(toAbsoluteImageUrl)
    .filter(Boolean);
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

const getPartyDetails = (order) => {
  const farmer = order?.farmer || order?.pickup_farmer || null;
  const customer = order?.customer || order?.delivery_customer || null;

  const farmerName = pickFirst(
    farmer?.name,
    farmer?.full_name,
    order?.farmer_name,
    order?.pickup_farmer_name,
    null
  );
  const customerName = pickFirst(
    customer?.name,
    customer?.full_name,
    order?.customer_name,
    order?.delivery_customer_name,
    null
  );

  return {
    farmer: {
      name: farmerName,
      phone: pickFirst(farmer?.mobile_number, farmer?.phone, order?.farmer_phone, null),
      image: toAbsoluteImageUrl(
        pickFirst(
          farmer?.image_url,
          farmer?.profile_image,
          farmer?.image,
          order?.farmer_image_url,
          order?.farmer_image
        )
      ),
    },
    customer: {
      name: customerName,
      phone: pickFirst(customer?.mobile_number, customer?.phone, order?.customer_phone, null),
      image: toAbsoluteImageUrl(
        pickFirst(
          customer?.image_url,
          customer?.profile_image,
          customer?.image,
          order?.customer_image_url,
          order?.customer_image
        )
      ),
    },
  };
};

const FILTER_OPTIONS = [
  { key: 'All', label: 'All' },
  { key: 'Pickups', label: 'Pickups' },
  { key: 'Deliveries', label: 'Deliveries' },
  { key: 'DELIVERED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const DeliveryHistory = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState([]);
  const [productImageById, setProductImageById] = useState({});
  const [brokenUris, setBrokenUris] = useState({});
  const [filter, setFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMissingProductImages = useCallback(async (orders) => {
    const uniqueProductIds = Array.from(
      new Set(
        orders
          .filter((o) => getProductImageCandidates(o).length === 0)
          .map((o) => o?.product_id)
          .filter(Boolean)
      )
    );

    if (uniqueProductIds.length === 0) return;

    const results = await Promise.allSettled(
      uniqueProductIds.map((productId) => api.get(`/products/${productId}`))
    );

    const nextMap = {};
    results.forEach((result, idx) => {
      const productId = uniqueProductIds[idx];
      if (result.status !== 'fulfilled') {
        nextMap[productId] = null;
        return;
      }

      const productPayload = result.value?.data?.data || result.value?.data || {};
      const product = productPayload?.product || productPayload;
      const productCandidates = getProductImageCandidates({ product });
      nextMap[productId] = productCandidates[0] || null;
    });

    setProductImageById((prev) => ({ ...prev, ...nextMap }));
  }, []);

  // ─── Fetch ────────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get('/delivery-persons/orders/history');
      const data = normalizeOrders(res.data);

      if (data.length > 0) {
        setHistory(data);
        loadMissingProductImages(data).catch(() => {});
        return;
      }

      // Some backends return empty history endpoint; fallback to orders endpoint.
      const res2 = await api.get('/delivery-persons/orders');
      const all = normalizeOrders(res2.data);
      const done = all.filter((o) => HISTORY_STATUSES.includes(normalizeStatus(o)));
      setHistory(done);
      loadMissingProductImages(done).catch(() => {});
    } catch (e) {
      try {
        const res2 = await api.get('/delivery-persons/orders');
        const all = normalizeOrders(res2.data);
        const done = all.filter((o) => HISTORY_STATUSES.includes(normalizeStatus(o)));
        setHistory(done);
        loadMissingProductImages(done).catch(() => {});
      } catch {
        console.log('Failed to fetch delivery history');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [loadMissingProductImages]);

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchHistory);
    return unsubscribe;
  }, [navigation, fetchHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  // ─── Filtered data ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    switch (filter) {
      case 'All':
        return history;
      case 'Pickups':
        return history.filter((o) =>
          ['PICKED_UP', 'RECEIVED', 'SHIPPED', 'TRANSFERRED'].includes(normalizeStatus(o))
        );
      case 'Deliveries':
        return history.filter((o) =>
          ['OUT_FOR_DELIVERY', 'REACHED_DESTINATION', 'DELIVERED', 'COMPLETED'].includes(normalizeStatus(o))
        );
      default:
        return history.filter((o) => normalizeStatus(o) === filter);
    }
  }, [filter, history]);

  // ─── Stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const delivered = history.filter((o) =>
      ['DELIVERED', 'COMPLETED'].includes(normalizeStatus(o))
    );
    const totalEarnings = delivered.reduce(
      (sum, d) => sum + Number(d.delivery_charge || d.earnings || d.transport_charge || 0),
      0
    );
    const totalDistance = delivered.reduce(
      (sum, d) => sum + Number(d.distance || d.estimated_distance || 0),
      0
    );
    return {
      total: history.length,
      completed: delivered.length,
      cancelled: history.filter((o) =>
        ['CANCELLED', 'FAILED'].includes(normalizeStatus(o))
      ).length,
      totalEarnings,
      totalDistance,
    };
  }, [history]);

  // ─── Type icon ────────────────────────────────────────────────────────
  const getTypeInfo = (status) => {
    const s = (status || '').toUpperCase();
    if (['PICKED_UP', 'RECEIVED', 'SHIPPED', 'TRANSFERRED'].includes(s)) {
      return { icon: 'cube-outline', label: 'Pickup', color: '#9C27B0' };
    }
    if (['REACHED_DESTINATION', 'OUT_FOR_DELIVERY'].includes(s)) {
      return { icon: 'bicycle-outline', label: 'Delivery', color: '#2196F3' };
    }
    if (['DELIVERED', 'COMPLETED'].includes(s)) {
      return { icon: 'checkmark-circle-outline', label: 'Completed', color: '#4CAF50' };
    }
    return { icon: 'close-circle-outline', label: 'Cancelled', color: '#F44336' };
  };

  // ─── Render card ──────────────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const status = normalizeStatus(item) || 'UNKNOWN';
    const color = STATUS_COLORS[status] || '#888';
    const typeInfo = getTypeInfo(status);
    const productName = pickFirst(
      item.product?.name,
      item.product_name,
      item.item_name,
      item.title,
      'Product'
    );
    const productImageCandidates = getProductImageCandidates(item);
    const fallbackImage = item?.product_id ? productImageById[item.product_id] : null;
    const allCandidates = [...productImageCandidates, ...(fallbackImage ? [fallbackImage] : [])]
      .filter(Boolean)
      .filter((uri, idx, arr) => arr.indexOf(uri) === idx);
    const productImage = allCandidates.find((uri) => !brokenUris[uri]) || null;
    const quantity = Number(item.quantity || item.qty || item.product?.quantity || 0);
    const totalAmount = Number(item.total_price || item.total_amount || item.amount || 0);
    const paymentMethod = pickFirst(item.payment_method, item.payment_type, item.payment?.method, 'N/A');
    const earning = Number(item.delivery_charge || item.earnings || item.transport_charge || 0);
    const dateStr = item.delivery_date || item.order_date || item.updated_at || '';
    const pickupAddr = formatAddress(item.pickup_address || item.farmer?.address || item.farmer?.farm_address || '');
    const deliveryAddr = formatAddress(item.delivery_address || item.customer?.address || '');
    const parties = getPartyDetails(item);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('OrderDetails', { order: item })}
        activeOpacity={0.7}
      >
        {/* Top row: product image + product name + status */}
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            {productImage ? (
              <Image
                source={{ uri: productImage }}
                style={styles.productImage}
                onError={() => setBrokenUris((prev) => ({ ...prev, [productImage]: true }))}
              />
            ) : (
              <View style={[styles.productImageFallback, { backgroundColor: typeInfo.color + '15' }]}>
                <Ionicons name={typeInfo.icon} size={20} color={typeInfo.color} />
              </View>
            )}
            <View>
              <Text style={styles.productName} numberOfLines={1}>{productName}</Text>
              <Text style={styles.typeLabel}>{typeInfo.label}</Text>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: color + '18' }]}>
            <Text style={[styles.badgeText, { color }]}>{status.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        {/* Detail rows */}
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Quantity</Text>
            <Text style={styles.detailValue}>{quantity > 0 ? quantity : 'N/A'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Order Amount</Text>
            <Text style={styles.detailValue}>{totalAmount > 0 ? `₹${totalAmount.toFixed(0)}` : 'N/A'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Payment</Text>
            <Text style={styles.detailValue}>{String(paymentMethod).replace(/_/g, ' ')}</Text>
          </View>
        </View>

        {/* Addresses */}
        <View style={styles.addressSection}>
          {pickupAddr ? (
            <View style={styles.addressRow}>
              <View style={[styles.addressDot, { backgroundColor: '#4CAF50' }]} />
              <Text style={styles.addressText} numberOfLines={1}>
                {pickupAddr}
              </Text>
            </View>
          ) : null}
          {deliveryAddr ? (
            <View style={styles.addressRow}>
              <View style={[styles.addressDot, { backgroundColor: '#F44336' }]} />
              <Text style={styles.addressText} numberOfLines={1}>
                {deliveryAddr}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Customer / Farmer name */}
        <View style={styles.peopleCard}>
          <Text style={styles.peopleTitle}>People</Text>

          {parties.farmer.name ? (
            <View style={styles.personRow}>
              {parties.farmer.image ? (
                <Image
                  source={{ uri: parties.farmer.image }}
                  style={styles.personAvatar}
                  onError={() => setBrokenUris((prev) => ({ ...prev, [parties.farmer.image]: true }))}
                />
              ) : (
                <View style={styles.personAvatarFallback}>
                  <Ionicons name="leaf-outline" size={14} color="#2E7D32" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.personLabel}>Farmer</Text>
                <Text style={styles.personName} numberOfLines={1}>{parties.farmer.name}</Text>
              </View>
              {parties.farmer.phone ? <Text style={styles.personPhone}>{parties.farmer.phone}</Text> : null}
            </View>
          ) : null}

          {parties.customer.name ? (
            <View style={styles.personRow}>
              {parties.customer.image ? (
                <Image
                  source={{ uri: parties.customer.image }}
                  style={styles.personAvatar}
                  onError={() => setBrokenUris((prev) => ({ ...prev, [parties.customer.image]: true }))}
                />
              ) : (
                <View style={styles.personAvatarFallback}>
                  <Ionicons name="person-outline" size={14} color="#1565C0" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.personLabel}>Customer</Text>
                <Text style={styles.personName} numberOfLines={1}>{parties.customer.name}</Text>
              </View>
              {parties.customer.phone ? <Text style={styles.personPhone}>{parties.customer.phone}</Text> : null}
            </View>
          ) : null}
        </View>

        {/* Bottom row: date + earnings */}
        <View style={styles.cardBottom}>
          {dateStr ? (
            <Text style={styles.date}>
              {new Date(dateStr).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          ) : (
            <Text style={styles.date}>—</Text>
          )}
          {earning > 0 ? (
            <Text style={styles.earnings}>₹{earning.toFixed(0)}</Text>
          ) : (
            <Text style={[styles.earnings, { color: '#aaa' }]}>—</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Empty component ──────────────────────────────────────────────────
  const EmptyList = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="clipboard-text-clock-outline" size={72} color="#C8E6C9" />
      <Text style={styles.emptyTitle}>No History Found</Text>
      <Text style={styles.emptyMsg}>
        {filter === 'All'
          ? 'Your completed deliveries will appear here'
          : `No ${filter.toLowerCase()} orders found`}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={Colors.gradientHeroDark} style={styles.header}>
        <Text style={styles.headerTitle}>Delivery History</Text>
        <Text style={styles.headerSub}>{stats.total} total orders</Text>
      </LinearGradient>

      {/* Stats Summary */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="checkmark-done-circle-outline" size={20} color="#4CAF50" />
          <Text style={styles.statVal}>{stats.completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="close-circle-outline" size={20} color="#F44336" />
          <Text style={styles.statVal}>{stats.cancelled}</Text>
          <Text style={styles.statLabel}>Cancelled</Text>
        </View>
        <View style={styles.statCard}>
          <MaterialCommunityIcons name="map-marker-distance" size={20} color="#2196F3" />
          <Text style={styles.statVal}>{stats.totalDistance.toFixed(0)} km</Text>
          <Text style={styles.statLabel}>Distance</Text>
        </View>
        <View style={styles.statCard}>
          <MaterialCommunityIcons name="cash-multiple" size={20} color="#FF9800" />
          <Text style={styles.statVal}>₹{stats.totalEarnings.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Earned</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.chipRow}>
        {FILTER_OPTIONS.map((item) => (
          <TouchableOpacity
            key={item.key}
            onPress={() => setFilter(item.key)}
            style={[styles.chip, filter === item.key && styles.chipActive]}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.chipText, filter === item.key && styles.chipTextActive]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            {filter === item.key && (
              <View style={styles.chipCount}>
                <Text style={styles.chipCountText}>{filtered.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Main List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, index) => String(item.order_id || item.id || `history-${index}`)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
          ListEmptyComponent={<EmptyList />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.base,
    borderBottomLeftRadius: Radius.xxl,
    borderBottomRightRadius: Radius.xxl,
  },
  headerTitle: { fontSize: Font.xxxl, fontWeight: Font.weightExtraBold, color: Colors.textOnDark, letterSpacing: 0.2 },
  headerSub: { fontSize: Font.sm, color: Colors.textOnDarkSoft, marginTop: 2 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    gap: 6,
    minHeight: 70,
    justifyContent: 'center',
  },
  statVal: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  statLabel: { fontSize: 10, color: '#888', fontWeight: '500' },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: '#fff',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F8F4',
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    minWidth: '31%',
    maxWidth: '48%',
  },
  chipActive: { backgroundColor: '#1B5E20' },
  chipText: { fontSize: 13, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  chipCount: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  chipCountText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  // Card
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EAF2EA',
    ...shadowStyle('md'),
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f3f3f3',
  },
  productImageFallback: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productName: { fontSize: Font.base, fontWeight: Font.weightBold, color: Colors.textPrimary, maxWidth: 180 },
  typeLabel: { fontSize: Font.xs, color: Colors.textMuted, marginTop: 1, fontWeight: Font.weightMedium },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: Font.weightExtraBold, textTransform: 'uppercase', letterSpacing: 0.3 },

  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
    backgroundColor: '#FAFCFA',
  },
  detailItem: {
    width: '50%',
    marginBottom: 8,
    paddingRight: 8,
  },
  detailLabel: {
    fontSize: Font.xs,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: Font.sm,
    color: Colors.textPrimary,
    fontWeight: Font.weightBold,
  },

  // Addresses
  addressSection: { marginBottom: 10, gap: 6 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addressDot: { width: 8, height: 8, borderRadius: 4 },
  addressText: { flex: 1, fontSize: Font.sm, color: Colors.textSecondary },

  // Person
  peopleCard: {
    borderWidth: 1,
    borderColor: '#E7F2E7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    backgroundColor: '#F9FCF9',
    gap: 8,
  },
  peopleTitle: {
    fontSize: Font.xs,
    fontWeight: Font.weightExtraBold,
    color: '#1B5E20',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EAF4EA',
  },
  personAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EAF4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: Font.weightSemiBold,
  },
  personName: { fontSize: Font.sm, color: Colors.textSecondary, flex: 1, fontWeight: Font.weightBold },
  personPhone: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: Font.weightMedium,
  },

  // Bottom
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: 10,
  },
  date: { fontSize: Font.xs, color: Colors.textMuted },
  earnings: { fontSize: Font.lg, fontWeight: Font.weightExtraBold, color: Colors.primary },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: Font.base, color: Colors.textSecondary, marginTop: 10 },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: 50, gap: 8 },
  emptyTitle: { fontSize: Font.xl, fontWeight: Font.weightExtraBold, color: Colors.textPrimary },
  emptyMsg: { fontSize: Font.base, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
});

export default DeliveryHistory;
