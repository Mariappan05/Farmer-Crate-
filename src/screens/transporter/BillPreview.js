/**
 * BillPreview.js
 * Invoice / bill preview with PDF download & share.
 *
 * Features:
 *   - Receives params: { orderId, order }
 *   - Bill/invoice display: order details, items, prices, commissions, total
 *   - Farmer info, customer info
 *   - Bill number, date
 *   - Download/share as PDF using expo-print + expo-sharing
 *   - Print button
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../../services/api';

const formatDate = (d) => {
  if (!d) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatCurrency = (a) => '₹' + (parseFloat(a) || 0).toFixed(2);
const pickFirst = (...values) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

const parseAddress = (value) => {
  if (!value) return '';
  if (typeof value === 'object') {
    return [
      value.full_name,
      value.address_line,
      value.address,
      value.city,
      value.district,
      value.state,
      value.pincode,
    ].filter(Boolean).join(', ');
  }

  const str = String(value);
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      return [
        parsed.full_name,
        parsed.address_line,
        parsed.address,
        parsed.city,
        parsed.district,
        parsed.state,
        parsed.pincode,
      ].filter(Boolean).join(', ');
    }
  } catch {
    // keep raw string
  }
  return str;
};

const resolveOrderCandidate = (raw) => {
  const payload = raw?.data?.data || raw?.data || raw;
  const candidate = payload?.order || payload;
  if (!candidate || typeof candidate !== 'object') return null;
  if (!(candidate.order_id || candidate.id)) return null;

  const product = candidate.product || candidate.Product || null;
  const farmer = candidate.farmer || candidate.Farmer || product?.farmer || product?.Farmer || null;

  return {
    ...candidate,
    product,
    farmer,
    customer: candidate.customer || candidate.Customer || null,
    delivery_person: candidate.delivery_person || candidate.DeliveryPerson || null,
    source_transporter: candidate.source_transporter || candidate.sourceTransporter || null,
    destination_transporter: candidate.destination_transporter || candidate.destinationTransporter || null,
  };
};

const BillPreview = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { orderId, order: initialOrder } = route.params || {};
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder && !!orderId);
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);

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
          // continue fallbacks
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
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const items = order.items || order.order_items || (order.product ? [{ product: order.product, quantity: order.quantity || 1 }] : []);
  const farmer = order.farmer || order.product?.farmer || order.Product?.farmer || {};
  const customer = order.customer || order.Customer || {};
  const billNumber = order.bill_number || order.invoice_number || `INV-${resolvedOrderId || 'N/A'}`;
  const billDate = formatDate(order.bill_date || order.created_at);
  const subtotal = items.reduce((sum, item) => {
    const p = item.product || item;
    const price = parseFloat(p.price || p.current_price || item.price || item.unit_price || 0) || 0;
    const qty = parseFloat(item.quantity || 1) || 1;
    return sum + (price * qty);
  }, 0);
  const commission = parseFloat(order.commission || order.transport_charge || order.delivery_charge || order.admin_commission || 0) || (subtotal * 0.05);
  const total = parseFloat(order.total_amount || order.total_price || order.amount || order.grand_total || 0) || (subtotal + commission);

  /* ── Generate HTML for PDF ──────────────────────────────── */
  const generateHTML = () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
        h1 { color: #1B5E20; margin-bottom: 5px; }
        .header { border-bottom: 2px solid #1B5E20; padding-bottom: 15px; margin-bottom: 20px; }
        .bill-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .bill-info div { flex: 1; }
        .section { margin-bottom: 20px; }
        .section h3 { color: #1B5E20; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th { background: #1B5E20; color: white; padding: 10px; text-align: left; }
        td { padding: 10px; border-bottom: 1px solid #eee; }
        .total-row { font-weight: bold; font-size: 18px; color: #1B5E20; }
        .footer { margin-top: 30px; text-align: center; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>FarmerCrate</h1>
        <p>Transport Invoice</p>
      </div>
      <div class="bill-info">
        <div>
          <strong>Bill No:</strong> ${billNumber}<br/>
          <strong>Date:</strong> ${billDate}<br/>
          <strong>Order ID:</strong> #${resolvedOrderId}
        </div>
      </div>
      <div class="section">
        <h3>Farmer (Pickup)</h3>
        <p><strong>${farmer.full_name || farmer.name || order.farmer_name || 'N/A'}</strong></p>
        <p>${pickFirst(farmer.phone, farmer.mobile_number, farmer.mobile, farmer.phone_number, order.farmer_phone, '')}</p>
        <p>${parseAddress(pickFirst(farmer.address, farmer.address_line, order.pickup_address, order.farmer_address, ''))}</p>
      </div>
      <div class="section">
        <h3>Customer (Delivery)</h3>
        <p><strong>${customer.full_name || customer.name || order.customer_name || 'N/A'}</strong></p>
        <p>${pickFirst(customer.phone, customer.mobile_number, customer.mobile, customer.phone_number, order.customer_phone, '')}</p>
        <p>${parseAddress(pickFirst(customer.address, customer.address_line, order.delivery_address, order.customer_address, ''))}</p>
      </div>
      <div class="section">
        <h3>Items</h3>
        <table>
          <thead>
            <tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${items.map((item) => {
              const p = item.product || item;
              const price = parseFloat(p.price || p.current_price || item.price || item.unit_price || 0) || 0;
              const qty = item.quantity || 1;
              return `<tr><td>${p.name || 'Product'}</td><td>${qty}</td><td>₹${parseFloat(price).toFixed(2)}</td><td>₹${(price * qty).toFixed(2)}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="section">
        <table>
          <tr><td>Subtotal</td><td style="text-align:right">${formatCurrency(subtotal)}</td></tr>
          <tr><td>Transport / Commission</td><td style="text-align:right">${formatCurrency(commission)}</td></tr>
          <tr class="total-row"><td>Total</td><td style="text-align:right">${formatCurrency(total)}</td></tr>
        </table>
      </div>
      <div class="footer">
        <p>Thank you for using FarmerCrate Transport Services</p>
        <p>Generated on ${new Date().toLocaleDateString('en-IN')}</p>
      </div>
    </body>
    </html>
  `;

  /* ── Print ──────────────────────────────────────────────── */
  const handlePrint = async () => {
    setPrinting(true);
    try {
      await Print.printAsync({ html: generateHTML() });
    } catch (e) {
      Alert.alert('Error', 'Failed to print: ' + (e.message || 'Unknown error'));
    } finally {
      setPrinting(false);
    }
  };

  /* ── Share as PDF ───────────────────────────────────────── */
  const handleShare = async () => {
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: generateHTML() });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Bill-${billNumber}` });
      } else {
        Alert.alert('Sharing not available', 'Sharing is not supported on this device');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to share: ' + (e.message || 'Unknown error'));
    } finally {
      setSharing(false);
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
        <Text style={styles.headerTitle}>Bill Preview</Text>
        <View style={{ width: 32 }} />
      </LinearGradient>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Bill Header */}
        <View style={styles.card}>
          <View style={styles.billHeader}>
            <View>
              <Text style={styles.billTitle}>FarmerCrate</Text>
              <Text style={styles.billSubtitle}>Transport Invoice</Text>
            </View>
            <MaterialCommunityIcons name="receipt" size={36} color="#1B5E20" />
          </View>
          <View style={styles.billInfoRow}>
            <View style={styles.billInfoItem}>
              <Text style={styles.billInfoLabel}>Bill No</Text>
              <Text style={styles.billInfoValue}>{billNumber}</Text>
            </View>
            <View style={styles.billInfoItem}>
              <Text style={styles.billInfoLabel}>Date</Text>
              <Text style={styles.billInfoValue}>{billDate}</Text>
            </View>
            <View style={styles.billInfoItem}>
              <Text style={styles.billInfoLabel}>Order</Text>
              <Text style={styles.billInfoValue}>#{resolvedOrderId}</Text>
            </View>
          </View>
        </View>

        {/* Farmer Info */}
        <View style={styles.card}>
          <View style={styles.personRow}>
            <View style={[styles.personIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="leaf-outline" size={18} color="#4CAF50" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personLabel}>Farmer (Pickup)</Text>
              <Text style={styles.personName}>{farmer.full_name || farmer.name || order.farmer_name || 'N/A'}</Text>
              {pickFirst(farmer.phone, farmer.mobile_number, farmer.mobile, farmer.phone_number, order.farmer_phone) && (
                <Text style={styles.personDetail}>{pickFirst(farmer.phone, farmer.mobile_number, farmer.mobile, farmer.phone_number, order.farmer_phone)}</Text>
              )}
              {(farmer.address || farmer.address_line || order.pickup_address || order.farmer_address) && (
                <Text style={styles.personDetail}>{parseAddress(pickFirst(farmer.address, farmer.address_line, order.pickup_address, order.farmer_address))}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.card}>
          <View style={styles.personRow}>
            <View style={[styles.personIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="person-outline" size={18} color="#2196F3" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personLabel}>Customer (Delivery)</Text>
              <Text style={styles.personName}>{customer.full_name || customer.name || order.customer_name || 'N/A'}</Text>
              {pickFirst(customer.phone, customer.mobile_number, customer.mobile, customer.phone_number, order.customer_phone) && (
                <Text style={styles.personDetail}>{pickFirst(customer.phone, customer.mobile_number, customer.mobile, customer.phone_number, order.customer_phone)}</Text>
              )}
              {(customer.address || customer.address_line || order.delivery_address || order.customer_address) ? (
                <Text style={styles.personDetail}>{parseAddress(pickFirst(customer.address, customer.address_line, order.delivery_address, order.customer_address))}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Items</Text>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Product</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.5, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {items.map((item, idx) => {
            const p = item.product || item;
            const price = parseFloat(p.price || p.current_price || item.price || item.unit_price || 0) || 0;
            const qty = item.quantity || 1;
            return (
              <View key={idx} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{p.name || 'Product'}</Text>
                <Text style={[styles.tableCell, { flex: 0.5, textAlign: 'center' }]}>{qty}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatCurrency(price)}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatCurrency(price * qty)}</Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Transport / Commission</Text>
            <Text style={styles.summaryValue}>{formatCurrency(commission)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#1B5E20' }]}
            onPress={handlePrint}
            disabled={printing}
          >
            {printing ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="print-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Print</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#2196F3' }]}
            onPress={handleShare}
            disabled={sharing}
          >
            {sharing ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Share PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.billActionBtn}
          onPress={() => navigation.navigate('BillAction', { orderId: resolvedOrderId, order })}
        >
          <MaterialCommunityIcons name="file-document-edit-outline" size={20} color="#1B5E20" />
          <Text style={styles.billActionBtnText}>Bill Actions</Text>
          <Ionicons name="chevron-forward" size={18} color="#1B5E20" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F8F4' },
  emptyText: { color: '#999', fontSize: 14, marginTop: 12 },
  retryBtn: { marginTop: 16, backgroundColor: '#1B5E20', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '600' },

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
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1B5E20', marginBottom: 12 },

  billHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  billTitle: { fontSize: 22, fontWeight: '800', color: '#1B5E20' },
  billSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  billInfoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  billInfoItem: { alignItems: 'center' },
  billInfoLabel: { fontSize: 11, color: '#888' },
  billInfoValue: { fontSize: 14, fontWeight: '800', color: '#333', marginTop: 2 },

  personRow: { flexDirection: 'row', gap: 12 },
  personIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  personLabel: { fontSize: 11, color: '#888' },
  personName: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
  personDetail: { fontSize: 12, color: '#666', marginTop: 2 },

  tableHeader: { flexDirection: 'row', backgroundColor: '#E8F5E9', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 8, marginBottom: 4 },
  tableHeaderText: { fontSize: 12, fontWeight: '700', color: '#1B5E20' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tableCell: { fontSize: 13, color: '#333' },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  summaryLabel: { fontSize: 14, color: '#666' },
  summaryValue: { fontSize: 14, color: '#333', fontWeight: '600' },
  totalRow: { borderTopWidth: 2, borderTopColor: '#1B5E20', marginTop: 4, paddingTop: 12 },
  totalLabel: { fontSize: 16, fontWeight: '800', color: '#1B5E20' },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#1B5E20' },

  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
    elevation: 2, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  billActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
    borderRadius: 14, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  billActionBtnText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1B5E20' },
});

export default BillPreview;
