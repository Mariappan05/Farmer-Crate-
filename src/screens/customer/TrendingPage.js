/**
 * TrendingPage.js
 * Trending products - conversion of Flutter TrendingPage.dart
 *
 * Features:
 *   - GET /api/products/trending
 *   - Ranked list with badges/medals (top 3 gold/silver/bronze)
 *   - Product cards: rank, image, name, farmer, price, rating, view count
 *   - Pull to refresh
 *   - Product tap -> ProductDetails
 *   - Add to Cart button
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  ActivityIndicator,
  Animated,
  StatusBar,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import { useCart } from '../../context/CartContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* --------------------------------------------------------------------------
 * RANK CONFIG
 * ------------------------------------------------------------------------ */

const RANK_CONFIG = {
  1: { bg: '#FFF8E1', border: '#FFD700', icon: 'trophy', iconColor: '#FFD700', label: '1st', gradient: ['#FFF8E1', '#FFFDE7'] },
  2: { bg: '#F5F5F5', border: '#C0C0C0', icon: 'trophy', iconColor: '#C0C0C0', label: '2nd', gradient: ['#F5F5F5', '#FAFAFA'] },
  3: { bg: '#FBE9E7', border: '#CD7F32', icon: 'trophy', iconColor: '#CD7F32', label: '3rd', gradient: ['#FBE9E7', '#FFF3E0'] },
};

const getMedalEmoji = (rank) => {
  if (rank === 1) return '\uD83E\uDD47';
  if (rank === 2) return '\uD83E\uDD48';
  if (rank === 3) return '\uD83E\uDD49';
  return null;
};

/* --------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------ */

const getProductImage = (product) => {
  if (!product) return null;
  const imgs = product.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const primary = imgs.find((i) => i?.is_primary) || imgs[0];
    return typeof primary === 'string' ? primary : primary?.image_url || primary?.url || null;
  }
  return product.image_url || product.image || null;
};

const formatCurrency = (a) => '\u20B9' + (parseFloat(a) || 0).toFixed(2);

const getRating = (product) => {
  const r = product.average_rating || product.rating || 0;
  return Math.min(5, Math.max(0, parseFloat(r) || 0));
};

const getFarmerName = (product) =>
  product.farmer_name || product.user?.full_name || product.user?.name || 'Local Farmer';

const isVisibleToCustomer = (product) => {
  const now = new Date();
  const status = String(product?.status || '').toUpperCase();
  const qty = Number(product?.quantity ?? product?.stock ?? product?.available_quantity ?? 0);

  if (product?.expiry_date) {
    const expiryDate = new Date(product.expiry_date);
    if (!Number.isNaN(expiryDate.getTime()) && expiryDate < now) return false;
  }

  if (status === 'HIDDEN' || status === 'PENDING' || status === 'INACTIVE') return false;
  if (status === 'SOLD_OUT' || status === 'OUT_OF_STOCK') return false;
  if (qty <= 0) return false;

  return status === 'AVAILABLE' || status === 'ACTIVE' || !status;
};

/* --------------------------------------------------------------------------
 * SHIMMER
 * ------------------------------------------------------------------------ */

const ShimmerBlock = ({ width: w, height: h, style, borderRadius = 8 }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#e0e0e0', '#f5f5f5'] });
  return <Animated.View style={[{ width: w, height: h, borderRadius, backgroundColor: bg }, style]} />;
};

/* --------------------------------------------------------------------------
 * STAR RATING
 * ------------------------------------------------------------------------ */

const Stars = ({ rating, size = 14 }) => {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {Array(full).fill(0).map((_, i) => <Ionicons key={'f' + i} name="star" size={size} color="#FFC107" />)}
      {half > 0 && <Ionicons name="star-half" size={size} color="#FFC107" />}
      {Array(empty).fill(0).map((_, i) => <Ionicons key={'e' + i} name="star-outline" size={size} color="#DDD" />)}
    </View>
  );
};

/* --------------------------------------------------------------------------
 * TOP 3 PODIUM CARD
 * ------------------------------------------------------------------------ */

const TopProductCard = ({ product, rank, onPress, onAddToCart }) => {
  const config = RANK_CONFIG[rank];
  const img = getProductImage(product);
  const rating = getRating(product);
  const medal = getMedalEmoji(rank);
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.topCard, { backgroundColor: config.bg, borderColor: config.border }]}
        activeOpacity={0.7}
        onPress={onPress}
      >
        {/* Rank badge */}
        <View style={[styles.rankBadgeTop, { backgroundColor: config.border }]}>
          <Text style={styles.rankBadgeTopText}>{medal || '#' + rank}</Text>
        </View>

        {/* Image */}
        <View style={styles.topImageWrap}>
          {img ? (
            <Image source={{ uri: optimizeImageUrl(img, { width: 120, height: 120 }) }} style={styles.topImage} />
          ) : (
            <View style={[styles.topImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' }]}>
              <Ionicons name="leaf-outline" size={32} color="#aaa" />
            </View>
          )}
        </View>

        {/* Info */}
        <Text style={styles.topName} numberOfLines={2}>{product.name || product.product_name}</Text>
        <Text style={styles.topFarmer} numberOfLines={1}>{getFarmerName(product)}</Text>

        <Stars rating={rating} size={16} />

        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
          <Text style={styles.topPrice}>{formatCurrency(product.price || product.current_price)}</Text>
          {product.unit && <Text style={styles.topUnit}>/{product.unit}</Text>}
        </View>

        {/* View count */}
        {(product.view_count || product.views) > 0 && (
          <View style={styles.viewCountRow}>
            <Ionicons name="eye-outline" size={14} color="#888" />
            <Text style={styles.viewCountText}>{product.view_count || product.views} views</Text>
          </View>
        )}

        {/* Add to Cart */}
        <TouchableOpacity style={[styles.addCartBtn, { backgroundColor: config.border }]} onPress={onAddToCart}>
          <Ionicons name="cart-outline" size={16} color="#fff" />
          <Text style={styles.addCartBtnText}>Add to Cart</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

/* --------------------------------------------------------------------------
 * REGULAR PRODUCT CARD (rank 4+)
 * ------------------------------------------------------------------------ */

const ProductCard = ({ product, rank, onPress, onAddToCart }) => {
  const img = getProductImage(product);
  const rating = getRating(product);

  return (
    <TouchableOpacity style={styles.productCard} activeOpacity={0.7} onPress={onPress}>
      {/* Rank */}
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>#{rank}</Text>
      </View>

      {/* Image */}
      {img ? (
        <Image source={{ uri: optimizeImageUrl(img, { width: 80, height: 80 }) }} style={styles.productImage} />
      ) : (
        <View style={[styles.productImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#E8F5E9' }]}>
          <Ionicons name="leaf-outline" size={24} color="#aaa" />
        </View>
      )}

      {/* Info */}
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{product.name || product.product_name}</Text>
        <Text style={styles.productFarmer} numberOfLines={1}>{getFarmerName(product)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Stars rating={rating} />
          <Text style={styles.ratingNum}>{rating.toFixed(1)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.productPrice}>{formatCurrency(product.price || product.current_price)}</Text>
            {product.unit && <Text style={styles.productUnit}>/{product.unit}</Text>}
          </View>
          {(product.view_count || product.views) > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="eye-outline" size={12} color="#888" />
              <Text style={{ fontSize: 11, color: '#888' }}>{product.view_count || product.views}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Add to cart */}
      <TouchableOpacity style={styles.addCartSmall} onPress={onAddToCart}>
        <Ionicons name="cart-outline" size={18} color="#1B5E20" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

/* --------------------------------------------------------------------------
 * MAIN COMPONENT
 * ------------------------------------------------------------------------ */

const TrendingPage = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* -- Fetch ------------------------------------------------- */
  const fetchTrending = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [trendRes, allRes] = await Promise.all([
        api.get('/products/trending').catch(() => null),
        api.get('/products').catch(() => null),
      ]);
      const trendingRaw = trendRes?.data?.data || trendRes?.data?.products;
      const trending = Array.isArray(trendingRaw) ? trendingRaw.filter(isVisibleToCustomer) : [];
      if (trending && trending.length > 0) {
        setProducts(trending);
      } else {
        const all = (allRes?.data?.data || allRes?.data?.products || []).filter(isVisibleToCustomer);
        // Sort by views/rating as fallback
        all.sort((a, b) => ((b.view_count || b.views || 0) + (b.average_rating || 0) * 10) - ((a.view_count || a.views || 0) + (a.average_rating || 0) * 10));
        setProducts(all.slice(0, 20));
      }
    } catch (e) {
      console.log('Trending fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTrending(); }, []);

  /* -- Handlers ---------------------------------------------- */
  const handleProductPress = (product) => {
    navigation.navigate('ProductDetails', { product, productId: product.id || product.product_id });
  };

  const handleAddToCart = async (product) => {
    const success = await addToCart(product.id || product.product_id);
    if (success) {
      Alert.alert('Added!', (product.name || product.product_name) + ' added to cart.');
    } else {
      Alert.alert('Error', 'Failed to add to cart.');
    }
  };

  /* -- Render top 3 ------------------------------------------ */
  const renderTop3 = () => {
    const top3 = products.slice(0, 3);
    if (top3.length === 0) return null;
    return (
      <View style={styles.top3Section}>
        <Text style={styles.top3Title}>{'\uD83C\uDFC6'} Top Trending</Text>
        {top3.map((p, idx) => (
          <TopProductCard
            key={p.id || p.product_id || idx}
            product={p}
            rank={idx + 1}
            onPress={() => handleProductPress(p)}
            onAddToCart={() => handleAddToCart(p)}
          />
        ))}
      </View>
    );
  };

  /* -- Skeleton ---------------------------------------------- */
  const renderSkeleton = () => (
    <View style={{ padding: 16, gap: 12 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.productCard, { paddingRight: 16 }]}>
          <ShimmerBlock width={32} height={32} borderRadius={16} style={{ marginRight: 10 }} />
          <ShimmerBlock width={70} height={70} borderRadius={10} />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <ShimmerBlock width="80%" height={14} />
            <ShimmerBlock width="50%" height={12} />
            <ShimmerBlock width="60%" height={12} />
            <ShimmerBlock width="40%" height={16} />
          </View>
        </View>
      ))}
    </View>
  );

  /* -- Main -------------------------------------------------- */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'\uD83D\uDD25'} Trending Products</Text>
        <TouchableOpacity onPress={() => fetchTrending()}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? renderSkeleton() : (
        <FlatList
          data={products.slice(3)} // Rest after top 3
          keyExtractor={(item, idx) => String(item.id || item.product_id || idx)}
          ListHeaderComponent={renderTop3}
          renderItem={({ item, index }) => (
            <ProductCard
              product={item}
              rank={index + 4}
              onPress={() => handleProductPress(item)}
              onAddToCart={() => handleAddToCart(item)}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            products.length === 0 && { flex: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchTrending(true); }}
              colors={['#1B5E20']}
              tintColor="#1B5E20"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="chart-line" size={72} color="#ccc" />
              <Text style={styles.emptyTitle}>No Trending Products</Text>
              <Text style={styles.emptySubtitle}>Check back later for popular products!</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

/* --------------------------------------------------------------------------
 * STYLES
 * ------------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },

  headerBar: {
    backgroundColor: '#1B5E20',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  listContent: { padding: 16, paddingBottom: 32 },

  /* Top 3 section */
  top3Section: { marginBottom: 16 },
  top3Title: { fontSize: 22, fontWeight: '700', color: '#1B5E20', marginBottom: 14 },

  /* Top card */
  topCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  rankBadgeTop: {
    position: 'absolute',
    top: -1,
    left: -1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  rankBadgeTopText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  topImageWrap: { marginTop: 8, marginBottom: 10 },
  topImage: { width: 110, height: 110, borderRadius: 14 },
  topName: { fontSize: 16, fontWeight: '700', color: '#222', textAlign: 'center' },
  topFarmer: { fontSize: 13, color: '#888', marginTop: 2, marginBottom: 4 },
  topPrice: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  topUnit: { fontSize: 13, color: '#888', marginLeft: 2 },
  viewCountRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  viewCountText: { fontSize: 12, color: '#888' },
  addCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 10,
    gap: 6,
  },
  addCartBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  /* Regular product card */
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1B5E20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rankText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  productImage: { width: 70, height: 70, borderRadius: 10, marginRight: 12 },
  productInfo: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '700', color: '#222' },
  productFarmer: { fontSize: 12, color: '#888', marginTop: 2 },
  ratingNum: { fontSize: 12, color: '#888' },
  productPrice: { fontSize: 15, fontWeight: '700', color: '#1B5E20' },
  productUnit: { fontSize: 11, color: '#888', marginLeft: 2 },
  addCartSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Empty */
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
});

export default TrendingPage;
