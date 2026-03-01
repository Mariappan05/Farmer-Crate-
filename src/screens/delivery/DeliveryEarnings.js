import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PERIOD_LABELS = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  all: 'All Time',
};

const DeliveryEarnings = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const [period, setPeriod] = useState('week');
  const [deliveries, setDeliveries] = useState([]);
  const [allDeliveries, setAllDeliveries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState([]);

  // ─── Fetch earnings ───────────────────────────────────────────────────
  const fetchEarnings = useCallback(async () => {
    try {
      const res = await api.get('/delivery-persons/earnings', { params: { period } });
      const data = res.data?.data || res.data?.deliveries || [];
      setDeliveries(data);
      if (period === 'all') setAllDeliveries(data);
    } catch (e) {
      // Fallback: fetch from orders and filter completed
      try {
        const res2 = await api.get('/delivery-persons/orders');
        const allOrders = res2.data?.data || res2.data?.orders || [];
        const completed = allOrders.filter((o) =>
          ['DELIVERED', 'COMPLETED'].includes(o.current_status || o.status)
        );
        setAllDeliveries(completed);
        setDeliveries(filterByPeriod(completed, period));
      } catch {
        console.log('Earnings fetch error:', e.message);
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    setIsLoading(true);
    fetchEarnings();
  }, [period]);

  // Also compute monthly breakdown
  useEffect(() => {
    if (allDeliveries.length === 0 && period === 'all') return;
    const months = {};
    const source = allDeliveries.length > 0 ? allDeliveries : deliveries;
    source.forEach((d) => {
      const date = d.delivery_date || d.order_date || d.updated_at || '';
      if (!date) return;
      const key = date.slice(0, 7); // YYYY-MM
      if (!months[key]) months[key] = { month: key, count: 0, earnings: 0 };
      months[key].count += 1;
      months[key].earnings += Number(d.delivery_charge || d.earnings || d.transport_charge || 0);
    });
    const sorted = Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
    setMonthlyBreakdown(sorted.slice(0, 6)); // last 6 months
  }, [allDeliveries, deliveries]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEarnings();
  };

  // ─── Filter helpers ───────────────────────────────────────────────────
  const filterByPeriod = (data, p) => {
    const now = new Date();
    return data.filter((d) => {
      const date = new Date(d.delivery_date || d.order_date || d.updated_at || 0);
      if (p === 'today') return date.toDateString() === now.toDateString();
      if (p === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return date >= weekAgo;
      }
      if (p === 'month') {
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      }
      return true;
    });
  };

  // ─── Computed stats ───────────────────────────────────────────────────
  const totalEarnings = deliveries.reduce(
    (sum, d) => sum + Number(d.delivery_charge || d.earnings || d.transport_charge || 0),
    0
  );
  const totalDeliveries = deliveries.length;
  const avgPerDelivery = totalDeliveries > 0 ? totalEarnings / totalDeliveries : 0;

  // Calculate today/week/month from allDeliveries
  const calcForPeriod = (p) => {
    const source = allDeliveries.length > 0 ? allDeliveries : deliveries;
    const filtered = filterByPeriod(source, p);
    return filtered.reduce(
      (sum, d) => sum + Number(d.delivery_charge || d.earnings || d.transport_charge || 0),
      0
    );
  };

  const todayEarnings = calcForPeriod('today');
  const weekEarnings = calcForPeriod('week');
  const monthEarnings = calcForPeriod('month');

  // Pending payouts (simplified: total - some assumed payout %, or just show total)
  const pendingPayouts = totalEarnings * 0.3; // Simplified: 30% pending

  // Monthly chart max
  const maxMonthlyEarning = monthlyBreakdown.length > 0
    ? Math.max(...monthlyBreakdown.map((m) => m.earnings), 1)
    : 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.headerBtn}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Period Filter */}
      <View style={styles.periodRow}>
        {Object.entries(PERIOD_LABELS).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setPeriod(key)}
            style={[styles.periodChip, period === key && styles.periodChipActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodText, period === key && styles.periodTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading earnings...</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Main Earnings Display */}
          <LinearGradient
            colors={['#1B5E20', '#2E7D32', '#388E3C']}
            style={styles.totalCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.totalLabel}>{PERIOD_LABELS[period]} Earnings</Text>
            <Text style={styles.totalAmount}>₹{totalEarnings.toFixed(2)}</Text>
            <Text style={styles.totalDeliveries}>{totalDeliveries} deliveries completed</Text>
          </LinearGradient>

          {/* Breakdown Cards */}
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownCard}>
              <Ionicons name="today-outline" size={20} color="#FF9800" />
              <Text style={styles.breakdownVal}>₹{todayEarnings.toFixed(0)}</Text>
              <Text style={styles.breakdownLabel}>Today</Text>
            </View>
            <View style={styles.breakdownCard}>
              <Ionicons name="calendar-outline" size={20} color="#2196F3" />
              <Text style={styles.breakdownVal}>₹{weekEarnings.toFixed(0)}</Text>
              <Text style={styles.breakdownLabel}>This Week</Text>
            </View>
            <View style={styles.breakdownCard}>
              <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#4CAF50" />
              <Text style={styles.breakdownVal}>₹{monthEarnings.toFixed(0)}</Text>
              <Text style={styles.breakdownLabel}>This Month</Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderLeftColor: '#4CAF50' }]}>
              <Text style={styles.statVal}>₹{avgPerDelivery.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Avg / Delivery</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#FF9800' }]}>
              <Text style={styles.statVal}>₹{pendingPayouts.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Pending Payout</Text>
            </View>
          </View>

          {/* Monthly Breakdown Chart */}
          {monthlyBreakdown.length > 0 && (
            <View style={styles.chartCard}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="chart-bar" size={20} color="#1B5E20" />
                <Text style={styles.cardTitle}>Monthly Breakdown</Text>
              </View>
              {monthlyBreakdown.map((m) => {
                const barWidth = (m.earnings / maxMonthlyEarning) * 100;
                const monthName = new Date(m.month + '-01').toLocaleDateString('en-IN', {
                  month: 'short',
                  year: '2-digit',
                });
                return (
                  <View key={m.month} style={styles.chartRow}>
                    <Text style={styles.chartMonth}>{monthName}</Text>
                    <View style={styles.chartBarContainer}>
                      <View
                        style={[styles.chartBar, { width: `${Math.max(barWidth, 5)}%` }]}
                      />
                    </View>
                    <View style={styles.chartValues}>
                      <Text style={styles.chartEarning}>₹{m.earnings.toFixed(0)}</Text>
                      <Text style={styles.chartCount}>{m.count}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Delivery Breakdown List */}
          <View style={styles.listCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="list-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Earnings Per Delivery</Text>
            </View>

            {deliveries.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="cash-remove" size={64} color="#C8E6C9" />
                <Text style={styles.emptyTitle}>No Earnings Yet</Text>
                <Text style={styles.emptyMsg}>Completed deliveries will appear here</Text>
              </View>
            ) : (
              deliveries.map((d, i) => {
                const earning = Number(d.delivery_charge || d.earnings || d.transport_charge || 0);
                const dateStr = d.delivery_date || d.order_date || d.updated_at || '';
                return (
                  <View key={d.order_id || i} style={styles.deliveryRow}>
                    <View style={styles.deliveryIcon}>
                      <Ionicons name="bicycle-outline" size={20} color="#4CAF50" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deliveryOrderId}>Order #{d.order_id || d.id}</Text>
                      <Text style={styles.deliveryCustomer} numberOfLines={1}>
                        {d.customer?.name || d.customer_name || 'Customer'}
                      </Text>
                      {dateStr ? (
                        <Text style={styles.deliveryDate}>
                          {new Date(dateStr).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.deliveryEarning}>
                      {earning > 0 ? `₹${earning.toFixed(0)}` : '—'}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Pending Payouts */}
          <View style={styles.pendingCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="time-outline" size={20} color="#FF9800" />
              <Text style={[styles.cardTitle, { color: '#FF9800' }]}>Pending Payouts</Text>
            </View>
            <Text style={styles.pendingAmount}>₹{pendingPayouts.toFixed(2)}</Text>
            <Text style={styles.pendingNote}>
              Payouts are processed weekly. Contact admin for queries.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F8E9' },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Period filter
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  periodChipActive: { backgroundColor: '#388E3C' },
  periodText: { fontSize: 12, color: '#555', fontWeight: '600' },
  periodTextActive: { color: '#fff', fontWeight: '700' },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#888', marginTop: 12, fontSize: 14 },

  // Total earnings card
  totalCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  totalLabel: { fontSize: 14, color: '#C8E6C9', fontWeight: '600', marginBottom: 4 },
  totalAmount: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  totalDeliveries: { fontSize: 14, color: '#A5D6A7', marginTop: 6 },

  // Breakdown cards
  breakdownRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  breakdownCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    gap: 4,
  },
  breakdownVal: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  breakdownLabel: { fontSize: 11, color: '#888' },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  statVal: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },

  // Chart
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1B5E20', textTransform: 'uppercase', letterSpacing: 0.5 },
  chartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  chartMonth: { width: 55, fontSize: 12, color: '#666', fontWeight: '500' },
  chartBarContainer: {
    flex: 1,
    height: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    overflow: 'hidden',
  },
  chartBar: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 10 },
  chartValues: { width: 75, alignItems: 'flex-end' },
  chartEarning: { fontSize: 12, fontWeight: '700', color: '#333' },
  chartCount: { fontSize: 10, color: '#aaa' },

  // Delivery list
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  deliveryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deliveryOrderId: { fontSize: 14, fontWeight: '700', color: '#333' },
  deliveryCustomer: { fontSize: 12, color: '#666', marginTop: 2 },
  deliveryDate: { fontSize: 11, color: '#aaa', marginTop: 2 },
  deliveryEarning: { fontSize: 16, fontWeight: 'bold', color: '#1B5E20' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  emptyMsg: { fontSize: 14, color: '#888' },

  // Pending payouts
  pendingCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  pendingAmount: { fontSize: 28, fontWeight: 'bold', color: '#F57F17', marginVertical: 8 },
  pendingNote: { fontSize: 13, color: '#888', lineHeight: 18 },
});

export default DeliveryEarnings;
