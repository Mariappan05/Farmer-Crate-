import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
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
  const [filter, setFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ─── Fetch ────────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get('/delivery-persons/orders/history');
      const data = res.data?.data || res.data?.orders || [];
      setHistory(data);
    } catch (e) {
      try {
        const res2 = await api.get('/delivery-persons/orders');
        const all = res2.data?.data || res2.data?.orders || [];
        const done = all.filter((o) =>
          ['DELIVERED', 'COMPLETED', 'CANCELLED', 'FAILED', 'OUT_FOR_DELIVERY', 'SHIPPED'].includes(
            o.current_status || o.status
          )
        );
        setHistory(done);
      } catch {
        console.log('Failed to fetch delivery history');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, []);

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
          ['ASSIGNED', 'PICKUP_IN_PROGRESS', 'SHIPPED'].includes(o.current_status || o.status)
        );
      case 'Deliveries':
        return history.filter((o) =>
          ['OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(o.current_status || o.status)
        );
      default:
        return history.filter((o) => (o.current_status || o.status) === filter);
    }
  }, [filter, history]);

  // ─── Stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const delivered = history.filter((o) =>
      ['DELIVERED', 'COMPLETED'].includes(o.current_status || o.status)
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
        ['CANCELLED', 'FAILED'].includes(o.current_status || o.status)
      ).length,
      totalEarnings,
      totalDistance,
    };
  }, [history]);

  // ─── Type icon ────────────────────────────────────────────────────────
  const getTypeInfo = (status) => {
    const s = status || '';
    if (['ASSIGNED', 'PICKUP_IN_PROGRESS'].includes(s)) {
      return { icon: 'cube-outline', label: 'Pickup', color: '#9C27B0' };
    }
    if (['SHIPPED', 'OUT_FOR_DELIVERY'].includes(s)) {
      return { icon: 'bicycle-outline', label: 'Delivery', color: '#2196F3' };
    }
    if (['DELIVERED', 'COMPLETED'].includes(s)) {
      return { icon: 'checkmark-circle-outline', label: 'Completed', color: '#4CAF50' };
    }
    return { icon: 'close-circle-outline', label: 'Cancelled', color: '#F44336' };
  };

  // ─── Render card ──────────────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const status = item.current_status || item.status || 'UNKNOWN';
    const color = STATUS_COLORS[status] || '#888';
    const typeInfo = getTypeInfo(status);
    const earning = Number(item.delivery_charge || item.earnings || item.transport_charge || 0);
    const dateStr = item.delivery_date || item.order_date || item.updated_at || '';
    const pickupAddr = item.pickup_address || item.farmer?.address || '';
    const deliveryAddr = item.delivery_address || item.customer?.address || '';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('OrderDetails', { order: item })}
        activeOpacity={0.7}
      >
        {/* Top row: type badge + order ID + date */}
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <View style={[styles.typeIcon, { backgroundColor: typeInfo.color + '15' }]}>
              <Ionicons name={typeInfo.icon} size={18} color={typeInfo.color} />
            </View>
            <View>
              <Text style={styles.orderId}>Order #{item.order_id || item.id}</Text>
              <Text style={styles.typeLabel}>{typeInfo.label}</Text>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: color + '18' }]}>
            <Text style={[styles.badgeText, { color }]}>{status.replace(/_/g, ' ')}</Text>
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
        <View style={styles.personRow}>
          <Ionicons name="person-outline" size={14} color="#888" />
          <Text style={styles.personName} numberOfLines={1}>
            {item.customer?.name || item.customer_name || item.farmer?.name || 'Customer'}
          </Text>
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
      <FlatList
        horizontal
        data={FILTER_OPTIONS}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setFilter(item.key)}
            style={[styles.chip, filter === item.key && styles.chipActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, filter === item.key && styles.chipTextActive]}>
              {item.label}
            </Text>
            {filter === item.key && (
              <View style={styles.chipCount}>
                <Text style={styles.chipCountText}>{filtered.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      />

      {/* Main List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.order_id || item.id)}
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
  chipRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, backgroundColor: '#fff' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F8F4',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
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
    marginBottom: 10,
    ...shadowStyle('sm'),
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderId: { fontSize: Font.base, fontWeight: Font.weightBold, color: Colors.textPrimary },
  typeLabel: { fontSize: Font.xs, color: Colors.textMuted, marginTop: 1, fontWeight: Font.weightMedium },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: Font.weightExtraBold, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Addresses
  addressSection: { marginBottom: 10, gap: 6 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addressDot: { width: 8, height: 8, borderRadius: 4 },
  addressText: { flex: 1, fontSize: Font.sm, color: Colors.textSecondary },

  // Person
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  personName: { fontSize: Font.sm, color: Colors.textSecondary, flex: 1, fontWeight: Font.weightMedium },

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
