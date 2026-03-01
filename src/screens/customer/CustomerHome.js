import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

// ---------------------------------------------------------------------------
// Category data with emojis
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { name: 'Vegetables', emoji: '🥬' },
  { name: 'Fruits', emoji: '🍎' },
  { name: 'Grains', emoji: '🌾' },
  { name: 'Dairy', emoji: '🥛' },
  { name: 'Spices', emoji: '🌶️' },
  { name: 'Herbs', emoji: '🌿' },
  { name: 'Organic', emoji: '🥗' },
  { name: 'Nuts', emoji: '🥜' },
  { name: 'Pulses', emoji: '🫘' },
  { name: 'Oil', emoji: '🫒' },
  { name: 'Honey', emoji: '🍯' },
  { name: 'Other', emoji: '📦' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getProductImage(product) {
  if (!product) return null;
  const imgs = product.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const primary = imgs.find((i) => i && i.is_primary) || imgs[0];
    if (typeof primary === 'string') return primary;
    return primary?.image_url || primary?.url || null;
  }
  if (typeof imgs === 'string' && imgs.length > 0) return imgs;
  return product.image_url || null;
}

function getFarmerName(product) {
  return (
    product.farmer_name ||
    product.user?.full_name ||
    product.user?.name ||
    'Local Farmer'
  );
}

function getRating(product) {
  const r = product.average_rating || product.rating || 0;
  return Math.min(5, Math.max(0, parseFloat(r) || 0));
}

// ---------------------------------------------------------------------------
// Shimmer placeholder component
// ---------------------------------------------------------------------------
const ShimmerBlock = ({ width: w, height: h, style, borderRadius = 8 }) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1000, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const bg = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#e0e0e0', '#f5f5f5'],
  });

  return (
    <Animated.View
      style={[{ width: w, height: h, borderRadius, backgroundColor: bg }, style]}
    />
  );
};

// ---------------------------------------------------------------------------
// Shimmer loading skeletons
// ---------------------------------------------------------------------------
const CategoryShimmer = () => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
  >
    {Array.from({ length: 8 }).map((_, i) => (
      <View key={i} style={{ alignItems: 'center', marginRight: 16, width: 64 }}>
        <ShimmerBlock width={56} height={56} borderRadius={28} />
        <ShimmerBlock width={48} height={10} style={{ marginTop: 6 }} borderRadius={4} />
      </View>
    ))}
  </ScrollView>
);

const TopBuysShimmer = () => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ paddingHorizontal: 16 }}
  >
    {Array.from({ length: 4 }).map((_, i) => (
      <View key={i} style={{ width: 150, marginRight: 12 }}>
        <ShimmerBlock width={150} height={120} borderRadius={12} />
        <ShimmerBlock width={110} height={12} style={{ marginTop: 8 }} borderRadius={4} />
        <ShimmerBlock width={70} height={12} style={{ marginTop: 6 }} borderRadius={4} />
      </View>
    ))}
  </ScrollView>
);

const ProductGridShimmer = () => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 }}>
    {Array.from({ length: 6 }).map((_, i) => (
      <View key={i} style={{ width: CARD_WIDTH, marginBottom: 12 }}>
        <ShimmerBlock width={CARD_WIDTH} height={130} borderRadius={12} />
        <ShimmerBlock width={CARD_WIDTH - 20} height={12} style={{ marginTop: 8 }} borderRadius={4} />
        <ShimmerBlock width={CARD_WIDTH - 50} height={10} style={{ marginTop: 6 }} borderRadius={4} />
        <ShimmerBlock width={60} height={14} style={{ marginTop: 6 }} borderRadius={4} />
      </View>
    ))}
  </View>
);

// ---------------------------------------------------------------------------
// Star rating component
// ---------------------------------------------------------------------------
const StarRating = ({ rating = 0, size = 12, color = '#FFC107' }) => {
  const stars = [];
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(<Ionicons key={i} name="star" size={size} color={color} />);
    } else if (i === full && half) {
      stars.push(<Ionicons key={i} name="star-half" size={size} color={color} />);
    } else {
      stars.push(<Ionicons key={i} name="star-outline" size={size} color="#ccc" />);
    }
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{stars}</View>;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function CustomerHome({ navigation }) {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const { cartCount, fetchCart } = useCart();

  const scrollY = useRef(new Animated.Value(0)).current;
  const toastRef = useRef(null);

  const [products, setProducts] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [wishlist, setWishlist] = useState({});
  const [addingToCart, setAddingToCart] = useState({});
  const [cartSuccessIds, setCartSuccessIds] = useState({});

  // --------------------------------------------------
  // Data fetching
  // --------------------------------------------------
  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchProducts(), fetchTrending(), fetchProfile(), fetchCart()]);
    setLoading(false);
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      const data = res.data?.data || res.data || [];
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('Products error:', e.message);
    }
  };

  const fetchTrending = async () => {
    try {
      const res = await api.get('/products/trending');
      const data = res.data?.data || res.data || [];
      setTrending(Array.isArray(data) ? data : []);
    } catch {
      // fallback: use top-viewed from products
      try {
        const res = await api.get('/products');
        const data = res.data?.data || res.data || [];
        const sorted = [...(Array.isArray(data) ? data : [])].sort(
          (a, b) => (b.views || 0) - (a.views || 0),
        );
        setTrending(sorted.slice(0, 10));
      } catch (_) {}
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await api.get('/customers/me');
      setProfile(res.data?.data || res.data || null);
    } catch (_) {}
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProducts(), fetchTrending(), fetchProfile(), fetchCart()]);
    setRefreshing(false);
  }, []);

  // --------------------------------------------------
  // Actions
  // --------------------------------------------------
  const handleAddToCart = async (product) => {
    const pid = product.product_id || product.id;
    if (addingToCart[pid]) return;
    setAddingToCart((prev) => ({ ...prev, [pid]: true }));
    try {
      await api.post('/cart', { product_id: pid, quantity: 1 });
      fetchCart();
      // Show success animation on the button
      setCartSuccessIds((prev) => ({ ...prev, [pid]: true }));
      setTimeout(() => setCartSuccessIds((prev) => ({ ...prev, [pid]: false })), 1500);
      toastRef.current?.show(`${product.name} added to cart! ✔`, 'success');
    } catch (e) {
      toastRef.current?.show(e.message || 'Could not add to cart', 'error');
    } finally {
      setAddingToCart((prev) => ({ ...prev, [pid]: false }));
    }
  };

  const toggleWishlist = async (product) => {
    const pid = product.product_id || product.id;
    const isWished = !!wishlist[pid];
    setWishlist((prev) => ({ ...prev, [pid]: !isWished }));
    try {
      if (isWished) {
        await api.delete(`/wishlist/${pid}`);
      } else {
        await api.post('/wishlist', { product_id: pid });
      }
    } catch {
      // revert on failure
      setWishlist((prev) => ({ ...prev, [pid]: isWished }));
    }
  };

  const navigateToProduct = (product) => {
    navigation.navigate('ProductDetails', {
      productId: product.product_id || product.id,
      product,
    });
  };

  // --------------------------------------------------
  // Derived data
  // --------------------------------------------------
  const userName = useMemo(() => {
    if (profile?.customer_name) return profile.customer_name;
    if (profile?.name) return profile.name;
    if (authState?.user?.full_name) return authState.user.full_name;
    if (authState?.user?.name) return authState.user.name;
    return 'Customer';
  }, [profile, authState]);

  const featuredProducts = useMemo(() => {
    return products.filter((p) => (p.quantity || 0) > 0);
  }, [products]);

  // --------------------------------------------------
  // AppBar opacity animated
  // --------------------------------------------------
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // --------------------------------------------------
  // Render helpers
  // --------------------------------------------------

  const renderCategoryItem = ({ name, emoji }, index) => (
    <TouchableOpacity
      key={index}
      style={styles.categoryItem}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('Categories', { category: name })}
    >
      <View style={styles.categoryCircle}>
        <Text style={styles.categoryEmoji}>{emoji}</Text>
      </View>
      <Text style={styles.categoryLabel} numberOfLines={1}>
        {name}
      </Text>
    </TouchableOpacity>
  );

  const renderTopBuyCard = (item, index) => {
    const imgUrl = getProductImage(item);
    const optimized = imgUrl ? optimizeImageUrl(imgUrl, { width: 300, height: 300 }) : null;
    const pid = item.product_id || item.id;

    return (
      <TouchableOpacity
        key={pid || index}
        style={styles.topBuyCard}
        activeOpacity={0.85}
        onPress={() => navigateToProduct(item)}
      >
        {optimized ? (
          <Image source={{ uri: optimized }} style={styles.topBuyImage} resizeMode="cover" />
        ) : (
          <View style={[styles.topBuyImage, styles.noImage]}>
            <Ionicons name="leaf-outline" size={36} color="#66BB6A" />
          </View>
        )}
        {/* Wishlist heart */}
        <TouchableOpacity
          style={styles.topBuyHeart}
          onPress={() => toggleWishlist(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={wishlist[pid] ? 'heart' : 'heart-outline'}
            size={18}
            color={wishlist[pid] ? '#E53935' : '#fff'}
          />
        </TouchableOpacity>
        <View style={styles.topBuyInfo}>
          <Text style={styles.topBuyName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.topBuyFarmer} numberOfLines={1}>
            {getFarmerName(item)}
          </Text>
          <View style={styles.topBuyBottom}>
            <Text style={styles.topBuyPrice}>₹{item.current_price || item.price || 0}</Text>
            <StarRating rating={getRating(item)} size={10} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderProductCard = ({ item }) => {
    const imgUrl = getProductImage(item);
    const optimized = imgUrl ? optimizeImageUrl(imgUrl, { width: 400, height: 400 }) : null;
    const pid = item.product_id || item.id;
    const price = item.current_price || item.price || 0;
    const unit = item.unit || 'kg';

    return (
      <TouchableOpacity
        style={styles.productCard}
        activeOpacity={0.9}
        onPress={() => navigateToProduct(item)}
      >
        {/* Image */}
        <View style={styles.productImageWrapper}>
          {optimized ? (
            <Image source={{ uri: optimized }} style={styles.productImage} resizeMode="cover" />
          ) : (
            <View style={[styles.productImage, styles.noImage]}>
              <Ionicons name="leaf-outline" size={32} color="#66BB6A" />
            </View>
          )}
          {/* Wishlist */}
          <TouchableOpacity
            style={styles.productHeart}
            onPress={() => toggleWishlist(item)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <View style={styles.heartBg}>
              <Ionicons
                name={wishlist[pid] ? 'heart' : 'heart-outline'}
                size={16}
                color={wishlist[pid] ? '#E53935' : '#666'}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.productFarmer} numberOfLines={1}>
            {getFarmerName(item)}
          </Text>
          <StarRating rating={getRating(item)} size={11} />
          <View style={styles.productBottom}>
            <Text style={styles.productPrice}>
              ₹{price}
              <Text style={styles.productUnit}>/{unit}</Text>
            </Text>
            <TouchableOpacity
              style={[
                styles.addCartBtn,
                (addingToCart[pid] || cartSuccessIds[pid]) && styles.addCartBtnDisabled,
                cartSuccessIds[pid] && styles.addCartBtnSuccess,
              ]}
              onPress={() => handleAddToCart(item)}
              disabled={!!addingToCart[pid]}
            >
              {addingToCart[pid]
                ? <ActivityIndicator size="small" color="#fff" />
                : cartSuccessIds[pid]
                  ? <Ionicons name="checkmark" size={18} color="#fff" />
                  : <Ionicons name="add" size={18} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // --------------------------------------------------
  // Main render
  // --------------------------------------------------
  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#1B5E20" barStyle="light-content" translucent={false} />

      {/* ============ Glassmorphic AppBar ============ */}
      <View style={[styles.appBar, { paddingTop: insets.top + 8 }]}>
        <LinearGradient
          colors={['#1B5E20', '#2E7D32', '#388E3C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Animated overlay that intensifies on scroll */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#1B5E20', opacity: headerOpacity },
          ]}
        />

        <View style={styles.appBarContent}>
          <View style={styles.appBarLeft}>
            <View style={styles.avatarWrapper}>
              {profile?.image_url ? (
                <Image
                  source={{ uri: optimizeImageUrl(profile.image_url, { width: 80, height: 80 }) }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={20} color="#fff" />
                </View>
              )}
            </View>
            <View style={styles.greetingWrap}>
              <Text style={styles.greetingLabel}>Hello,</Text>
              <Text style={styles.greetingName} numberOfLines={1}>
                {userName}! 👋
              </Text>
            </View>
          </View>

          <View style={styles.appBarRight}>
            {/* Notification bell */}
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={24} color="#fff" />
            </TouchableOpacity>
            {/* Cart icon with badge */}
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('Cart')}
            >
              <Ionicons name="cart-outline" size={24} color="#fff" />
              {cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>
                    {cartCount > 99 ? '99+' : cartCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar in app bar */}
        <TouchableOpacity
          style={styles.searchBar}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Explore')}
        >
          <Ionicons name="search-outline" size={18} color="#999" />
          <Text style={styles.searchPlaceholder}>Search fresh products...</Text>
          <View style={styles.searchFilterBtn}>
            <Ionicons name="options-outline" size={16} color="#388E3C" />
          </View>
        </TouchableOpacity>
      </View>

      {/* ============ Content ============ */}
      {loading ? (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
        >
          {/* Category shimmer */}
          <View style={styles.sectionHeader}>
            <ShimmerBlock width={100} height={16} borderRadius={4} />
          </View>
          <CategoryShimmer />

          {/* Top buys shimmer */}
          <View style={[styles.sectionHeader, { marginTop: 8 }]}>
            <ShimmerBlock width={80} height={16} borderRadius={4} />
          </View>
          <TopBuysShimmer />

          {/* Products shimmer */}
          <View style={[styles.sectionHeader, { marginTop: 16 }]}>
            <ShimmerBlock width={130} height={16} borderRadius={4} />
          </View>
          <ProductGridShimmer />
        </ScrollView>
      ) : (
        <Animated.ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#1B5E20', '#388E3C']}
              tintColor="#1B5E20"
              progressBackgroundColor="#fff"
            />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {/* ====== Categories ====== */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Shop by Category</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Categories')}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {CATEGORIES.map((cat, i) => renderCategoryItem(cat, i))}
          </ScrollView>

          {/* ====== Top Buys ====== */}
          {trending.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🔥 Top Buys</Text>
                <TouchableOpacity onPress={() => navigation.navigate('TrendingPage')}>
                  <Text style={styles.viewAll}>View All</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
              >
                {trending.slice(0, 10).map((item, idx) => renderTopBuyCard(item, idx))}
              </ScrollView>
            </>
          )}

          {/* ====== Featured Products Grid ====== */}
          <View style={[styles.sectionHeader, { marginTop: 8 }]}>
            <Text style={styles.sectionTitle}>
              Fresh Picks{' '}
              <Text style={styles.productCount}>({featuredProducts.length})</Text>
            </Text>
          </View>

          {featuredProducts.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="basket-off-outline" size={64} color="#ccc" />
              <Text style={styles.emptyTitle}>No products available</Text>
              <Text style={styles.emptySubtitle}>Pull down to refresh</Text>
            </View>
          ) : (
            <FlatList
              data={featuredProducts}
              keyExtractor={(item, i) => String(item.product_id || item.id || i)}
              renderItem={renderProductCard}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={{ paddingHorizontal: 16 }}
            />
          )}
        </Animated.ScrollView>
      )}

      {/* Toast */}
      <ToastMessage ref={toastRef} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F8E9',
  },

  /* ===== AppBar ===== */
  appBar: {
    paddingBottom: 14,
    overflow: 'hidden',
  },
  appBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    marginRight: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  greetingWrap: {
    flex: 1,
  },
  greetingLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
  },
  greetingName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  appBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#E53935',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#2E7D32',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },

  /* Search bar */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 25,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  searchPlaceholder: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#999',
  },
  searchFilterBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ===== Content ===== */
  content: {
    flex: 1,
  },

  /* Section headers */
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B5E20',
  },
  productCount: {
    fontSize: 13,
    color: '#888',
    fontWeight: '400',
  },
  viewAll: {
    color: '#43A047',
    fontSize: 13,
    fontWeight: '600',
  },

  /* ===== Categories ===== */
  categoryScroll: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: 14,
    width: 68,
  },
  categoryCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#E8F5E9',
  },
  categoryEmoji: {
    fontSize: 26,
  },
  categoryLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },

  /* ===== Top Buys ===== */
  topBuyCard: {
    width: 155,
    backgroundColor: '#fff',
    borderRadius: 14,
    marginRight: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  topBuyImage: {
    width: '100%',
    height: 120,
  },
  topBuyHeart: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBuyInfo: {
    padding: 10,
  },
  topBuyName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  topBuyFarmer: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  topBuyBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  topBuyPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E20',
  },

  /* ===== Product Grid ===== */
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 3,
  },
  productImageWrapper: {
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: 130,
  },
  noImage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
  },
  productHeart: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  heartBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  productInfo: {
    padding: 10,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
    lineHeight: 17,
  },
  productFarmer: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  productBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E20',
  },
  productUnit: {
    fontSize: 11,
    fontWeight: '400',
    color: '#888',
  },
  addCartBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  addCartBtnDisabled: {
    backgroundColor: '#A5D6A7',
  },
  addCartBtnSuccess: {
    backgroundColor: '#43A047',
    transform: [{ scale: 1.1 }],
  },

  /* ===== Empty ===== */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    color: '#999',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#bbb',
    fontSize: 13,
    marginTop: 4,
  },
});
