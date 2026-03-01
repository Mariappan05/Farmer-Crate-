/**
 * AdminReport.js
 * Admin reports – conversion of Flutter adminreport.dart (969 lines)
 *
 * Features:
 *   - Calendar view with colour-coded dates based on order density
 *   - Monthly / weekly toggle
 *   - Total orders, revenue, average order value
 *   - Recent orders list for selected date
 *   - Order density: green (high), yellow (medium), red (low/no orders)
 *   - Date picker to select specific dates
 *   - Report summary cards
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  StatusBar,
  Animated,
  Alert,
  FlatList,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAY_SIZE = (SCREEN_WIDTH - 32 - 6 * 6) / 7; // 7 cols with 6 gaps

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatCurrency = (v) =>
  '₹' + (parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const formatDateShort = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const formatDateFull = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const isSameDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  const a = new Date(d1);
  const b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const toDateKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/* density colour */
const getDensityColor = (count, maxCount) => {
  if (!count || count === 0) return { bg: '#FFEBEE', text: '#C62828' }; // red — no orders
  const ratio = count / Math.max(maxCount, 1);
  if (ratio >= 0.6) return { bg: '#E8F5E9', text: '#1B5E20' }; // green — high
  if (ratio >= 0.25) return { bg: '#FFF8E1', text: '#F57F17' }; // yellow — medium
  return { bg: '#FFF3E0', text: '#E65100' }; // orange — low
};

/* -------------------------------------------------------------------------- */
/*  SUMMARY CARD                                                               */
/* -------------------------------------------------------------------------- */

const SummaryCard = ({ title, value, icon, mcIcon, color }) => (
  <View style={[styles.summaryCard, { borderTopColor: color }]}>
    <View style={[styles.summaryIconWrap, { backgroundColor: color + '18' }]}>
      {mcIcon ? (
        <MaterialCommunityIcons name={mcIcon} size={22} color={color} />
      ) : (
        <Ionicons name={icon} size={22} color={color} />
      )}
    </View>
    <Text style={styles.summaryValue}>{value}</Text>
    <Text style={styles.summaryTitle}>{title}</Text>
  </View>
);

/* ========================================================================== */
/*  MAIN COMPONENT                                                             */
/* ========================================================================== */

const AdminReport = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState([]);
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' | 'weekly'

  // Calendar state
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(today);

  /* fetch -------------------------------------------------------------- */
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/orders/all');
      const list = Array.isArray(data) ? data : data?.data || data?.orders || [];
      console.log('[AdminReport] Fetched', list.length, 'orders');
      setOrders(list);
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to load report data';
      console.error('[AdminReport] fetchOrders error:', msg, '\nStatus:', e?.response?.status, '\nDetails:', JSON.stringify(e?.response?.data));
      if (!silent) Alert.alert('Error', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const onRefresh = () => { setRefreshing(true); fetchOrders(true); };

  /* derived data ------------------------------------------------------- */
  const ordersByDate = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const key = toDateKey(o.created_at || o.order_date || o.date || new Date());
      if (!map[key]) map[key] = [];
      map[key].push(o);
    });
    return map;
  }, [orders]);

  const maxOrdersPerDay = useMemo(() => {
    let max = 0;
    Object.values(ordersByDate).forEach((arr) => { if (arr.length > max) max = arr.length; });
    return max;
  }, [ordersByDate]);

  /* Monthly orders for summary */
  const monthOrders = useMemo(() => {
    return orders.filter((o) => {
      const d = new Date(o.created_at || o.order_date || o.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [orders, currentMonth, currentYear]);

  const totalRevenue = useMemo(
    () => monthOrders.reduce((s, o) => s + (parseFloat(o.total_price || o.total_amount || o.total || 0)), 0),
    [monthOrders],
  );

  const avgOrderValue = monthOrders.length > 0 ? totalRevenue / monthOrders.length : 0;

  /* selected date orders */
  const selectedDateKey = toDateKey(selectedDate);
  const selectedOrders = ordersByDate[selectedDateKey] || [];

  /* weekly view orders */
  const weekOrders = useMemo(() => {
    const start = new Date(selectedDate);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return orders.filter((o) => {
      const d = new Date(o.created_at || o.order_date || o.date);
      return d >= start && d <= end;
    });
  }, [orders, selectedDate]);

  const displayOrders = viewMode === 'weekly' ? weekOrders : selectedOrders;

  /* calendar generation ------------------------------------------------ */
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const cells = [];

    // Leading blanks
    for (let i = 0; i < firstDay; i++) cells.push(null);
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = (ordersByDate[dateKey] || []).length;
      cells.push({ day: d, dateKey, count });
    }
    return cells;
  }, [currentYear, currentMonth, ordersByDate]);

  /* nav month ---------------------------------------------------------- */
  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  /* loading ------------------------------------------------------------ */
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
        <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.headerBar}>
          <Text style={styles.headerTitle}>Reports</Text>
        </LinearGradient>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#388E3C" />
          <Text style={styles.loaderText}>Loading reports…</Text>
        </View>
      </View>
    );
  }

  /* ==================================================================== */
  /*  RENDER                                                               */
  /* ==================================================================== */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.headerBar}>
        <Text style={styles.headerTitle}>Reports</Text>
        <Text style={styles.headerSub}>{MONTHS[currentMonth]} {currentYear}</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <SummaryCard title="Orders" value={monthOrders.length} icon="cart-outline" color="#7B1FA2" />
          <SummaryCard title="Revenue" value={formatCurrency(totalRevenue)} mcIcon="cash-multiple" color="#00897B" />
          <SummaryCard title="Avg Value" value={formatCurrency(avgOrderValue)} icon="analytics-outline" color="#F57C00" />
        </View>

        {/* Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'monthly' && styles.toggleBtnActive]}
            onPress={() => setViewMode('monthly')}
          >
            <Text style={[styles.toggleBtnText, viewMode === 'monthly' && styles.toggleBtnTextActive]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'weekly' && styles.toggleBtnActive]}
            onPress={() => setViewMode('weekly')}
          >
            <Text style={[styles.toggleBtnText, viewMode === 'weekly' && styles.toggleBtnTextActive]}>Weekly</Text>
          </TouchableOpacity>
        </View>

        {/* Calendar */}
        <View style={styles.card}>
          {/* Month nav */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth}>
              <Ionicons name="chevron-back" size={24} color="#1B5E20" />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{MONTHS[currentMonth]} {currentYear}</Text>
            <TouchableOpacity onPress={nextMonth}>
              <Ionicons name="chevron-forward" size={24} color="#1B5E20" />
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekdayText}>{w}</Text>
            ))}
          </View>

          {/* Days grid */}
          <View style={styles.daysGrid}>
            {calendarDays.map((cell, i) => {
              if (!cell) {
                return <View key={`blank-${i}`} style={styles.dayCell} />;
              }

              const density = getDensityColor(cell.count, maxOrdersPerDay);
              const isSelected = isSameDay(
                selectedDate,
                new Date(currentYear, currentMonth, cell.day),
              );
              const isToday = isSameDay(today, new Date(currentYear, currentMonth, cell.day));

              return (
                <TouchableOpacity
                  key={cell.dateKey}
                  style={[
                    styles.dayCell,
                    { backgroundColor: density.bg },
                    isSelected && styles.dayCellSelected,
                    isToday && !isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => setSelectedDate(new Date(currentYear, currentMonth, cell.day))}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: density.text },
                      isSelected && { color: '#fff' },
                    ]}
                  >
                    {cell.day}
                  </Text>
                  {cell.count > 0 && (
                    <Text
                      style={[
                        styles.dayCount,
                        isSelected && { color: '#fff' },
                      ]}
                    >
                      {cell.count}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#E8F5E9' }]} />
              <Text style={styles.legendText}>High</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FFF8E1' }]} />
              <Text style={styles.legendText}>Medium</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FFF3E0' }]} />
              <Text style={styles.legendText}>Low</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FFEBEE' }]} />
              <Text style={styles.legendText}>None</Text>
            </View>
          </View>
        </View>

        {/* Orders for selected date / week */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {viewMode === 'weekly'
              ? `Week Orders (${displayOrders.length})`
              : `Orders on ${formatDateShort(selectedDate)} (${displayOrders.length})`}
          </Text>
        </View>

        {displayOrders.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={44} color="#C8E6C9" />
            <Text style={styles.emptyTitle}>No orders</Text>
            <Text style={styles.emptySubtitle}>
              {viewMode === 'weekly' ? 'No orders this week' : 'No orders on this date'}
            </Text>
          </View>
        ) : (
          displayOrders.map((o, idx) => {
            const statusKey = (o.current_status || o.status || 'pending').toLowerCase().replace(/\s+/g, '_');
            const statusColor =
              statusKey === 'delivered' ? '#4CAF50'
                : statusKey === 'cancelled' ? '#D32F2F'
                  : statusKey === 'shipped' ? '#3F51B5'
                    : statusKey === 'confirmed' ? '#2196F3'
                      : '#FF9800';
            return (
              <View key={o.id || o.order_id || idx} style={styles.orderRow}>
                <View style={[styles.orderDot, { backgroundColor: statusColor }]} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.orderRowId} numberOfLines={1}>
                    {o.product?.name || o.product_name || o.customer_name || o.customer?.full_name || o.user?.full_name || 'Order'}
                  </Text>
                  <Text style={styles.orderRowDate}>
                    {formatDateFull(o.created_at || o.order_date)}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.orderRowStatus, { color: statusColor }]}>
                    {(o.current_status || o.status || 'pending').replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.orderRowAmount}>
                    {formatCurrency(o.total_price || o.total_amount || o.total || 0)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

/* ========================================================================== */
/*  STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  /* Header */
  headerBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#C8E6C9', fontSize: 13, marginTop: 2 },

  /* Loader */
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { fontSize: 14, color: '#757575', marginTop: 12 },

  /* Summary */
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    borderTopWidth: 3,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'center',
  },
  summaryIconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#212121' },
  summaryTitle: { fontSize: 11, color: '#757575', marginTop: 2 },

  /* Toggle */
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#1B5E20' },
  toggleBtnText: { fontSize: 14, fontWeight: '600', color: '#388E3C' },
  toggleBtnTextActive: { color: '#fff' },

  /* Card */
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  /* Month nav */
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  monthLabel: { fontSize: 16, fontWeight: '700', color: '#212121' },

  /* Weekdays */
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  weekdayText: { fontSize: 11, fontWeight: '600', color: '#9E9E9E', width: DAY_SIZE, textAlign: 'center' },

  /* Days grid */
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 3,
  },
  dayCellSelected: { backgroundColor: '#1B5E20' },
  dayCellToday: { borderWidth: 2, borderColor: '#388E3C' },
  dayText: { fontSize: 13, fontWeight: '600' },
  dayCount: { fontSize: 8, color: '#757575', marginTop: 1 },

  /* Legend */
  legendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 3, marginRight: 4 },
  legendText: { fontSize: 10, color: '#757575' },

  /* Section */
  sectionHeader: { paddingHorizontal: 16, marginTop: 18, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#212121' },

  /* Order row */
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  orderDot: { width: 10, height: 10, borderRadius: 5 },
  orderRowId: { fontSize: 14, fontWeight: '700', color: '#212121' },
  orderRowDate: { fontSize: 11, color: '#9E9E9E', marginTop: 1 },
  orderRowStatus: { fontSize: 12, fontWeight: '600', textAlign: 'right', textTransform: 'capitalize' },
  orderRowAmount: { fontSize: 14, fontWeight: '700', color: '#1B5E20', textAlign: 'right', marginTop: 2 },

  /* Empty */
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 10 },
  emptySubtitle: { fontSize: 13, color: '#9E9E9E', marginTop: 4 },
});

export default AdminReport;
