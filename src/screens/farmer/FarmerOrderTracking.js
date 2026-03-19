import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
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

const STAGES = [
  { key: 'PLACED', label: 'Order Placed', icon: 'receipt-outline', iconLib: 'Ionicons' },
  { key: 'CONFIRMED', label: 'Confirmed', icon: 'checkmark-circle-outline', iconLib: 'Ionicons' },
  { key: 'ASSIGNED', label: 'Transporter Assigned', icon: 'people-outline', iconLib: 'Ionicons' },
  { key: 'SHIPPED', label: 'Shipped', icon: 'cube-outline', iconLib: 'Ionicons' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: 'truck-delivery-outline', iconLib: 'Material' },
  { key: 'DELIVERED', label: 'Delivered', icon: 'checkmark-done-circle-outline', iconLib: 'Ionicons' },
];

const STAGE_COLORS = {
  completed: '#4CAF50',
  active: '#FF9800',
  upcoming: '#E0E0E0',
};

const FarmerOrderTracking = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { orderId, order: routeOrder } = route.params || {};

  const [order, setOrder] = useState(routeOrder || null);
  const [loading, setLoading] = useState(!routeOrder);
  const [refreshing, setRefreshing] = useState(false);
  const refreshInterval = useRef(null);

  const fetchOrder = useCallback(async () => {
    try {
      const id = orderId || order?.id;
      if (!id) return;
      const { data } = await api.get(`/farmers/orders/${id}`);
      setOrder(data?.order || data);
    } catch (e) {
      console.error('Fetch tracking error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, order?.id]);

  useEffect(() => {
    if (!routeOrder) fetchOrder();

    // Auto-refresh every 40 seconds
    refreshInterval.current = setInterval(() => {
      fetchOrder();
    }, 40000);

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, []);

  const onRefresh = () => { setRefreshing(true); fetchOrder(); };

  const getCurrentStageIndex = () => {
    if (!order) return -1;
    const status = order.status || '';
    // PENDING maps to PLACED
    if (status === 'PENDING') return 0;
    const idx = STAGES.findIndex((s) => s.key === status);
    return idx >= 0 ? idx : 0;
  };

  const currentStageIndex = getCurrentStageIndex();
  const isCancelled = order?.status === 'CANCELLED';

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderTimelineStage = (stage, idx) => {
    let stageStatus = 'upcoming';
    if (isCancelled) {
      stageStatus = idx <= currentStageIndex ? 'completed' : 'upcoming';
    } else if (idx < currentStageIndex) {
      stageStatus = 'completed';
    } else if (idx === currentStageIndex) {
      stageStatus = 'active';
    }

    const color = STAGE_COLORS[stageStatus];
    const isLast = idx === STAGES.length - 1;
    const IconComponent = stage.iconLib === 'Material' ? MaterialCommunityIcons : Ionicons;

    return (
      <View key={stage.key} style={styles.timelineItem}>
        {/* Left side: dot + line */}
        <View style={styles.timelineLeft}>
          <View
            style={[
              styles.timelineDot,
              {
                backgroundColor: stageStatus === 'active' ? color : stageStatus === 'completed' ? color : '#fff',
                borderColor: color,
              },
            ]}
          >
            {stageStatus === 'completed' && (
              <Ionicons name="checkmark" size={14} color="#fff" />
            )}
            {stageStatus === 'active' && (
              <View style={styles.activePulse} />
            )}
          </View>
          {!isLast && (
            <View
              style={[
                styles.timelineLine,
                {
                  backgroundColor:
                    stageStatus === 'completed' || (stageStatus === 'active' && idx < STAGES.length - 1)
                      ? '#4CAF50'
                      : '#E0E0E0',
                },
              ]}
            />
          )}
        </View>

        {/* Right side: content */}
        <View style={[styles.timelineContent, isLast && { paddingBottom: 0 }]}>
          <View style={styles.timelineStageRow}>
            <IconComponent
              name={stage.icon}
              size={20}
              color={stageStatus === 'upcoming' ? '#bbb' : color}
            />
            <Text
              style={[
                styles.stageLabel,
                stageStatus === 'upcoming' && { color: '#bbb' },
                stageStatus === 'active' && { color: '#FF9800', fontWeight: '700' },
                stageStatus === 'completed' && { color: '#4CAF50' },
              ]}
            >
              {stage.label}
            </Text>
          </View>

          {stageStatus === 'active' && (
            <View style={styles.activeTagRow}>
              <View style={styles.activeTag}>
                <Text style={styles.activeTagText}>Current Status</Text>
              </View>
            </View>
          )}

          {stageStatus === 'completed' && order?.status_updates && (
            <Text style={styles.stageTime}>
              {formatDate(
                order.status_updates[stage.key] || order.status_updates[stage.key.toLowerCase()]
              )}
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ marginTop: 12, color: '#666' }}>Loading tracking info...</Text>
      </View>
    );
  }

  const products = order?.items || order?.products || order?.order_items || [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <LinearGradient
        colors={['#103A12', '#1B5E20', '#2E7D32']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Tracking</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {/* Order Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryOrderId}>Order #{order?.id || order?.order_id}</Text>
              <Text style={styles.summaryDate}>{formatDate(order?.created_at || order?.date)}</Text>
            </View>
            {isCancelled ? (
              <View style={[styles.cancelledBadge]}>
                <Text style={styles.cancelledText}>Cancelled</Text>
              </View>
            ) : (
              <Text style={styles.summaryTotal}>
                ₹{parseFloat(order?.total_amount || order?.total || 0).toLocaleString('en-IN')}
              </Text>
            )}
          </View>

          {/* Progress Bar */}
          {!isCancelled && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(((currentStageIndex + 1) / STAGES.length) * 100, 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {Math.round(((currentStageIndex + 1) / STAGES.length) * 100)}% Complete
              </Text>
            </View>
          )}
        </View>

        {/* Cancelled Reason */}
        {isCancelled && (
          <View style={styles.cancelCard}>
            <Ionicons name="close-circle" size={24} color="#F44336" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.cancelTitle}>Order Cancelled</Text>
              <Text style={styles.cancelReason}>
                {order?.cancellation_reason || 'This order has been cancelled.'}
              </Text>
            </View>
          </View>
        )}

        {/* Timeline */}
        <View style={styles.timelineCard}>
          <Text style={styles.cardTitle}>Tracking Timeline</Text>
          {STAGES.map((stage, idx) => renderTimelineStage(stage, idx))}
        </View>

        {/* Product Info */}
        {products.length > 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Products</Text>
            {products.map((p, idx) => (
              <View key={idx} style={[styles.productRow, idx < products.length - 1 && styles.productBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{p.product_name || p.name}</Text>
                  <Text style={styles.productMeta}>
                    Qty: {p.quantity || 1} • ₹{parseFloat(p.price || 0).toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.productTotal}>
                  ₹{(parseFloat(p.price || 0) * (p.quantity || 1)).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Customer Info */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Customer Information</Text>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color="#666" />
            <Text style={styles.infoText}>
              {order?.customer_name || order?.user?.full_name || 'N/A'}
            </Text>
          </View>
          {order?.delivery_address && (() => {
            const raw = order.delivery_address;
            let addr = raw;
            if (typeof raw === 'string') { try { addr = JSON.parse(raw); } catch (_) {} }
            const addrText = typeof addr === 'object' && addr !== null
              ? [addr.full_name, addr.phone ? `Ph: ${addr.phone}` : null, addr.address_line, addr.city, addr.district, addr.state, addr.pincode].filter(Boolean).join(', ')
              : String(addr);
            return (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={18} color="#666" />
                <Text style={styles.infoText}>{addrText}</Text>
              </View>
            );
          })()}
          {(order?.customer_phone || order?.user?.phone) && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={18} color="#666" />
              <Text style={styles.infoText}>{order.customer_phone || order.user?.phone}</Text>
            </View>
          )}
        </View>

        {/* Transporter Info */}
        {(order?.transporter_name || order?.transporter) && (
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Transporter</Text>
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="truck-outline" size={18} color="#666" />
              <Text style={styles.infoText}>
                {order?.transporter_name || order?.transporter?.name || 'Assigned'}
              </Text>
            </View>
            {(order?.transporter_phone || order?.transporter?.phone) && (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={18} color="#666" />
                <Text style={styles.infoText}>
                  {order.transporter_phone || order.transporter?.phone}
                </Text>
              </View>
            )}
            {(order?.vehicle_number || order?.transporter?.vehicle_number) && (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="car-side" size={18} color="#666" />
                <Text style={styles.infoText}>
                  {order.vehicle_number || order.transporter?.vehicle_number}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default FarmerOrderTracking;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },

  /* Summary */
  summaryCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryOrderId: { fontSize: 18, fontWeight: '800', color: '#333' },
  summaryDate: { fontSize: 13, color: '#999', marginTop: 2 },
  summaryTotal: { fontSize: 22, fontWeight: '800', color: '#1B5E20' },
  cancelledBadge: { backgroundColor: '#FFEBEE', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  cancelledText: { color: '#F44336', fontWeight: '600', fontSize: 13 },

  progressContainer: { marginTop: 16 },
  progressBg: { height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 4 },
  progressText: { fontSize: 12, color: '#888', marginTop: 6, textAlign: 'right' },

  /* Cancel */
  cancelCard: {
    margin: 16,
    marginBottom: 0,
    flexDirection: 'row',
    backgroundColor: '#FFEBEE',
    borderRadius: 14,
    padding: 16,
    alignItems: 'flex-start',
  },
  cancelTitle: { fontSize: 15, fontWeight: '700', color: '#F44336' },
  cancelReason: { fontSize: 13, color: '#C62828', marginTop: 4, lineHeight: 20 },

  /* Timeline */
  timelineCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#1B5E20', marginBottom: 16 },

  timelineItem: { flexDirection: 'row' },
  timelineLeft: { alignItems: 'center', width: 30 },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  activePulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  timelineLine: {
    width: 3,
    flex: 1,
    marginVertical: 2,
  },
  timelineContent: { flex: 1, paddingLeft: 14, paddingBottom: 28 },
  timelineStageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  activeTagRow: { marginTop: 6 },
  activeTag: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  activeTagText: { fontSize: 11, color: '#FF9800', fontWeight: '600' },
  stageTime: { fontSize: 12, color: '#999', marginTop: 4 },

  /* Info Cards */
  infoCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  infoText: { fontSize: 14, color: '#555', flex: 1 },

  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  productBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  productName: { fontSize: 14, fontWeight: '600', color: '#333' },
  productMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  productTotal: { fontSize: 14, fontWeight: '800', color: '#1B5E20' },
});
