/**
 * OrderHistory.js
 * Customer order history - full conversion of Flutter order_history.dart (967 lines)
 *
 * Features:
 *   - GET /api/customer/orders
 *   - Status filter chips: All, Pending, Confirmed, Shipped, Delivered, Cancelled
 *   - Order cards: ID, date, status badge (color-coded), product images, item count, total
 *   - Transporter card with name, vehicle, phone
 *   - Delivery person card with name, phone
 *   - Expandable order detail dialog
 *   - Tap order -> OrderSummary; Track Order -> OrderTracking
 *   - Pull to refresh, loading & empty states
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  optimizeImageUrl,
  pickImage,
  pickVideo,
  uploadImageToCloudinary,
  uploadMediaToCloudinary,
} from '../../services/cloudinaryService';
import { getCustomerOrders, submitCustomerReturnRequest } from '../../services/orderService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* --------------------------------------------------------------------------
 * CONSTANTS
 * ------------------------------------------------------------------------ */

const STATUS_FILTERS = ['All', 'Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
const RETURN_WINDOW_MS = 10 * 60 * 1000;

const STATUS_CONFIG = {
  pending:          { color: '#FF9800', bg: '#FFF3E0', icon: 'time-outline',                   label: 'Pending' },
  placed:           { color: '#FF9800', bg: '#FFF3E0', icon: 'time-outline',                   label: 'Placed' },
  confirmed:        { color: '#2196F3', bg: '#E3F2FD', icon: 'checkmark-circle-outline',       label: 'Confirmed' },
  assigned:         { color: '#9C27B0', bg: '#F3E5F5', icon: 'person-outline',                 label: 'Assigned' },
  processing:       { color: '#9C27B0', bg: '#F3E5F5', icon: 'cog-outline',                    label: 'Processing' },
  shipped:          { color: '#3F51B5', bg: '#E8EAF6', icon: 'airplane-outline',               label: 'Shipped' },
  in_transit:       { color: '#3F51B5', bg: '#E8EAF6', icon: 'car-outline',                    label: 'In Transit' },
  received:         { color: '#00897B', bg: '#E0F2F1', icon: 'cube-outline',                   label: 'Received' },
  out_for_delivery: { color: '#00BCD4', bg: '#E0F7FA', icon: 'bicycle-outline',                label: 'Out for Delivery' },
  delivered:        { color: '#4CAF50', bg: '#E8F5E9', icon: 'checkmark-done-circle-outline',  label: 'Delivered' },
  completed:        { color: '#4CAF50', bg: '#E8F5E9', icon: 'checkmark-done-circle-outline',  label: 'Delivered' },
  cancelled:        { color: '#F44336', bg: '#FFEBEE', icon: 'close-circle-outline',           label: 'Cancelled' },
};

const getStatusConfig = (status) => {
  const key = (status || 'pending').toLowerCase().replace(/[\s-]+/g, '_');
  return STATUS_CONFIG[key] || STATUS_CONFIG.pending;
};

// Normalize an order object so .status always exists
const normalizeOrder = (o) => ({
  ...o,
  status: (o.current_status || o.status || 'PENDING').toUpperCase(),
});

/* --------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------ */

const getProductImage = (item) => {
  if (!item) return null;
  // Direct image fields on the item itself
  if (item.image_url) return item.image_url;
  if (item.image) return item.image;
  if (item.product_image) return item.product_image;
  if (item.product_image_url) return item.product_image_url;
  // Sequelize returns association as capital-P "Product" � check both cases
  const product = item.Product || item.product;
  if (product) {
    const imgs = product.images;
    if (Array.isArray(imgs) && imgs.length > 0) {
      const primary = imgs.find((i) => i?.is_primary) || imgs[0];
      return typeof primary === 'string' ? primary : primary?.image_url || primary?.url || null;
    }
    if (product.image_url) return product.image_url;
    if (product.image) return product.image;
  }
  return null;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatCurrency = (amount) => {
  const n = parseFloat(amount) || 0;
  return '\u20B9' + n.toFixed(2);
};

const getOrderTotal = (order) => {
  // Backend model uses total_price; also accept total_amount / total as fallbacks
  const direct = order.total_price || order.total_amount || order.total;
  if (direct) return parseFloat(direct) || 0;
  const items = order.items || order.order_items || [];
  return items.reduce((sum, it) => sum + (parseFloat(it.total || it.subtotal || 0)), 0);
};

const getOrderItems = (order) => {
  // Resolve the product-level image once, for injection into items that lack one
  const productImageFromAssociation = getProductImage({ Product: order.Product || order.product });

  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((it) => ({
      ...it,
      image_url: it.image_url || it.image || productImageFromAssociation || null,
      name: it.name || it.product_name || order.Product?.name || order.product?.name || '',
    }));
  }
  if (Array.isArray(order.order_items) && order.order_items.length > 0) {
    return order.order_items.map((it) => ({
      ...it,
      image_url: it.image_url || it.image || productImageFromAssociation || null,
      name: it.name || it.product_name || order.Product?.name || order.product?.name || '',
    }));
  }
  if (order.items_json) {
    try {
      const parsed = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((it) => ({
          ...it,
          // Inject image from Sequelize Product association for orders saved without image_url
          image_url: it.image_url || it.image || productImageFromAssociation || null,
          name: it.name || it.product_name || order.Product?.name || order.product?.name || '',
        }));
      }
    } catch (_) {}
  }
  // Fallback: build a synthetic item directly from the Sequelize Product association
  const prod = order.Product || order.product;
  if (prod) {
    return [{
      product_id: order.product_id,
      name: prod.name || prod.product_name || '',
      product_name: prod.name || prod.product_name || '',
      image_url: productImageFromAssociation,
      quantity: order.quantity || 1,
      price: parseFloat(order.total_price || prod.current_price || 0),
      total: parseFloat(order.total_price || (prod.current_price || 0) * (order.quantity || 1)),
    }];
  }
  return [];
};

const getAddressText = (rawAddress) => {
  if (!rawAddress) return '';

  const parts = [];
  const addPart = (value) => {
    if (value === null || value === undefined) return;
    const text = String(value).trim();
    if (!text) return;
    if (!parts.includes(text)) parts.push(text);
  };

  const parseAddress = (value) => {
    if (value === null || value === undefined) return;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          parseAddress(JSON.parse(trimmed));
          return;
        } catch (_) {
          // Keep as plain text when parsing fails.
        }
      }

      addPart(trimmed);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(parseAddress);
      return;
    }

    if (typeof value === 'object') {
      addPart(value.full_name || value.name || value.customer_name);

      const phone = value.phone || value.mobile || value.mobile_number || value.phone_number;
      if (phone) addPart(`Phone: ${phone}`);

      addPart(value.address_line || value.address || value.street);

      const cityLine = [value.city, value.district].filter(Boolean).join(', ');
      addPart(cityLine);

      const stateLine = [value.state, value.pincode || value.zipcode || value.zip].filter(Boolean).join(' - ');
      addPart(stateLine);

      if (value.zone) addPart(`Zone: ${value.zone}`);

      if (parts.length === 0) {
        Object.values(value).forEach((entry) => {
          if (typeof entry === 'string' || typeof entry === 'number') addPart(entry);
        });
      }
    }
  };

  parseAddress(rawAddress);
  return parts.join(', ');
};

const isDeliveredOrCompleted = (order) => {
  const status = (order?.status || order?.current_status || '').toUpperCase();
  return status === 'DELIVERED' || status === 'COMPLETED';
};

const getCompletionTimestamp = (order) => {
  if (!order) return null;
  const candidates = [
    order.delivered_at,
    order.completed_at,
    order.delivery_completed_at,
    order.status_updated_at,
    order.updated_at,
    order.modified_at,
    order.created_at,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const ts = new Date(value).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return null;
};

const getReturnWindowRemainingMs = (order, now = Date.now()) => {
  if (!isDeliveredOrCompleted(order)) return 0;
  const completedAt = getCompletionTimestamp(order);
  if (!completedAt) return 0;
  return Math.max(0, RETURN_WINDOW_MS - (now - completedAt));
};

const isReturnRequested = (order) => {
  const markers = [
    order?.return_status,
    order?.return_request_status,
    order?.returnState,
    order?.returnStatus,
  ];
  const normalized = markers
    .map((v) => String(v || '').trim().toUpperCase())
    .filter(Boolean);
  if (normalized.some((v) => ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'].includes(v))) {
    return true;
  }
  return Boolean(order?.return_requested || order?.is_return_requested || order?.has_return_request);
};

const formatDuration = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const chooseMediaSource = (title = 'Select Source') =>
  new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    Alert.alert(
      title,
      'Choose how you want to upload',
      [
        { text: 'Camera', onPress: () => done('camera') },
        { text: 'Gallery', onPress: () => done('gallery') },
        { text: 'Cancel', style: 'cancel', onPress: () => done(null) },
      ],
      {
        cancelable: true,
        onDismiss: () => done(null),
      }
    );
  });

/* --------------------------------------------------------------------------
 * SHIMMER
 * ------------------------------------------------------------------------ */

const ShimmerBlock = ({ width: w, height: h, style, borderRadius = 8 }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#e0e0e0', '#f5f5f5'] });
  return <Animated.View style={[{ width: w, height: h, borderRadius, backgroundColor: bg }, style]} />;
};

const OrderCardSkeleton = () => (
  <View style={styles.card}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
      <ShimmerBlock width={120} height={16} />
      <ShimmerBlock width={80} height={24} borderRadius={12} />
    </View>
    <ShimmerBlock width={150} height={12} style={{ marginBottom: 12 }} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <ShimmerBlock width={56} height={56} />
      <ShimmerBlock width={56} height={56} />
      <ShimmerBlock width={56} height={56} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
      <ShimmerBlock width={100} height={14} />
      <ShimmerBlock width={80} height={32} borderRadius={16} />
    </View>
  </View>
);

/* --------------------------------------------------------------------------
 * STATUS BADGE
 * ------------------------------------------------------------------------ */

const StatusBadge = ({ status }) => {
  const cfg = getStatusConfig(status);
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={14} color={cfg.color} />
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};

/* --------------------------------------------------------------------------
 * ORDER DETAIL MODAL
 * ------------------------------------------------------------------------ */

const OrderDetailModal = ({
  visible,
  order,
  onClose,
  onTrack,
  onViewSummary,
  onOpenReturn,
  returnRemainingMs = 0,
  hasExistingReturnRequest = false,
}) => {
  if (!order) return null;
  const items = getOrderItems(order);
  const normalizedStatus = (order.status || '').toUpperCase();
  const canTrack = !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(normalizedStatus);
  const deliveredOrCompleted = isDeliveredOrCompleted(order);
  const canOpenReturn = deliveredOrCompleted && returnRemainingMs > 0 && !hasExistingReturnRequest;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Order Details</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
            {/* Product Name */}
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Product</Text>
              <Text style={[styles.modalValue, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                {items.length > 0
                  ? items.map(i => i.name || i.product_name || i.product?.name || i.Product?.name || 'Product').join(', ')
                  : (order.Product?.name || order.product?.name || `Order #${order.order_id || order.id}`)}
              </Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Status</Text>
              <StatusBadge status={order.status} />
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Date</Text>
              <Text style={styles.modalValue}>{formatDate(order.created_at || order.order_date)}</Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Total</Text>
              <Text style={[styles.modalValue, { color: '#1B5E20', fontWeight: '700' }]}>
                {formatCurrency(getOrderTotal(order))}
              </Text>
            </View>

            {/* Price Breakdown */}
            {(order.subtotal || order.admin_commission || order.delivery_charges || order.transport_charge) ? (
              <View style={styles.breakdownBox}>
                {parseFloat(order.subtotal || 0) > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Subtotal</Text>
                    <Text style={styles.breakdownAmt}>{formatCurrency(parseFloat(order.subtotal))}</Text>
                  </View>
                )}
                {parseFloat(order.admin_commission || 0) > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Platform Fee</Text>
                    <Text style={styles.breakdownAmt}>{formatCurrency(parseFloat(order.admin_commission))}</Text>
                  </View>
                )}
                {parseFloat(order.delivery_charges || order.transport_charge || 0) > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Delivery Charges</Text>
                    <Text style={styles.breakdownAmt}>{formatCurrency(parseFloat(order.delivery_charges || order.transport_charge))}</Text>
                  </View>
                )}
                <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: '#ddd', marginTop: 6, paddingTop: 6 }]}>
                  <Text style={[styles.breakdownLabel, { fontWeight: '700', color: '#333' }]}>Total</Text>
                  <Text style={[styles.breakdownAmt, { fontWeight: '700', color: '#1B5E20' }]}>{formatCurrency(getOrderTotal(order))}</Text>
                </View>
              </View>
            ) : null}

            {/* Delivery Address */}
            {(order.delivery_address || order.shipping_address) && (() => {
              const raw = order.delivery_address || order.shipping_address;
              const addrText = getAddressText(raw);
              return (
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Delivery</Text>
                  <Text style={[styles.modalValue, { flex: 1, textAlign: 'right' }]} numberOfLines={3}>
                    {addrText}
                  </Text>
                </View>
              );
            })()}

            {/* Payment method */}
            {order.payment_method && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Payment</Text>
                <Text style={styles.modalValue}>{order.payment_method}</Text>
              </View>
            )}

            {/* Items */}
            <Text style={[styles.modalLabel, { marginTop: 16, marginBottom: 8, fontSize: 15, fontWeight: '600', color: '#333' }]}>
              Items ({items.length})
            </Text>
            {items.map((item, idx) => {
              const img = getProductImage(item);
              return (
                <View key={idx} style={styles.modalItem}>
                  {img ? (
                    <Image
                      source={{ uri: optimizeImageUrl(img, { width: 60, height: 60 }) }}
                      style={styles.modalItemImage}
                    />
                  ) : (
                    <View style={[styles.modalItemImage, styles.imagePlaceholder]}>
                      <Ionicons name="leaf-outline" size={20} color="#aaa" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.modalItemName} numberOfLines={1}>
                      {item.product_name || item.product?.name || item.name || 'Product'}
                    </Text>
                    <Text style={styles.modalItemMeta}>
                      Qty: {item.quantity || 1}  {'\u2022'}  {formatCurrency(item.price || item.unit_price || 0)}
                    </Text>
                  </View>
                  <Text style={styles.modalItemTotal}>
                    {formatCurrency(item.total || item.subtotal || (item.price || 0) * (item.quantity || 1))}
                  </Text>
                </View>
              );
            })}

            {/* Transporter */}
            {order.transporter && (
              <View style={styles.infoCard}>
                <MaterialCommunityIcons name="truck-outline" size={20} color="#1B5E20" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.infoCardTitle}>Transporter</Text>
                  <Text style={styles.infoCardValue}>
                    {order.transporter.name || order.transporter.full_name || order.transporter.username || 'N/A'}
                  </Text>
                  {(order.transporter.vehicle_type || order.transporter.vehicle_number) && (
                    <Text style={styles.infoCardMeta}>
                      {'\uD83D\uDE9B'} {order.transporter.vehicle_type || ''} {order.transporter.vehicle_number ? (' \u2022 ' + order.transporter.vehicle_number) : ''}
                    </Text>
                  )}
                  {order.transporter.phone && (
                    <Text style={styles.infoCardMeta}>{'\uD83D\uDCDE'} {order.transporter.phone}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Source Transporter (from farmer to hub) */}
            {order.source_transporter && (
              <View style={[styles.infoCard, { backgroundColor: '#E8F5E9' }]}>
                <MaterialCommunityIcons name="truck-outline" size={20} color="#1B5E20" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.infoCardTitle}>Source Transporter</Text>
                  <Text style={styles.infoCardValue}>
                    {order.source_transporter.name || order.source_transporter.full_name || 'N/A'}
                  </Text>
                  {order.source_transporter.mobile_number && (
                    <Text style={styles.infoCardMeta}>{'\uD83D\uDCDE'} {order.source_transporter.mobile_number}</Text>
                  )}
                  {order.source_transporter.zone && (
                    <Text style={styles.infoCardMeta}>{'\uD83D\uDCCD'} {order.source_transporter.zone}{order.source_transporter.district ? `, ${order.source_transporter.district}` : ''}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Destination Transporter (hub to customer) */}
            {order.destination_transporter && (
              <View style={[styles.infoCard, { backgroundColor: '#E3F2FD' }]}>
                <MaterialCommunityIcons name="truck-delivery-outline" size={20} color="#0288D1" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.infoCardTitle, { color: '#0288D1' }]}>Destination Transporter</Text>
                  <Text style={styles.infoCardValue}>
                    {order.destination_transporter.name || order.destination_transporter.full_name || 'N/A'}
                  </Text>
                  {order.destination_transporter.mobile_number && (
                    <Text style={styles.infoCardMeta}>{'\uD83D\uDCDE'} {order.destination_transporter.mobile_number}</Text>
                  )}
                  {order.destination_transporter.zone && (
                    <Text style={styles.infoCardMeta}>{'\uD83D\uDCCD'} {order.destination_transporter.zone}{order.destination_transporter.district ? `, ${order.destination_transporter.district}` : ''}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Delivery Person */}
            {order.delivery_person && (
              <View style={styles.infoCard}>
                <Ionicons name="bicycle-outline" size={20} color="#1B5E20" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.infoCardTitle}>Delivery Person</Text>
                  <Text style={styles.infoCardValue}>
                    {order.delivery_person.name || order.delivery_person.full_name || order.delivery_person.username || 'N/A'}
                  </Text>
                  {order.delivery_person.phone && (
                    <Text style={styles.infoCardMeta}>{'\uD83D\uDCDE'} {order.delivery_person.phone}</Text>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#E8F5E9' }]}
              onPress={onViewSummary}
            >
              <Ionicons name="receipt-outline" size={18} color="#1B5E20" />
              <Text style={[styles.modalBtnText, { color: '#1B5E20' }]}>View Summary</Text>
            </TouchableOpacity>
            {canTrack && (
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#1B5E20' }]}
                onPress={onTrack}
              >
                <Ionicons name="locate-outline" size={18} color="#fff" />
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Track Order</Text>
              </TouchableOpacity>
            )}
            {deliveredOrCompleted && (
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: canOpenReturn ? '#2E7D32' : '#C8E6C9' },
                ]}
                disabled={!canOpenReturn}
                onPress={onOpenReturn}
              >
                <Ionicons name="return-up-back-outline" size={18} color={canOpenReturn ? '#fff' : '#33691E'} />
                <Text style={[styles.modalBtnText, { color: canOpenReturn ? '#fff' : '#33691E' }]}>Request Return</Text>
              </TouchableOpacity>
            )}
          </View>
          {deliveredOrCompleted && (
            <Text style={styles.returnInfoText}>
              {hasExistingReturnRequest
                ? 'Return request already submitted for this order.'
                : returnRemainingMs > 0
                  ? `Return available for ${formatDuration(returnRemainingMs)} after delivery.`
                  : 'Return window closed. Returns are allowed only for 10 minutes after delivery.'}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

/* --------------------------------------------------------------------------
 * RETURN REQUEST MODAL
 * ------------------------------------------------------------------------ */

const ReturnRequestModal = ({
  visible,
  order,
  reportText,
  setReportText,
  openingPhotos,
  proofPhotos,
  videoUri,
  submitting,
  onClose,
  onPickOpeningPhoto,
  onPickProofPhoto,
  onPickVideo,
  onRemoveOpeningPhoto,
  onRemoveProofPhoto,
  onRemoveVideo,
  onSubmit,
}) => {
  if (!order) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, styles.returnModalContent]}>
          <View style={[styles.modalHeader, styles.returnModalHeader]}>
            <View style={styles.returnModalTitleWrap}>
              <Text style={styles.modalTitle}>Return Policy Evidence</Text>
              <Text style={styles.returnModalSubtitle}>Upload complete proof from camera or gallery to submit your return request.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.evidenceStatsRow}>
            <View style={styles.evidencePill}>
              <Ionicons name="videocam-outline" size={14} color="#1B5E20" />
              <Text style={styles.evidencePillText}>{videoUri ? 'Video Added' : 'Video Required'}</Text>
            </View>
            <View style={styles.evidencePill}>
              <Ionicons name="images-outline" size={14} color="#1B5E20" />
              <Text style={styles.evidencePillText}>{openingPhotos.length} Related</Text>
            </View>
            <View style={styles.evidencePill}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#1B5E20" />
              <Text style={styles.evidencePillText}>{proofPhotos.length} Proof</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.returnModalScroll}>
            <View style={styles.returnPolicyCard}>
              <Text style={styles.returnPolicyTitle}>Customer Return Requirements</Text>
              <Text style={styles.returnPolicyText}>1. Return is allowed only within 10 minutes after delivery completion.</Text>
              <Text style={styles.returnPolicyText}>2. Upload unboxing/opening video of the order.</Text>
              <Text style={styles.returnPolicyText}>3. Upload related photos and proof evidence photos.</Text>
              <Text style={styles.returnPolicyText}>4. Add a report explaining the issue.</Text>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.returnSectionTitle}>Order Opening Video</Text>
                <Text style={styles.requiredBadge}>Required</Text>
              </View>
              {videoUri ? (
                <View style={styles.uploadedItemRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name="videocam" size={18} color="#2E7D32" />
                    <Text style={styles.uploadedItemText} numberOfLines={1}>Video selected</Text>
                  </View>
                  <TouchableOpacity onPress={onRemoveVideo}>
                    <Ionicons name="trash-outline" size={18} color="#C62828" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.uploadBtn, styles.uploadBtnPrimary]} onPress={onPickVideo}>
                  <Ionicons name="videocam-outline" size={18} color="#1B5E20" />
                  <Text style={styles.uploadBtnText}>Select Video (Camera/Gallery)</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.sectionHintText}>Capture clear unboxing and defect visibility in one clip.</Text>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.returnSectionTitle}>Related Photos</Text>
                <Text style={styles.requiredBadge}>Required</Text>
              </View>
              <TouchableOpacity style={[styles.uploadBtn, styles.uploadBtnPrimary]} onPress={onPickOpeningPhoto}>
                <Ionicons name="images-outline" size={18} color="#1B5E20" />
                <Text style={styles.uploadBtnText}>Add Related Photo (Camera/Gallery)</Text>
              </TouchableOpacity>
              {openingPhotos.map((uri, idx) => (
                <View key={`opening-${idx}`} style={styles.uploadedItemRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name="image-outline" size={18} color="#2E7D32" />
                    <Text style={styles.uploadedItemText} numberOfLines={1}>Related photo {idx + 1}</Text>
                  </View>
                  <TouchableOpacity onPress={() => onRemoveOpeningPhoto(idx)}>
                    <Ionicons name="trash-outline" size={18} color="#C62828" />
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={styles.sectionHintText}>Add photos of package condition and product state.</Text>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.returnSectionTitle}>Proof Evidence Photos</Text>
                <Text style={styles.requiredBadge}>Required</Text>
              </View>
              <TouchableOpacity style={[styles.uploadBtn, styles.uploadBtnPrimary]} onPress={onPickProofPhoto}>
                <Ionicons name="camera-outline" size={18} color="#1B5E20" />
                <Text style={styles.uploadBtnText}>Add Proof Photo (Camera/Gallery)</Text>
              </TouchableOpacity>
              {proofPhotos.map((uri, idx) => (
                <View key={`proof-${idx}`} style={styles.uploadedItemRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name="image-outline" size={18} color="#2E7D32" />
                    <Text style={styles.uploadedItemText} numberOfLines={1}>Proof photo {idx + 1}</Text>
                  </View>
                  <TouchableOpacity onPress={() => onRemoveProofPhoto(idx)}>
                    <Ionicons name="trash-outline" size={18} color="#C62828" />
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={styles.sectionHintText}>Focus on damages, defects, and mismatch evidence.</Text>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.returnSectionTitle}>Issue Report</Text>
                <Text style={styles.requiredBadge}>Required</Text>
              </View>
              <TextInput
                style={styles.reportInput}
                placeholder="Type your issue report here..."
                multiline
                value={reportText}
                onChangeText={setReportText}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#ECEFF1' }]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={[styles.modalBtnText, { color: '#455A64' }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#1B5E20', opacity: submitting ? 0.7 : 1 }]}
              onPress={onSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Submit Return</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

/* --------------------------------------------------------------------------
 * ORDER CARD
 * ------------------------------------------------------------------------ */

const OrderCard = ({ order, onPress, onTrack }) => {
  const items = getOrderItems(order);
  const total = getOrderTotal(order);
  const cfg = getStatusConfig(order.status);

  return (
    <TouchableOpacity style={[styles.card, { borderLeftWidth: 4, borderLeftColor: cfg.color }]} activeOpacity={0.7} onPress={onPress}>
      {/* Top row: Product names + Status */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.orderId} numberOfLines={1}>
            {items.length > 0
              ? (() => {
                  const names = items.map(i => i.name || i.product_name || i.product?.name || i.Product?.name || 'Product');
                  return names.length > 2
                    ? `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
                    : names.join(', ');
                })()
              : (order.Product?.name || order.product?.name || `Order #${order.order_id || order.id}`)}
          </Text>
          <Text style={styles.orderDate}>{formatDate(order.created_at || order.order_date)}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      {/* Product image previews */}
      <View style={styles.imageRow}>
        {items.slice(0, 4).map((item, idx) => {
          const img = getProductImage(item);
          return img ? (
            <Image
              key={idx}
              source={{ uri: optimizeImageUrl(img, { width: 56, height: 56 }) }}
              style={styles.thumbImage}
            />
          ) : (
            <View key={idx} style={[styles.thumbImage, styles.imagePlaceholder]}>
              <Ionicons name="leaf-outline" size={18} color="#aaa" />
            </View>
          );
        })}
        {items.length > 4 && (
          <View style={[styles.thumbImage, styles.moreItems]}>
            <Text style={styles.moreItemsText}>+{items.length - 4}</Text>
          </View>
        )}
        {items.length === 0 && (
          <View style={[styles.thumbImage, styles.imagePlaceholder]}>
            <Ionicons name="cube-outline" size={18} color="#aaa" />
          </View>
        )}
      </View>

      {/* Bottom row: item count + total + track */}
      <View style={styles.cardFooter}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemCount}>
            {items.length || order.total_items || 0} item{(items.length || order.total_items || 0) !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
        </View>
        {!['DELIVERED', 'COMPLETED', 'CANCELLED'].includes((order.status || '').toUpperCase()) && (
          <TouchableOpacity
            style={styles.trackBtn}
            onPress={(e) => { e.stopPropagation && e.stopPropagation(); onTrack(); }}
          >
            <Ionicons name="locate-outline" size={16} color="#fff" />
            <Text style={styles.trackBtnText}>Track</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Transporter mini-card */}
      {order.transporter && (
        <View style={styles.miniCard}>
          <MaterialCommunityIcons name="truck-outline" size={16} color="#666" />
          <Text style={styles.miniCardText} numberOfLines={1}>
            {order.transporter.name || order.transporter.full_name || order.transporter.username || ''}
            {order.transporter.vehicle_type ? (' \u2022 ' + order.transporter.vehicle_type) : ''}
            {order.transporter.phone ? (' \u2022 ' + order.transporter.phone) : ''}
          </Text>
        </View>
      )}

      {/* Delivery person mini-card */}
      {order.delivery_person && (
        <View style={styles.miniCard}>
          <Ionicons name="bicycle-outline" size={16} color="#666" />
          <Text style={styles.miniCardText} numberOfLines={1}>
            {order.delivery_person.name || order.delivery_person.full_name || order.delivery_person.username || ''}
            {order.delivery_person.phone ? (' \u2022 ' + order.delivery_person.phone) : ''}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

/* --------------------------------------------------------------------------
 * MAIN COMPONENT
 * ------------------------------------------------------------------------ */

const OrderHistory = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnReport, setReturnReport] = useState('');
  const [openingPhotos, setOpeningPhotos] = useState([]);
  const [proofPhotos, setProofPhotos] = useState([]);
  const [returnVideoUri, setReturnVideoUri] = useState(null);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const toastRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* -- Fetch ------------------------------------------------- */
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getCustomerOrders();
      const raw = Array.isArray(data) ? data : data?.data || data?.orders || [];
      const list = raw.map(normalizeOrder);
      list.sort((a, b) => new Date(b.created_at || b.order_date || 0) - new Date(a.created_at || a.order_date || 0));
      console.log('[OrderHistory] Fetched', list.length, 'orders');
      setOrders(list);
      applyFilter(activeFilter, list);
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to load orders';
      console.error('[OrderHistory] fetchOrders error:', msg, '\nStatus:', e?.response?.status, '\nDetails:', JSON.stringify(e?.response?.data));
      if (!silent) toastRef.current?.show(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => { fetchOrders(); }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchOrders(true));
    return unsub;
  }, [navigation, fetchOrders]);

  /* -- Filter ------------------------------------------------ */
  const applyFilter = (filter, list = orders) => {
    setActiveFilter(filter);
    if (filter === 'All') {
      setFilteredOrders(list);
    } else {
      // Match both backend uppercase (PENDING, PLACED) and display case
      const key = filter.toUpperCase();
      setFilteredOrders(list.filter((o) => {
        const s = (o.status || o.current_status || '').toUpperCase();
        if (key === 'PENDING') return s === 'PENDING' || s === 'PLACED';
        if (key === 'CONFIRMED') return s === 'CONFIRMED' || s === 'ASSIGNED';
        if (key === 'SHIPPED') return s === 'SHIPPED' || s === 'IN_TRANSIT' || s === 'RECEIVED' || s === 'OUT_FOR_DELIVERY';
        if (key === 'DELIVERED') return s === 'DELIVERED' || s === 'COMPLETED';
        return s === key;
      }));
    }
  };

  /* -- Handlers ---------------------------------------------- */
  const handleOrderPress = (order) => {
    setSelectedOrder(order);
    setModalVisible(true);
  };

  const handleTrackOrder = (order) => {
    setModalVisible(false);
    navigation.navigate('OrderTracking', { orderId: order.order_id || order.id, order });
  };

  const handleViewSummary = () => {
    if (!selectedOrder) return;
    setModalVisible(false);
    navigation.navigate('OrderSummary', { orderId: selectedOrder.order_id || selectedOrder.id, order: selectedOrder });
  };

  const resetReturnForm = () => {
    setReturnReport('');
    setOpeningPhotos([]);
    setProofPhotos([]);
    setReturnVideoUri(null);
  };

  const handleOpenReturnModal = () => {
    if (!selectedOrder) return;
    if (isReturnRequested(selectedOrder)) {
      toastRef.current?.show('Return request already submitted for this order.', 'info');
      return;
    }

    const remaining = getReturnWindowRemainingMs(selectedOrder, nowMs);
    if (remaining <= 0) {
      toastRef.current?.show('Return window closed. Returns are allowed only for 10 minutes after delivery.', 'error');
      return;
    }

    setReturnModalVisible(true);
  };

  const handleCloseReturnModal = () => {
    setReturnModalVisible(false);
  };

  const addOpeningPhoto = async () => {
    const source = await chooseMediaSource('Add Related Photo');
    if (!source) return;
    const uri = await pickImage(source === 'camera');
    if (!uri) return;
    setOpeningPhotos((prev) => [...prev, uri]);
  };

  const addProofPhoto = async () => {
    const source = await chooseMediaSource('Add Proof Photo');
    if (!source) return;
    const uri = await pickImage(source === 'camera');
    if (!uri) return;
    setProofPhotos((prev) => [...prev, uri]);
  };

  const selectReturnVideo = async () => {
    const source = await chooseMediaSource('Add Opening Video');
    if (!source) return;
    const uri = await pickVideo(source === 'camera');
    if (!uri) return;
    setReturnVideoUri(uri);
  };

  const removeOpeningPhoto = (idx) => {
    setOpeningPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeProofPhoto = (idx) => {
    setProofPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeVideo = () => {
    setReturnVideoUri(null);
  };

  const handleSubmitReturn = async () => {
    if (!selectedOrder) return;

    const submitOrderId = selectedOrder.order_id || selectedOrder.id;

    const remaining = getReturnWindowRemainingMs(selectedOrder, Date.now());
    if (remaining <= 0) {
      toastRef.current?.show('Return window closed. Returns are allowed only for 10 minutes after delivery.', 'error');
      return;
    }

    if (!returnVideoUri) {
      toastRef.current?.show('Please upload the order opening video.', 'error');
      return;
    }
    if (!openingPhotos.length) {
      toastRef.current?.show('Please upload at least one related photo.', 'error');
      return;
    }
    if (!proofPhotos.length) {
      toastRef.current?.show('Please upload at least one proof evidence photo.', 'error');
      return;
    }
    if (!returnReport.trim()) {
      toastRef.current?.show('Please type your report before submitting.', 'error');
      return;
    }

    setSubmittingReturn(true);
    try {
      console.log('[OrderHistory][ReturnSubmit] Start', {
        order_id: submitOrderId,
        report_length: returnReport?.trim()?.length || 0,
        opening_video_local_uri: returnVideoUri,
        related_photos_count: openingPhotos.length,
        proof_photos_count: proofPhotos.length,
      });

      const uploadImageBatchSequentially = async (uris) => {
        const uploaded = [];
        for (const uri of uris) {
          const url = await uploadImageToCloudinary(uri);
          if (!url) {
            throw new Error('Failed to upload one or more evidence photos. Please try again.');
          }
          uploaded.push(url);
        }
        return uploaded;
      };

      const videoUrl = await uploadMediaToCloudinary(returnVideoUri, 'video');
      const openingPhotoUrls = await uploadImageBatchSequentially(openingPhotos);
      const proofPhotoUrls = await uploadImageBatchSequentially(proofPhotos);

      console.log('[OrderHistory][ReturnSubmit] Upload return', {
        order_id: submitOrderId,
        opening_video_url: videoUrl,
        related_photos_uploaded: openingPhotoUrls,
        proof_photos_uploaded: proofPhotoUrls,
      });

      if (!videoUrl) {
        throw new Error('Failed to upload return video. Please try again.');
      }

      const cleanOpening = openingPhotoUrls.filter(Boolean);
      const cleanProof = proofPhotoUrls.filter(Boolean);

      if (!cleanOpening.length || !cleanProof.length) {
        throw new Error('Failed to upload one or more evidence photos. Please try again.');
      }

      const submitPayload = {
        report: returnReport.trim(),
        return_reason: returnReport.trim(),
        issue_report: returnReport.trim(),
        opening_video_url: videoUrl,
        openingVideoUrl: videoUrl,
        related_photos: cleanOpening,
        opening_photos: cleanOpening,
        proof_evidence_photos: cleanProof,
        evidence_photos: cleanProof,
        submitted_at: new Date().toISOString(),
      };

      console.log('[OrderHistory][ReturnSubmit] API payload', {
        order_id: submitOrderId,
        payload: submitPayload,
      });

      const submitResponse = await submitCustomerReturnRequest(submitOrderId, submitPayload);

      console.log('[OrderHistory][ReturnSubmit] Success return', {
        order_id: submitOrderId,
        response: submitResponse,
      });

      setSelectedOrder((prev) => prev ? {
        ...prev,
        return_requested: true,
        return_request_status: 'REQUESTED',
      } : prev);
      toastRef.current?.show('Return request submitted successfully.', 'success');
      setReturnModalVisible(false);
      resetReturnForm();
      fetchOrders(true);
    } catch (e) {
      console.error('[OrderHistory][ReturnSubmit] Error', {
        order_id: submitOrderId,
        message: e?.message,
        status: e?.status || e?.response?.status,
        data: e?.response?.data,
        stack: e?.stack,
      });
      const msg = e?.response?.data?.message || e.message || 'Failed to submit return request';
      toastRef.current?.show(msg, 'error');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); fetchOrders(true); };

  const selectedReturnRemainingMs = getReturnWindowRemainingMs(selectedOrder, nowMs);
  const selectedHasReturnRequest = isReturnRequested(selectedOrder);

  /* -- Render helpers ---------------------------------------- */
  const renderFilterChips = () => (
    <View style={styles.chipContainer}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {STATUS_FILTERS.map((f) => {
        const active = f === activeFilter;
        const count = f === 'All'
          ? orders.length
          : orders.filter((o) => (o.status || '').toLowerCase() === f.toLowerCase()).length;
        return (
          <TouchableOpacity
            key={f}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => applyFilter(f)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {f}{count > 0 ? ` (${count})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="receipt-outline" size={72} color="#ccc" />
      <Text style={styles.emptyTitle}>No Orders Yet</Text>
      <Text style={styles.emptySubtitle}>
        {activeFilter === 'All'
          ? "You haven't placed any orders yet. Start shopping!"
          : 'No ' + activeFilter.toLowerCase() + ' orders found.'}
      </Text>
      {activeFilter === 'All' && (
        <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.navigate('Home')}>
          <Ionicons name="cart-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.shopBtnText}>Start Shopping</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  /* -- Main -------------------------------------------------- */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Orders</Text>
          <Text style={styles.headerSub}>
            {orders.length} order{orders.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => fetchOrders()} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color="#1B5E20" />
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      {renderFilterChips()}

      {/* List */}
      {loading ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {[1, 2, 3].map((i) => <OrderCardSkeleton key={i} />)}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item, idx) => String(item.order_id || item.id || idx)}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => handleOrderPress(item)}
              onTrack={() => handleTrackOrder(item)}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            filteredOrders.length === 0 && { flex: 1 },
          ]}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} tintColor="#1B5E20" />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal */}
      <OrderDetailModal
        visible={modalVisible}
        order={selectedOrder}
        onClose={() => {
          setModalVisible(false);
          setReturnModalVisible(false);
          resetReturnForm();
        }}
        onTrack={() => selectedOrder && handleTrackOrder(selectedOrder)}
        onViewSummary={handleViewSummary}
        onOpenReturn={handleOpenReturnModal}
        returnRemainingMs={selectedReturnRemainingMs}
        hasExistingReturnRequest={selectedHasReturnRequest}
      />

      <ReturnRequestModal
        visible={returnModalVisible}
        order={selectedOrder}
        reportText={returnReport}
        setReportText={setReturnReport}
        openingPhotos={openingPhotos}
        proofPhotos={proofPhotos}
        videoUri={returnVideoUri}
        submitting={submittingReturn}
        onClose={handleCloseReturnModal}
        onPickOpeningPhoto={addOpeningPhoto}
        onPickProofPhoto={addProofPhoto}
        onPickVideo={selectReturnVideo}
        onRemoveOpeningPhoto={removeOpeningPhoto}
        onRemoveProofPhoto={removeProofPhoto}
        onRemoveVideo={removeVideo}
        onSubmit={handleSubmitReturn}
      />
      <ToastMessage ref={toastRef} />
    </View>
  );
};

/* --------------------------------------------------------------------------
 * STYLES
 * ------------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EDF6EE' },

  /* Header */
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FBFDFB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E6EFE6',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1B5E20' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  refreshBtn: { padding: 8 },

  /* Filter chips */
  chipContainer: {
    backgroundColor: '#fff',
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5E9',
    ...Platform.select({
      ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  chipRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#1B5E20', borderColor: '#1B5E20' },
  chipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  /* List */
  listContent: { padding: 16, paddingBottom: 32 },

  /* Card */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4EEE4',
    ...Platform.select({
      ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.09, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  orderId: { fontSize: 15, fontWeight: '800', color: '#1B5E20' },
  orderDate: { fontSize: 12, color: '#888', marginTop: 2 },

  /* Badge */
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },

  /* Image row */
  imageRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  thumbImage: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#f0f0f0' },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F8F4' },
  moreItems: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#E8F5E9' },
  moreItemsText: { fontSize: 13, fontWeight: '600', color: '#1B5E20' },

  /* Card footer */
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  itemCount: { fontSize: 12, color: '#888' },
  totalAmount: { fontSize: 16, fontWeight: '800', color: '#1B5E20', marginTop: 2 },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B5E20',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  trackBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  /* Mini card */
  miniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    gap: 6,
  },
  miniCardText: { fontSize: 12, color: '#666', flex: 1 },

  /* Empty */
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#333', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  shopBtn: {
    marginTop: 20,
    backgroundColor: '#1B5E20',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  shopBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1B5E20' },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  modalLabel: { fontSize: 14, color: '#888' },
  modalValue: { fontSize: 14, fontWeight: '600', color: '#333' },

  /* Modal items */
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  modalItemImage: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#F4F8F4' },
  modalItemName: { fontSize: 14, fontWeight: '600', color: '#333' },
  modalItemMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  modalItemTotal: { fontSize: 14, fontWeight: '600', color: '#1B5E20' },

  /* Info card */
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FFF8',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  infoCardTitle: { fontSize: 11, color: '#888', fontWeight: '500' },
  infoCardValue: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 2 },
  infoCardMeta: { fontSize: 12, color: '#666', marginTop: 2 },

  /* Price breakdown */
  breakdownBox: {
    backgroundColor: '#F1F8E9',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#DCEDC8',
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  breakdownLabel: { fontSize: 13, color: '#555' },
  breakdownAmt: { fontSize: 13, color: '#333', fontWeight: '500' },

  /* Modal actions */
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  modalBtnText: { fontSize: 14, fontWeight: '600' },

  returnModalContent: {
    backgroundColor: '#F8FBF8',
  },
  returnModalHeader: {
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  returnModalTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  returnModalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#4E6A50',
  },
  returnModalScroll: {
    maxHeight: 520,
  },
  evidenceStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  evidencePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#ECF5EC',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6E9D8',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  evidencePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1F5B24',
  },

  returnInfoText: {
    marginTop: 8,
    fontSize: 12,
    color: '#546E7A',
    textAlign: 'center',
  },

  returnPolicyCard: {
    backgroundColor: '#F1F8E9',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCECC5',
    marginBottom: 12,
  },
  returnPolicyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 6,
  },
  returnPolicyText: {
    fontSize: 12,
    color: '#33691E',
    marginBottom: 3,
    lineHeight: 18,
  },
  returnSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 6,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2ECE4',
    padding: 12,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  requiredBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B71C1C',
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sectionHintText: {
    marginTop: 4,
    fontSize: 11,
    color: '#607D8B',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    paddingVertical: 10,
    marginBottom: 6,
  },
  uploadBtnPrimary: {
    backgroundColor: '#F0FAF1',
  },
  uploadBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1B5E20',
  },
  uploadedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ECEFF1',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  uploadedItemText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#455A64',
    flex: 1,
  },
  reportInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#263238',
    marginBottom: 4,
  },
});

export default OrderHistory;
