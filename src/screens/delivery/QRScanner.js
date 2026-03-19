import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
import { Colors, Font, Radius, Spacing, shadowStyle } from '../../utils/theme';

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
  loadingText: { color: Colors.textOnDark, marginTop: 12, fontSize: Font.base },

  // Header
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

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)' },
  overlayMiddle: { flexDirection: 'row' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)' },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    paddingTop: 30,
  },

  // Scan box
  scanBox: {
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE,
    position: 'relative',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: Colors.primaryLight },
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
    backgroundColor: Colors.primaryLight,
    opacity: 0.8,
  },

  // Processing
  processingBox: { alignItems: 'center', gap: 12 },
  processingText: { color: Colors.textOnDark, fontSize: Font.md, fontWeight: Font.weightSemiBold },
  scanInstructions: {
    color: '#E0E0E0',
    fontSize: Font.base,
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
    backgroundColor: 'rgba(8,28,10,0.75)',
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
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

  // Permission
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: Colors.background,
  },
  permIconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.primaryXSoft,
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
    backgroundColor: Colors.primaryMid,
    borderRadius: Radius.lg,
    paddingHorizontal: 28,
    paddingVertical: 14,
    ...shadowStyle('sm'),
  },
  permBtnText: { color: Colors.textOnDark, fontWeight: Font.weightBold, fontSize: Font.lg },
  manualEntryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    padding: 10,
  },
  manualEntryLinkText: { color: Colors.primaryMid, fontSize: Font.md, fontWeight: Font.weightSemiBold },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: 24,
    paddingBottom: 40,
    ...shadowStyle('lg'),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: Font.xxl, fontWeight: Font.weightBold, color: Colors.textPrimary },
  modalSubtext: { fontSize: Font.base, color: Colors.textMuted, marginBottom: 20, lineHeight: 20 },
  manualInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: Font.xl,
    fontWeight: Font.weightSemiBold,
    borderWidth: 1.5,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  manualSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primaryMid,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    ...shadowStyle('sm'),
  },
  manualSubmitText: { color: Colors.textOnDark, fontSize: Font.lg, fontWeight: Font.weightBold },
});

export default QRScanner;
