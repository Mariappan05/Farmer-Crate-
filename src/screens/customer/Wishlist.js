import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useCart } from '../../context/CartContext';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  return product.farmer_name || product.user?.full_name || product.user?.name || 'Local Farmer';
}

function getRating(product) {
  const r = product.average_rating || product.rating || 0;
  return Math.min(5, Math.max(0, parseFloat(r) || 0));
}

// ---------------------------------------------------------------------------
// Star Rating
// ---------------------------------------------------------------------------
const StarRating = ({ rating = 0, size = 12, color = '#FFC107' }) => {
  const stars = [];
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  for (let i = 0; i < 5; i++) {
    if (i < full) stars.push(<Ionicons key={i} name="star" size={size} color={color} />);
    else if (i === full && half)
      stars.push(<Ionicons key={i} name="star-half" size={size} color={color} />);
    else stars.push(<Ionicons key={i} name="star-outline" size={size} color="#ccc" />);
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{stars}</View>;
};

// ---------------------------------------------------------------------------
// Wishlist Item Card
// ---------------------------------------------------------------------------
const WishlistItemCard = ({
  item,
  onPress,
  onAddToCart,
  onRemove,
  isAddingToCart,
  isRemoving,
}) => {
  const product = item.product || item;
  const imgUrl = getProductImage(product);
  const optimized = imgUrl ? optimizeImageUrl(imgUrl, { width: 200, height: 200 }) : null;
  const name = product.name || product.product_name || 'Unknown';
  const price = product.current_price || product.price || 0;
  const unit = product.unit || 'kg';
  const farmerName = getFarmerName(product);
  const rating = getRating(product);

  return (
    <TouchableOpacity
      style={styles.wishCard}
      activeOpacity={0.9}
      onPress={() => onPress(product)}
    >
      {/* Product Image */}
      {optimized ? (
        <Image source={{ uri: optimized }} style={styles.wishImage} resizeMode="cover" />
      ) : (
        <View style={[styles.wishImage, styles.noImage]}>
          <Ionicons name="leaf-outline" size={28} color="#66BB6A" />
        </View>
      )}

      {/* Info */}
      <View style={styles.wishInfo}>
        <Text style={styles.wishName} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.wishFarmer} numberOfLines={1}>
          {farmerName}
        </Text>
        <View style={styles.wishRatingRow}>
          <StarRating rating={rating} size={12} />
          <Text style={styles.wishRatingText}>{rating.toFixed(1)}</Text>
        </View>
        <Text style={styles.wishPrice}>
          ₹{price}
          <Text style={styles.wishUnit}>/{unit}</Text>
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.wishActions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.cartActionBtn]}
          onPress={() => onAddToCart(item)}
          disabled={isAddingToCart}
        >
          {isAddingToCart ? (
            <ActivityIndicator size="small" color="#1B5E20" />
          ) : (
            <Ionicons name="cart-outline" size={20} color="#1B5E20" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.removeActionBtn]}
          onPress={() => onRemove(item)}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <ActivityIndicator size="small" color="#E53935" />
          ) : (
            <Ionicons name="trash-outline" size={20} color="#E53935" />
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Wishlist({ navigation }) {
  const insets = useSafeAreaInsets();
  const { addToCart, fetchCart } = useCart();

  const [wishlistItems, setWishlistItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingToCart, setAddingToCart] = useState({});
  const [removing, setRemoving] = useState({});
  const toastRef = useRef(null);

  // --------------------------------------------------
  // Data fetching
  // --------------------------------------------------
  useEffect(() => {
    fetchWishlist();
  }, []);

  const fetchWishlist = async () => {
    setLoading(true);
    try {
      const res = await api.get('/wishlist');
      const data = res.data?.data || res.data?.items || res.data || [];
      setWishlistItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('Wishlist error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.get('/wishlist');
      const data = res.data?.data || res.data?.items || res.data || [];
      setWishlistItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('Wishlist refresh error:', e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // --------------------------------------------------
  // Actions
  // --------------------------------------------------
  const handleAddToCart = async (item) => {
    const product = item.product || item;
    const pid = product.product_id || product.id;
    if (addingToCart[pid]) return;
    setAddingToCart((prev) => ({ ...prev, [pid]: true }));
    try {
      const success = await addToCart(pid, 1);
      if (success) {
        toastRef.current?.show((product.name || 'Product') + ' added to cart!', 'success');
      } else {
        toastRef.current?.show('Could not add to cart', 'error');
      }
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to add to cart', 'error');
    } finally {
      setAddingToCart((prev) => ({ ...prev, [pid]: false }));
    }
  };

  const handleRemoveFromWishlist = async (item) => {
    const wid = item.wishlist_id || item.id;
    const pid = item.product_id || item.product?.product_id || item.product?.id;
    const removeId = wid || pid;

    if (removing[removeId]) return;

    Alert.alert(
      'Remove from Wishlist',
      'Are you sure you want to remove this item from your wishlist?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving((prev) => ({ ...prev, [removeId]: true }));
            try {
              await api.delete('/wishlist/' + removeId);
              setWishlistItems((prev) =>
                prev.filter(
                  (w) =>
                    (w.wishlist_id || w.id) !== removeId &&
                    (w.product_id || w.product?.product_id || w.product?.id) !== removeId
                )
              );
            } catch (e) {
              toastRef.current?.show('Failed to remove from wishlist', 'error');
            } finally {
              setRemoving((prev) => ({ ...prev, [removeId]: false }));
            }
          },
        },
      ]
    );
  };

  const navigateToProduct = (product) => {
    navigation.navigate('ProductDetails', {
      productId: product.product_id || product.id,
      product,
    });
  };

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  const renderWishlistItem = ({ item }) => {
    const product = item.product || item;
    const pid = product.product_id || product.id;
    const wid = item.wishlist_id || item.id;

    return (
      <WishlistItemCard
        item={item}
        onPress={navigateToProduct}
        onAddToCart={handleAddToCart}
        onRemove={handleRemoveFromWishlist}
        isAddingToCart={!!addingToCart[pid]}
        isRemoving={!!removing[wid || pid]}
      />
    );
  };

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrapper}>
        <Ionicons name="heart-outline" size={64} color="#ccc" />
      </View>
      <Text style={styles.emptyTitle}>Your Wishlist is Empty</Text>
      <Text style={styles.emptySubtitle}>
        Products you save will appear here. Start browsing to find products you love!
      </Text>
      <TouchableOpacity
        style={styles.browseBtn}
        onPress={() => navigation.navigate('Explore')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#1B5E20', '#388E3C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.browseBtnGradient}
        >
          <Ionicons name="compass-outline" size={20} color="#fff" />
          <Text style={styles.browseBtnText}>Browse Products</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar backgroundColor="#1B5E20" barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#2E7D32', '#388E3C']} style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>My Wishlist</Text>
            <Text style={styles.headerCount}>
              {wishlistItems.length} item{wishlistItems.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={{ marginTop: 12, color: '#888' }}>Loading wishlist...</Text>
        </View>
      ) : (
        <FlatList
          data={wishlistItems}
          keyExtractor={(item, i) =>
            String(item.wishlist_id || item.product_id || item.id || i)
          }
          renderItem={renderWishlistItem}
          contentContainerStyle={[
            styles.listContent,
            wishlistItems.length === 0 && { flex: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#1B5E20', '#388E3C']}
              tintColor="#1B5E20"
            />
          }
          ListEmptyComponent={EmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}
      <ToastMessage ref={toastRef} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F8E9' },

  /* Header */
  header: { paddingHorizontal: 16, paddingVertical: 14 },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerCount: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  /* Loading */
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* List */
  listContent: { padding: 16, paddingBottom: 30 },

  /* Wishlist Card */
  wishCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    alignItems: 'center',
  },
  wishImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
  },
  noImage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
  },
  wishInfo: {
    flex: 1,
    marginLeft: 12,
  },
  wishName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
    marginBottom: 2,
  },
  wishFarmer: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  wishRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  wishRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  wishPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1B5E20',
  },
  wishUnit: {
    fontSize: 12,
    fontWeight: '400',
    color: '#888',
  },

  /* Action Buttons */
  wishActions: {
    gap: 8,
    marginLeft: 8,
  },
  actionBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartActionBtn: {
    backgroundColor: '#E8F5E9',
  },
  removeActionBtn: {
    backgroundColor: '#FFEBEE',
  },

  /* Empty State */
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  browseBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  browseBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
  },
  browseBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
