import React, { useState, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Vibration,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { updateOrderStatusByQR } from '../../services/orderService';
import { Colors, Font, Radius, Spacing, shadowStyle } from '../../utils/theme';
import { useAuth } from '../../context/AuthContext';

const SCAN_BOX_SIZE = 250;
const CORNER = 28;
const BORDER_W = 4;

// Destination delivery person advances final-mile statuses via QR scans.
const DELIVERY_TRANSITIONS = {
  REACHED_DESTINATION: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

// Pickup delivery person advances pickup-side statuses via QR scans.
const PICKUP_TRANSITIONS = {
  ASSIGNED: 'PICKUP_ASSIGNED',
  PICKUP_ASSIGNED: 'PICKED_UP',
  PICKUP_IN_PROGRESS: 'PICKED_UP',
};

const pickFirst = (...values) => values.find((value) => !!value);

const normalizeToken = (value) =>
  String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

const parseQRPayload = (qrData) => {
  if (!qrData) return { orderId: null, qrCode: null };

  let orderId = null;
  let qrCode = null;

  try {
    const parsed = JSON.parse(qrData);
    orderId = pickFirst(parsed.order_id, parsed.orderId, parsed.id, null);
    qrCode = pickFirst(parsed.qr_code, parsed.qrCode, parsed.code, null);
  } catch {
    const orderIdMatch =
      qrData.match(/order_id[:\s"]*(\d+)/i) ||
      qrData.match(/order[:\s"]*(\d+)/i) ||
      qrData.match(/id[:\s"]*(\d+)/i) ||
      qrData.match(/^(\d+)$/);
    if (orderIdMatch) orderId = parseInt(orderIdMatch[1], 10);

    const qrCodeMatch = qrData.match(/qr[_\s-]?code[:\s"]*([A-Za-z0-9\-_.]+)/i);
    if (qrCodeMatch) qrCode = qrCodeMatch[1];
  }

  if (!orderId && !qrCode && typeof qrData === 'string' && qrData.trim()) {
    qrCode = qrData.trim();
  }

  return { orderId, qrCode };
};

const QRScanner = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualId, setManualId] = useState('');
  const lastScanRef = useRef(null);

  const myDeliveryPersonId =
    authState?.user?.delivery_person_id || authState?.user?.id;
  const expectedOrderId = route?.params?.expectedOrderId;

  const processQR = async (qrData) => {
    if (isProcessing || scanned) return;
    const now = Date.now();
    if (lastScanRef.current && now - lastScanRef.current < 2000) return;
    lastScanRef.current = now;
    setIsProcessing(true);
    setScanned(true);
    Vibration.vibrate(200);

    try {
      const { orderId, qrCode } = parseQRPayload(qrData);

      if (!orderId && !qrCode) {
        Alert.alert('Invalid QR', 'Could not read this QR. Please rescan or enter manually.', [
          { text: 'Rescan', onPress: resetScanner },
          {
            text: 'Enter Manually',
            onPress: () => { resetScanner(); setShowManual(true); },
          },
        ]);
        return;
      }
      await validateAndUpdate({ orderId, qrCode });
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to process QR', [
        { text: 'Retry', onPress: resetScanner },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchOrderByQR = async (qrCode) => {
    const encoded = encodeURIComponent(qrCode);
    const endpoints = [
      `/orders/track-by-qr/${encoded}`,
      `/orders/qr/${encoded}`,
      `/orders/by-qr/${encoded}`,
      `/orders?qr_code=${encoded}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await api.get(endpoint);
        const payload = res.data?.data || res.data;
        const maybeOrder = payload?.order || payload?.data || payload;
        const order = Array.isArray(maybeOrder) ? maybeOrder[0] : maybeOrder;
        if (order) return order;
      } catch {
        // Try next endpoint shape.
      }
    }

    return null;
  };

  const fetchOrderFromDeliveryOrders = async ({ orderId, qrCode }) => {
    try {
      const res = await api.get('/delivery-persons/orders');
      const payload = res.data?.data || res.data;
      const orders = Array.isArray(payload)
        ? payload
        : payload?.orders || payload?.data || [];

      if (!Array.isArray(orders) || orders.length === 0) return null;

      const byId = orderId
        ? orders.find(
            (o) =>
              String(o?.order_id || '') === String(orderId) ||
              String(o?.id || '') === String(orderId)
          )
        : null;
      if (byId) return byId;

      if (!qrCode) return null;

      const wanted = normalizeToken(qrCode);
      return (
        orders.find((o) => {
          const candidates = [
            o?.qr_code,
            o?.qrCode,
            o?.qr,
            o?.order_qr,
            o?.order_qr_code,
            o?.metadata?.qr_code,
            o?.tracking?.qr_code,
          ];
          return candidates.some((candidate) => normalizeToken(candidate) === wanted);
        }) || null
      );
    } catch {
      return null;
    }
  };

  const validateAndUpdate = async ({ orderId, qrCode }) => {
    try {
      let order = null;
      if (orderId) {
        try {
          const res = await api.get(`/orders/${orderId}`);
          order = res.data?.data || res.data;
        } catch {
          // Some roles cannot access /orders/:id directly.
        }
      } else if (qrCode) {
        order = await fetchOrderByQR(qrCode);
      }

      if (!order) {
        order = await fetchOrderFromDeliveryOrders({ orderId, qrCode });
      }

      if (!order && orderId) {
        // If QR payload provided both values, try QR route as final fallback.
        order = qrCode ? await fetchOrderByQR(qrCode) : null;
      }

      const resolvedOrderId = order?.order_id || order?.id || orderId;

      if (!resolvedOrderId) {
        Alert.alert('Not Found', 'Order was resolved but has no valid ID for update.', [
          { text: 'OK', onPress: resetScanner },
        ]);
        return;
      }

      if (expectedOrderId && String(expectedOrderId) !== String(resolvedOrderId)) {
        Alert.alert(
          'Wrong Order QR',
          `This scanner is opened for order #${expectedOrderId}. Please scan the correct order QR.`,
          [{ text: 'OK', onPress: resetScanner }]
        );
        return;
      }

      if (!order) {
        Alert.alert('Not Found', 'Order was not found for this QR.', [
          { text: 'OK', onPress: resetScanner },
        ]);
        return;
      }

      const status = (order.current_status || order.status || '').toUpperCase();

      // pickup_delivery_person_id = assigned by source transporter for pickup
      // delivery_person_id = assigned by destination transporter for final delivery
      const pickupDPId = order.pickup_delivery_person_id;
      const destDPId =
        order.delivery_person_id ||
        order.delivery_person?.id ||
        order.delivery_person?.delivery_person_id;

      const isPickupPerson =
        pickupDPId && String(pickupDPId) === String(myDeliveryPersonId);
      const isDestPerson =
        destDPId && String(destDPId) === String(myDeliveryPersonId);

      if (!isPickupPerson && !isDestPerson) {
        Alert.alert(
          'Access Denied',
          'You are not the assigned delivery person for this order.',
          [{ text: 'OK', onPress: resetScanner }]
        );
        return;
      }

      // Choose transitions by assignment and current stage.
      const transitions =
        isPickupPerson && !isDestPerson
          ? PICKUP_TRANSITIONS
          : isDestPerson && !isPickupPerson
            ? DELIVERY_TRANSITIONS
            : PICKUP_TRANSITIONS[status]
              ? PICKUP_TRANSITIONS
              : DELIVERY_TRANSITIONS;

      const nextStatus = transitions[status];
      if (!nextStatus) {
        const allowed = Object.keys(transitions)
          .map((s) => s.replace(/_/g, ' '))
          .join(', ');
        Alert.alert(
          'Cannot Update',
          `Current status is "${status.replace(/_/g, ' ')}". QR scan is valid only for: ${allowed}.`,
          [{ text: 'OK', onPress: resetScanner }]
        );
        return;
      }

      Alert.alert(
        'Order Status Confirmation',
        `Confirm status update?\nNew status: ${nextStatus.replace(/_/g, ' ')}`,
        [
          { text: 'Cancel', style: 'cancel', onPress: resetScanner },
          {
            text: 'Confirm Update',
            onPress: async () => {
              try {
                await updateOrderStatusByQR(resolvedOrderId, nextStatus, 'delivery_person');
                Alert.alert(
                  'Update Successful',
                  `Order status updated to ${nextStatus.replace(/_/g, ' ')}.`,
                  [
                    {
                      text: 'View Details',
                      onPress: () =>
                        navigation.navigate('OrderDetails', { orderId: resolvedOrderId, order }),
                    },
                    { text: 'Scan Another', onPress: resetScanner },
                  ]
                );
              } catch (e) {
                Alert.alert('Update Failed', e.message || 'Could not update status', [
                  { text: 'OK', onPress: resetScanner },
                ]);
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to fetch order', [
        { text: 'Retry', onPress: resetScanner },
      ]);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setIsProcessing(false);
    lastScanRef.current = null;
  };

  const handleManualSubmit = async () => {
    const id = parseInt(manualId.trim());
    if (!id || isNaN(id)) {
      Alert.alert('Invalid', 'Enter a valid order number');
      return;
    }
    setShowManual(false);
    setIsProcessing(true);
    setScanned(true);
    try {
      await validateAndUpdate({ orderId: id, qrCode: null });
    } finally {
      setIsProcessing(false);
      setManualId('');
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.permissionContainer}>
          <View style={styles.permIconContainer}>
            <Ionicons name="camera-off-outline" size={80} color="#C8E6C9" />
          </View>
          <Text style={styles.permTitle}>Camera Permission Required</Text>
          <Text style={styles.permText}>
            To scan QR codes for delivery confirmation, please grant camera access.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={styles.permBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.manualEntryLink}
            onPress={() => setShowManual(true)}
          >
            <Ionicons name="keypad-outline" size={18} color="#388E3C" />
            <Text style={styles.manualEntryLinkText}>Enter Order ID Manually</Text>
          </TouchableOpacity>
        </View>
        {renderManualModal()}
      </View>
    );
  }

  function renderManualModal() {
    return (
      <Modal visible={showManual} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Order ID</Text>
              <TouchableOpacity onPress={() => setShowManual(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtext}>
              If QR scanning isn't working, enter the order ID manually.
            </Text>
            <TextInput
              style={styles.manualInput}
              placeholder="e.g. 12345"
              placeholderTextColor="#bbb"
              value={manualId}
              onChangeText={setManualId}
              keyboardType="numeric"
              autoFocus
              returnKeyType="go"
              onSubmitEditing={handleManualSubmit}
            />
            <TouchableOpacity
              style={[styles.manualSubmitBtn, !manualId.trim() && { opacity: 0.5 }]}
              onPress={handleManualSubmit}
              disabled={!manualId.trim()}
            >
              <Ionicons name="search-outline" size={20} color="#fff" />
              <Text style={styles.manualSubmitText}>Find Order</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delivery QR Scanner</Text>
        <View style={styles.headerActions}>
          {scanned && (
            <TouchableOpacity onPress={resetScanner} style={styles.headerActionBtn}>
              <Text style={styles.rescanText}>Rescan</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) =>
            !scanned && !isProcessing && processQR(data)
          }
          enableTorch={torchOn}
        />

        <View style={styles.overlay}>
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.scanBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              {!scanned && !isProcessing && <View style={styles.scanLine} />}
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom}>
            {isProcessing ? (
              <View style={styles.processingBox}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.processingText}>Verifying delivery...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.scanInstructions}>
                  Scan QR to update pickup or delivery status
                </Text>
                <Text style={styles.scanNote}>
                  Only the assigned delivery person can use this scanner
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={[styles.controlBtn, torchOn && styles.controlBtnActive]}
            onPress={() => setTorchOn(!torchOn)}
          >
            <Ionicons
              name={torchOn ? 'flash' : 'flash-outline'}
              size={24}
              color={torchOn ? '#FFD600' : '#fff'}
            />
            <Text style={[styles.controlBtnText, torchOn && { color: '#FFD600' }]}>
              {torchOn ? 'Flash On' : 'Flash Off'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => setShowManual(true)}
          >
            <Ionicons name="keypad-outline" size={24} color="#fff" />
            <Text style={styles.controlBtnText}>Enter ID</Text>
          </TouchableOpacity>
        </View>
      </View>

      {renderManualModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', marginTop: 12, fontSize: 14 },

  header: {
    backgroundColor: 'rgba(16,58,18,0.74)',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
  },
  backBtn: { padding: 6 },
  headerTitle: {
    flex: 1,
    fontSize: Font.xl,
    fontWeight: Font.weightBold,
    color: Colors.textOnDark,
    marginLeft: 12,
    letterSpacing: Font.trackTight,
  },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerActionBtn: { padding: 6 },
  rescanText: { color: Colors.primaryGlow, fontWeight: Font.weightBold, fontSize: Font.md },

  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)' },
  overlayMiddle: { flexDirection: 'row' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)' },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    paddingTop: 24,
    gap: 8,
  },

  // Scan box
  scanBox: { width: SCAN_BOX_SIZE, height: SCAN_BOX_SIZE, position: 'relative' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#4CAF50' },
  topLeft: { top: 0, left: 0, borderTopWidth: BORDER_W, borderLeftWidth: BORDER_W, borderTopLeftRadius: 6 },
  topRight: { top: 0, right: 0, borderTopWidth: BORDER_W, borderRightWidth: BORDER_W, borderTopRightRadius: 6 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: BORDER_W, borderLeftWidth: BORDER_W, borderBottomLeftRadius: 6 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: BORDER_W, borderRightWidth: BORDER_W, borderBottomRightRadius: 6 },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: '#4CAF50',
    opacity: 0.8,
  },

  processingBox: { alignItems: 'center', gap: 12 },
  processingText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scanInstructions: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },

  // Bottom controls
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  controlBtn: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  controlBtnActive: { opacity: 1 },
  controlBtnText: { color: Colors.textOnDark, fontSize: Font.sm, fontWeight: Font.weightMedium },

  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F1F8E9',
  },
  permIconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  permTitle: { fontSize: Font.xxxl, fontWeight: Font.weightBold, color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  permText: { fontSize: Font.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  permBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#388E3C',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  permBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  manualEntryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    padding: 10,
  },
  manualEntryLinkText: { color: '#388E3C', fontSize: 15, fontWeight: '600' },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  modalSubtext: { fontSize: 14, color: '#888', marginBottom: 20, lineHeight: 20 },
  manualInput: {
    backgroundColor: '#f8f8f8',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '600',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  manualSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#388E3C',
    borderRadius: 14,
    paddingVertical: 16,
  },
  manualSubmitText: { color: Colors.textOnDark, fontSize: Font.lg, fontWeight: Font.weightBold },
});

export default QRScanner;
