import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import ToastMessage from '../../utils/Toast';

// ─── Colour palette ───────────────────────────────────────────────────────────
const COLORS = {
  INCREASE: { bg: '#E8F5E9', text: '#1B5E20', border: '#4CAF50', icon: 'trending-up' },
  DECREASE: { bg: '#FFEBEE', text: '#B71C1C', border: '#EF5350', icon: 'trending-down' },
  MAINTAIN: { bg: '#F3E5F5', text: '#4A148C', border: '#9C27B0', icon: 'remove-outline' },
};
const DEMAND_COLOR = {
  HIGH:     { text: '#B71C1C', bg: '#FFEBEE' },
  MODERATE: { text: '#E65100', bg: '#FFF3E0' },
  LOW:      { text: '#1B5E20', bg: '#E8F5E9' },
};

// ─── Helper – format currency ─────────────────────────────────────────────────
const fmt = (v) => `₹${parseFloat(v || 0).toFixed(2)}`;

// ─── Summary Card ─────────────────────────────────────────────────────────────
const SummaryCard = ({ label, count, color, bg, icon }) => (
  <View style={[ss.summaryCard, { backgroundColor: bg }]}>
    <Ionicons name={icon} size={22} color={color} />
    <Text style={[ss.summaryCount, { color }]}>{count}</Text>
    <Text style={[ss.summaryLabel, { color }]}>{label}</Text>
  </View>
);

// ─── Individual Product Prediction Card ───────────────────────────────────────
const PredCard = ({ item }) => {
  const scheme = COLORS[item.action] || COLORS.MAINTAIN;
  const demand = DEMAND_COLOR[item.demand_level] || DEMAND_COLOR.LOW;

  return (
    <View style={ss.card}>
      {/* ── Top: product name + action badge ── */}
      <View style={ss.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={ss.productName} numberOfLines={2}>{item.product_name}</Text>
          <Text style={ss.algoLabel}>Demand-Based Seasonal Pricing</Text>
        </View>
        <View style={[ss.actionBadge, { backgroundColor: scheme.bg, borderColor: scheme.border }]}>
          <Ionicons name={scheme.icon} size={14} color={scheme.text} />
          <Text style={[ss.actionText, { color: scheme.text }]}>{item.action}</Text>
        </View>
      </View>

      {/* ── Season status ── */}
      <View style={ss.seasonRow}>
        <Text style={ss.seasonChip}>{item.current_season}</Text>
        <Text style={[ss.inSeasonBadge, { color: item.in_season ? '#1B5E20' : '#B71C1C' }]}>
          {item.in_season ? '✅ In Peak Season' : '❌ Off Season'}
        </Text>
        <Text style={ss.seasonFactor}>×{item.seasonal_factor} factor</Text>
      </View>

      {/* ── Price row ── */}
      <View style={ss.priceRow}>
        <View style={ss.priceBox}>
          <Text style={ss.priceBoxLabel}>Current</Text>
          <Text style={ss.priceCurrentVal}>{fmt(item.current_price)}</Text>
        </View>

        <View style={ss.priceArrow}>
          <Ionicons name="arrow-forward" size={20} color="#90A4AE" />
          <Text style={ss.priceUnit}>per kg</Text>
        </View>

        <View style={ss.priceBox}>
          <Text style={ss.priceBoxLabel}>Suggested</Text>
          <Text style={[ss.priceSuggestedVal, { color: scheme.text }]}>
            {fmt(item.predicted_price)}
          </Text>
        </View>
      </View>

      {/* ── Change pill ── */}
      <View style={[ss.changePill, { backgroundColor: scheme.bg }]}>
        <Ionicons name={scheme.icon} size={12} color={scheme.text} />
        <Text style={[ss.changeText, { color: scheme.text }]}>
          {item.price_change >= 0 ? '+' : ''}₹{parseFloat(item.price_change).toFixed(2)}/kg
          {'  '}({item.price_change_pct >= 0 ? '+' : ''}{parseFloat(item.price_change_pct).toFixed(1)}%)
        </Text>
      </View>

      {/* ── Recommendation text (mirrors api_seasonal.py output) ── */}
      <View style={ss.recBox}>
        <Ionicons name="bulb-outline" size={14} color="#F57C00" style={{ marginTop: 1 }} />
        <Text style={ss.recText}>{item.recommendation}</Text>
      </View>

      {/* ── Metrics row ── */}
      <View style={ss.metricsRow}>
        <View style={[ss.demandChip, { backgroundColor: demand.bg }]}>
          <Text style={[ss.demandText, { color: demand.text }]}>
            {item.demand_level} DEMAND
          </Text>
        </View>
        <Text style={ss.stockText}>
          <Ionicons name="cube-outline" size={11} color="#607D8B" /> Stock: {item.current_stock ?? '–'}
        </Text>
        <Text style={ss.adjustedText}>
          {item.was_adjusted ? '⚙ Adjusted' : '✓ Valid'}
        </Text>
      </View>

      {/* ── Sales breakdown ── */}
      <View style={ss.salesRow}>
        <View style={ss.salesItem}>
          <Text style={ss.salesItemLabel}>Today</Text>
          <Text style={ss.salesItemVal}>{item.today_sales ?? 0}</Text>
        </View>
        <View style={ss.salesDiv} />
        <View style={ss.salesItem}>
          <Text style={ss.salesItemLabel}>Yesterday</Text>
          <Text style={ss.salesItemVal}>{item.yesterday_sales ?? 0}</Text>
        </View>
        <View style={ss.salesDiv} />
        <View style={ss.salesItem}>
          <Text style={ss.salesItemLabel}>7-day avg</Text>
          <Text style={ss.salesItemVal}>{parseFloat(item.avg_sales_7_days || 0).toFixed(1)}</Text>
        </View>
        <View style={ss.salesDiv} />
        <View style={ss.salesItem}>
          <Text style={ss.salesItemLabel}>30-day avg</Text>
          <Text style={ss.salesItemVal}>{parseFloat(item.avg_sales_30_days || 0).toFixed(1)}</Text>
        </View>
      </View>

      {/* ── Adjustment note (shown when price was clamped) ── */}
      {item.was_adjusted && item.adjustment_reason ? (
        <View style={ss.adjNote}>
          <Ionicons name="information-circle-outline" size={13} color="#795548" />
          <Text style={ss.adjNoteText}>{item.adjustment_reason}</Text>
        </View>
      ) : null}

      {/* ── Footer: computed at ── */}
      <Text style={ss.computedAt}>
        Computed: {item.computed_at ? new Date(item.computed_at).toLocaleString('en-IN') : '–'}
      </Text>
    </View>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
const PricePredictionScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const toastRef = useRef(null);

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [summary, setSummary]       = useState(null);
  const [season, setSeason]         = useState('');
  const [error, setError]           = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Filter tab state ──────────────────────────────────────────────────────
  const FILTERS = ['All', 'INCREASE', 'DECREASE', 'MAINTAIN'];
  const [activeFilter, setActiveFilter] = useState('All');

  const fetchPredictions = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/price-prediction/farmer/all');
      if (res.data?.success) {
        setPredictions(res.data.data || []);
        setSummary(res.data.summary || null);
        setSeason(res.data.current_season || '');
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      } else {
        setError(res.data?.message || 'Could not load predictions');
      }
    } catch (e) {
      console.error('[PricePred] fetch error:', e.message);
      setError('Could not load price predictions. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPredictions(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchPredictions(); };

  // ── Filtered data ─────────────────────────────────────────────────────────
  const filtered = activeFilter === 'All'
    ? predictions
    : predictions.filter((p) => p.action === activeFilter);

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={ss.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0D47A1" />
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={ss.loadingText}>Analyzing prices…</Text>
        <Text style={ss.loadingSubText}>Running demand-based seasonal algorithm</Text>
      </View>
    );
  }

  return (
    <View style={ss.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0D47A1" />

      {/* ── Header ── */}
      <LinearGradient
        colors={['#0D47A1', '#1565C0', '#1976D2']}
        style={[ss.header, { paddingTop: insets.top + 12 }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={ss.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={ss.headerTitle}>💰 Smart Price Advisor</Text>
          <Text style={ss.headerSub}>Demand-Based Seasonal Algorithm</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); fetchPredictions(); }} style={ss.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Season banner ── */}
      {season ? (
        <View style={ss.seasonBanner}>
          <MaterialCommunityIcons name="weather-partly-cloudy" size={16} color="#1565C0" />
          <Text style={ss.seasonBannerText}>Current Season: {season}</Text>
        </View>
      ) : null}

      {/* ── Algorithm info strip ── */}
      <View style={ss.algoStrip}>
        <Ionicons name="analytics-outline" size={13} color="#546E7A" />
        <Text style={ss.algoStripText}>
          Algorithm: Demand Pressure × Seasonal Multiplier → ±₹3–₹4 clamped price change
        </Text>
      </View>

      {error ? (
        <TouchableOpacity style={ss.errorBox} onPress={() => { setLoading(true); fetchPredictions(); }}>
          <Ionicons name="cloud-offline-outline" size={44} color="#EF5350" />
          <Text style={ss.errorText}>{error}</Text>
          <Text style={ss.errorRetry}>Tap to retry</Text>
        </TouchableOpacity>
      ) : (
        <Animated.FlatList
          data={filtered}
          keyExtractor={(item) => `pp-${item.product_id}`}
          style={{ opacity: fadeAnim }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16, paddingTop: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1976D2']} />
          }
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* ── Summary cards ── */}
              {summary && (
                <View style={ss.summaryRow}>
                  <SummaryCard
                    label="Total"
                    count={summary.total ?? predictions.length}
                    color="#1565C0"
                    bg="#E3F2FD"
                    icon="pricetag-outline"
                  />
                  <SummaryCard
                    label="Increase"
                    count={summary.increase ?? 0}
                    color="#1B5E20"
                    bg="#E8F5E9"
                    icon="trending-up"
                  />
                  <SummaryCard
                    label="Decrease"
                    count={summary.decrease ?? 0}
                    color="#B71C1C"
                    bg="#FFEBEE"
                    icon="trending-down"
                  />
                  <SummaryCard
                    label="Maintain"
                    count={summary.maintain ?? 0}
                    color="#4A148C"
                    bg="#F3E5F5"
                    icon="remove-outline"
                  />
                </View>
              )}

              {/* ── Filter tabs ── */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                {FILTERS.map((f) => {
                  const active = activeFilter === f;
                  const scheme = f === 'All' ? { bg: '#1565C0', text: '#fff', bid: '#1565C0' }
                    : f === 'INCREASE' ? { bg: active ? '#1B5E20' : '#fff', text: active ? '#fff' : '#1B5E20', bid: '#1B5E20' }
                    : f === 'DECREASE' ? { bg: active ? '#B71C1C' : '#fff', text: active ? '#fff' : '#B71C1C', bid: '#B71C1C' }
                    : { bg: active ? '#4A148C' : '#fff', text: active ? '#fff' : '#4A148C', bid: '#4A148C' };
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[ss.filterTab, { backgroundColor: active ? scheme.bg : '#F5F5F5', borderColor: scheme.bid }]}
                      onPress={() => setActiveFilter(f)}
                      activeOpacity={0.75}
                    >
                      <Text style={[ss.filterTabText, { color: active ? (f === 'All' ? '#fff' : scheme.text) : '#546E7A' }]}>
                        {f === 'All' ? 'All Products' : f}
                        {f !== 'All' && predictions.filter(p => p.action === f).length > 0
                          ? ` (${predictions.filter(p => p.action === f).length})`
                          : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {filtered.length === 0 && (
                <View style={ss.emptyBox}>
                  <Ionicons name="pricetag-outline" size={52} color="#B0BEC5" />
                  <Text style={ss.emptyText}>
                    {predictions.length === 0
                      ? 'Add products to see price recommendations'
                      : `No products with action: ${activeFilter}`}
                  </Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => <PredCard item={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}

      <ToastMessage ref={toastRef} />
    </View>
  );
};

export default PricePredictionScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F4F8' },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4F8', gap: 12 },
  loadingText:    { fontSize: 16, fontWeight: '600', color: '#1565C0', marginTop: 8 },
  loadingSubText: { fontSize: 12, color: '#78909C' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { padding: 4 },
  refreshBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // Season banner
  seasonBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E3F2FD', paddingHorizontal: 16, paddingVertical: 7,
  },
  seasonBannerText: { fontSize: 13, color: '#1565C0', fontWeight: '600' },

  // Algorithm strip
  algoStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ECEFF1', paddingHorizontal: 16, paddingVertical: 6,
  },
  algoStripText: { fontSize: 11, color: '#546E7A', flex: 1 },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: 8 },
  summaryCard: {
    flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4,
  },
  summaryCount: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // Filter tabs
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  filterTabText: { fontSize: 12, fontWeight: '700' },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6,
  },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  productName: { fontSize: 16, fontWeight: '800', color: '#1A237E', flex: 1 },
  algoLabel:   { fontSize: 10, color: '#78909C', marginTop: 2 },

  actionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1.5, marginLeft: 8,
  },
  actionText: { fontSize: 11, fontWeight: '800' },

  // Season
  seasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  seasonChip: { fontSize: 12, color: '#37474F', fontWeight: '600' },
  inSeasonBadge: { fontSize: 12, fontWeight: '700' },
  seasonFactor: { fontSize: 11, color: '#78909C', marginLeft: 'auto' },

  // Prices
  priceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, marginBottom: 10,
  },
  priceBox: { alignItems: 'center', flex: 1 },
  priceArrow: { alignItems: 'center' },
  priceUnit: { fontSize: 9, color: '#90A4AE', marginTop: 2 },
  priceBoxLabel:    { fontSize: 10, color: '#78909C', fontWeight: '600', marginBottom: 4 },
  priceCurrentVal:  { fontSize: 20, fontWeight: '800', color: '#37474F' },
  priceSuggestedVal: { fontSize: 20, fontWeight: '800' },

  // Change pill
  changePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, alignSelf: 'flex-start', marginBottom: 12,
  },
  changeText: { fontSize: 12, fontWeight: '700' },

  // Recommendation
  recBox: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: '#FFF8E1', borderRadius: 8, padding: 10, marginBottom: 12,
  },
  recText: { fontSize: 12.5, color: '#4E342E', flex: 1, lineHeight: 18, fontWeight: '500' },

  // Metrics
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  demandChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  demandText: { fontSize: 10, fontWeight: '800' },
  stockText:  { fontSize: 11, color: '#546E7A' },
  adjustedText: { fontSize: 10, color: '#78909C', marginLeft: 'auto' },

  // Sales breakdown
  salesRow: {
    flexDirection: 'row', backgroundColor: '#F5F7FA', borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
  },
  salesItem: { flex: 1, alignItems: 'center' },
  salesDiv: { width: 1, backgroundColor: '#DDEEFF', marginVertical: 2 },
  salesItemLabel: { fontSize: 9, color: '#90A4AE', fontWeight: '600', marginBottom: 3 },
  salesItemVal:   { fontSize: 13, fontWeight: '700', color: '#37474F' },

  // Adjustment note
  adjNote: {
    flexDirection: 'row', gap: 5, alignItems: 'flex-start',
    backgroundColor: '#FFF3E0', borderRadius: 6, padding: 8, marginBottom: 8,
  },
  adjNoteText: { fontSize: 11, color: '#5D4037', flex: 1, lineHeight: 16 },

  // Footer
  computedAt: { fontSize: 10, color: '#B0BEC5', textAlign: 'right', marginTop: 4 },

  // Error
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  errorText: { fontSize: 14, color: '#546E7A', textAlign: 'center', lineHeight: 20 },
  errorRetry:{ fontSize: 13, color: '#1565C0', fontWeight: '700' },

  // Empty
  emptyBox:  { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, color: '#90A4AE', textAlign: 'center', lineHeight: 20 },
});
