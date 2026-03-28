/**
 * OrderConfirm.js
 * Order success screen — faithful conversion of Flutter order_confirm.dart
 *
 * Receives: { order } with order details, QR code, pricing, address
 * Features:
 *   - Success checkmark animation (scale up + green circle)
 *   - Order ID display
 *   - Order summary: total, payment method, delivery address
 *   - Estimated delivery time (3-5 days)
 *   - QR code display
 *   - Track Order → OrderTracking
 *   - Continue Shopping → CustomerHome
 *   - Green gradient accent
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ═══════════════════════════════════════════════════════════════════════════
 * CONFETTI DOT — decorative animated dots
 * ═══════════════════════════════════════════════════════════════════════════ */

const ConfettiDot = ({ delay, x, color, size = 8 }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -60] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });

  return (
    <View style={{ position: 'absolute', left: x, top: 20 }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }],
        }}
      />
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

const OrderConfirm = ({ navigation, route }) => {
  const { order } = route.params || {};
  const insets = useSafeAreaInsets();

  // ── Animations ──
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(40)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Checkmark entrance
    Animated.sequence([
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      // Content slide in
      Animated.parallel([
        Animated.timing(contentSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();

    // Pulse loop on checkmark ring
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Derived data ──
  const orderId = order?.order_id || order?.id || 'N/A';
  const totalAmount = parseFloat(order?.total_amount || order?.total_price || 0) || 0;
  const paymentMethod = order?.payment_method || 'ONLINE';
  const qrCodeStr = order?.qr_code || '';
  const subtotal = parseFloat(order?.subtotal || totalAmount) || 0;
  const adminCommission = parseFloat(order?.admin_commission || 0) || 0;
  const deliveryCharges = parseFloat(order?.delivery_charges || 0) || 0;

  // Product names from items
  const orderItems = order?.items || [];
  const productNames = orderItems.map((item) => {
    const name = item.name || item.product_name || item.product?.name || `Product #${item.product_id || item.id || ''}`;
    return `${name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`;
  });

  const deliveryAddr = order?.delivery_address;
  const addressText = typeof deliveryAddr === 'string'
    ? deliveryAddr
    : deliveryAddr
      ? [deliveryAddr.full_name, deliveryAddr.address_line, deliveryAddr.city, deliveryAddr.district, deliveryAddr.state, deliveryAddr.pincode].filter(Boolean).join(', ')
      : 'N/A';

  // Estimated delivery date (3-5 days)
  const estimatedMin = new Date();
  estimatedMin.setDate(estimatedMin.getDate() + 3);
  const estimatedMax = new Date();
  estimatedMax.setDate(estimatedMax.getDate() + 5);
  const formatDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const estimatedRange = `${formatDate(estimatedMin)} - ${formatDate(estimatedMax)}`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Green accent top bar */}
      <View style={styles.greenBar}>
        <View style={styles.greenBarInner}>
          <Ionicons name="checkmark-circle" size={18} color="#A5D6A7" />
          <Text style={styles.greenBarText}>Order Confirmed</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Success Animation Section ── */}
        <View style={styles.successSection}>
          {/* Confetti dots */}
          <ConfettiDot delay={0} x={SCREEN_WIDTH * 0.15} color="#4CAF50" size={8} />
          <ConfettiDot delay={200} x={SCREEN_WIDTH * 0.3} color="#FF9800" size={6} />
          <ConfettiDot delay={400} x={SCREEN_WIDTH * 0.5} color="#2196F3" size={10} />
          <ConfettiDot delay={600} x={SCREEN_WIDTH * 0.65} color="#E91E63" size={7} />
          <ConfettiDot delay={100} x={SCREEN_WIDTH * 0.8} color="#9C27B0" size={9} />

          {/* Pulse ring */}
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />

          {/* Checkmark circle */}
          <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
            <Ionicons name="checkmark" size={52} color="#fff" />
          </Animated.View>

          <Animated.View style={{ opacity: checkOpacity, marginTop: 20, alignItems: 'center' }}>
            <Text style={styles.successTitle}>Order Placed Successfully!</Text>
            <Text style={styles.successSubtitle}>
              Thank you for your order. You'll receive updates on your delivery status.
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentSlide }] }}>

          {/* ── Items Ordered Card ── */}
          <View style={styles.orderIdCard}>
            <View style={styles.orderIdRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderIdLabel}>Items Ordered</Text>
                {productNames.length > 0
                  ? productNames.map((pName, idx) => (
                      <Text key={idx} style={styles.orderIdValue} numberOfLines={2}>{pName}</Text>
                    ))
                  : <Text style={styles.orderIdValue}>Your order has been placed</Text>
                }
              </View>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Confirmed</Text>
              </View>
            </View>
          </View>

          {/* ── Order Summary Card ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="receipt-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Order Summary</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Subtotal</Text>
              <Text style={styles.detailValue}>₹{subtotal.toFixed(2)}</Text>
            </View>
            {adminCommission > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Admin Commission</Text>
                <Text style={styles.detailValue}>₹{adminCommission.toFixed(2)}</Text>
              </View>
            )}
            {deliveryCharges > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Delivery Charges</Text>
                <Text style={styles.detailValue}>₹{deliveryCharges.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>₹{totalAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment Method</Text>
              <View style={styles.paymentBadge}>
                <MaterialCommunityIcons
                  name={paymentMethod === 'COD' ? 'cash-multiple' : 'credit-card-outline'}
                  size={14}
                  color="#1B5E20"
                />
                <Text style={styles.paymentBadgeText}>
                  {paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online Payment'}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={[styles.detailValue, { color: '#FF9800', fontWeight: 'bold' }]}>PENDING</Text>
            </View>
          </View>

          {/* ── Delivery Info Card ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="location-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Delivery Details</Text>
            </View>

            <View style={styles.deliveryInfoRow}>
              <View style={styles.deliveryIconCircle}>
                <Ionicons name="home-outline" size={16} color="#1B5E20" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deliveryLabel}>Delivery Address</Text>
                <Text style={styles.deliveryText}>{addressText}</Text>
              </View>
            </View>

            <View style={styles.deliveryInfoRow}>
              <View style={styles.deliveryIconCircle}>
                <Ionicons name="time-outline" size={16} color="#1B5E20" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deliveryLabel}>Estimated Delivery</Text>
                <Text style={styles.deliveryText}>{estimatedRange} (3-5 business days)</Text>
              </View>
            </View>
          </View>

          {/* ── QR Code Card ── */}
          {qrCodeStr ? (
            <View style={styles.qrCard}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="qrcode" size={20} color="#1B5E20" />
                <Text style={styles.cardTitle}>Order QR Code</Text>
              </View>
              <View style={styles.qrContainer}>
                <QRCode
                  value={JSON.stringify({ qr_code: qrCodeStr, order_id: orderId, total: totalAmount })}
                  size={160}
                  color="#1B5E20"
                  backgroundColor="#fff"
                />
                <Text style={styles.qrCodeText}>{qrCodeStr}</Text>
                <Text style={styles.qrHint}>Show this QR code to the delivery person</Text>
              </View>
            </View>
          ) : null}

          {/* ── Action Buttons ── */}
          <TouchableOpacity
            style={styles.trackBtn}
            onPress={() => navigation.navigate('OrderTracking', { order })}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate-outline" size={20} color="#fff" />
            <Text style={styles.trackBtnText}>Track Order</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shopBtn}
            onPress={() => {
              navigation.reset({ index: 0, routes: [{ name: 'CustomerTabs', params: { screen: 'Home' } }] });
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="bag-handle-outline" size={20} color="#1B5E20" />
            <Text style={styles.shopBtnText}>Continue Shopping</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ordersBtn}
            onPress={() => navigation.navigate('CustomerTabs', { screen: 'Orders' })}
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={18} color="#666" />
            <Text style={styles.ordersBtnText}>View My Orders</Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDF6EE',
  },

  /* Green accent bar */
  greenBar: {
    backgroundColor: '#1B5E20',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  greenBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  greenBarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },

  /* Success section */
  successSection: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 30,
    position: 'relative',
    overflow: 'visible',
    minHeight: 220,
  },
  pulseRing: {
    position: 'absolute',
    top: 30,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(27, 94, 32, 0.15)',
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1B5E20',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1B5E20',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    paddingHorizontal: 20,
  },

  /* Order ID card */
  orderIdCard: {
    backgroundColor: '#1B5E20',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  orderIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderIdLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  orderIdValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A5D6A7',
  },
  statusText: {
    fontSize: 13,
    color: '#A5D6A7',
    fontWeight: '600',
  },

  /* Cards */
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4EEE4',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1B5E20',
  },

  /* Detail rows */
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  detailLabel: {
    fontSize: 13,
    color: '#888',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 6,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1B5E20',
  },

  /* Payment badge */
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  paymentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1B5E20',
  },

  /* Delivery info */
  deliveryInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  deliveryIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  deliveryLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  deliveryText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },

  /* QR card */
  qrCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4EEE4',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  qrContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  qrCodeText: {
    fontSize: 15,
    color: '#1B5E20',
    fontWeight: 'bold',
    marginTop: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  qrHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
  },

  /* Action buttons */
  trackBtn: {
    backgroundColor: '#1B5E20',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  trackBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  shopBtn: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#1B5E20',
  },
  shopBtnText: {
    color: '#1B5E20',
    fontSize: 15,
    fontWeight: '600',
  },
  ordersBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  ordersBtnText: {
    color: '#666',
    fontSize: 14,
  },
});

export default OrderConfirm;
