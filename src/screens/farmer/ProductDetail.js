import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function parseImages(product) {
  const imgs = product?.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    return imgs.map((i) => (typeof i === 'string' ? i : i?.image_url || i?.url)).filter(Boolean);
  }
  if (typeof imgs === 'string' && imgs.length > 0) return imgs.split('|||').filter(Boolean);
  if (product?.image_url) return [product.image_url];
  return [];
}

const ProductDetail = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const { productId, product: routeProduct } = route.params || {};

  const [product, setProduct] = useState(routeProduct || null);
  const [loading, setLoading] = useState(!routeProduct);
  const [refreshing, setRefreshing] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [editingQty, setEditingQty] = useState(false);
  const [newQuantity, setNewQuantity] = useState('');
  const [updatingQty, setUpdatingQty] = useState(false);
  const [salesStats, setSalesStats] = useState({ totalSold: 0, totalRevenue: 0, orderCount: 0 });
  const [reviews, setReviews] = useState([]);

  const fetchProduct = useCallback(async () => {
    try {
      const id = productId || product?.id;
      if (!id) return;
      const { data } = await api.get(`/products/${id}`);
      setProduct(data?.product || data);
    } catch (e) {
      console.error('Fetch product error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [productId, product?.id]);

  const fetchSalesAndReviews = useCallback(async () => {
    const id = productId || product?.id;
    if (!id) return;

    try {
      const [salesRes, reviewsRes] = await Promise.allSettled([
        api.get(`/products/${id}/sales`),
        api.get(`/products/${id}/reviews`),
      ]);

      if (salesRes.status === 'fulfilled') {
        const s = salesRes.value.data;
        setSalesStats({
          totalSold: s?.total_sold || s?.total_quantity || 0,
          totalRevenue: s?.total_revenue || s?.revenue || 0,
          orderCount: s?.order_count || s?.total_orders || 0,
        });
      }
      if (reviewsRes.status === 'fulfilled') {
        const r = reviewsRes.value.data;
        setReviews(Array.isArray(r) ? r : r?.reviews || []);
      }
    } catch (_) {}
  }, [productId, product?.id]);

  useEffect(() => {
    if (!routeProduct) fetchProduct();
    fetchSalesAndReviews();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProduct();
    fetchSalesAndReviews();
  };

  const images = parseImages(product);

  const handleImageScroll = (event) => {
    const idx = Math.round(event.nativeEvent.contentOffset.x / (SCREEN_WIDTH));
    setCurrentImageIndex(idx);
  };

  const handleUpdateQuantity = async () => {
    if (!newQuantity || isNaN(parseInt(newQuantity)) || parseInt(newQuantity) < 0) {
      Alert.alert('Validation', 'Please enter a valid quantity');
      return;
    }
    setUpdatingQty(true);
    try {
      await api.put(`/products/${product.id}`, { quantity: parseInt(newQuantity) });
      setProduct((prev) => ({ ...prev, quantity: parseInt(newQuantity) }));
      setEditingQty(false);
      Alert.alert('Updated', 'Quantity updated successfully');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update quantity');
    } finally {
      setUpdatingQty(false);
    }
  };

  const getStatusColor = () => {
    if (!product) return '#888';
    if (product.quantity === 0 || product.stock === 0) return '#F44336';
    if (product.status === 'active' || product.status === 'ACTIVE' || product.is_active)
      return '#4CAF50';
    return '#FF9800';
  };

  const getStatusText = () => {
    if (!product) return '';
    if (product.quantity === 0 || product.stock === 0) return 'Out of Stock';
    if (product.status === 'active' || product.status === 'ACTIVE' || product.is_active)
      return 'Active';
    return 'Inactive';
  };

  const renderStars = (rating) => {
    const stars = [];
    const r = Math.round(parseFloat(rating || 0));
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= r ? 'star' : 'star-outline'}
          size={14}
          color={i <= r ? '#FFC107' : '#ccc'}
          style={{ marginRight: 1 }}
        />
      );
    }
    return <View style={{ flexDirection: 'row' }}>{stars}</View>;
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ marginTop: 12, color: '#666' }}>Loading product...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <Ionicons name="alert-circle-outline" size={64} color="#ccc" />
        <Text style={{ marginTop: 12, color: '#999', fontSize: 16 }}>Product not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#4CAF50', fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = getStatusColor();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient
        colors={['#103A12', '#1B5E20', '#2E7D32']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {product.name}
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('EditProduct', { product })}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
        }
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {/* Image Carousel */}
        {images.length > 0 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleImageScroll}
            >
              {images.map((url, idx) => (
                <Image
                  key={idx}
                  source={{ uri: optimizeImageUrl(url, { width: 600 }) }}
                  style={styles.productImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
            {images.length > 1 && (
              <View style={styles.dotsRow}>
                {images.map((_, idx) => (
                  <View
                    key={idx}
                    style={[styles.dot, currentImageIndex === idx && styles.dotActive]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noImage}>
            <Ionicons name="image-outline" size={60} color="#ccc" />
            <Text style={{ color: '#999', marginTop: 8 }}>No images</Text>
          </View>
        )}

        {/* Product Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{product.name}</Text>
              {product.variety ? (
                <Text style={styles.variety}>{product.variety}</Text>
              ) : null}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{getStatusText()}</Text>
            </View>
          </View>

          <View style={styles.categoryRow}>
            <Ionicons name="pricetag-outline" size={16} color="#888" />
            <Text style={styles.categoryText}>{product.category || 'Uncategorized'}</Text>
          </View>

          <View style={styles.priceSection}>
            <Text style={styles.price}>₹{parseFloat(product.price || 0).toFixed(2)}</Text>
            <Text style={styles.unit}>per {product.unit || 'kg'}</Text>
          </View>

          {/* Quantity Management */}
          <View style={styles.quantitySection}>
            <View style={styles.quantityHeader}>
              <Text style={styles.quantityLabel}>Available Stock</Text>
              <TouchableOpacity
                onPress={() => {
                  setEditingQty(!editingQty);
                  setNewQuantity(String(product.quantity ?? product.stock ?? 0));
                }}
              >
                <Ionicons
                  name={editingQty ? 'close-circle-outline' : 'create-outline'}
                  size={20}
                  color="#4CAF50"
                />
              </TouchableOpacity>
            </View>
            {editingQty ? (
              <View style={styles.editQtyRow}>
                <TextInput
                  style={styles.qtyInput}
                  value={newQuantity}
                  onChangeText={setNewQuantity}
                  keyboardType="numeric"
                  placeholder="Quantity"
                  placeholderTextColor="#999"
                />
                <TouchableOpacity
                  style={styles.qtyUpdateBtn}
                  onPress={handleUpdateQuantity}
                  disabled={updatingQty}
                >
                  {updatingQty ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.qtyUpdateText}>Update</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.quantityValue}>
                {product.quantity ?? product.stock ?? 0} {product.unit || 'kg'}
              </Text>
            )}
          </View>

          <Text style={styles.descTitle}>Description</Text>
          <Text style={styles.description}>{product.description || 'No description provided.'}</Text>
        </View>

        {/* Sales Statistics */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Sales Statistics</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="package-variant-closed" size={24} color="#4CAF50" />
              <Text style={styles.statValue}>{salesStats.totalSold}</Text>
              <Text style={styles.statLabel}>Units Sold</Text>
            </View>
            <View style={[styles.statItem, styles.statDivider]}>
              <Ionicons name="cash-outline" size={24} color="#FF9800" />
              <Text style={styles.statValue}>₹{salesStats.totalRevenue.toLocaleString('en-IN')}</Text>
              <Text style={styles.statLabel}>Revenue</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="receipt-outline" size={24} color="#2196F3" />
              <Text style={styles.statValue}>{salesStats.orderCount}</Text>
              <Text style={styles.statLabel}>Orders</Text>
            </View>
          </View>
        </View>

        {/* Reviews */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Customer Reviews ({reviews.length})
          </Text>
          {reviews.length === 0 ? (
            <View style={styles.emptyReviews}>
              <Ionicons name="chatbubble-outline" size={36} color="#ccc" />
              <Text style={styles.emptyText}>No reviews yet</Text>
            </View>
          ) : (
            reviews.slice(0, 10).map((review, idx) => (
              <View key={review.id || idx} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewUser}>
                    <Ionicons name="person-circle-outline" size={28} color="#888" />
                    <Text style={styles.reviewerName}>
                      {review.user_name || review.user?.full_name || 'Customer'}
                    </Text>
                  </View>
                  {renderStars(review.rating)}
                </View>
                {review.comment || review.review ? (
                  <Text style={styles.reviewText}>{review.comment || review.review}</Text>
                ) : null}
                {review.created_at && (
                  <Text style={styles.reviewDate}>
                    {new Date(review.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default ProductDetail;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 12 },

  /* Images */
  productImage: { width: SCREEN_WIDTH, height: 280 },
  noImage: { height: 200, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F0F0' },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 3,
  },
  dotActive: { backgroundColor: '#fff', width: 20 },

  /* Info Card */
  infoCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  infoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  productName: { fontSize: 22, fontWeight: '700', color: '#333' },
  variety: { fontSize: 14, color: '#888', marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  categoryText: { fontSize: 14, color: '#888', marginLeft: 6 },

  priceSection: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14 },
  price: { fontSize: 28, fontWeight: '700', color: '#1B5E20' },
  unit: { fontSize: 15, color: '#666', marginLeft: 6 },

  /* Quantity */
  quantitySection: {
    marginTop: 16,
    backgroundColor: '#F9FBE7',
    borderRadius: 12,
    padding: 14,
  },
  quantityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quantityLabel: { fontSize: 14, fontWeight: '600', color: '#555' },
  quantityValue: { fontSize: 20, fontWeight: '700', color: '#1B5E20', marginTop: 6 },
  editQtyRow: { flexDirection: 'row', marginTop: 8, gap: 10 },
  qtyInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: '#333',
  },
  qtyUpdateBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  qtyUpdateText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  descTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginTop: 16 },
  description: { fontSize: 14, color: '#666', marginTop: 6, lineHeight: 22 },

  /* Section Card */
  sectionCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1B5E20', marginBottom: 14 },

  /* Stats */
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  statDivider: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E0E0E0',
  },
  statValue: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 6 },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },

  /* Reviews */
  emptyReviews: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { marginTop: 8, color: '#999', fontSize: 14 },
  reviewCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewUser: { flexDirection: 'row', alignItems: 'center' },
  reviewerName: { fontSize: 14, fontWeight: '600', color: '#333', marginLeft: 8 },
  reviewText: { fontSize: 13, color: '#555', marginTop: 8, lineHeight: 20 },
  reviewDate: { fontSize: 11, color: '#aaa', marginTop: 6 },
});
