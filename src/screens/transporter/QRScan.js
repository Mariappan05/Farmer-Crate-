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

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Vibration,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_SIZE = SCREEN_WIDTH * 0.7;

// Only transporter-controlled statuses should be QR updated.
const VALID_TRANSPORTER_QR_STATUSES = ['PICKED_UP', 'RECEIVED', 'SHIPPED', 'IN_TRANSIT', 'REACHED_DESTINATION'];
const WORKFLOW_STATUS_ORDER = [
  'PENDING',
  'PLACED',
  'ASSIGNED',
  'PICKUP_ASSIGNED',
  'PICKUP_IN_PROGRESS',
  'PICKED_UP',
  'RECEIVED',
  'SHIPPED',
  'IN_TRANSIT',
  'REACHED_DESTINATION',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
];

const statusRank = (status) => {
  const s = String(status || '').toUpperCase();
  const idx = WORKFLOW_STATUS_ORDER.indexOf(s);
  return idx >= 0 ? idx : -1;
};

const isBackwardTransition = (fromStatus, toStatus) => {
  const from = statusRank(fromStatus);
  const to = statusRank(toStatus);
  if (from < 0 || to < 0) return false;
  return to < from;
};

const toNumberOrZero = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeStatus = (status) => {
  const s = String(status || '').toUpperCase();
  return s === 'OUT_OF_DELIVERY' ? 'OUT_FOR_DELIVERY' : s;
};

const extractOrderIdFromQrPayload = (rawValue) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) return Number(raw);

  try {
    const parsed = JSON.parse(raw);
    const candidate = parsed?.order_id || parsed?.orderId || parsed?.id;
    if (candidate && /^\d+$/.test(String(candidate))) return Number(candidate);
  } catch (_) {
    // keep parsing
  }

  try {
    const url = new URL(raw);
    const idFromQuery = url.searchParams.get('order_id') || url.searchParams.get('orderId') || url.searchParams.get('id');
    if (idFromQuery && /^\d+$/.test(String(idFromQuery))) return Number(idFromQuery);
  } catch (_) {
    // keep parsing
  }

  const idMatch = raw.match(/(?:order[_-]?id|id)[:=\s"']*(\d+)/i) || raw.match(/#(\d+)/);
  if (idMatch) return Number(idMatch[1]);

  return null;
};

const getProductMetaFromOrder = (order) => {
  const product = order?.product || order?.Product || {};
  const productName = order?.product_name || product?.name || 'Product';
  const productImages = Array.isArray(product?.images) ? product.images : [];
  const primaryImageObj = productImages.find((img) => img?.is_primary) || productImages[0] || null;
  const imageFromArray = typeof primaryImageObj === 'string'
    ? primaryImageObj
    : primaryImageObj?.image_url || primaryImageObj?.url || null;
  const productImage = order?.product_image || imageFromArray || null;

  return { productName, productImage };
};

const parseExpectedStatusFromMessage = (message) => {
  const raw = String(message || '');
  const match = raw.match(/expected\s+next\s+status\s*[:=-]\s*['\"]?([A-Z_]+)['\"]?/i);
  return match ? String(match[1] || '').toUpperCase() : null;
};

const getExpectedStatusFromError = (error) => {
  const data = error?.response?.data || {};
  const nested = data?.data || {};

  const directCandidates = [
    data?.expected_next_status,
    data?.expectedNextStatus,
    data?.next_status,
    data?.nextStatus,
    nested?.expected_next_status,
    nested?.expectedNextStatus,
    nested?.next_status,
    nested?.nextStatus,
  ];

  for (const candidate of directCandidates) {
    const normalized = String(candidate || '').trim().toUpperCase();
    if (/^[A-Z_]+$/.test(normalized)) return normalized;
  }

  try {
    const jsonText = JSON.stringify(data);
    const fromJson = parseExpectedStatusFromMessage(jsonText);
    if (fromJson) return fromJson;
  } catch (_) {
    // ignore
  }

  return (
    parseExpectedStatusFromMessage(data?.message) ||
    parseExpectedStatusFromMessage(data?.error) ||
    parseExpectedStatusFromMessage(error?.message)
  );
};

const QRScan = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const expectedOrderId = route?.params?.orderId || route?.params?.expectedOrderId || null;
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualId, setManualId] = useState('');
  const [popup, setPopup] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
    productName: '',
    productImage: null,
  });
  const lastScanRef = useRef(null);

  const myTransporterId = authState?.user?.transporter_id || authState?.user?.id;

  const showPopup = (title, message, buttons = [], type = 'info', meta = {}) => {
    const baseButtons = buttons.length > 0
      ? buttons
      : [{ text: 'OK', variant: 'primary', onPress: () => {} }];
    const hasCancel = baseButtons.some((btn) => String(btn?.text || '').toLowerCase() === 'cancel');
    const normalizedButtons = hasCancel
      ? baseButtons
      : [...baseButtons, { text: 'Cancel', variant: 'outline', onPress: () => {} }];
    setPopup({
      visible: true,
      title,
      message,
      type,
      buttons: normalizedButtons,
      productName: meta?.productName || '',
      productImage: meta?.productImage || null,
    });
  };

  const closePopup = () => {
    setPopup((prev) => ({ ...prev, visible: false }));
  };

  const handlePopupPress = (btn) => {
    closePopup();
    if (typeof btn?.onPress === 'function') {
      setTimeout(() => btn.onPress(), 0);
    }
  };

  const isAssignedToLoggedTransporter = (order) => {
    const myId = Number(myTransporterId);
    if (!myId || !order) return true;

    const sourceId = Number(order.source_transporter_id || order.pickup_transporter_id || order.transporter_id);
    const destinationId = Number(order.destination_transporter_id || order.delivery_transporter_id);
    const assignedTransporterId = Number(order.assigned_transporter_id || order.transporter?.id || order.transporter?.transporter_id);
    const role = String(order.transporter_role || '').toUpperCase();

    if (role === 'PICKUP_SHIPPING' && sourceId) return sourceId === myId;
    if (role === 'DELIVERY' && destinationId) return destinationId === myId;
    if (assignedTransporterId) return assignedTransporterId === myId;
    if (sourceId && destinationId) return sourceId === myId || destinationId === myId;

    return true;
  };

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
      orderId = extractOrderIdFromQrPayload(qrData);

      // Fallback for UUID/code-only payloads.
      if (!orderId) {
        try {
          const resolveRes = await api.post('/transporters/orders/resolve-qr', { qr_code: qrData });
          const resolvedId = resolveRes?.data?.data?.order_id;
          if (resolvedId) orderId = Number(resolvedId);
        } catch (_) {
          // Keep null and show invalid dialog below.
        }
      }

      if (!orderId) {
        showPopup(
          'Invalid QR',
          'This QR does not contain a valid order reference.',
          [
            { text: 'Rescan', variant: 'primary', onPress: resetScanner },
            { text: 'Enter Manually', variant: 'outline', onPress: () => { resetScanner(); setShowManual(true); } },
          ],
          'error'
        );
        return;
      }
      await validateAndUpdate(orderId);
    } catch (e) {
      showPopup('Error', e.message || 'Failed to process QR', [{ text: 'Retry', variant: 'primary', onPress: resetScanner }], 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  /* ── Fetch and validate order ───────────────────────────── */
  const fetchAndValidateOrder = async (orderId) => {
    try {
      // Fetch from transporter's allocated orders with endpoint fallbacks.
      let order = null;
      const orderEndpoints = [
        `/orders/${orderId}`,
        `/transporters/orders/${orderId}`,
      ];

      for (const endpoint of orderEndpoints) {
        try {
          const res = await api.get(endpoint);
          const payload = res.data?.data || res.data?.order || res.data;
          const candidate = payload?.order || payload;
          if (candidate && (candidate.order_id || candidate.id)) {
            order = candidate;
            break;
          }
        } catch (_) {
          // Continue fallbacks.
        }
      }

      if (!order) {
        const listRes = await api
          .get('/orders/transporter/allocated')
          .catch(() => api.get('/transporters/orders/active').catch(() => ({ data: [] })));
        const allOrders = listRes.data?.data || listRes.data?.orders || listRes.data || [];
        order = (Array.isArray(allOrders) ? allOrders : []).find((o) => (o.order_id || o.id) == orderId);
      }

      if (!order) {
        showPopup('Not Found', `Order #${orderId} not found or not assigned to you.`, [{ text: 'OK', variant: 'primary', onPress: resetScanner }], 'warning');
        return;
      }

      if (expectedOrderId && Number(orderId) !== Number(expectedOrderId)) {
        showPopup('Wrong QR', `Please scan QR for order #${expectedOrderId}.`, [{ text: 'Rescan', variant: 'primary', onPress: resetScanner }], 'warning');
        return;
      }

      const status = normalizeStatus(order.current_status || order.status);

      if (!isAssignedToLoggedTransporter(order)) {
        showPopup('Not Assigned', 'This order is not assigned to your transporter account.', [{ text: 'OK', variant: 'primary', onPress: resetScanner }], 'warning');
        return null;
      }

      if (VALID_TRANSPORTER_QR_STATUSES.includes(status)) {
        return order;
      }

      // Already delivered
      if (status === 'DELIVERED' || status === 'COMPLETED') {
        const { productName, productImage } = getProductMetaFromOrder(order);
        showPopup(
          'Already Delivered',
          'This product has already been delivered.',
          [
            { text: 'View Details', variant: 'outline', onPress: () => navigation.navigate('OrderDetail', { orderId, order }) },
            { text: 'Scan Another', variant: 'primary', onPress: resetScanner },
          ],
          'success',
          { productName, productImage }
        );
        return;
      }

      if (status === 'OUT_FOR_DELIVERY') {
        showPopup(
          'Final Delivery Stage',
          `Order #${orderId} is in OUT_FOR_DELIVERY. Final QR completion must be done by the assigned delivery person.`,
          [{ text: 'OK', variant: 'primary', onPress: resetScanner }],
          'warning'
        );
        return null;
      }

      // Invalid status
      showPopup(
        'Invalid Status',
        `Order #${orderId} has status "${status}". QR scanning is not allowed at this stage.`,
        [{ text: 'OK', variant: 'primary', onPress: resetScanner }],
        'warning'
      );
      return null;
    } catch (e) {
      showPopup('Error', e.message || 'Failed to fetch order', [{ text: 'Retry', variant: 'primary', onPress: resetScanner }], 'error');
      return null;
    }
  };

  const validateAndUpdate = async (orderId) => {
    const order = await fetchAndValidateOrder(orderId);
    if (!order) return;
    await updateStatusAfterScan(order);
  };

  const getNextStatusAfterScan = (order) => {
    const role = (order?.transporter_role || '').toUpperCase();
    const current = normalizeStatus(order?.current_status || order?.status);
    const myId = toNumberOrZero(myTransporterId);
    const sourceId = toNumberOrZero(order?.source_transporter_id || order?.pickup_transporter_id || order?.transporter_id);
    const destinationId = toNumberOrZero(order?.destination_transporter_id || order?.delivery_transporter_id);
    const isDestinationTransporter = !!myId && !!destinationId && myId === destinationId;
    const isSourceTransporter = !!myId && !!sourceId && myId === sourceId;
    const isSameTransporter = order?.same_transporter === true || 
      (order?.source_transporter_id && order?.source_transporter_id === order?.destination_transporter_id);

    // Destination transporter can progress only delivery-side statuses by QR.
    if (isDestinationTransporter && !isSameTransporter) {
      if (current === 'SHIPPED' || current === 'IN_TRANSIT') return 'REACHED_DESTINATION';
      if (current === 'REACHED_DESTINATION') return 'OUT_FOR_DELIVERY';
      return null;
    }

    // Source transporter keeps source-side QR transitions.
    if (isSourceTransporter && !isSameTransporter) {
      if (current === 'PICKED_UP') return 'RECEIVED';
      if (current === 'RECEIVED') return 'SHIPPED';
      if (current === 'SHIPPED') return 'IN_TRANSIT';
      return null;
    }

    // When same transporter handles both roles, allow the full flow
    if (isSameTransporter || !role) {
      if (current === 'PICKED_UP') return 'RECEIVED';
      if (current === 'RECEIVED') return 'SHIPPED';
      if (current === 'SHIPPED') return 'IN_TRANSIT';
      if (current === 'IN_TRANSIT') return 'REACHED_DESTINATION';
      if (current === 'REACHED_DESTINATION') return order?.delivery_person_id ? 'OUT_FOR_DELIVERY' : null;
      return null;
    }

    if (role === 'PICKUP_SHIPPING') {
      if (current === 'PICKED_UP') return 'RECEIVED';
      if (current === 'RECEIVED') return 'SHIPPED';
      if (current === 'SHIPPED') return 'IN_TRANSIT';
    }
    if (role === 'DELIVERY') {
      if (current === 'SHIPPED' || current === 'IN_TRANSIT') return 'REACHED_DESTINATION';
      if (current === 'REACHED_DESTINATION') return 'OUT_FOR_DELIVERY';
    }
    return null;
  };

  const normalizeStatusForBackend = (order, statusToApply) => {
    const normalized = normalizeStatus(statusToApply);
    const myId = toNumberOrZero(myTransporterId);
    const sourceId = toNumberOrZero(order?.source_transporter_id || order?.pickup_transporter_id || order?.transporter_id);
    const destinationId = toNumberOrZero(order?.destination_transporter_id || order?.delivery_transporter_id);
    const isSameTransporter =
      order?.same_transporter === true ||
      (order?.source_transporter_id && order?.source_transporter_id === order?.destination_transporter_id);
    const isDestinationTransporter = !!myId && !!destinationId && myId === destinationId;

    // Guard against backend hints using generic RECEIVED for destination office stage.
    if (isDestinationTransporter && !isSameTransporter && normalized === 'RECEIVED') {
      return 'REACHED_DESTINATION';
    }

    return normalized;
  };

  const updateStatusAfterScan = async (order) => {
    const orderId = order.order_id || order.id;
    let effectiveOrder = order;

    // Always re-sync once before update to avoid stale status mismatch with backend transaction state.
    try {
      const endpoints = [`/orders/${orderId}`, `/transporters/orders/${orderId}`];
      for (const endpoint of endpoints) {
        try {
          const res = await api.get(endpoint);
          const payload = res.data?.data || res.data?.order || res.data;
          const candidate = payload?.order || payload;
          if (candidate && (candidate.order_id || candidate.id)) {
            effectiveOrder = { ...order, ...candidate };
            break;
          }
        } catch (_) {
          // try next endpoint
        }
      }
    } catch (_) {
      // keep original order object
    }

    const nextStatus = normalizeStatusForBackend(effectiveOrder, getNextStatusAfterScan(effectiveOrder));

    if (!nextStatus) {
      showPopup('No Next Status', 'This order cannot be advanced by QR scan right now.', [{ text: 'OK', variant: 'primary', onPress: resetScanner }], 'warning');
      return;
    }

    const updateSingleStatus = async (statusToApply) => {
      const mappedStatus = normalizeStatusForBackend(effectiveOrder, statusToApply);
      const attempts = [
        {
          label: `/orders/${orderId}/qr-status`,
          run: () => api.put(`/orders/${orderId}/qr-status`, { status: mappedStatus, scanner_role: 'transporter', is_qr_scan: true }),
        },
        {
          label: `/transporters/orders/${orderId}/status`,
          run: () => api.put(`/transporters/orders/${orderId}/status`, { status: mappedStatus, scanner_role: 'transporter', is_qr_scan: true }),
        },
        {
          label: '/transporters/order-status',
          run: () => api.put('/transporters/order-status', { order_id: orderId, status: mappedStatus, scanner_role: 'transporter', is_qr_scan: true }),
        },
        {
          label: '/orders/status',
          run: () => api.put('/orders/status', { order_id: orderId, status: mappedStatus, is_qr_scan: true }),
        },
      ];

      let lastError = null;
      let expectedStatusHint = null;

      for (const attempt of attempts) {
        try {
          await attempt.run();
          console.log('[Transporter QR] Status update success', {
            orderId,
            statusToApply: mappedStatus,
            endpoint: attempt.label,
          });
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          const statusCode = err?.response?.status;
          const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || '';
          const parsedExpected = getExpectedStatusFromError(err);
          if (parsedExpected && !expectedStatusHint) {
            expectedStatusHint = parsedExpected;
          }
          const hasExpectedNextStatus = !!parsedExpected;
          const looksLikeQrValidation = /invalid\s+qr\s+transac|expected\s+next\s+status/i.test(String(message));
          const shouldRetry = statusCode === 404 || statusCode === 405 || hasExpectedNextStatus || looksLikeQrValidation;

          console.error('[Transporter QR] Status update failed', {
            orderId,
            attemptedStatus: mappedStatus,
            endpoint: attempt.label,
            statusCode,
            message,
            responseData: err?.response?.data,
            expectedStatusHint: parsedExpected,
            shouldRetry,
          });

          if (!shouldRetry) {
            break;
          }
        }
      }

      if (lastError) {
        if (expectedStatusHint && !lastError.expectedStatusHint) {
          lastError.expectedStatusHint = expectedStatusHint;
        }
        throw lastError;
      }
    };

    const submitQrStatusUpdate = async (statusToApply) => {
      const mappedStatus = normalizeStatusForBackend(effectiveOrder, statusToApply);
      await updateSingleStatus(mappedStatus);
      let finalStatus = mappedStatus;

      // Auto-progress shipping flow after successful SHIPPED update.
      if (mappedStatus === 'SHIPPED') {
        await updateSingleStatus('IN_TRANSIT');
        finalStatus = 'IN_TRANSIT';
      }

      return finalStatus;
    };

    try {
      const appliedStatus = await submitQrStatusUpdate(nextStatus);

      const { productName, productImage } = getProductMetaFromOrder(order);

      showPopup(
        'Status Updated',
        `${appliedStatus.replace(/_/g, ' ')} updated successfully.`,
        [
          {
            text: 'View Order',
            variant: 'outline',
            onPress: () => navigation.replace('OrderDetail', {
              orderId,
              order: {
                ...order,
                current_status: appliedStatus,
                status: appliedStatus,
              },
            }),
          },
          { text: 'Scan Another', variant: 'primary', onPress: resetScanner },
        ],
        'success',
        { productName, productImage }
      );
    } catch (e) {
      const serverMessage = e?.response?.data?.message || e?.response?.data?.error;
      const statusCode = e?.response?.status;
      const readable = serverMessage || e?.message || 'Could not update order status';
      const suffix = statusCode ? ` (HTTP ${statusCode})` : '';
      const expectedStatusRaw = getExpectedStatusFromError(e) || e?.expectedStatusHint;
      const expectedStatus = expectedStatusRaw
        ? normalizeStatusForBackend(effectiveOrder, expectedStatusRaw)
        : null;
      const currentStatus = (effectiveOrder?.current_status || effectiveOrder?.status || '').toUpperCase();

      console.error('[Transporter QR] Final update failure', {
        orderId,
        currentStatus,
        computedNextStatus: nextStatus,
        expectedStatus,
        statusCode,
        responseData: e?.response?.data,
        message: readable,
      });

      if (expectedStatus && expectedStatus !== nextStatus) {
        if (isBackwardTransition(currentStatus, expectedStatus)) {
          console.error('[Transporter QR] Blocked backward transition from backend hint', {
            orderId,
            currentStatus,
            expectedStatus,
          });
          showPopup(
            'Update Failed',
            `Backend requested older status (${expectedStatus.replace(/_/g, ' ')}) while order is already ${currentStatus.replace(/_/g, ' ')}. Status was not downgraded.`,
            [{ text: 'Retry', variant: 'primary', onPress: resetScanner }],
            'error'
          );
          return;
        }

        try {
          await submitQrStatusUpdate(expectedStatus);
          const { productName, productImage } = getProductMetaFromOrder(order);
          showPopup(
            'Status Updated',
            `${expectedStatus.replace(/_/g, ' ')} updated successfully.`,
            [
              {
                text: 'View Order',
                variant: 'outline',
                onPress: () => navigation.replace('OrderDetail', {
                  orderId,
                  order: {
                    ...effectiveOrder,
                    current_status: expectedStatus,
                    status: expectedStatus,
                  },
                }),
              },
              { text: 'Scan Another', variant: 'primary', onPress: resetScanner },
            ],
            'success',
            { productName, productImage }
          );
          return;
        } catch (retryError) {
          const retryReadable =
            retryError?.response?.data?.message ||
            retryError?.response?.data?.error ||
            retryError?.message ||
            'Could not update order status';
          showPopup('Update Failed', retryReadable, [{ text: 'Retry', variant: 'primary', onPress: resetScanner }], 'error');
          return;
        }
      }

      showPopup('Update Failed', `${readable}${suffix}`, [{ text: 'Retry', variant: 'primary', onPress: resetScanner }], 'error');
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setIsProcessing(false);
    lastScanRef.current = null;
  };

  const handleManualSubmit = async () => {
    const id = parseInt(manualId.trim());
    if (!id || isNaN(id)) { showPopup('Invalid Input', 'Enter a valid order ID', [{ text: 'OK', variant: 'primary', onPress: () => {} }], 'warning'); return; }
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

      <Modal visible={popup.visible} transparent animationType="fade" onRequestClose={closePopup}>
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <View
              style={[
                styles.popupAccent,
                popup.type === 'success' && styles.popupAccentSuccess,
                popup.type === 'error' && styles.popupAccentError,
                popup.type === 'warning' && styles.popupAccentWarning,
              ]}
            />
            <View style={styles.popupHeaderRow}>
              <View style={[
                styles.popupIconWrap,
                popup.type === 'success' && styles.popupIconSuccess,
                popup.type === 'error' && styles.popupIconError,
                popup.type === 'warning' && styles.popupIconWarning,
              ]}>
                <Ionicons
                  name={popup.type === 'success' ? 'checkmark-circle' : popup.type === 'error' ? 'close-circle' : 'alert-circle'}
                  size={24}
                  color={popup.type === 'success' ? '#16A34A' : popup.type === 'error' ? '#DC2626' : '#D97706'}
                />
              </View>
              <TouchableOpacity style={styles.popupCloseBtn} onPress={closePopup}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.popupTitle} numberOfLines={2}>{popup.title}</Text>
            <Text style={styles.popupMessage}>{popup.message}</Text>
            {(popup.productImage || popup.productName) && (
              <View style={styles.popupProductWrap}>
                {popup.productImage ? (
                  <Image source={{ uri: popup.productImage }} style={styles.popupProductImage} />
                ) : (
                  <View style={styles.popupProductPlaceholder}>
                    <Ionicons name="cube-outline" size={24} color="#9CA3AF" />
                  </View>
                )}
                <Text style={styles.popupProductName} numberOfLines={2}>{popup.productName || 'Product'}</Text>
              </View>
            )}
            <View style={styles.popupActions}>
              {popup.buttons.map((btn, idx) => (
                <TouchableOpacity
                  key={`${btn.text}-${idx}`}
                  style={[
                    styles.popupBtn,
                    btn.variant === 'outline' ? styles.popupBtnOutline : styles.popupBtnPrimary,
                  ]}
                  onPress={() => handlePopupPress(btn)}
                >
                  <Text style={btn.variant === 'outline' ? styles.popupBtnOutlineText : styles.popupBtnPrimaryText}>{btn.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
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
  popupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  popupCard: {
    width: '100%',
    maxWidth: 370,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  popupAccent: { height: 5, backgroundColor: '#EAB308', marginHorizontal: -18 },
  popupAccentSuccess: { backgroundColor: '#16A34A' },
  popupAccentError: { backgroundColor: '#DC2626' },
  popupAccentWarning: { backgroundColor: '#D97706' },
  popupHeaderRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  popupCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupIconWrap: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginBottom: 10, backgroundColor: '#FEF3C7' },
  popupIconSuccess: { backgroundColor: '#DCFCE7' },
  popupIconError: { backgroundColor: '#FEE2E2' },
  popupIconWarning: { backgroundColor: '#FEF3C7' },
  popupTitle: { fontSize: 19, fontWeight: '800', color: '#1F2937', marginTop: 2 },
  popupMessage: { fontSize: 14, color: '#4B5563', marginTop: 6, lineHeight: 20 },
  popupProductWrap: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  popupProductImage: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#E5E7EB' },
  popupProductPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupProductName: { flex: 1, color: '#111827', fontSize: 14, fontWeight: '700' },
  popupActions: { flexDirection: 'column', gap: 10, marginTop: 16 },
  popupBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  popupBtnPrimary: { backgroundColor: '#1B5E20' },
  popupBtnOutline: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  popupBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  popupBtnOutlineText: { color: '#374151', fontWeight: '700', fontSize: 14 },
});

export default QRScan;
