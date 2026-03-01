import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Dimensions, Platform, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCart } from '../../context/CartContext';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: W } = Dimensions.get('window');

const getItemId = (item) => item.cart_id ?? item.cart_item_id ?? item.id ?? null;

// When the API returns `product` as an integer ID instead of a full object,
// fall back to the top-level item fields (product_name, image_url, price, etc.)
const getProduct = (item) => (item.product && typeof item.product === 'object') ? item.product : item;

const getImage = (item) => {
  const p = getProduct(item);
  const raw = p.images || p.image_url || item.image_url;
  if (Array.isArray(raw) && raw.length > 0) {
    const primary = raw.find((i) => i?.is_primary) || raw[0];
    if (typeof primary === 'string') return primary;
    return primary?.image_url || primary?.url || null;
  }
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return p.image || p.thumbnail || item.thumbnail || null;
};

const getPrice = (item) => {
  const p = getProduct(item);
  return Number(p.price || item.price || p.current_price || item.current_price || 0);
};
const getName = (item) => {
  const p = getProduct(item);
  return p.name || p.product_name || item.product_name || item.name || 'Product #' + (item.product_id || item.id || '');
};
const getFarmerName = (item) => {
  const p = getProduct(item);
  return p.farmer_name || p.user?.full_name || p.user?.name || item.farmer_name || 'Local Farmer';
};
const getStock = (item) => {
  const p = getProduct(item);
  return Number(p.stock || p.available_stock || p.quantity_available || item.stock || 999);
};
const getUnit = (item) => { const p = getProduct(item); return p.unit || item.unit || 'kg'; };

const DELIVERY_THRESHOLD = 500;
const DELIVERY_FEE = 40;

const Cart = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { cartItems, cartCount, isLoading, fetchCart, updateCartItem, removeFromCart, clearCart } = useCart();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [updatingIds, setUpdatingIds] = useState(new Set());
  const [deletingIds, setDeletingIds] = useState(new Set());
  const toastRef = useRef(null);

  useEffect(() => { fetchCart(); }, []);
  useEffect(() => {
    setSelectedIds(new Set(cartItems.map((i) => getItemId(i))));
  }, [cartItems]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCart();
    setRefreshing(false);
  }, [fetchCart]);

  const allSelected = cartItems.length > 0 && selectedIds.size === cartItems.length;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(cartItems.map((i) => getItemId(i))));
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleUpdateQuantity = useCallback(async (item, delta) => {
    const id = getItemId(item);
    const currentQty = item.quantity || 1;
    const newQty = currentQty + delta;
    const maxStock = getStock(item);
    if (newQty < 1) { handleDelete(item); return; }
    if (newQty > maxStock) { toastRef.current?.show(`Only ${maxStock} available in stock.`, 'warning'); return; }
    setUpdatingIds((prev) => new Set(prev).add(id));
    await updateCartItem(id, newQty);
    setUpdatingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }, [updateCartItem]);

  const handleDelete = useCallback(async (item) => {
    const id = getItemId(item);
    if (id === null || id === undefined) {
      toastRef.current?.show('Could not identify item.', 'error');
      return;
    }
    setDeletingIds((prev) => new Set(prev).add(id));
    await removeFromCart(id);
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setDeletingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    toastRef.current?.show(`${getName(item)} removed from cart`, 'info');
  }, [removeFromCart]);

  const handleClearCart = useCallback(async () => {
    await clearCart();
    setSelectedIds(new Set());
    toastRef.current?.show('Cart cleared', 'info');
  }, [clearCart]);

  const selectedItems = useMemo(
    () => cartItems.filter((i) => selectedIds.has(getItemId(i))),
    [cartItems, selectedIds],
  );

  const subtotal = useMemo(
    () => selectedItems.reduce((s, item) => s + getPrice(item) * (item.quantity || 1), 0),
    [selectedItems],
  );

  const deliveryFee = subtotal > 0 && subtotal < DELIVERY_THRESHOLD ? DELIVERY_FEE : 0;
  const totalAmount = subtotal + deliveryFee;

  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      toastRef.current?.show('Select at least one item to continue.', 'warning');
      return;
    }
    navigation.navigate('Payment', { cartItems: selectedItems, totalAmount });
  };

  const renderCartItem = ({ item }) => {
    const id = getItemId(item);
    const isSelected = selectedIds.has(id);
    const isUpdating = updatingIds.has(id);
    const isDeleting = deletingIds.has(id);
    const price = getPrice(item);
    const imageUri = getImage(item);
    const optimizedImage = imageUri ? optimizeImageUrl(imageUri, { width: 220 }) : null;
    const qty = item.quantity || 1;
    const lineTotal = price * qty;
    const unit = getUnit(item);

    return (
      <View style={[styles.cardWrapper, !isSelected && styles.cardDimmed, isDeleting && { opacity: 0.3 }]}>
        {isSelected && <View style={styles.selectedStripe} />}
        <View style={styles.cardInner}>
          {/* Left: checkbox + image */}
          <View style={styles.cardLeft}>
            <TouchableOpacity
              onPress={() => toggleSelect(id)}
              style={styles.checkpoint}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={[styles.checkboxBox, isSelected && styles.checkboxChecked]}>
                {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
            </TouchableOpacity>
            {optimizedImage ? (
              <Image source={{ uri: optimizedImage }} style={styles.itemImg} />
            ) : (
              <View style={styles.itemImgPlaceholder}>
                <Ionicons name="leaf" size={28} color="#A5D6A7" />
              </View>
            )}
          </View>

          {/* Right: details */}
          <View style={styles.cardContent}>
            <View style={styles.nameRow}>
              <Text style={styles.itemName} numberOfLines={2}>{getName(item)}</Text>
              <TouchableOpacity
                onPress={() => handleDelete(item)}
                style={styles.deleteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={isDeleting}
              >
                {isDeleting
                  ? <ActivityIndicator size="small" color="#EF5350" />
                  : <Ionicons name="trash-outline" size={18} color="#EF5350" />
                }
              </TouchableOpacity>
            </View>

            <View style={styles.farmerRow}>
              <Ionicons name="person-circle-outline" size={13} color="#81C784" />
              <Text style={styles.farmerName} numberOfLines={1}>{getFarmerName(item)}</Text>
            </View>

            <Text style={styles.unitPrice}>
              ₹{price.toFixed(2)}<Text style={styles.unitLabel}> /{unit}</Text>
            </Text>

            <View style={styles.qtyRow}>
              <View style={styles.qtyControl}>
                <TouchableOpacity
                  onPress={() => handleUpdateQuantity(item, -1)}
                  style={styles.qtyBtn}
                  disabled={isUpdating || isDeleting}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons
                    name={qty <= 1 ? 'trash-outline' : 'remove'}
                    size={15}
                    color={qty <= 1 ? '#EF5350' : '#2E7D32'}
                  />
                </TouchableOpacity>
                {isUpdating
                  ? <ActivityIndicator size="small" color="#1B5E20" style={{ marginHorizontal: 10 }} />
                  : <Text style={styles.qtyText}>{qty}</Text>
                }
                <TouchableOpacity
                  onPress={() => handleUpdateQuantity(item, 1)}
                  style={[styles.qtyBtn, (isUpdating || qty >= getStock(item)) && { opacity: 0.35 }]}
                  disabled={isUpdating || isDeleting || qty >= getStock(item)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="add" size={15} color={qty >= getStock(item) ? '#ccc' : '#2E7D32'} />
                </TouchableOpacity>
              </View>
              <Text style={styles.lineTotal}>₹{lineTotal.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const EmptyCart = () => (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <MaterialCommunityIcons name="cart-outline" size={72} color="#A5D6A7" />
      </View>
      <Text style={styles.emptyTitle}>Your cart is empty</Text>
      <Text style={styles.emptySub}>
        Browse fresh products and add them to your cart to get started.
      </Text>
      <TouchableOpacity
        style={styles.browseBtn}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.85}
      >
        <Ionicons name="storefront-outline" size={18} color="#fff" />
        <Text style={styles.browseBtnText}>Browse Products</Text>
      </TouchableOpacity>
    </View>
  );

  const ListHeader = () => {
    if (cartItems.length === 0) return null;
    return (
      <View style={styles.listHeader}>
        <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllBtn} activeOpacity={0.7}>
          <View style={[styles.checkboxBox, allSelected && styles.checkboxChecked]}>
            {allSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
          <Text style={styles.selectAllText}>
            {allSelected ? 'Deselect All' : `Select All (${cartItems.length})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClearCart} style={styles.clearBtn} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={15} color="#EF5350" />
          <Text style={styles.clearBtnText}>Clear All</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const PriceBreakdown = () => {
    if (selectedItems.length === 0) return null;
    return (
      <View style={styles.priceCard}>
        <View style={styles.priceCardHeader}>
          <Ionicons name="receipt-outline" size={18} color="#1B5E20" />
          <Text style={styles.priceCardTitle}>Price Details</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Subtotal ({selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''})</Text>
          <Text style={styles.priceVal}>₹{subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Delivery Fee</Text>
          {deliveryFee > 0
            ? <Text style={styles.priceVal}>₹{deliveryFee.toFixed(2)}</Text>
            : <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>FREE</Text></View>
          }
        </View>
        {deliveryFee > 0 && (
          <View style={styles.freeHintRow}>
            <Ionicons name="arrow-up-circle-outline" size={14} color="#E65100" />
            <Text style={styles.freeHintText}>Add ₹{(DELIVERY_THRESHOLD - subtotal).toFixed(0)} more for free delivery</Text>
          </View>
        )}
        <View style={[styles.divider, { marginTop: 10 }]} />
        <View style={[styles.priceRow, { marginTop: 4 }]}>
          <Text style={styles.totalLabel}>Total Amount</Text>
          <Text style={styles.totalVal}>₹{totalAmount.toFixed(2)}</Text>
        </View>
        {deliveryFee === 0 && subtotal > 0 && (
          <View style={styles.savingRow}>
            <Ionicons name="checkmark-circle" size={14} color="#1B5E20" />
            <Text style={styles.savingText}>You saved ₹{DELIVERY_FEE} on delivery!</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>My Cart</Text>
            <Text style={styles.headerSub}>{cartCount} item{cartCount !== 1 ? 's' : ''}</Text>
          </View>
        </View>
        {cartItems.length > 0 && (
          <TouchableOpacity onPress={handleClearCart} style={styles.headerTrashBtn}>
            <MaterialCommunityIcons name="delete-sweep-outline" size={24} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        )}
      </View>

      {isLoading && cartItems.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={styles.loadingText}>Loading your cart…</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={cartItems}
            keyExtractor={(item) => String(getItemId(item) ?? Math.random())}
            renderItem={renderCartItem}
            ListHeaderComponent={<ListHeader />}
            ListFooterComponent={<PriceBreakdown />}
            ListEmptyComponent={<EmptyCart />}
            contentContainerStyle={[
              styles.listContent,
              cartItems.length === 0 && { flex: 1, justifyContent: 'center' },
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} tintColor="#1B5E20" />
            }
            showsVerticalScrollIndicator={false}
          />
          {cartItems.length > 0 && (
            <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
              <View style={styles.bottomLeft}>
                <Text style={styles.bottomCount}>{selectedItems.length} of {cartItems.length} selected</Text>
                <Text style={styles.bottomTotal}>₹{totalAmount.toFixed(2)}</Text>
                {deliveryFee === 0 && subtotal > 0 && (
                  <Text style={styles.freeDeliveryLabel}>Free delivery applied</Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.checkoutBtn, selectedItems.length === 0 && styles.checkoutBtnOff]}
                onPress={handleCheckout}
                activeOpacity={0.85}
                disabled={selectedItems.length === 0}
              >
                <Text style={styles.checkoutBtnText}>Checkout</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
      <ToastMessage ref={toastRef} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF7' },
  header: {
    backgroundColor: '#1B5E20',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Platform.select({
      android: { elevation: 6 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6 },
    }),
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  headerTrashBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#888' },
  listContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 180 },
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14, paddingHorizontal: 2,
  },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText: { fontSize: 14, color: '#444', fontWeight: '500' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clearBtnText: { fontSize: 13, color: '#EF5350', fontWeight: '600' },
  cardWrapper: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  cardDimmed: { opacity: 0.45 },
  selectedStripe: { height: 3, backgroundColor: '#4CAF50' },
  cardInner: { flexDirection: 'row', padding: 12, gap: 12 },
  cardLeft: { alignItems: 'center', gap: 8 },
  checkpoint: { padding: 2 },
  checkboxBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#C8E6C9',
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: '#1B5E20', borderColor: '#1B5E20' },
  itemImg: { width: 80, height: 80, borderRadius: 14, backgroundColor: '#F1F8E9' },
  itemImgPlaceholder: {
    width: 80, height: 80, borderRadius: 14,
    backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center',
  },
  cardContent: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  itemName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A', lineHeight: 20 },
  deleteBtn: { padding: 6, borderRadius: 10, backgroundColor: '#FFF3F3' },
  farmerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  farmerName: { fontSize: 12, color: '#777', flex: 1 },
  unitPrice: { fontSize: 14, fontWeight: '700', color: '#1B5E20', marginTop: 6 },
  unitLabel: { fontSize: 12, fontWeight: '400', color: '#888' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  qtyControl: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F1F8E9', borderRadius: 22,
    borderWidth: 1.5, borderColor: '#C8E6C9', paddingVertical: 2,
  },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 15, fontWeight: '700', color: '#222', minWidth: 28, textAlign: 'center' },
  lineTotal: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  priceCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 6, marginBottom: 8,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
    }),
  },
  priceCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  priceCardTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  divider: { height: 1, backgroundColor: '#F0F0F0' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  priceLabel: { fontSize: 14, color: '#666' },
  priceVal: { fontSize: 14, fontWeight: '600', color: '#333' },
  freeBadge: { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  freeBadgeText: { fontSize: 12, fontWeight: '700', color: '#2E7D32' },
  freeHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF8E1', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  freeHintText: { fontSize: 12, color: '#E65100', flex: 1 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#111' },
  totalVal: { fontSize: 20, fontWeight: '800', color: '#1B5E20' },
  savingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E8F5E9', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginTop: 10,
  },
  savingText: { fontSize: 12, fontWeight: '600', color: '#1B5E20' },
  emptyWrap: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 20 },
  emptyIconCircle: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#222', marginBottom: 10 },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  browseBtn: {
    backgroundColor: '#1B5E20', borderRadius: 28,
    paddingHorizontal: 32, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    }),
  },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E8F5E9',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14,
    ...Platform.select({
      android: { elevation: 14 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 8 },
    }),
  },
  bottomLeft: { flex: 1 },
  bottomCount: { fontSize: 12, color: '#888' },
  bottomTotal: { fontSize: 24, fontWeight: '800', color: '#1B5E20' },
  freeDeliveryLabel: { fontSize: 11, color: '#388E3C', fontWeight: '600', marginTop: 2 },
  checkoutBtn: {
    backgroundColor: '#1B5E20', borderRadius: 16,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 22, paddingVertical: 15, gap: 8,
    ...Platform.select({
      android: { elevation: 4 },
      ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
    }),
  },
  checkoutBtnOff: { backgroundColor: '#A5D6A7' },
  checkoutBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default Cart;
