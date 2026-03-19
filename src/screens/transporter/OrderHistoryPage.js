/**
 * OrderHistoryPage.js
 * Order history with filter chips and stats summary.
 *
 * Features:
 *   - GET /api/orders/transporter/allocated (fallbacks to transporter history endpoints)
 *   - Filter chips: All, Completed, Cancelled
 *   - Order cards with status, date, from/to, amount
 *   - Stats summary: total, completed, cancelled
 *   - Pull to refresh
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';

const FILTERS = ['All', 'Completed', 'Cancelled'];

const getStatusColor = (s) => {
  const u = (s || '').toUpperCase();
  if (u === 'DELIVERED' || u === 'COMPLETED') return '#4CAF50';
  if (u === 'SHIPPED') return '#3F51B5';
  if (u === 'OUT_FOR_DELIVERY') return '#00BCD4';
  if (u === 'ASSIGNED') return '#9C27B0';
  if (u === 'CANCELLED') return '#F44336';
  return '#FF9800';
};

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const formatCurrency = (a) => '₹' + (parseFloat(a) || 0).toFixed(2);

const OrderHistoryPage = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');

  /* ── Fetch ──────────────────────────────────────────────── */
  const fetchHistory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let data = [];
      try {
        const allocatedRes = await api.get('/orders/transporter/allocated');
        const allocated = allocatedRes.data?.data || allocatedRes.data?.orders || allocatedRes.data || [];
        data = (Array.isArray(allocated) ? allocated : []).filter((o) => {
          const st = (o.current_status || o.status || '').toUpperCase();
          return st === 'COMPLETED' || st === 'DELIVERED' || st === 'CANCELLED';
        });
      } catch {
        try {
          const res = await api.get('/transporters/orders/history');
          data = res.data?.data || res.data?.orders || res.data || [];
        } catch {
          const res2 = await api.get('/transporters/orders');
          data = res2.data?.data || res2.data?.orders || res2.data || [];
        }
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('History fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchHistory(true));
    return unsub;
  }, [navigation, fetchHistory]);

  /* ── Computed ────────────────────────────────────────────── */
  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => {
    const st = (o.current_status || o.status || '').toUpperCase();
    return st === 'DELIVERED' || st === 'COMPLETED';
  }).length;
  const cancelledOrders = orders.filter((o) => (o.current_status || o.status || '').toUpperCase() === 'CANCELLED').length;

  const filteredOrders = orders.filter((o) => {
    if (activeFilter === 'All') return true;
    const st = (o.current_status || o.status || '').toUpperCase();
    if (activeFilter === 'Completed') return st === 'DELIVERED' || st === 'COMPLETED';
    if (activeFilter === 'Cancelled') return st === 'CANCELLED';
    return true;
  });

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <Text style={styles.headerTitle}>Order History</Text>
        <Text style={styles.headerSub}>{totalOrders} total orders</Text>
      </LinearGradient>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: '#2196F3' }]}>
          <Text style={styles.statValue}>{totalOrders}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#4CAF50' }]}>
          <Text style={styles.statValue}>{completedOrders}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#F44336' }]}>
          <Text style={styles.statValue}>{cancelledOrders}</Text>
          <Text style={styles.statLabel}>Cancelled</Text>
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchHistory(true); }} colors={['#1B5E20']} />}
          showsVerticalScrollIndicator={false}
        >
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="history" size={50} color="#ccc" />
              <Text style={styles.emptyTitle}>No Orders Found</Text>
              <Text style={styles.emptyText}>
                {activeFilter === 'All' ? 'Your order history will appear here' : `No ${activeFilter.toLowerCase()} orders`}
              </Text>
            </View>
          ) : (
            filteredOrders.map((order) => {
              const orderId = order.order_id || order.id;
              const status = (order.current_status || order.status || 'PENDING').toUpperCase();
              const product = order.items?.[0]?.product || order.product || {};

              return (
                <TouchableOpacity
                  key={orderId}
                  style={styles.orderCard}
                  onPress={() => navigation.navigate('OrderDetail', { orderId, order })}
                  activeOpacity={0.7}
                >
                  <View style={styles.orderHeader}>
                    <View>
                      <Text style={styles.orderId}>Order #{orderId}</Text>
                      <Text style={styles.orderDate}>{formatDate(order.created_at || order.order_date)}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
                        {status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>

                  {product.name && (
                    <View style={styles.detailRow}>
                      <Ionicons name="cube-outline" size={14} color="#666" />
                      <Text style={styles.detailText} numberOfLines={1}>{product.name}</Text>
                    </View>
                  )}

                  <View style={styles.addressesWrap}>
                    <View style={styles.detailRow}>
                      <Ionicons name="location" size={14} color="#4CAF50" />
                      <Text style={styles.detailText} numberOfLines={1}>
                        From: {order.farmer_name || order.farmer?.full_name || order.farmer?.name || 'Farmer'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="location" size={14} color="#F44336" />
                      <Text style={styles.detailText} numberOfLines={1}>
                        To: {order.customer_name || order.customer?.full_name || order.customer?.name || 'Customer'}
                      </Text>
                    </View>
                  </View>

                  {(order.total_amount || order.amount) && (
                    <View style={styles.amountRow}>
                      <Text style={styles.amountLabel}>Amount</Text>
                      <Text style={styles.amountValue}>{formatCurrency(order.total_amount || order.amount)}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
};

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.2 },
  headerSub: { color: '#C8E6C9', fontSize: 13, marginTop: 2 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: -8, marginBottom: 8 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, marginHorizontal: 4,
    borderLeftWidth: 3, elevation: 4, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09, shadowRadius: 6, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: '#1B5E20' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '500' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E0E0E0' },
  filterChipActive: { backgroundColor: '#1B5E20' },
  filterText: { fontSize: 13, color: '#666', fontWeight: '600' },
  filterTextActive: { color: '#fff' },

  body: { flex: 1, paddingHorizontal: 16 },

  orderCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 4, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.09, shadowRadius: 7,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  orderId: { fontSize: 15, fontWeight: '800', color: '#1B5E20' },
  orderDate: { fontSize: 11, color: '#999', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  detailText: { fontSize: 13, color: '#555', flex: 1 },
  addressesWrap: { marginTop: 4, marginBottom: 4 },
  amountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10, marginTop: 8,
  },
  amountLabel: { fontSize: 13, color: '#666' },
  amountValue: { fontSize: 16, fontWeight: '800', color: '#1B5E20' },

  emptyCard: { alignItems: 'center', padding: 40, marginTop: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#888', marginTop: 4, textAlign: 'center' },
});

export default OrderHistoryPage;
