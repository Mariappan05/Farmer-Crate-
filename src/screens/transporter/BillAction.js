/**
 * BillAction.js
 * Bill actions: Accept, Dispute, Download.
 *
 * Features:
 *   - Receives params: { orderId, order }
 *   - Bill details summary
 *   - Accept bill confirmation
 *   - Dispute form with reason
 *   - POST /api/transporters/bills/{id}/accept or /dispute
 *   - Download bill
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../services/api';
import ToastMessage from '../../utils/Toast';

const formatCurrency = (a) => '₹' + (parseFloat(a) || 0).toFixed(2);
const pickFirst = (...values) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

const resolveOrderCandidate = (raw) => {
  const payload = raw?.data?.data || raw?.data || raw;
  const candidate = payload?.order || payload;
  if (!candidate || typeof candidate !== 'object') return null;
  if (!(candidate.order_id || candidate.id)) return null;
  return {
    ...candidate,
    product: candidate.product || candidate.Product || null,
  };
};
const formatDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const BillAction = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { orderId, order: initialOrder } = route.params || {};
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder && !!orderId);

  const [accepting, setAccepting] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const toastRef = useRef(null);

  const resolvedOrderId = orderId || order?.order_id || order?.id;

  const fetchOrder = useCallback(async () => {
    if (!resolvedOrderId) return;
    setLoading(true);
    try {
      const endpoints = [
        `/transporters/orders/${resolvedOrderId}`,
        `/transporters/orders/${resolvedOrderId}/track`,
        `/orders/details/${resolvedOrderId}`,
        `/orders/${resolvedOrderId}`,
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await api.get(endpoint);
          const candidate = resolveOrderCandidate(res.data);
          if (candidate) {
            setOrder((prev) => ({ ...(prev || {}), ...candidate }));
            break;
          }
        } catch {
          // continue fallback chain
        }
      }
    } finally {
      setLoading(false);
    }
  }, [resolvedOrderId]);

  useEffect(() => {
    if (!order && resolvedOrderId) {
      fetchOrder();
    }
  }, [order, resolvedOrderId, fetchOrder]);

  useEffect(() => {
    if (initialOrder) {
      setOrder(initialOrder);
      if (resolvedOrderId) {
        fetchOrder();
      }
    }
  }, [initialOrder, resolvedOrderId, fetchOrder]);

  if (loading && !order) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <ActivityIndicator size="large" color="#1B5E20" />
        <Text style={styles.emptyText}>Loading bill details...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <Ionicons name="document-outline" size={50} color="#ccc" />
        <Text style={styles.emptyText}>No bill data available</Text>
        <TouchableOpacity style={styles.goBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.goBackBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const billId = order.bill_id || order.invoice_id || resolvedOrderId;
  const billNumber = order.bill_number || order.invoice_number || `INV-${resolvedOrderId}`;
  const items = order.items || order.order_items || (order.product ? [{ product: order.product, quantity: order.quantity || 1 }] : []);
  const subtotal = items.reduce((sum, item) => {
    const p = item.product || item;
    const unitPrice = parseFloat(p.price || p.current_price || item.price || item.unit_price || 0) || 0;
    return sum + (unitPrice * (item.quantity || 1));
  }, 0);
  const commission = parseFloat(order.commission || order.transport_charge || order.delivery_charge || order.admin_commission || 0) || (subtotal * 0.05);
  const total = parseFloat(order.total_amount || order.total_price || order.amount || order.grand_total || 0) || (subtotal + commission);
  const billStatus = order.bill_status || order.payment_status || 'Pending';

  /* ── Accept bill ────────────────────────────────────────── */
  const handleAccept = () => {
    Alert.alert(
      'Accept Bill',
      `Accept bill ${billNumber} for ${formatCurrency(total)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setAccepting(true);
            try {
              await api.post(`/transporters/bills/${billId}/accept`);
              toastRef.current?.show('Bill accepted successfully!', 'success');
              navigation.goBack();
            } catch (e) {
              toastRef.current?.show(e.message || 'Failed to accept bill', 'error');
            } finally {
              setAccepting(false);
            }
          },
        },
      ]
    );
  };

  /* ── Dispute bill ───────────────────────────────────────── */
  const handleDispute = async () => {
    if (!disputeReason.trim()) {
      toastRef.current?.show('Please enter a reason for the dispute', 'warning');
      return;
    }
    setDisputing(true);
    try {
      await api.post(`/transporters/bills/${billId}/dispute`, {
        reason: disputeReason.trim(),
      });
      toastRef.current?.show('Dispute submitted for review!', 'success');
      setShowDisputeModal(false);
      navigation.goBack();
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to file dispute', 'error');
    } finally {
      setDisputing(false);
    }
  };

  /* ── Download as PDF ────────────────────────────────────── */
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const html = `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"/>
        <style>
          body { font-family: Arial; padding: 30px; color: #333; }
          h1 { color: #1B5E20; } .total { font-size: 20px; font-weight: bold; color: #1B5E20; }
          table { width: 100%; border-collapse: collapse; } th { background: #1B5E20; color: #fff; padding: 8px; text-align: left; }
          td { padding: 8px; border-bottom: 1px solid #eee; }
        </style></head><body>
        <h1>FarmerCrate - Invoice</h1>
        <p>Bill No: ${billNumber} | Date: ${formatDate(order.created_at)} | Order: #${resolvedOrderId}</p>
        <table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
        ${items.map((it) => {
          const p = it.product || it;
          const pr = parseFloat(p.price || p.current_price || it.price || it.unit_price || 0) || 0;
          return `<tr><td>${p.name || 'Product'}</td><td>${it.quantity || 1}</td><td>₹${pr.toFixed(2)}</td><td>₹${(pr * (it.quantity || 1)).toFixed(2)}</td></tr>`;
        }).join('')}
        </tbody></table>
        <p>Subtotal: ${formatCurrency(subtotal)}</p>
        <p>Commission: ${formatCurrency(commission)}</p>
        <p class="total">Total: ${formatCurrency(total)}</p>
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Bill-${billNumber}` });
      } else {
        toastRef.current?.show('PDF saved successfully', 'success');
      }
    } catch (e) {
      toastRef.current?.show('Failed to download: ' + (e.message || ''), 'error');
    } finally {
      setDownloading(false);
    }
  };

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bill Actions</Text>
        <View style={{ width: 32 }} />
      </LinearGradient>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Bill Summary */}
        <View style={styles.card}>
          <View style={styles.summaryHeader}>
            <MaterialCommunityIcons name="receipt" size={28} color="#1B5E20" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.billNumber}>{billNumber}</Text>
              <Text style={styles.billDate}>Order #{resolvedOrderId} • {formatDate(order.created_at)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: billStatus === 'Accepted' ? '#4CAF5020' : billStatus === 'Disputed' ? '#F4433620' : '#FF980020' }]}>
              <Text style={[styles.statusText, { color: billStatus === 'Accepted' ? '#4CAF50' : billStatus === 'Disputed' ? '#F44336' : '#FF9800' }]}>
                {billStatus}
              </Text>
            </View>
          </View>

          {/* Items summary */}
          <View style={styles.divider} />
          {items.map((item, idx) => {
            const p = item.product || item;
            const price = parseFloat(p.price || p.current_price || item.price || item.unit_price || 0) || 0;
            const qty = item.quantity || 1;
            return (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>{p.name || 'Product'}</Text>
                <Text style={styles.itemQty}>x{qty}</Text>
                <Text style={styles.itemPrice}>{formatCurrency(price * qty)}</Text>
              </View>
            );
          })}
          <View style={styles.divider} />

          <View style={styles.totalSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalVal}>{formatCurrency(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Commission</Text>
              <Text style={styles.totalVal}>{formatCurrency(commission)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalVal}>{formatCurrency(total)}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Actions</Text>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#4CAF50' }]}
            onPress={handleAccept}
            disabled={accepting}
          >
            {accepting ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionBtnTitle}>Accept Bill</Text>
                  <Text style={styles.actionBtnSub}>Confirm and accept this bill</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#F44336' }]}
            onPress={() => setShowDisputeModal(true)}
          >
            <Ionicons name="flag-outline" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.actionBtnTitle}>Dispute</Text>
              <Text style={styles.actionBtnSub}>Raise a dispute for this bill</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#2196F3' }]}
            onPress={handleDownload}
            disabled={downloading}
          >
            {downloading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="download-outline" size={22} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionBtnTitle}>Download PDF</Text>
                  <Text style={styles.actionBtnSub}>Save bill as PDF</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#FF9800' }]}
            onPress={() => navigation.navigate('BillPreview', { orderId: resolvedOrderId, order })}
          >
            <Ionicons name="eye-outline" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.actionBtnTitle}>Preview Bill</Text>
              <Text style={styles.actionBtnSub}>View full bill details</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Dispute Modal */}
      <Modal visible={showDisputeModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDisputeModal(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>File a Dispute</Text>
            <Text style={styles.modalSubtitle}>Bill: {billNumber} • {formatCurrency(total)}</Text>

            <Text style={styles.modalLabel}>Reason for dispute</Text>
            <TextInput
              style={styles.disputeInput}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              placeholder="Explain why you're disputing this bill..."
              placeholderTextColor="#aaa"
              value={disputeReason}
              onChangeText={setDisputeReason}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#E0E0E0' }]}
                onPress={() => setShowDisputeModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: '#666' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#F44336' }]}
                onPress={handleDispute}
                disabled={disputing}
              >
                {disputing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Submit Dispute</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      <ToastMessage ref={toastRef} />
    </View>
  );
};

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F8F4' },
  emptyText: { color: '#999', fontSize: 14, marginTop: 12 },
  goBackBtn: { marginTop: 16, backgroundColor: '#1B5E20', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  goBackBtnText: { color: '#fff', fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },

  summaryHeader: { flexDirection: 'row', alignItems: 'center' },
  billNumber: { fontSize: 16, fontWeight: '800', color: '#1B5E20' },
  billDate: { fontSize: 12, color: '#888', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 12 },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  itemName: { flex: 1, fontSize: 14, color: '#333' },
  itemQty: { fontSize: 13, color: '#888', marginHorizontal: 12 },
  itemPrice: { fontSize: 14, fontWeight: '600', color: '#333' },

  totalSection: { marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 14, color: '#666' },
  totalVal: { fontSize: 14, color: '#333', fontWeight: '500' },
  grandTotalRow: { borderTopWidth: 2, borderTopColor: '#1B5E20', marginTop: 8, paddingTop: 10 },
  grandTotalLabel: { fontSize: 16, fontWeight: '800', color: '#1B5E20' },
  grandTotalVal: { fontSize: 18, fontWeight: '800', color: '#1B5E20' },

  actionsCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    elevation: 2, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  actionsTitle: { fontSize: 16, fontWeight: '800', color: '#1B5E20', marginBottom: 14 },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, marginBottom: 10,
  },
  actionBtnTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  actionBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#F44336', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#888', marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  disputeInput: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#333', backgroundColor: '#FAFAFA', minHeight: 120,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  modalBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default BillAction;
