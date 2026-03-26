import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import * as orderService from '../../services/orderService';

const STAGES = [
  { key: 'PENDING',             label: 'Order Placed',           icon: 'receipt-outline',               iconLib: 'Ionicons' },
  { key: 'ASSIGNED',            label: 'Farmer Accepted + Transporters Assigned', icon: 'truck-check-outline', iconLib: 'Material' },
  { key: 'PICKUP_ASSIGNED',     label: 'Pickup Person Assigned', icon: 'person-outline',                iconLib: 'Ionicons' },
  { key: 'PICKED_UP',           label: 'Picked Up from Farmer',  icon: 'store-check-outline',           iconLib: 'Material' },
  { key: 'RECEIVED',            label: 'Received at Source Office', icon: 'package-variant-closed',      iconLib: 'Material' },
  { key: 'SHIPPED',             label: 'Shipped from Source',    icon: 'cube-send',                     iconLib: 'Material' },
  { key: 'IN_TRANSIT',          label: 'In Transit to Destination', icon: 'truck-fast-outline',         iconLib: 'Material' },
  { key: 'REACHED_DESTINATION', label: 'Reached Destination',    icon: 'warehouse',                     iconLib: 'Material' },
  { key: 'OUT_FOR_DELIVERY',    label: 'Out for Delivery',       icon: 'truck-delivery-outline',        iconLib: 'Material' },
  { key: 'DELIVERED',           label: 'Delivered to Customer',  icon: 'checkmark-done-circle-outline', iconLib: 'Ionicons' },
];

const STAGE_COLORS = {
  completed: '#4CAF50',
  active: '#FF9800',
  upcoming: '#E0E0E0',
};

const normalizeOrdersArray = (payload) =>
  Array.isArray(payload) ? payload : payload?.orders || payload?.data || [];

const findOrderById = (orders, id) =>
  orders.find((o) =>
    (o?.order_id && String(o.order_id) === String(id)) ||
    (o?.id && String(o.id) === String(id))
  );

const buildAvatarUrl = (name, seed) => {
  const avatarName = encodeURIComponent(name || 'Transporter');
  const avatarSeed = encodeURIComponent(seed || 'transporter');
  return `https://ui-avatars.com/api/?name=${avatarName}&background=E8F5E9&color=1B5E20&rounded=true&size=128&bold=true&seed=${avatarSeed}`;
};

const formatAddressText = (rawAddress) => {
  if (!rawAddress) return null;

  if (typeof rawAddress === 'string') {
    try {
      const parsed = JSON.parse(rawAddress);
      if (parsed && typeof parsed === 'object') {
        return [
          parsed.address_line,
          parsed.city,
          parsed.district,
          parsed.state,
          parsed.pincode,
          parsed.zone,
        ].filter(Boolean).join(', ');
      }
    } catch {
      return rawAddress;
    }
    return rawAddress;
  }

  if (typeof rawAddress === 'object') {
    return [
      rawAddress.address_line,
      rawAddress.city,
      rawAddress.district,
      rawAddress.state,
      rawAddress.pincode,
      rawAddress.zone,
    ].filter(Boolean).join(', ');
  }

  return String(rawAddress);
};

const getInitials = (name) => {
  if (!name || typeof name !== 'string') return 'TR';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'TR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const buildTransporterFallback = (role, orderWithDetails) => {
  const isSource = role === 'source';
  const id = isSource ? orderWithDetails?.source_transporter_id : orderWithDetails?.destination_transporter_id;
  const existing = isSource ? orderWithDetails?.source_transporter : orderWithDetails?.destination_transporter;
  const nameFromOrder = isSource
    ? (orderWithDetails?.source_transporter_name || orderWithDetails?.source_transporter_full_name)
    : (orderWithDetails?.destination_transporter_name || orderWithDetails?.destination_transporter_full_name);
  const addressFromOrder = isSource
    ? (orderWithDetails?.source_transporter_address || orderWithDetails?.pickup_address || null)
    : (orderWithDetails?.destination_transporter_address || orderWithDetails?.delivery_address || null);
  const imageFromOrder = isSource
    ? (orderWithDetails?.source_transporter_image_url || orderWithDetails?.source_transporter_profile_image)
    : (orderWithDetails?.destination_transporter_image_url || orderWithDetails?.destination_transporter_profile_image);

  const defaultName = isSource ? 'Source Transporter' : 'Destination Transporter';
  const name = existing?.name || existing?.full_name || nameFromOrder || defaultName;

  return {
    transporter_id: existing?.transporter_id || existing?.id || id || null,
    name,
    mobile_number: existing?.mobile_number || existing?.mobile || existing?.phone || null,
    email: existing?.email || null,
    address: existing?.address || formatAddressText(addressFromOrder) || null,
    image_url: existing?.image_url || existing?.profile_image || imageFromOrder || buildAvatarUrl(name, id || role),
    note: isSource
      ? 'Pickup handled by assigned source transporter'
      : 'Delivery handled by assigned destination transporter',
  };
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
        orderWithDetails = trackingResp?.data?.data?.order || trackingResp?.data?.order || trackingResp?.data?.data || trackingResp?.data;
        console.log('[FarmerOrderTracking] Got order from tracking endpoint:', JSON.stringify(orderWithDetails, null, 2));
      } catch (trackingError) {
        console.log('[FarmerOrderTracking] Tracking endpoint not available:', trackingError.message);
      }

      // Try generic tracking endpoint which may include enriched transporter details
      if (!orderWithDetails) {
        try {
          const genericTrackResp = await api.get(`/orders/${id}/track`);
          orderWithDetails =
            genericTrackResp?.data?.data?.order ||
            genericTrackResp?.data?.order ||
            genericTrackResp?.data?.data ||
            genericTrackResp?.data ||
            null;
          if (orderWithDetails) {
            console.log('[FarmerOrderTracking] Got order from generic tracking endpoint');
          }
        } catch (genericTrackError) {
          console.log('[FarmerOrderTracking] Generic tracking fallback unavailable:', genericTrackError.message);
        }
      }
      
      // If tracking endpoint didn't work, get from orders list
      if (!orderWithDetails) {
        const { data } = await api.get(`/farmers/orders`);
        const orders = normalizeOrdersArray(data);
        orderWithDetails = findOrderById(orders, id);
      }

      // Final fallback: generic order endpoint
      if (!orderWithDetails) {
        try {
          const data = await orderService.getOrderById(id);
          orderWithDetails = data?.data || data?.order || data;
          if (orderWithDetails) {
            console.log('[FarmerOrderTracking] Found order from generic endpoint:', id);
          }
        } catch (genericError) {
          console.log('[FarmerOrderTracking] Generic order fallback failed:', genericError.message);
        }
      }
      
      if (orderWithDetails) {
        console.log('[FarmerOrderTracking] Found order:', JSON.stringify(orderWithDetails, null, 2));

        // Extra enrichment: generic order endpoint may include nested transporter objects
        // even when farmer order endpoints return only transporter IDs.
        try {
          const genericData = await orderService.getOrderById(id);
          const genericOrder = genericData?.data || genericData?.order || genericData;
          if (genericOrder && typeof genericOrder === 'object') {
            orderWithDetails = {
              ...genericOrder,
              ...orderWithDetails,
              source_transporter:
                orderWithDetails?.source_transporter || genericOrder?.source_transporter || null,
              destination_transporter:
                orderWithDetails?.destination_transporter || genericOrder?.destination_transporter || null,
            };
            console.log('[FarmerOrderTracking] Enriched order from generic endpoint');
          }
        } catch (genericEnrichError) {
          console.log('[FarmerOrderTracking] Generic enrichment unavailable:', genericEnrichError.message);
        }
        
        // Check if we already have transporter details
        let orderWithTransporters = { ...orderWithDetails };
        
        // Farmer role cannot access transporter profile endpoints in this backend.
        // Build best-effort transporter cards from order payload plus avatar fallback.
        if (orderWithDetails.source_transporter_id || orderWithDetails.source_transporter) {
          console.log('[FarmerOrderTracking] Building source transporter from order payload:', orderWithDetails.source_transporter_id);
          orderWithTransporters.source_transporter = buildTransporterFallback('source', orderWithDetails);
        }
        
        if (orderWithDetails.destination_transporter_id || orderWithDetails.destination_transporter) {
          console.log('[FarmerOrderTracking] Building destination transporter from order payload:', orderWithDetails.destination_transporter_id);
          orderWithTransporters.destination_transporter = buildTransporterFallback('destination', orderWithDetails);
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
    const status = (order.current_status || order.status || '').toUpperCase();
    const STATUS_INDEX = {
      PENDING: 0, PLACED: 0,
      CONFIRMED: 1, ACCEPTED: 1, ASSIGNED: 1,
      PICKUP_ASSIGNED: 2,
      PICKUP_IN_PROGRESS: 2,
      PICKED_UP: 3,
      RECEIVED: 4,
      SHIPPED: 5,
      IN_TRANSIT: 6,
      REACHED_DESTINATION: 7,
      OUT_FOR_DELIVERY: 8,
      DELIVERED: 9,
      COMPLETED: 9,
    };
    return STATUS_INDEX[status] ?? 0;
  };

  const currentStageIndex = getCurrentStageIndex();
  const isCancelled = (order?.current_status || order?.status || '').toUpperCase() === 'CANCELLED';
  const isPickupOrder = (() => {
    const deliveryType = (order?.delivery_type || '').toUpperCase();
    if (deliveryType === 'PICKUP') return true;
    if (deliveryType === 'DELIVERY') return false;

    const status = (order?.current_status || order?.status || '').toUpperCase();
    return ['ASSIGNED', 'RECEIVED', 'PICKUP_ASSIGNED', 'PICKUP_IN_PROGRESS', 'SHIPPED', 'PICKED_UP'].includes(status);
  })();

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
                ₹{parseFloat(order?.total_price || order?.total_amount || order?.total || 0).toLocaleString('en-IN')}
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
          <Text style={styles.cardTitle}>Tracking Timeline (10 Steps)</Text>
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
                Price: ₹{parseFloat(order?.Product?.current_price || order?.product?.current_price || order?.product?.price || order?.unit_price || 0).toFixed(2)} per unit
              </Text>
              <Text style={styles.productDetailTotal}>
                Total: ₹{parseFloat(order?.total_price || order?.total_amount || order?.total || 0).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>

        {/* Packing Proof Images */}
        {(order?.packing_image_url || order?.bill_paste_image_url) && (
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>📸 Packing Proof</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {order?.packing_image_url && (
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Image 
                    source={{ uri: order.packing_image_url }} 
                    style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f0f0f0' }}
                    resizeMode="cover"
                  />
                  <Text style={{ fontSize: 11, color: '#888', marginTop: 4, fontWeight: '600' }}>Packing Image</Text>
                </View>
              )}
              {order?.bill_paste_image_url && (
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Image 
                    source={{ uri: order.bill_paste_image_url }} 
                    style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f0f0f0' }}
                    resizeMode="cover"
                  />
                  <Text style={{ fontSize: 11, color: '#888', marginTop: 4, fontWeight: '600' }}>Bill Image</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Source Transporter Info */}
        {(order?.source_transporter_id || order?.source_transporter) && (
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
                  <Text style={styles.transporterInitials}>
                    {getInitials(order?.source_transporter?.name || 'Source Transporter')}
                  </Text>
                </View>
              )}
              <View style={styles.transporterInfo}>
                <Text style={styles.transporterName}>
                  {order?.source_transporter?.name || order?.source_transporter?.full_name || 'Source Transporter'}
                </Text>
                {(order?.source_transporter?.mobile_number || order?.source_transporter?.mobile || order?.source_transporter?.phone) ? (
                  <Text style={styles.transporterContact}>
                    📞 {order.source_transporter.mobile_number || order.source_transporter.mobile || order.source_transporter.phone}
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
        {(order?.destination_transporter_id || order?.destination_transporter) && (
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
                  <Text style={styles.transporterInitials}>
                    {getInitials(order?.destination_transporter?.name || 'Destination Transporter')}
                  </Text>
                </View>
              )}
              <View style={styles.transporterInfo}>
                <Text style={styles.transporterName}>
                  {order?.destination_transporter?.name || order?.destination_transporter?.full_name || 'Destination Transporter'}
                </Text>
                {(order?.destination_transporter?.mobile_number || order?.destination_transporter?.mobile || order?.destination_transporter?.phone) ? (
                  <Text style={styles.transporterContact}>
                    📞 {order.destination_transporter.mobile_number || order.destination_transporter.mobile || order.destination_transporter.phone}
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
        {!isPickupOrder && (
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
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transporterInitials: {
    fontSize: 14,
    color: '#1B5E20',
    fontWeight: '700',
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
