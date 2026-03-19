/**
 * QRScan.js — Transporter QR Scanner
 *
 * Rules:
 *  - QR only shown/scanned AFTER transporters are assigned (step 3+)
 *  - Only the ASSIGNED transporter (source or destination) can scan
 *  - Different transporter scanning → blocked, no status update
 *  - Source transporter scans:
 *      PICKUP_ASSIGNED → PICKED_UP  (pickup delivery person collected from farmer)
 *      PICKED_UP       → RECEIVED   (source transporter received at source office)
 *      RECEIVED        → SHIPPED    (vehicle assigned and shipped)
 *  - Destination transporter scans:
 *      SHIPPED / IN_TRANSIT → REACHED_DESTINATION
 *      REACHED_DESTINATION → OUT_FOR_DELIVERY (after assigning delivery person)
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Vibration, TextInput, KeyboardAvoidingView, Platform,
  StatusBar, Modal, Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { updateOrderStatusByQR } from '../../services/orderService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_SIZE = SCREEN_WIDTH * 0.7;

// Status → next status for SOURCE transporter
const SOURCE_TRANSITIONS = {
  PICKUP_ASSIGNED: 'PICKED_UP',
  PICKED_UP: 'RECEIVED',
  RECEIVED: 'SHIPPED',
};

// Status → next status for DESTINATION transporter
const DEST_TRANSITIONS = {
  SHIPPED: 'REACHED_DESTINATION',
  IN_TRANSIT: 'REACHED_DESTINATION',
  REACHED_DESTINATION: 'OUT_FOR_DELIVERY',
};

const QRScan = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualId, setManualId] = useState('');
  const lastScanRef = useRef(null);

  const myTransporterId = authState?.user?.transporter_id || authState?.user?.id;

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
        Alert.alert('Invalid QR', 'No valid order ID found.', [
          { text: 'Rescan', onPress: resetScanner },
          { text: 'Enter Manually', onPress: () => { resetScanner(); setShowManual(true); } },
        ]);
        return;
      }
      await validateAndUpdate(orderId);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to process QR', [{ text: 'Retry', onPress: resetScanner }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const validateAndUpdate = async (orderId) => {
    try {
      const res = await api.get(`/orders/${orderId}`);
      const order = res.data?.data || res.data;

      if (!order) {
        Alert.alert('Not Found', `Order #${orderId} not found or not assigned to you.`, [{ text: 'OK', onPress: resetScanner }]);
        return;
      }

      const status = (order.current_status || order.status || '').toUpperCase();
      const srcId = order.source_transporter_id;
      const dstId = order.destination_transporter_id;

      // Determine if I am source or destination transporter
      const isSource = srcId && String(srcId) === String(myTransporterId);
      const isDest = dstId && String(dstId) === String(myTransporterId);

      // Condition 3: only assigned transporter can scan
      if (!isSource && !isDest) {
        Alert.alert(
          'Access Denied',
          'You are not the assigned transporter for this order. Status cannot be updated.',
          [{ text: 'OK', onPress: resetScanner }]
        );
        return;
      }

      // Determine next status based on role
      let nextStatus = null;
      let scannerRole = null;

      if (isSource && SOURCE_TRANSITIONS[status]) {
        nextStatus = SOURCE_TRANSITIONS[status];
        scannerRole = 'source_transporter';
      } else if (isDest && DEST_TRANSITIONS[status]) {
        nextStatus = DEST_TRANSITIONS[status];
        scannerRole = 'destination_transporter';
      }

      if (!nextStatus) {
        Alert.alert(
          'Cannot Update',
          `Order #${orderId} is currently "${status.replace(/_/g, ' ')}". No QR action available at this stage.`,
          [{ text: 'OK', onPress: resetScanner }]
        );
        return;
      }

      Alert.alert(
        '📦 Order Verified',
        `Order #${orderId}\nCurrent: ${status.replace(/_/g, ' ')}\nUpdate to: ${nextStatus.replace(/_/g, ' ')}`,
        [
          { text: 'Cancel', style: 'cancel', onPress: resetScanner },
          {
            text: 'Confirm Update',
            onPress: async () => {
              try {
                await updateOrderStatusByQR(orderId, nextStatus, scannerRole);
                Alert.alert('✅ Updated', `Order #${orderId} → ${nextStatus.replace(/_/g, ' ')}`, [
                  { text: 'View Order', onPress: () => navigation.replace('OrderDetail', { orderId, order }) },
                  { text: 'Scan Another', onPress: resetScanner },
                ]);
              } catch (e) {
                Alert.alert('Update Failed', e.message || 'Could not update status', [{ text: 'OK', onPress: resetScanner }]);
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to fetch order', [{ text: 'Retry', onPress: resetScanner }]);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setIsProcessing(false);
    lastScanRef.current = null;
  };

  const handleManualSubmit = async () => {
    const id = parseInt(manualId.trim());
    if (!id || isNaN(id)) { Alert.alert('Invalid', 'Enter a valid order ID'); return; }
    setShowManual(false);
    setIsProcessing(true);
    setScanned(true);
    try { await validateAndUpdate(id); } finally { setIsProcessing(false); }
  };

  if (!permission) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator size="large" color="#1B5E20" /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <MaterialCommunityIcons name="camera-off-outline" size={60} color="#ccc" />
        <Text style={styles.permTitle}>Camera Permission Required</Text>
        <Text style={styles.permText}>QR scanning requires camera access.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Ionicons name="camera-outline" size={20} color="#fff" />
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.manualLink} onPress={() => setShowManual(true)}>
          <Text style={styles.manualLinkText}>Enter Order ID Manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : ({ data }) => processQR(data)}
      />

      <View style={styles.overlay}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Scan Order QR</Text>
          <TouchableOpacity style={styles.topBtn} onPress={() => setTorchOn(!torchOn)}>
            <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={24} color={torchOn ? '#FFD600' : '#fff'} />
          </TouchableOpacity>
        </View>

        <View style={styles.scannerArea}>
          <View style={styles.scanFrame}>
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
          <Text style={styles.scanSubHint}>Only assigned transporters can update order status</Text>
        </View>

        <View style={styles.bottomBar}>
          {scanned && !isProcessing && (
            <TouchableOpacity style={styles.rescanBtn} onPress={resetScanner}>
              <Ionicons name="refresh" size={22} color="#fff" />
              <Text style={styles.rescanText}>Scan Again</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.manualBtn} onPress={() => setShowManual(true)}>
            <Ionicons name="keypad-outline" size={20} color="#fff" />
            <Text style={styles.manualBtnText}>Enter Manually</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showManual} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Order ID</Text>
            <Text style={styles.modalSub}>Type the order ID manually</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., 12345"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              value={manualId}
              onChangeText={setManualId}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtnItem, { backgroundColor: '#E0E0E0' }]}
                onPress={() => { setShowManual(false); setManualId(''); }}
              >
                <Text style={[styles.modalBtnText, { color: '#666' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnItem, { backgroundColor: '#1B5E20' }]} onPress={handleManualSubmit}>
                <Text style={styles.modalBtnText}>Verify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F8F4', paddingHorizontal: 30 },
  permTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 16 },
  permText: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  permBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1B5E20', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 20 },
  permBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  manualLink: { marginTop: 16 },
  manualLinkText: { color: '#1B5E20', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.4)' },
  topBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  scannerArea: { alignItems: 'center' },
  scanFrame: { width: SCAN_SIZE, height: SCAN_SIZE, justifyContent: 'center', alignItems: 'center' },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: '#4CAF50', borderWidth: 4 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  processingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  processingText: { color: '#fff', fontSize: 14, marginTop: 8 },
  scanHint: { color: '#fff', fontSize: 14, marginTop: 16, textAlign: 'center' },
  scanSubHint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
  bottomBar: { alignItems: 'center', paddingBottom: 40, paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.4)', paddingTop: 16, gap: 12 },
  rescanBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#4CAF50', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25 },
  rescanText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  manualBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  manualBtnText: { color: '#fff', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 },
  modalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  modalSub: { fontSize: 13, color: '#888', marginTop: 4, marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 14, fontSize: 18, color: '#333', textAlign: 'center', letterSpacing: 2 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalBtnItem: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  modalBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default QRScan;
