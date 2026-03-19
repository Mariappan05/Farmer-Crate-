/**
 * QRScan.js
 * Camera QR scanner for order verification.
 *
 * Features:
 *   - Camera QR scanner using expo-camera (CameraView)
 *   - Scans order QR codes
 *   - Validates: PICKUP_SHIPPING → ASSIGNED; DELIVERY → SHIPPED
 *   - Fetches allocated orders and validates scanned order belongs to transporter
 *   - Navigates to OrderDetail on valid scan
 *   - Torch toggle, manual entry fallback
 *   - Camera permissions
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    Vibration,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_SIZE = SCREEN_WIDTH * 0.7;

const REQUIRED_STATUS_BY_ROLE = {
  PICKUP_SHIPPING: 'ASSIGNED',
  DELIVERY: 'SHIPPED',
};

const QRScan = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const params = route?.params || {};
  const updateStatusOnScan = !!params.updateStatusOnScan;
  const expectedOrderId = params.expectedOrderId;
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualOrderId, setManualOrderId] = useState('');
  const lastScanRef = useRef(null);

  /* ── Process scanned QR data ────────────────────────────── */
  const processQR = async (qrData) => {
    if (isProcessing || scanned) return;
    const now = Date.now();
    if (lastScanRef.current && now - lastScanRef.current < 2000) return;
    lastScanRef.current = now;
    setIsProcessing(true);
    setScanned(true);
    Vibration.vibrate(200);

    try {
      let orderId = null;
      try {
        const parsed = JSON.parse(qrData);
        orderId = parsed.order_id || parsed.orderId || parsed.id;
      } catch {
        const match = qrData.match(/order_id[:\s"]*(\d+)/i) || qrData.match(/^(\d+)$/);
        if (match) orderId = parseInt(match[1]);
      }

      if (!orderId) {
        Alert.alert('Invalid QR Code', 'No valid order ID found in QR code.', [
          { text: 'Rescan', onPress: resetScanner },
          { text: 'Enter Manually', onPress: () => { resetScanner(); setShowManualEntry(true); } },
        ]);
        return;
      }

      await fetchAndValidateOrder(orderId);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to process QR code', [
        { text: 'Retry', onPress: resetScanner },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  /* ── Fetch and validate order ───────────────────────────── */
  const fetchAndValidateOrder = async (orderId) => {
    try {
      let order = null;
      const allocatedRes = await api.get('/orders/transporter/allocated');
      const allOrders = allocatedRes.data?.data || allocatedRes.data?.orders || allocatedRes.data || [];
      order = (Array.isArray(allOrders) ? allOrders : []).find((o) => (o.order_id || o.id) == orderId);

      if (!order) {
        Alert.alert('Order Not Found', `Order #${orderId} was not found or is not assigned to you.`, [
          { text: 'Rescan', onPress: resetScanner },
        ]);
        return;
      }

      if (expectedOrderId && Number(orderId) !== Number(expectedOrderId)) {
        Alert.alert('Wrong QR', `Please scan QR for order #${expectedOrderId}.`, [
          { text: 'Rescan', onPress: resetScanner },
        ]);
        return;
      }

      const status = (order.current_status || order.status || '').toUpperCase();
      const role = (order.transporter_role || '').toUpperCase();
      const requiredStatus = REQUIRED_STATUS_BY_ROLE[role];

      if (!requiredStatus) {
        Alert.alert('Invalid Transporter Role', `Order #${orderId} has unsupported transporter role: ${role || 'UNKNOWN'}.`, [
          { text: 'Scan Another', onPress: resetScanner },
        ]);
        return;
      }

      if (status !== requiredStatus) {
        Alert.alert(
          'Invalid Status',
          `Cannot scan QR for role ${role}. Required status: ${requiredStatus}, current status: ${status}.`,
          [{ text: 'OK', onPress: resetScanner }]
        );
        return;
      }

      // Already delivered
      if (status === 'DELIVERED' || status === 'COMPLETED') {
        Alert.alert('Already Delivered', `Order #${orderId} has already been delivered.`, [
          { text: 'View Details', onPress: () => navigation.navigate('OrderDetail', { orderId, order }) },
          { text: 'Scan Another', onPress: resetScanner },
        ]);
        return;
      }

      if (updateStatusOnScan) {
        await updateStatusAfterScan(order);
        return;
      }

      navigateToOrder(order, role === 'PICKUP_SHIPPING' ? 'pickup' : 'delivery');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to fetch order', [
        { text: 'Retry', onPress: resetScanner },
      ]);
    }
  };

  const getNextStatusAfterScan = (order) => {
    const role = (order?.transporter_role || '').toUpperCase();
    const current = (order?.current_status || order?.status || '').toUpperCase();
    if (role === 'PICKUP_SHIPPING' && current === 'ASSIGNED') return 'SHIPPED';
    if (role === 'DELIVERY' && current === 'SHIPPED') return 'RECEIVED';
    return null;
  };

  const updateStatusAfterScan = async (order) => {
    const orderId = order.order_id || order.id;
    const nextStatus = getNextStatusAfterScan(order);

    if (!nextStatus) {
      Alert.alert('No Next Status', 'This order cannot be advanced by QR scan right now.', [
        { text: 'OK', onPress: resetScanner },
      ]);
      return;
    }

    try {
      try {
        await api.put('/orders/status', { order_id: orderId, status: nextStatus });
      } catch {
        await api.put(`/transporters/orders/${orderId}/status`, { status: nextStatus });
      }

      Alert.alert(
        'Status Updated',
        `Order #${orderId} marked as ${nextStatus.replace(/_/g, ' ')}.`,
        [
          {
            text: 'View Order',
            onPress: () => navigation.replace('OrderDetail', {
              orderId,
              order: {
                ...order,
                current_status: nextStatus,
                status: nextStatus,
              },
            }),
          },
          { text: 'Scan Another', onPress: resetScanner },
        ]
      );
    } catch (e) {
      Alert.alert('Update Failed', e.message || 'Could not update order status', [
        { text: 'Retry', onPress: resetScanner },
      ]);
    }
  };

  /* ── Navigate on success ────────────────────────────────── */
  const navigateToOrder = (order, scanType) => {
    const orderId = order.order_id || order.id;
    Alert.alert(
      scanType === 'pickup' ? '📦 Pickup Verified' : '🚚 Delivery Verified',
      `Order #${orderId} verified for ${scanType}`,
      [
        {
          text: 'View Order',
          onPress: () => navigation.replace('OrderDetail', { orderId, order }),
        },
        { text: 'Scan Another', onPress: resetScanner },
      ]
    );
  };

  /* ── Reset ──────────────────────────────────────────────── */
  const resetScanner = () => {
    setScanned(false);
    setIsProcessing(false);
    lastScanRef.current = null;
  };

  /* ── Manual entry submit ────────────────────────────────── */
  const handleManualSubmit = async () => {
    const id = parseInt(manualOrderId.trim());
    if (!id || isNaN(id)) {
      Alert.alert('Invalid', 'Please enter a valid order ID');
      return;
    }
    setShowManualEntry(false);
    setIsProcessing(true);
    setScanned(true);
    try {
      await fetchAndValidateOrder(id);
    } finally {
      setIsProcessing(false);
    }
  };

  /* ── Permission check ───────────────────────────────────── */
  if (!permission) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#1B5E20" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <MaterialCommunityIcons name="camera-off-outline" size={60} color="#ccc" />
        <Text style={styles.permTitle}>Camera Permission Required</Text>
        <Text style={styles.permText}>QR scanning requires camera access to scan order QR codes.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Ionicons name="camera-outline" size={20} color="#fff" />
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.manualLink} onPress={() => setShowManualEntry(true)}>
          <Text style={styles.manualLinkText}>Enter Order ID Manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ── Main render ────────────────────────────────────────── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Camera */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : ({ data }) => processQR(data)}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Scan QR Code</Text>
          <TouchableOpacity style={styles.topBtn} onPress={() => setTorchOn(!torchOn)}>
            <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={24} color={torchOn ? '#FFD600' : '#fff'} />
          </TouchableOpacity>
        </View>

        {/* Scanner frame */}
        <View style={styles.scannerArea}>
          <View style={styles.scanFrame}>
            {/* Corner borders */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {isProcessing && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.processingText}>Verifying...</Text>
              </View>
            )}
          </View>
          <Text style={styles.scanHint}>Align QR code within the frame</Text>
        </View>

        {/* Bottom actions */}
        <View style={styles.bottomBar}>
          {scanned && !isProcessing && (
            <TouchableOpacity style={styles.rescanBtn} onPress={resetScanner}>
              <Ionicons name="refresh" size={22} color="#fff" />
              <Text style={styles.rescanText}>Scan Again</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.manualBtn}
            onPress={() => setShowManualEntry(true)}
          >
            <Ionicons name="keypad-outline" size={20} color="#fff" />
            <Text style={styles.manualBtnText}>Enter Manually</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Manual Entry Modal */}
      <Modal visible={showManualEntry} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Order ID</Text>
            <Text style={styles.modalSub}>Type the order ID manually</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., 12345"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              value={manualOrderId}
              onChangeText={setManualOrderId}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtnItem, { backgroundColor: '#E0E0E0' }]}
                onPress={() => { setShowManualEntry(false); setManualOrderId(''); }}
              >
                <Text style={[styles.modalBtnText, { color: '#666' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnItem, { backgroundColor: '#1B5E20' }]}
                onPress={handleManualSubmit}
              >
                <Text style={styles.modalBtnText}>Verify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F8F4', paddingHorizontal: 30 },

  permTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 16 },
  permText: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  permBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1B5E20',
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 20,
  },
  permBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  manualLink: { marginTop: 16 },
  manualLinkText: { color: '#1B5E20', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  scannerArea: { alignItems: 'center' },
  scanFrame: {
    width: SCAN_SIZE, height: SCAN_SIZE, justifyContent: 'center', alignItems: 'center',
  },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: '#4CAF50', borderWidth: 4 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },

  processingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', borderRadius: 8,
  },
  processingText: { color: '#fff', fontSize: 14, marginTop: 8 },

  scanHint: { color: '#fff', fontSize: 14, marginTop: 16, textAlign: 'center' },

  bottomBar: {
    alignItems: 'center', paddingBottom: 40, paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingTop: 16, gap: 12,
  },
  rescanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#4CAF50',
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25,
  },
  rescanText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  manualBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
  manualBtnText: { color: '#fff', fontSize: 13 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 },
  modalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  modalSub: { fontSize: 13, color: '#888', marginTop: 4, marginBottom: 16 },
  modalInput: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 14,
    fontSize: 18, color: '#333', textAlign: 'center', letterSpacing: 2,
  },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalBtnItem: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  modalBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default QRScan;
