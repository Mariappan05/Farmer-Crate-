import React, { useState, useRef } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import api from '../../services/api';
import { getOrderById } from '../../services/orderService';

// Valid statuses for QR scanning
const VALID_PICKUP_STATUSES = ['ASSIGNED', 'CONFIRMED'];
const VALID_DELIVERY_STATUSES = ['SHIPPED', 'PICKED_UP', 'OUT_FOR_DELIVERY'];

const QRScanner = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualOrderId, setManualOrderId] = useState('');
  const lastScanRef = useRef(null);

  // ─── Process scanned QR data ─────────────────────────────────────────
  const processQR = async (qrData) => {
    if (isProcessing || scanned) return;
    const now = Date.now();
    if (lastScanRef.current && now - lastScanRef.current < 2000) return;
    lastScanRef.current = now;
    setIsProcessing(true);
    setScanned(true);
    Vibration.vibrate(200);

    try {
      // Parse order_id from QR (supports JSON, key:value, and plain number)
      let orderId = null;
      try {
        const parsed = JSON.parse(qrData);
        orderId = parsed.order_id || parsed.orderId || parsed.id;
      } catch {
        const match = qrData.match(/order_id[:\s"]*(\d+)/i) || qrData.match(/^(\d+)$/);
        if (match) orderId = parseInt(match[1]);
      }

      if (!orderId) {
        Alert.alert(
          'Invalid QR Code',
          'The scanned QR code does not contain a valid order ID.',
          [
            { text: 'Rescan', onPress: resetScanner },
            { text: 'Enter Manually', onPress: () => { resetScanner(); setShowManualEntry(true); } },
          ]
        );
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

  // ─── Fetch and validate order ─────────────────────────────────────────
  const fetchAndValidateOrder = async (orderId) => {
    try {
      // Fetch order details
      let order = null;
      try {
        const res = await api.get(`/orders/${orderId}`);
        order = res.data?.data || res.data;
      } catch {
        // Try delivery-specific endpoint
        const res2 = await api.get('/delivery-persons/orders');
        const allOrders = res2.data?.data || res2.data?.orders || [];
        order = allOrders.find((o) => o.order_id === orderId || o.id === orderId);
      }

      if (!order) {
        Alert.alert('Order Not Found', `Order #${orderId} was not found or is not assigned to you.`, [
          { text: 'Rescan', onPress: resetScanner },
        ]);
        return;
      }

      const status = order.current_status || order.status || '';

      // Validate status for pickup
      if (VALID_PICKUP_STATUSES.includes(status)) {
        navigateToOrder(order, 'pickup');
        return;
      }

      // Validate status for delivery
      if (VALID_DELIVERY_STATUSES.includes(status)) {
        navigateToOrder(order, 'delivery');
        return;
      }

      // Already delivered or cancelled
      if (status === 'DELIVERED' || status === 'COMPLETED') {
        Alert.alert('Already Delivered', `Order #${orderId} has already been delivered.`, [
          { text: 'View Details', onPress: () => navigation.navigate('OrderDetails', { orderId, order }) },
          { text: 'Scan Another', onPress: resetScanner },
        ]);
        return;
      }

      if (status === 'CANCELLED') {
        Alert.alert('Order Cancelled', `Order #${orderId} has been cancelled.`, [
          { text: 'OK', onPress: resetScanner },
        ]);
        return;
      }

      // Status doesn't match expected
      Alert.alert(
        'Status Mismatch',
        `Order #${orderId} is currently "${status.replace(/_/g, ' ')}". Expected ASSIGNED for pickup or SHIPPED for delivery.`,
        [
          { text: 'View Details', onPress: () => navigation.navigate('OrderDetails', { orderId, order }) },
          { text: 'Scan Another', onPress: resetScanner },
        ]
      );
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to fetch order details', [
        { text: 'Retry', onPress: resetScanner },
      ]);
    }
  };

  // ─── Navigate to order details ────────────────────────────────────────
  const navigateToOrder = (order, type) => {
    const orderId = order.order_id || order.id;
    Alert.alert(
      `Order #${orderId} Found`,
      `Type: ${type === 'pickup' ? 'Pickup' : 'Delivery'}\nStatus: ${(order.current_status || order.status || '').replace(/_/g, ' ')}`,
      [
        { text: 'View Details', onPress: () => navigation.navigate('OrderDetails', { orderId, order }) },
        { text: 'Scan Another', onPress: resetScanner },
      ]
    );
  };

  // ─── Manual order entry ───────────────────────────────────────────────
  const handleManualEntry = async () => {
    const id = parseInt(manualOrderId.trim());
    if (!id || isNaN(id)) {
      Alert.alert('Invalid ID', 'Please enter a valid numeric order ID.');
      return;
    }
    setShowManualEntry(false);
    setIsProcessing(true);
    setScanned(true);
    try {
      await fetchAndValidateOrder(id);
    } finally {
      setIsProcessing(false);
      setManualOrderId('');
    }
  };

  // ─── Reset scanner ───────────────────────────────────────────────────
  const resetScanner = () => {
    setScanned(false);
    setIsProcessing(false);
  };

  // ─── Loading / Permission states ──────────────────────────────────────
  if (!permission) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Requesting camera access...</Text>
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
            To scan QR codes for order verification, please grant camera access.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={styles.permBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.manualEntryLink}
            onPress={() => setShowManualEntry(true)}
          >
            <Ionicons name="keypad-outline" size={18} color="#388E3C" />
            <Text style={styles.manualEntryLinkText}>Enter Order ID Manually</Text>
          </TouchableOpacity>
        </View>

        {/* Manual Entry Modal */}
        {renderManualEntryModal()}
      </View>
    );
  }

  // ─── Manual Entry Modal ───────────────────────────────────────────────
  function renderManualEntryModal() {
    return (
      <Modal visible={showManualEntry} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Order ID</Text>
              <TouchableOpacity onPress={() => setShowManualEntry(false)}>
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
              value={manualOrderId}
              onChangeText={setManualOrderId}
              keyboardType="numeric"
              autoFocus
              returnKeyType="go"
              onSubmitEditing={handleManualEntry}
            />
            <TouchableOpacity
              style={[styles.manualSubmitBtn, !manualOrderId.trim() && { opacity: 0.5 }]}
              onPress={handleManualEntry}
              disabled={!manualOrderId.trim()}
            >
              <Ionicons name="search-outline" size={20} color="#fff" />
              <Text style={styles.manualSubmitText}>Find Order</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // ─── Main scanner view ────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>QR Scanner</Text>
        <View style={styles.headerActions}>
          {scanned && (
            <TouchableOpacity onPress={resetScanner} style={styles.headerActionBtn}>
              <Text style={styles.rescanText}>Rescan</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Camera */}
      <View style={{ flex: 1 }}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => !scanned && !isProcessing && processQR(data)}
          enableTorch={torchOn}
        />

        {/* Overlay */}
        <View style={styles.overlay}>
          {/* Top dark area */}
          <View style={styles.overlayTop} />

          {/* Middle row with scan box */}
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.scanBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />

              {/* Scan line animation placeholder */}
              {!scanned && !isProcessing && (
                <View style={styles.scanLine} />
              )}
            </View>
            <View style={styles.overlaySide} />
          </View>

          {/* Bottom dark area */}
          <View style={styles.overlayBottom}>
            {isProcessing ? (
              <View style={styles.processingBox}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.processingText}>Processing QR code...</Text>
              </View>
            ) : (
              <Text style={styles.scanInstructions}>
                Position the QR code within the frame to scan
              </Text>
            )}
          </View>
        </View>

        {/* Bottom controls */}
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
          {/* Torch toggle */}
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

          {/* Manual entry */}
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => setShowManualEntry(true)}
          >
            <Ionicons name="keypad-outline" size={24} color="#fff" />
            <Text style={styles.controlBtnText}>Enter ID</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Manual Entry Modal */}
      {renderManualEntryModal()}
    </View>
  );
};

const CORNER = 28;
const BORDER_W = 4;
const SCAN_BOX_SIZE = 250;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', marginTop: 12, fontSize: 14 },

  // Header
  header: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#fff', marginLeft: 12 },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerActionBtn: { padding: 6 },
  rescanText: { color: '#A5D6A7', fontWeight: '700', fontSize: 15 },

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayMiddle: { flexDirection: 'row' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    paddingTop: 30,
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

  // Processing
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
  controlBtn: { alignItems: 'center', gap: 6, padding: 12 },
  controlBtnActive: { opacity: 1 },
  controlBtnText: { color: '#fff', fontSize: 12, fontWeight: '500' },

  // Permission
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
  permTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 12, textAlign: 'center' },
  permText: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 30 },
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
  manualSubmitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default QRScanner;
