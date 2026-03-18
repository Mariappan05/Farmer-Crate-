import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import * as orderService from '../../services/orderService';

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
      const id = orderId || order?.id || order?.order_id;
      if (!id) return;
      
      console.log('[FarmerOrderTracking] Fetching order:', id);
      
      // First try to get detailed order with tracking info
      let orderWithDetails = null;
      try {
        const trackingResp = await api.get(`/farmers/orders/${id}/track`);
        orderWithDetails = trackingResp.data?.order || trackingResp.data;
        console.log('[FarmerOrderTracking] Got order from tracking endpoint:', JSON.stringify(orderWithDetails, null, 2));
      } catch (trackingError) {
        console.log('[FarmerOrderTracking] Tracking endpoint not available:', trackingError.message);
      }
      
      // If tracking endpoint didn't work, get from orders list
      if (!orderWithDetails) {
        const { data } = await api.get(`/farmers/orders`);
        const orders = Array.isArray(data) ? data : data?.orders || data?.data || [];
        
        orderWithDetails = orders.find(o => 
          (o.order_id && o.order_id.toString() === id.toString()) || 
          (o.id && o.id.toString() === id.toString())
        );
      }
      
      if (orderWithDetails) {
        console.log('[FarmerOrderTracking] Found order:', JSON.stringify(orderWithDetails, null, 2));
        
        // Check if we already have transporter details
        let orderWithTransporters = { ...orderWithDetails };
        
        // Since transporter endpoints are not available to farmers,
        // create meaningful placeholders with the IDs we have
        if (orderWithDetails.source_transporter_id && !orderWithDetails.source_transporter) {
          console.log('[FarmerOrderTracking] Creating source transporter placeholder for ID:', orderWithDetails.source_transporter_id);
          orderWithTransporters.source_transporter = {
            transporter_id: orderWithDetails.source_transporter_id,
            name: 'Source Transporter',
            mobile_number: null,
            email: null,
            address: null,
            note: 'Contact details will be shared when pickup is scheduled'
          };
        }
        
        if (orderWithDetails.destination_transporter_id && !orderWithDetails.destination_transporter) {
          console.log('[FarmerOrderTracking] Creating destination transporter placeholder for ID:', orderWithDetails.destination_transporter_id);
          orderWithTransporters.destination_transporter = {
            transporter_id: orderWithDetails.destination_transporter_id,
            name: 'Destination Transporter',
            mobile_number: null,
            email: null,
            address: null,
            note: 'Contact details will be shared when delivery is scheduled'
          };
        }
        
        setOrder(orderWithTransporters);
      } else {
        console.error('[FarmerOrderTracking] Order not found');
      }
      
    } catch (e) {
      console.error('[FarmerOrderTracking] Fetch tracking error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, order?.id, order?.order_id]);

  useEffect(() => {
    if (routeOrder) {
      // If we have order data from route, use it but still try to fetch updated data
      console.log('[FarmerOrderTracking] Using route order data:', JSON.stringify(routeOrder, null, 2));
      setOrder(routeOrder);
      setLoading(false);
      
      // Still fetch updated data in background
      fetchOrder();
    } else {
      fetchOrder();
    }

    // Auto-refresh every 40 seconds
    refreshInterval.current = setInterval(() => {
      fetchOrder();
    }, 40000);

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, []);

  const onRefresh = () => { setRefreshing(true); fetchOrder(); };

  // Helper functions for extracting images
  const getProductImage = (product) => {
    if (!product) return null;
    if (product.image_url) return product.image_url;
    if (product.image) return product.image;
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const primaryImage = product.images.find(img => img.is_primary === true);
      if (primaryImage && primaryImage.image_url) return primaryImage.image_url;
      const firstImage = product.images[0];
      if (firstImage && firstImage.image_url) return firstImage.image_url;
    }
    return null;
  };

  const getCustomerImage = (customer) => {
    if (!customer) return null;
    if (customer.image_url) return customer.image_url;
    if (customer.image) return customer.image;
    if (customer.photo) return customer.photo;
    if (customer.profile_image) return customer.profile_image;
    return null;
  };

  const getTransporterImage = (transporter) => {
    if (!transporter) return null;
    if (transporter.image_url) return transporter.image_url;
    if (transporter.image) return transporter.image;
    if (transporter.photo) return transporter.photo;
    if (transporter.profile_image) return transporter.profile_image;
    return null;
  };

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
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryProductName}>
                {order?.Product?.name || order?.product?.name || order?.product_name || 'Product Order'}
              </Text>
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

        {/* Product Info with Image */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Product Details</Text>
          <View style={styles.productDetailRow}>
            {getProductImage(order?.Product || order?.product) ? (
              <Image 
                source={{ uri: getProductImage(order?.Product || order?.product) }} 
                style={styles.productImage}
                onError={(error) => {
                  console.log('[FarmerOrderTracking] Product image load error:', error.nativeEvent.error);
                }}
              />
            ) : (
              <View style={styles.productImagePlaceholder}>
                <MaterialCommunityIcons name="food-apple-outline" size={32} color="#ccc" />
              </View>
            )}
            <View style={styles.productDetailInfo}>
              <Text style={styles.productDetailName}>
                {order?.Product?.name || order?.product?.name || order?.product_name || 'Unknown Product'}
              </Text>
              <Text style={styles.productDetailMeta}>
                Quantity: {order?.quantity || 1} units
              </Text>
              <Text style={styles.productDetailMeta}>
                Price: ₹{parseFloat(order?.Product?.current_price || order?.product?.price || order?.unit_price || 0).toFixed(2)} per unit
              </Text>
              <Text style={styles.productDetailTotal}>
                Total: ₹{parseFloat(order?.total_amount || order?.total_price || order?.total || 0).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>

        {/* Source Transporter Info */}
        {(order?.source_transporter_id) && (
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Source Transporter (Pickup)</Text>
            <View style={styles.transporterRow}>
              {getTransporterImage(order?.source_transporter) ? (
                <Image 
                  source={{ uri: getTransporterImage(order?.source_transporter) }} 
                  style={styles.transporterImage}
                  onError={(error) => {
                    console.log('[FarmerOrderTracking] Source transporter image load error:', error.nativeEvent.error);
                  }}
                />
              ) : (
                <View style={styles.transporterImagePlaceholder}>
                  <MaterialCommunityIcons name="truck-outline" size={24} color="#888" />
                </View>
              )}
              <View style={styles.transporterInfo}>
                <Text style={styles.transporterName}>
                  {order?.source_transporter?.name || 'Source Transporter'}
                </Text>
                {order?.source_transporter?.mobile_number ? (
                  <Text style={styles.transporterContact}>
                    📞 {order.source_transporter.mobile_number}
                  </Text>
                ) : (
                  <Text style={styles.transporterPending}>
                    {order?.source_transporter?.note || 'Contact details will be shared when pickup is scheduled'}
                  </Text>
                )}
                {order?.source_transporter?.email && (
                  <Text style={styles.transporterContact}>
                    ✉️ {order.source_transporter.email}
                  </Text>
                )}
                {order?.source_transporter?.address ? (
                  <Text style={styles.transporterAddress}>
                    📍 {order.source_transporter.address}
                    {order.source_transporter.district && `, ${order.source_transporter.district}`}
                    {order.source_transporter.state && `, ${order.source_transporter.state}`}
                  </Text>
                ) : (
                  <Text style={styles.transporterPending}>
                    Address details will be shared when pickup is scheduled
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Destination Transporter Info */}
        {(order?.destination_transporter_id) && (
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Destination Transporter (Delivery)</Text>
            <View style={styles.transporterRow}>
              {getTransporterImage(order?.destination_transporter) ? (
                <Image 
                  source={{ uri: getTransporterImage(order?.destination_transporter) }} 
                  style={styles.transporterImage}
                  onError={(error) => {
                    console.log('[FarmerOrderTracking] Destination transporter image load error:', error.nativeEvent.error);
                  }}
                />
              ) : (
                <View style={styles.transporterImagePlaceholder}>
                  <MaterialCommunityIcons name="truck-delivery-outline" size={24} color="#888" />
                </View>
              )}
              <View style={styles.transporterInfo}>
                <Text style={styles.transporterName}>
                  {order?.destination_transporter?.name || 'Destination Transporter'}
                </Text>
                {order?.destination_transporter?.mobile_number ? (
                  <Text style={styles.transporterContact}>
                    📞 {order.destination_transporter.mobile_number}
                  </Text>
                ) : (
                  <Text style={styles.transporterPending}>
                    {order?.destination_transporter?.note || 'Contact details will be shared when delivery is scheduled'}
                  </Text>
                )}
                {order?.destination_transporter?.email && (
                  <Text style={styles.transporterContact}>
                    ✉️ {order.destination_transporter.email}
                  </Text>
                )}
                {order?.destination_transporter?.address ? (
                  <Text style={styles.transporterAddress}>
                    📍 {order.destination_transporter.address}
                    {order.destination_transporter.district && `, ${order.destination_transporter.district}`}
                    {order.destination_transporter.state && `, ${order.destination_transporter.state}`}
                  </Text>
                ) : (
                  <Text style={styles.transporterPending}>
                    Address details will be shared when delivery is scheduled
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Customer Info with Profile Image */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Customer Information</Text>
          <View style={styles.customerRow}>
            {getCustomerImage(order?.customer) ? (
              <Image 
                source={{ uri: getCustomerImage(order?.customer) }} 
                style={styles.customerImage}
                onError={(error) => {
                  console.log('[FarmerOrderTracking] Customer image load error:', error.nativeEvent.error);
                }}
              />
            ) : (
              <View style={styles.customerImagePlaceholder}>
                <Ionicons name="person" size={24} color="#888" />
              </View>
            )}
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>
                {order?.customer?.name || order?.customer_name || order?.user?.full_name || 'Customer'}
              </Text>
              {(order?.customer?.mobile_number || order?.customer_phone || order?.user?.phone) && (
                <Text style={styles.customerContact}>
                  📞 {order?.customer?.mobile_number || order?.customer_phone || order?.user?.phone}
                </Text>
              )}
              {order?.delivery_address && (() => {
                const raw = order.delivery_address;
                let addr = raw;
                if (typeof raw === 'string') { try { addr = JSON.parse(raw); } catch (_) {} }
                const addrText = typeof addr === 'object' && addr !== null
                  ? [addr.address_line, addr.city, addr.district, addr.state, addr.pincode].filter(Boolean).join(', ')
                  : String(addr);
                return (
                  <Text style={styles.customerAddress}>
                    📍 {addrText}
                  </Text>
                );
              })()}
            </View>
          </View>
        </View>
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
  },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryProductName: { fontSize: 18, fontWeight: '800', color: '#333' },
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
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  infoText: { fontSize: 14, color: '#555', flex: 1 },

  /* Product Detail Styles */
  productDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  productImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#F0F4F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productDetailInfo: {
    flex: 1,
  },
  productDetailName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  productDetailMeta: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  productDetailTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E20',
  },

  /* Transporter Styles */
  transporterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transporterImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F5F5F5',
  },
  transporterImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F0F4F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transporterInfo: {
    flex: 1,
  },
  transporterName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  transporterContact: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  transporterAddress: {
    fontSize: 12,
    color: '#888',
    lineHeight: 16,
  },
  transporterPending: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },

  /* Customer Styles */
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customerImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F5F5F5',
  },
  customerImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F0F4F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  customerContact: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  customerAddress: {
    fontSize: 12,
    color: '#888',
    lineHeight: 16,
  },
});
