import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { getFarmerOrders, acceptFarmerOrder, rejectFarmerOrder, assignTransporters } from '../../services/orderService';
import ToastMessage from '../../utils/Toast';

const STATUS_LIST = ['All', 'PENDING', 'PLACED', 'ASSIGNED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'RECEIVED', 'SHIPPED', 'IN_TRANSIT', 'REACHED_DESTINATION', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'];

const STATUS_COLORS = {
  PENDING: '#FF9800',
  PLACED: '#2196F3',
  ASSIGNED: '#9C27B0',
  PICKUP_ASSIGNED: '#FF5722',
  PICKED_UP: '#00897B',
  RECEIVED: '#00897B',
  SHIPPED: '#3F51B5',
  IN_TRANSIT: '#3F51B5',
  REACHED_DESTINATION: '#673AB7',
  OUT_FOR_DELIVERY: '#00BCD4',
  COMPLETED: '#4CAF50',
  CANCELLED: '#F44336',
};

// Map backend status to frontend display status
const normalizeStatus = (backendStatus) => {
  if (!backendStatus) return 'PENDING';
  const status = backendStatus.toString().toUpperCase();
  
  // Map backend statuses to frontend statuses
  switch (status) {
    case 'PENDING':
      return 'PENDING';
    case 'PLACED':
    case 'ACCEPTED':
    case 'CONFIRMED':
      return 'PLACED';
    case 'ASSIGNED':
      return 'ASSIGNED';
    case 'PICKUP_ASSIGNED':
      return 'PICKUP_ASSIGNED';
    case 'PICKED_UP':
      return 'PICKED_UP';
    case 'RECEIVED':
      return 'RECEIVED';
    case 'SHIPPED':
      return 'SHIPPED';
    case 'IN_TRANSIT':
      return 'IN_TRANSIT';
    case 'REACHED_DESTINATION':
      return 'REACHED_DESTINATION';
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY';
    case 'COMPLETED':
    case 'DELIVERED':
      return 'COMPLETED';
    case 'CANCELLED':
    case 'REJECTED':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
};

// Extract customer image from backend response
const getCustomerImage = (customer) => {
  if (!customer) return null;
  
  // Check for direct image properties
  if (customer.image_url) return customer.image_url;
  if (customer.image) return customer.image;
  if (customer.photo) return customer.photo;
  if (customer.profile_image) return customer.profile_image;
  
  return null;
};

// Extract product image from backend response
const getProductImage = (product) => {
  if (!product) return null;
  
  // Check for direct image properties
  if (product.image_url) return product.image_url;
  if (product.image) return product.image;
  if (product.photo) return product.photo;
  
  // Check for images array
  if (product.images && Array.isArray(product.images) && product.images.length > 0) {
    // Find primary image first
    const primaryImage = product.images.find(img => img.is_primary === true);
    if (primaryImage && primaryImage.image_url) {
      return primaryImage.image_url;
    }
    
    // Fallback to first image
    const firstImage = product.images[0];
    if (firstImage && firstImage.image_url) {
      return firstImage.image_url;
    }
  }
  
  return null;
};

const FarmerOrders = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [detailModal, setDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const toastRef = React.useRef(null);

  const fetchOrders = useCallback(async (statusFilter = 'All') => {
    try {
      console.log('[FarmerOrders] Fetching orders for status:', statusFilter);
      
      let data;
      if (statusFilter === 'All') {
        data = await getFarmerOrders('all');
      } else {
        // Map frontend status to backend status for API call
        let backendStatus = statusFilter.toLowerCase();
        if (statusFilter === 'PLACED') backendStatus = 'accepted';
        if (statusFilter === 'CANCELLED') backendStatus = 'rejected';
        if (statusFilter === 'COMPLETED') backendStatus = 'completed';
        if (statusFilter === 'PENDING') backendStatus = 'pending';
        
        data = await getFarmerOrdersByStatus(backendStatus);
      }
      
      const raw = Array.isArray(data) ? data : data?.orders || data?.data || [];
      console.log('[FarmerOrders] Raw data received:', raw.length, 'orders');
      
      if (raw.length > 0) {
        console.log('[FarmerOrders] Sample order structure:', JSON.stringify(raw[0], null, 2));
      }
      
      // Process and normalize orders
      const processedOrders = raw.map(order => {
        const product = order.Product || order.product || {};
        const customer = order.customer || {};
        
        console.log('[FarmerOrders] Processing order:', order.order_id, {
          current_status: order.current_status,
          product_name: product.name,
          product_images: product.images?.length || 0,
          customer_name: customer.name
        });
        
        return {
          ...order,
          status: normalizeStatus(order.current_status || order.status),
          product_image: getProductImage(product),
          product_name: product.name || product.product_name || 'Unknown Product',
          customer_name: customer.name || customer.full_name || 'Unknown Customer'
        };
      });
      
      setOrders(processedOrders.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date)));
      console.log('[FarmerOrders] Processed', processedOrders.length, 'orders successfully');
      
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to load orders';
      console.error('[FarmerOrders] fetchOrders error:', msg);
      console.error('[FarmerOrders] Error details:', {
        status: e?.response?.status,
        data: e?.response?.data,
        message: e.message
      });
      toastRef.current?.show(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { 
    fetchOrders(activeFilter); 
  }, [activeFilter]);

  const onRefresh = () => { 
    setRefreshing(true); 
    fetchOrders(activeFilter); 
  };

  const filteredOrders =
    activeFilter === 'All'
      ? orders
      : orders.filter((o) => (o.status || o.current_status || '').toUpperCase() === activeFilter.toUpperCase());

  const handleAssignTransporters = async (orderId) => {
    setActionLoading(orderId);
    try {
      console.log('[FarmerOrders] Assigning transporters for order:', orderId);
      
      const response = await assignTransporters(orderId);
      console.log('[FarmerOrders] Assign transporters response:', response);
      
      setOrders((prev) =>
        prev.map((o) => ((o.order_id || o.id) === orderId ? { ...o, status: 'ASSIGNED' } : o))
      );
      toastRef.current?.show('Transporters assigned successfully!', 'success');
      
      // Refresh orders after action
      setTimeout(() => {
        fetchOrders(activeFilter);
      }, 1000);
      
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to assign transporters';
      console.error('[FarmerOrders] Assign transporters error:', msg);
      toastRef.current?.show(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (orderId, action) => {
    setActionLoading(orderId);
    try {
      console.log('[FarmerOrders] Handling action:', action, 'for order:', orderId);
      
      if (action === 'accept') {
        const response = await acceptFarmerOrder(orderId);
        console.log('[FarmerOrders] Accept response:', response);

        // Workflow step 2: transporter assignment should happen at accept time.
        try {
          const assignResp = await assignTransporters(orderId);
          console.log('[FarmerOrders] Auto-assign transporters response:', assignResp);
        } catch (assignErr) {
          console.log('[FarmerOrders] Auto-assign transporters failed:', assignErr.message);
        }
        
        setOrders((prev) =>
          prev.map((o) => ((o.order_id || o.id) === orderId ? { ...o, status: 'ASSIGNED' } : o))
        );
        toastRef.current?.show('Order accepted and transporters assigned successfully!', 'success');
      } else {
        const response = await rejectFarmerOrder(orderId, 'Rejected by farmer');
        console.log('[FarmerOrders] Reject response:', response);
        
        setOrders((prev) =>
          prev.map((o) => ((o.order_id || o.id) === orderId ? { ...o, status: 'CANCELLED' } : o))
        );
        toastRef.current?.show('Order rejected successfully.', 'success');
      }
      
      // Refresh orders after action
      setTimeout(() => {
        fetchOrders(activeFilter);
      }, 1000);
      
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to update order';
      console.error('[FarmerOrders] Action error:', msg);
      toastRef.current?.show(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const openDetail = (order) => {
    setSelectedOrder(order);
    setDetailModal(true);
  };

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

  const renderOrderCard = ({ item }) => {
    const realId = item.order_id || item.id;
    const statusColor = STATUS_COLORS[item.status] || '#888';
    const isActionable = ['PENDING'].includes(item.status); // Only PENDING orders are actionable

    // API returns per-item records with a Product association
    const product = item.Product || item.product || {};
    const customer = item.customer || {};
    const imgUri = getProductImage(product);
    const customerImageUri = getCustomerImage(customer);
    const productName = product.name || product.product_name || item.product_name || 'Unknown Product';
    const unitPrice = parseFloat(product.current_price || product.price || item.unit_price || item.price_per_unit || 0);
    const qty = parseInt(item.quantity || 1);
    const total = parseFloat(item.total_price || item.total_amount || item.total || 0);
    const customerName = item.customer?.name || item.customer?.full_name || item.customer_name || 'Unknown Customer';

    console.log('[FarmerOrders] Rendering order card:', {
      orderId: realId,
      status: item.status,
      productName,
      imgUri,
      customerName,
      customerImageUri,
      isActionable
    });

    return (
      <TouchableOpacity
        style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: statusColor }]}
        onPress={() => openDetail(item)}
        activeOpacity={0.85}
      >
        {/* ── Header ── */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.productTitle}>{productName}</Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at || item.date)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {(item.status || '').replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {/* ── Customer with Profile Photo ── */}
        <View style={styles.customerRow}>
          {customerImageUri ? (
            <Image 
              source={{ uri: customerImageUri }} 
              style={styles.customerPhoto}
              onError={(error) => {
                console.log('[FarmerOrders] Customer image load error:', error.nativeEvent.error);
              }}
            />
          ) : (
            <View style={styles.customerPhotoPlaceholder}>
              <Ionicons name="person" size={16} color="#888" />
            </View>
          )}
          <View style={styles.customerInfo}>
            <Text style={styles.customerName} numberOfLines={1}>{customerName}</Text>
            <Text style={styles.customerLocation}>Qty: {qty} items</Text>
          </View>
        </View>

        {/* ── Product (single item record) ── */}
        <View style={styles.productsSection}>
          <View style={styles.productRow}>
            {imgUri ? (
              <Image 
                source={{ uri: imgUri }} 
                style={styles.productThumb}
                onError={(error) => {
                  console.log('[FarmerOrders] Image load error:', error.nativeEvent.error, 'for URL:', imgUri);
                }}
                onLoad={() => {
                  console.log('[FarmerOrders] Image loaded successfully:', imgUri);
                }}
              />
            ) : (
              <View style={styles.productThumbPlaceholder}>
                <MaterialCommunityIcons name="food-apple-outline" size={26} color="#aaa" />
              </View>
            )}
            <View style={styles.productInfoWrap}>
              <Text style={styles.productName} numberOfLines={2}>{productName}</Text>
              <Text style={styles.productMeta}>
                Qty: {qty}{unitPrice > 0 ? `  ·  ₹${unitPrice.toFixed(2)}/unit` : ''}
              </Text>
            </View>
            {total > 0 && (
              <Text style={styles.productItemTotal}>₹{total.toLocaleString('en-IN')}</Text>
            )}
          </View>
        </View>

        {/* ── Total ── */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Order Total</Text>
          <Text style={styles.totalAmount}>₹{total.toLocaleString('en-IN')}</Text>
        </View>

        {/* ── Action Required: Accept / Reject (Only for PENDING orders) ── */}
        {isActionable && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() =>
                Alert.alert(
                  'Reject Order', 
                  `Are you sure you want to reject this ${productName} order from ${customerName}?`, 
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                      text: 'Reject', 
                      style: 'destructive', 
                      onPress: () => handleAction(realId, 'reject') 
                    },
                  ]
                )
              }
              disabled={actionLoading === realId}
            >
              {actionLoading === realId ? (
                <ActivityIndicator size="small" color="#F44336" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={19} color="#F44336" />
                  <Text style={styles.rejectText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => handleAction(realId, 'accept')}
              disabled={actionLoading === realId}
            >
              {actionLoading === realId ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={19} color="#fff" />
                  <Text style={styles.acceptText}>Accept Order</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Status-based actions ── */}
        {!isActionable && item.status !== 'CANCELLED' && (
          <View style={styles.statusActionsRow}>
            {item.status === 'PLACED' && (
              <TouchableOpacity
                style={styles.assignTransporterBtn}
                onPress={() => handleAssignTransporters(realId)}
                disabled={actionLoading === realId}
              >
                {actionLoading === realId ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="truck-plus" size={16} color="#fff" />
                    <Text style={styles.assignTransporterText}>Assign Transporters</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
    {['ASSIGNED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'REACHED_DESTINATION', 'OUT_FOR_DELIVERY'].includes(item.status) && (
              <TouchableOpacity
                style={styles.trackBtn}
                onPress={() => navigation.navigate('FarmerOrderTracking', { orderId: realId, order: item })}
              >
                <MaterialCommunityIcons name="truck-outline" size={16} color="#1B5E20" />
                <Text style={styles.trackText}>Track Order</Text>
              </TouchableOpacity>
            )}
            {item.status === 'COMPLETED' && (
              <View style={styles.statusInfoRow}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={[styles.statusInfoText, { color: '#4CAF50' }]}>Order Completed Successfully</Text>
              </View>
            )}
          </View>
        )}

        {item.status === 'CANCELLED' && (
          <View style={styles.statusInfoRow}>
            <Ionicons name="close-circle" size={16} color="#F44336" />
            <Text style={[styles.statusInfoText, { color: '#F44336' }]}>Order Cancelled</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  /* ─── Order Detail Modal ─── */
  const renderDetailModal = () => {
    if (!selectedOrder) return null;
    const o = selectedOrder;
    const realId = o.order_id || o.id;
    const statusColor = STATUS_COLORS[o.status] || '#888';
    const isActionable = ['PLACED', 'PENDING'].includes(o.status);

    const product = o.Product || o.product || {};
    const imgUri = getProductImage(product);
    const productName = product.name || product.product_name || o.product_name || 'Unknown Product';
    const unitPrice = parseFloat(product.current_price || product.price || o.unit_price || o.price_per_unit || 0);
    const qty = parseInt(o.quantity || 1);
    const total = parseFloat(o.total_price || o.total_amount || o.total || 0);
    const customerName = o.customer?.name || o.customer?.full_name || o.customer_name || 'Unknown Customer';
    const deliveryAddr = o.delivery_address || o.Order?.delivery_address || o.order?.delivery_address || 'Not provided';

    return (
      <Modal visible={detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.detailCard}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>{productName}</Text>
              <TouchableOpacity onPress={() => setDetailModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              {/* Status badge */}
              <View style={[styles.statusBadgeLg, { backgroundColor: statusColor + '22', alignSelf: 'flex-start' }]}>
                <Text style={[styles.statusTextLg, { color: statusColor }]}>
                  {(o.status || '').replace(/_/g, ' ')}
                </Text>
              </View>

              {/* Product Section First */}
              <Text style={[styles.detailLabel, { marginTop: 8, marginBottom: 10 }]}>Product Details</Text>
              <View style={styles.detailProductRow}>
                {imgUri ? (
                  <Image 
                    source={{ uri: imgUri }} 
                    style={styles.detailProductImg}
                    onError={(error) => {
                      console.log('[FarmerOrders] Detail image load error:', error.nativeEvent.error);
                    }}
                  />
                ) : (
                  <View style={[styles.detailProductImg, styles.detailProductImgPlaceholder]}>
                    <MaterialCommunityIcons name="food-apple-outline" size={28} color="#ccc" />
                  </View>
                )}
                <View style={styles.detailProductInfo}>
                  <Text style={styles.detailProductName} numberOfLines={2}>{productName}</Text>
                  <Text style={styles.detailProductMeta}>
                    Qty: {qty}{unitPrice > 0 ? `  ·  ₹${unitPrice.toFixed(2)}/unit` : ''}
                  </Text>
                </View>
                {total > 0 && (
                  <Text style={styles.detailProductPrice}>₹{total.toLocaleString('en-IN')}</Text>
                )}
              </View>

              {/* Customer Section */}
              <Text style={styles.detailLabel}>Customer</Text>
              <View style={styles.detailCustomerRow}>
                {getCustomerImage(o.customer) ? (
                  <Image 
                    source={{ uri: getCustomerImage(o.customer) }} 
                    style={styles.detailCustomerPhoto}
                    onError={(error) => {
                      console.log('[FarmerOrders] Detail customer image load error:', error.nativeEvent.error);
                    }}
                  />
                ) : (
                  <View style={styles.detailCustomerPhotoPlaceholder}>
                    <Ionicons name="person" size={20} color="#888" />
                  </View>
                )}
                <View style={styles.detailCustomerInfo}>
                  <Text style={styles.detailCustomerName}>{customerName}</Text>
                  <Text style={styles.detailCustomerContact}>{o.customer?.mobile_number || 'No contact'}</Text>
                </View>
              </View>

              {/* Delivery Address */}
              {deliveryAddr && deliveryAddr !== 'Not provided' && (
                <>
                  <Text style={styles.detailLabel}>Delivery Address</Text>
                  <View style={styles.addressContainer}>
                    <Ionicons name="location-outline" size={16} color="#666" />
                    <Text style={styles.detailAddressValue}>
                      {(() => {
                        // Handle JSON string addresses
                        let addr = deliveryAddr;
                        if (typeof addr === 'string') {
                          try {
                            addr = JSON.parse(addr);
                          } catch (e) {
                            // If parsing fails, use the string as is
                            return addr;
                          }
                        }
                        
                        // If it's an object, format it nicely
                        if (typeof addr === 'object' && addr !== null) {
                          const parts = [];
                          if (addr.full_name) parts.push(addr.full_name);
                          if (addr.address_line) parts.push(addr.address_line);
                          if (addr.address) parts.push(addr.address);
                          if (addr.city) parts.push(addr.city);
                          if (addr.district) parts.push(addr.district);
                          if (addr.state) parts.push(addr.state);
                          if (addr.pincode) parts.push(addr.pincode);
                          if (addr.phone) parts.push(`Ph: ${addr.phone}`);
                          return parts.filter(Boolean).join(', ') || 'Address not available';
                        }
                        
                        return String(addr);
                      })()
                    }
                    </Text>
                  </View>
                </>
              )}

              <Text style={styles.detailLabel}>Order Date</Text>
              <Text style={styles.detailValue}>{formatDate(o.created_at || o.date)}</Text>

              {/* Total */}
              <View style={styles.detailTotalRow}>
                <Text style={styles.detailTotalLabel}>Total Amount</Text>
                <Text style={styles.detailTotalValue}>₹{total.toLocaleString('en-IN')}</Text>
              </View>
            </ScrollView>

            {/* Accept / Reject inside modal (Only for PENDING orders) */}
            {isActionable && (
              <View style={[styles.actionsRow, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() =>
                    Alert.alert(
                      'Reject Order', 
                      `Reject this ${productName} order from ${customerName}?`, 
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Reject', 
                          style: 'destructive', 
                          onPress: () => { handleAction(realId, 'reject'); setDetailModal(false); } 
                        },
                      ]
                    )
                  }
                  disabled={actionLoading === realId}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#F44336" />
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={() => { handleAction(realId, 'accept'); setDetailModal(false); }}
                  disabled={actionLoading === realId}
                >
                  {actionLoading === realId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.acceptText}>Accept Order</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Status-based actions in modal */}
            {!isActionable && o.status !== 'CANCELLED' && (
              <View style={styles.detailStatusActions}>
                {o.status === 'PLACED' && (
                  <TouchableOpacity
                    style={styles.detailAssignBtn}
                    onPress={() => { handleAssignTransporters(realId); setDetailModal(false); }}
                    disabled={actionLoading === realId}
                  >
                    {actionLoading === realId ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="truck-plus" size={18} color="#fff" />
                        <Text style={styles.detailAssignText}>Assign Transporters</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                {['ASSIGNED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'REACHED_DESTINATION', 'OUT_FOR_DELIVERY'].includes(o.status) && (
                  <TouchableOpacity
                    style={styles.detailTrackBtn}
                    onPress={() => { setDetailModal(false); navigation.navigate('FarmerOrderTracking', { orderId: realId, order: o }); }}
                  >
                    <MaterialCommunityIcons name="truck-outline" size={18} color="#fff" />
                    <Text style={styles.detailTrackText}>Track Order</Text>
                  </TouchableOpacity>
                )}
                {o.status === 'COMPLETED' && (
                  <View style={styles.detailStatusInfo}>
                    <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                    <Text style={[styles.detailStatusText, { color: '#4CAF50' }]}>Order Completed Successfully</Text>
                  </View>
                )}
              </View>
            )}

            {o.status === 'CANCELLED' && (
              <View style={styles.detailStatusInfo}>
                <Ionicons name="close-circle" size={18} color="#F44336" />
                <Text style={[styles.detailStatusText, { color: '#F44336' }]}>Order Cancelled</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>My Orders</Text>
      </LinearGradient>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {STATUS_LIST.map((status) => {
            const isActive = activeFilter === status;
            const count =
              status === 'All'
                ? orders.length
                : orders.filter((o) => o.status === status).length;
            return (
              <TouchableOpacity
                key={status}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => {
                  console.log('[FarmerOrders] Filter changed to:', status);
                  setActiveFilter(status);
                }}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {status === 'All' ? 'All' : status.replace(/_/g, ' ')}
                </Text>
                <View style={[styles.filterCount, isActive && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, isActive && { color: '#4CAF50' }]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>
            {activeFilter === 'All' ? 'No orders yet' : `No ${activeFilter.toLowerCase().replace(/_/g, ' ')} orders`}
          </Text>
          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={() => fetchOrders(activeFilter)}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item, index) => String(item.order_id || item.id || index)}
          renderItem={renderOrderCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderDetailModal()}
      <ToastMessage ref={toastRef} />
    </View>
  );
};

export default FarmerOrders;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  emptyText: { marginTop: 12, fontSize: 15, color: '#999' },
  refreshButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  header: {
    paddingBottom: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },

  /* Filters */
  filterContainer: { marginTop: 12 },
  filterRow: { paddingHorizontal: 12 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  filterChipActive: { backgroundColor: '#1B5E20' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500', textTransform: 'capitalize' },
  filterChipTextActive: { color: '#fff' },
  filterCount: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  filterCountText: { fontSize: 11, fontWeight: '700', color: '#888' },

  /* Order Card */
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  productTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', letterSpacing: 0.1 },
  orderDate: { fontSize: 12, color: '#999', marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  customerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  customerPhoto: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: '#F5F5F5' 
  },
  customerPhotoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F4F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 14, color: '#333', fontWeight: '600' },
  customerLocation: { fontSize: 12, color: '#888', marginTop: 2 },

  /* Product rows in card */
  productsSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 12, gap: 10 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#F5F5F5' },
  productThumbPlaceholder: {
    width: 52, height: 52, borderRadius: 10,
    backgroundColor: '#F0F4F0', justifyContent: 'center', alignItems: 'center',
  },
  productInfoWrap: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  productMeta: { fontSize: 12, color: '#888' },
  productItemTotal: { fontSize: 14, fontWeight: '700', color: '#1B5E20' },
  moreProducts: { fontSize: 12, color: '#4CAF50', fontWeight: '600', marginTop: 2 },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  totalLabel: { fontSize: 13, color: '#888', fontWeight: '500' },
  totalAmount: { fontSize: 19, fontWeight: '800', color: '#1B5E20' },

  actionsRow: { flexDirection: 'row', marginTop: 14, gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 6 },
  rejectBtn: { backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' },
  acceptBtn: { backgroundColor: '#2E7D32', elevation: 3 },
  rejectText: { color: '#F44336', fontWeight: '700', fontSize: 14 },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    gap: 6,
  },
  trackText: { color: '#1B5E20', fontWeight: '700', fontSize: 13 },

  statusActionsRow: { marginTop: 12 },
  statusInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  assignTransporterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    gap: 6,
    elevation: 2,
  },
  assignTransporterText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 13 
  },

  /* Detail Modal */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  detailCard: { backgroundColor: '#fff', width: '92%', borderRadius: 20, padding: 20, maxHeight: '88%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  statusBadgeLg: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, marginBottom: 12 },
  statusTextLg: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#888', marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 15, color: '#333', marginTop: 3, fontWeight: '500' },

  /* Product row in modal */
  detailProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 12,
  },
  detailProductImg: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#F5F5F5' },
  detailProductImgPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  detailProductInfo: { flex: 1 },
  detailProductName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  detailProductMeta: { fontSize: 12, color: '#888' },
  detailProductPrice: { fontSize: 15, fontWeight: '800', color: '#1B5E20' },

  detailTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#E8F5E9',
  },
  detailTotalLabel: { fontSize: 15, fontWeight: '700', color: '#333' },
  detailTotalValue: { fontSize: 22, fontWeight: '800', color: '#1B5E20' },
  
  detailCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 12,
  },
  detailCustomerPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  detailCustomerPhotoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F4F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailCustomerInfo: {
    flex: 1,
  },
  detailCustomerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  detailCustomerContact: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    gap: 8,
  },
  detailAddressValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    lineHeight: 20,
  },
  
  detailTrackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 13,
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    gap: 8,
    elevation: 3,
  },
  detailTrackText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  
  detailStatusActions: { marginTop: 14 },
  detailStatusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  detailStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  
  detailAssignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 13,
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    gap: 8,
    elevation: 3,
  },
  detailAssignText: { 
    color: '#fff', 
    fontWeight: '800', 
    fontSize: 15 
  },
});
