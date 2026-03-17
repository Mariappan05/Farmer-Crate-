import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { getFarmerOrders } from '../../services/orderService';
import ToastMessage from '../../utils/Toast';

const DATE_RANGES = ['All Time', 'This Month', 'Last Month', 'This Week'];

const SellingHistory = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const toastRef = useRef(null);

  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState('All Time');

  // Stats
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);
  const [monthlyData, setMonthlyData] = useState([]);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await getFarmerOrders();
      const all = Array.isArray(data) ? data : data?.orders || [];

      // Filter delivered — backend uses current_status (COMPLETED or DELIVERED)
      const delivered = all.filter(
        (o) => ['DELIVERED', 'COMPLETED'].includes((o.current_status || o.status || '').toUpperCase())
      );

      delivered.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
      setDeliveredOrders(delivered);

      // Compute stats
      const total = delivered.reduce(
        (sum, o) => sum + parseFloat(o.total_price || o.total_amount || o.total || 0),
        0
      );
      setTotalRevenue(total);
      setOrderCount(delivered.length);
      setAvgOrderValue(delivered.length > 0 ? total / delivered.length : 0);

      // Monthly
      computeMonthlyData(delivered);
    } catch (e) {
      toastRef.current?.show(e?.response?.data?.message || e.message || 'Failed to load selling history', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const computeMonthlyData = (orders) => {
    const map = {};
    orders.forEach((o) => {
      const d = new Date(o.created_at || o.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (!map[key]) map[key] = { key, label, total: 0, count: 0 };
      map[key].total += parseFloat(o.total_price || o.total_amount || o.total || 0);
      map[key].count += 1;
    });

    const sorted = Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
    setMonthlyData(sorted.slice(-6)); // last 6 months
  };

  useEffect(() => { fetchHistory(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchHistory(); };

  const getFilteredOrders = () => {
    const now = new Date();
    return deliveredOrders.filter((o) => {
      if (dateRange === 'All Time') return true;
      const date = new Date(o.created_at || o.date);
      if (dateRange === 'This Month') {
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      }
      if (dateRange === 'Last Month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return date.getMonth() === lastMonth.getMonth() && date.getFullYear() === lastMonth.getFullYear();
      }
      if (dateRange === 'This Week') {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return date >= weekStart;
      }
      return true;
    });
  };

  const filteredOrders = getFilteredOrders();

  // Filtered stats
  const filteredRevenue = filteredOrders.reduce(
    (sum, o) => sum + parseFloat(o.total_price || o.total_amount || o.total || 0),
    0
  );

  const maxMonthly = monthlyData.length > 0 ? Math.max(...monthlyData.map((m) => m.total)) : 1;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderOrderCard = ({ item }) => {
    // Resolve fields from Sequelize associations or flat fields
    const orderId = item.order_id || item.id;
    const productName = item.Product?.name || item.product?.name || (() => {
      if (item.items_json) {
        try { const p = JSON.parse(item.items_json); return Array.isArray(p) && p[0] ? (p[0].name || p[0].product_name || '') : ''; } catch (_) { return ''; }
      }
      return '';
    })() || 'Product';
    const customerName = item.customer?.name || item.customer?.full_name || item.customer_name || 'Customer';
    const total = parseFloat(item.total_price || item.total_amount || item.total || 0);
    const farmerAmt = parseFloat(item.farmer_amount || 0);
    const qty = item.quantity || 1;
    const pricePerUnit = parseFloat(item.Product?.current_price || 0);

    return (
      <View style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: '#4CAF50' }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.orderId} numberOfLines={1}>{productName}</Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at || item.date)}</Text>
          </View>
          <Text style={styles.orderTotal}>₹{total.toLocaleString('en-IN')}</Text>
        </View>

        {/* Customer */}
        <View style={styles.customerRow}>
          <Ionicons name="person-outline" size={15} color="#888" />
          <Text style={styles.customerName}>{customerName}</Text>
        </View>

        {/* Qty + Price */}
        <View style={styles.customerRow}>
          <Ionicons name="layers-outline" size={14} color="#888" />
          <Text style={styles.customerName}>Qty: {qty}</Text>
          {pricePerUnit > 0 && (
            <Text style={[styles.customerName, { marginLeft: 10, color: '#1B5E20' }]}>
              ₹{pricePerUnit.toFixed(2)}/unit
            </Text>
          )}
        </View>

        {/* Farmer share */}
        {farmerAmt > 0 && (
          <View style={styles.customerRow}>
            <MaterialCommunityIcons name="cash" size={14} color="#4CAF50" />
            <Text style={[styles.customerName, { color: '#2E7D32', fontWeight: '600' }]}>
              Your earning: ₹{farmerAmt.toFixed(2)}
            </Text>
          </View>
        )}

        <View style={styles.deliveredBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
          <Text style={styles.deliveredText}>Delivered</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ marginTop: 12, color: '#666' }}>Loading history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <LinearGradient
        colors={['#103A12', '#1B5E20', '#2E7D32']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Text style={styles.headerTitle}>Selling History</Text>
      </LinearGradient>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => String(item.order_id || item.id)}
        renderItem={renderOrderCard}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Revenue Summary Cards */}
            <View style={styles.summaryRow}>
              <LinearGradient
                colors={['#103A12', '#1B5E20', '#2E7D32']}
                style={styles.summaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name="cash-multiple" size={24} color="#fff" />
                <Text style={styles.summaryValue}>
                  ₹{filteredRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
                <Text style={styles.summaryLabel}>Total Revenue</Text>
              </LinearGradient>

              <View style={styles.summarySmallCol}>
                <View style={[styles.summarySmallCard, { backgroundColor: '#E3F2FD' }]}>
                  <Ionicons name="receipt-outline" size={20} color="#1976D2" />
                  <Text style={[styles.summarySmallValue, { color: '#1976D2' }]}>
                    {filteredOrders.length}
                  </Text>
                  <Text style={styles.summarySmallLabel}>Orders</Text>
                </View>
                <View style={[styles.summarySmallCard, { backgroundColor: '#FFF3E0' }]}>
                  <Ionicons name="analytics-outline" size={20} color="#E65100" />
                  <Text style={[styles.summarySmallValue, { color: '#E65100' }]}>
                    ₹{filteredOrders.length > 0
                      ? Math.round(filteredRevenue / filteredOrders.length).toLocaleString('en-IN')
                      : '0'}
                  </Text>
                  <Text style={styles.summarySmallLabel}>Avg Order</Text>
                </View>
              </View>
            </View>

            {/* Monthly Bar Chart */}
            {monthlyData.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Monthly Revenue</Text>
                <View style={styles.chartContainer}>
                  {monthlyData.map((m, idx) => {
                    const barH = maxMonthly > 0 ? (m.total / maxMonthly) * 130 : 0;
                    return (
                      <View key={idx} style={styles.barCol}>
                        <Text style={styles.barValue}>
                          ₹{m.total >= 1000 ? `${(m.total / 1000).toFixed(1)}k` : m.total}
                        </Text>
                        <View style={styles.barWrapper}>
                          <LinearGradient
                            colors={['#4CAF50', '#81C784']}
                            style={[styles.bar, { height: Math.max(barH, 4) }]}
                          />
                        </View>
                        <Text style={styles.barLabel}>{m.label}</Text>
                        <Text style={styles.barCount}>{m.count} orders</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Date Filters */}
            <View style={styles.filterContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {DATE_RANGES.map((range) => {
                  const active = dateRange === range;
                  return (
                    <TouchableOpacity
                      key={range}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setDateRange(range)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {range}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Results header */}
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                {filteredOrders.length} completed order{filteredOrders.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No completed orders yet</Text>
            <Text style={styles.emptySubtext}>Your delivered orders will appear here</Text>
          </View>
        }
      />
      <ToastMessage ref={toastRef} />
    </View>
  );
};

export default SellingHistory;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },

  /* Summary */
  summaryRow: { flexDirection: 'row', margin: 16, gap: 12 },
  summaryGradient: {
    flex: 1.2,
    borderRadius: 18,
    padding: 18,
    justifyContent: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  summaryValue: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 10 },
  summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },

  summarySmallCol: { flex: 1, gap: 12 },
  summarySmallCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  summarySmallValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  summarySmallLabel: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '500' },

  /* Chart */
  chartCard: {
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
  },
  chartTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A', marginBottom: 16 },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', flex: 1 },
  barValue: { fontSize: 10, color: '#888', marginBottom: 4 },
  barWrapper: { width: 28, justifyContent: 'flex-end', height: 130 },
  bar: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 10, color: '#888', marginTop: 6, textAlign: 'center' },
  barCount: { fontSize: 9, color: '#bbb', marginTop: 1 },

  /* Filters */
  filterContainer: { marginTop: 12 },
  filterScroll: { paddingHorizontal: 12 },
  filterChip: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 22,
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
  },
  filterChipActive: { backgroundColor: '#1B5E20' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '600' },
  filterChipTextActive: { color: '#fff', fontWeight: '800' },

  resultsHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  resultsCount: { fontSize: 14, color: '#888', fontWeight: '600' },

  /* Order Card */
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 7,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderId: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  orderDate: { fontSize: 12, color: '#999', marginTop: 2, fontWeight: '500' },
  orderTotal: { fontSize: 18, fontWeight: '800', color: '#1B5E20' },

  customerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  customerName: { fontSize: 13, color: '#555', fontWeight: '500' },

  productsRow: { marginTop: 8, paddingLeft: 4 },
  productLine: { fontSize: 12, color: '#666', marginBottom: 2 },
  moreProducts: { fontSize: 11, color: '#999', fontStyle: 'italic', marginTop: 2 },

  deliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  deliveredText: { fontSize: 12, fontWeight: '700', color: '#2E7D32' },

  /* Empty */
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: '#888', marginTop: 12, fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#bbb', marginTop: 4 },
});
