import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Modal,
  RefreshControl,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Share,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useCart } from '../../context/CartContext';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_WIDTH * 0.85;
const RELATED_CARD_WIDTH = 160;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseImages(product) {
  if (!product) return [];
  const imgs = product.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    return imgs
      .map((i) => (typeof i === 'string' ? i : i?.image_url || i?.url || null))
      .filter(Boolean);
  }
  const raw = product.image_url || '';
  if (!raw) return [];
  const parts = raw.includes('|||') ? raw.split('|||') : raw.split(',');
  return parts.map((s) => s.trim()).filter(Boolean);
}

function getFarmerName(product) {
  return (
    product.farmer_name ||
    product.farmer?.name ||
    product.farmer?.full_name ||
    product.user?.full_name ||
    product.user?.name ||
    'Local Farmer'
  );
}

function getFarmerLocation(product) {
  return (
    product.farmer_location ||
    product.farmer?.address ||
    product.farmer?.district ||
    product.user?.city ||
    product.user?.location ||
    product.user?.address ||
    product.user?.district ||
    product.location ||
    product.city ||
    product.district ||
    ''
  );
}

function getFarmName(product) {
  return product.farm_name || product.farmer?.farm_name || product.user?.farm_name || '';
}

function getFarmerPhone(product) {
  return (
    product.farmer_phone ||
    product.farmer?.mobile_number ||
    product.farmer?.phone ||
    product.user?.phone ||
    product.user?.mobile_number ||
    product.user?.mobile ||
    ''
  );
}

function getFarmerGlobalId(product) {
  return product.global_farmer_id || product.user?.global_farmer_id || '';
}

function getFarmerVerified(product) {
  return (
    product.is_verified ||
    product.user?.is_verified ||
    product.user?.verified ||
    false
  );
}

function getRating(product) {
  const r = product.average_rating || product.rating || 0;
  return Math.min(5, Math.max(0, parseFloat(r) || 0));
}

function getReviewCount(product) {
  return product.review_count || product.total_reviews || product.reviews_count || 0;
}

// ---------------------------------------------------------------------------
// Star Rating
// ---------------------------------------------------------------------------
const StarRating = ({ rating = 0, size = 16, color = '#FFC107' }) => {
  const stars = [];
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  for (let i = 0; i < 5; i++) {
    if (i < full) stars.push(<Ionicons key={i} name="star" size={size} color={color} />);
    else if (i === full && half) stars.push(<Ionicons key={i} name="star-half" size={size} color={color} />);
    else stars.push(<Ionicons key={i} name="star-outline" size={size} color="#ccc" />);
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{stars}</View>;
};

// ---------------------------------------------------------------------------
// Image Carousel
// ---------------------------------------------------------------------------
const ImageCarousel = ({ images, onBack, isWished, onToggleWish, onShare }) => {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);

  const onScroll = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(idx);
  }, []);

  const optimizedImages = images.map((url) =>
    optimizeImageUrl(url, { width: 800, height: 800 })
  );

  return (
    <View style={styles.carouselContainer}>
      {optimizedImages.length > 0 ? (
        <FlatList
          data={optimizedImages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <Image source={{ uri: item }} style={styles.carouselImage} resizeMode="cover" />
          )}
        />
      ) : (
        <View style={[styles.carouselImage, styles.noImage]}>
          <Ionicons name="leaf-outline" size={64} color="#66BB6A" />
          <Text style={{ color: '#999', marginTop: 8 }}>No image available</Text>
        </View>
      )}

      {images.length > 1 && (
        <View style={styles.dotsContainer}>
          {images.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>
      )}

      <View style={[styles.carouselOverlay, { top: insets.top + 8 }]}>
        <TouchableOpacity style={styles.overlayBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={styles.overlayBtn} onPress={onShare}>
            <Ionicons name="share-social-outline" size={20} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.overlayBtn} onPress={onToggleWish}>
            <Ionicons
              name={isWished ? 'heart' : 'heart-outline'}
              size={20}
              color={isWished ? '#E53935' : '#333'}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Related Product Card
// ---------------------------------------------------------------------------
const RelatedProductCard = ({ item, onPress }) => {
  const imgUrl =
    Array.isArray(item.images) && item.images.length > 0
      ? typeof item.images[0] === 'string'
        ? item.images[0]
        : item.images[0]?.image_url
      : item.image_url;
  const optimized = imgUrl ? optimizeImageUrl(imgUrl, { width: 300, height: 300 }) : null;

  return (
    <TouchableOpacity
      style={styles.relatedCard}
      activeOpacity={0.85}
      onPress={() => onPress(item)}
    >
      {optimized ? (
        <Image source={{ uri: optimized }} style={styles.relatedImage} resizeMode="cover" />
      ) : (
        <View style={[styles.relatedImage, styles.noImageSmall]}>
          <Ionicons name="leaf-outline" size={28} color="#66BB6A" />
        </View>
      )}
      <View style={styles.relatedInfo}>
        <Text style={styles.relatedName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.relatedPrice}>
          ₹{item.current_price || item.price || 0}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function ProductDetails({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { addToCart, fetchCart } = useCart();

  const productId = route.params?.productId;
  const passedProduct = route.params?.product;

  const toastRef = useRef(null);
  const [product, setProduct] = useState(passedProduct || null);
  const [loading, setLoading] = useState(!passedProduct);
  const [refreshing, setRefreshing] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isWished, setIsWished] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartSuccessVisible, setCartSuccessVisible] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // --------------------------------------------------
  // Data fetching
  // --------------------------------------------------
  useEffect(() => {
    if (productId) {
      fetchProductDetails();
      checkWishlistStatus();
    }
  }, [productId]);

  useEffect(() => {
    if (product?.category) {
      fetchRelatedProducts(product.category, product.product_id || product.id);
    }
  }, [product?.category]);

  const fetchProductDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(/products/+productId);
      const data = res.data?.data || res.data;
      if (data) setProduct(data);
    } catch (e) {
      console.log('Product details error:', e.message);
      if (!passedProduct) Alert.alert('Error', 'Failed to load product details');
    } finally {
      setLoading(false);
    }
  };

  const checkWishlistStatus = async () => {
    try {
      const res = await api.get('/wishlist');
      const items = res.data?.data || res.data || [];
      const found = items.some(
        (w) =>
          String(w.product_id || w.product?.product_id || w.product?.id) ===
          String(productId)
      );
      setIsWished(found);
    } catch (_) {}
  };

  const fetchRelatedProducts = async (category, currentId) => {
    setRelatedLoading(true);
    try {
      const res = await api.get('/products', { params: { category } });
      const data = res.data?.data || res.data || [];
      const filtered = (Array.isArray(data) ? data : []).filter(
        (p) => String(p.product_id || p.id) !== String(currentId)
      );
      setRelatedProducts(filtered.slice(0, 10));
    } catch (_) {}
    finally {
      setRelatedLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProductDetails();
    setRefreshing(false);
  }, [productId]);

  // --------------------------------------------------
  // Actions
  // --------------------------------------------------
  const handleAddToCart = async () => {
    if (addingToCart) return;
    setAddingToCart(true);
    try {
      const pid = product.product_id || product.id;
      const success = await addToCart(pid, quantity);
      if (success) {
        toastRef.current?.show(
          `${product.name} (x${quantity}) added to cart!`,
          'success',
          3000,
        );
        setTimeout(() => setCartSuccessVisible(true), 300);
      } else {
        toastRef.current?.show('Could not add to cart. Please try again.', 'error');
      }
    } catch (e) {
      toastRef.current?.show(e.message || 'Could not add to cart.', 'error');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (buyingNow) return;
    setBuyingNow(true);
    try {
      const pid = product.product_id || product.id;
      const success = await addToCart(pid, quantity);
      if (success) {
        navigation.navigate('Payment');
      } else {
        toastRef.current?.show('Could not proceed. Please try again.', 'error');
      }
    } catch (e) {
      toastRef.current?.show(e.message || 'Something went wrong.', 'error');
    } finally {
      setBuyingNow(false);
    }
  };

  const toggleWishlist = async () => {
    const pid = product.product_id || product.id;
    const prev = isWished;
    setIsWished(!prev);
    try {
      if (prev) {
        await api.delete('/wishlist/' + pid);
      } else {
        await api.post('/wishlist', { product_id: pid });
      }
    } catch {
      setIsWished(prev);
    }
  };

  const handleShare = async () => {
    try {
      const p = product.current_price || product.price || 0;
      const u = product.unit || 'kg';
      await Share.share({
        message: 'Check out ' + product.name + ' on FarmerCrate! \u20B9' + p + '/' + u,
      });
    } catch (_) {}
  };

  const increaseQty = () => {
    const max = product.quantity || product.stock || 99;
    if (quantity < max) setQuantity((q) => q + 1);
  };

  const decreaseQty = () => {
    if (quantity > 1) setQuantity((q) => q - 1);
  };

  const navigateToRelated = (item) => {
    navigation.push('ProductDetails', {
      productId: item.product_id || item.id,
      product: item,
    });
  };

  // --------------------------------------------------
  // Loading state
  // --------------------------------------------------
  if (loading && !product) {
    return (
      <View style={styles.centered}>
        <StatusBar backgroundColor="#1B5E20" barStyle="light-content" />
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ marginTop: 12, color: '#666' }}>Loading product...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <StatusBar backgroundColor="#1B5E20" barStyle="light-content" />
        <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#ccc" />
        <Text style={{ marginTop: 12, color: '#666', fontSize: 16 }}>Product not found</Text>
        <TouchableOpacity style={styles.goBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --------------------------------------------------
  // Derived data
  // --------------------------------------------------
  const images = parseImages(product);
  const price = product.current_price || product.price || 0;
  const unit = product.unit || 'kg';
  const rating = getRating(product);
  const reviewCount = getReviewCount(product);
  const farmerName = getFarmerName(product);
  const farmerLocation = getFarmerLocation(product);
  const farmName = getFarmName(product);
  const farmerPhone = getFarmerPhone(product);
  const farmerGlobalId = getFarmerGlobalId(product);
  const farmerVerified = getFarmerVerified(product);
  const inStock = (product.quantity || product.stock || 0) > 0;
  const description = product.description || 'No description available.';
  const category = product.category || '';

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="transparent" barStyle="dark-content" translucent />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} />
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Image Carousel */}
        <ImageCarousel
          images={images}
          onBack={() => navigation.goBack()}
          isWished={isWished}
          onToggleWish={toggleWishlist}
          onShare={handleShare}
        />

        {/* Product Info */}
        <View style={styles.infoSection}>
          <View style={styles.badgeRow}>
            {category ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{category}</Text>
              </View>
            ) : null}
            <View
              style={[styles.stockBadge, inStock ? styles.inStockBadge : styles.outStockBadge]}
            >
              <View
                style={[
                  styles.stockDot,
                  { backgroundColor: inStock ? '#4CAF50' : '#E53935' },
                ]}
              />
              <Text
                style={[styles.stockText, { color: inStock ? '#2E7D32' : '#C62828' }]}
              >
                {inStock ? 'In Stock' : 'Out of Stock'}
              </Text>
            </View>
          </View>

          <Text style={styles.productName}>{product.name}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{price}</Text>
            <Text style={styles.priceUnit}> per {unit}</Text>
          </View>

          <TouchableOpacity style={styles.ratingRow} activeOpacity={0.7}>
            <StarRating rating={rating} size={18} />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
            <Text style={styles.reviewText}>({reviewCount} reviews)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Seller Information Card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seller Information</Text>
          <View style={styles.farmerCard}>
            {/* Avatar */}
            <View style={styles.farmerAvatarWrap}>
              <LinearGradient
                colors={['#4CAF50', '#1B5E20']}
                style={styles.farmerAvatarGrad}
              >
                <Text style={styles.farmerAvatarInitial}>
                  {farmerName.charAt(0).toUpperCase() || 'F'}
                </Text>
              </LinearGradient>
              {farmerVerified && (
                <View style={styles.verifiedDot}>
                  <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                </View>
              )}
            </View>

            {/* Info */}
            <View style={styles.farmerDetails}>
              <View style={styles.farmerNameRow}>
                <Text style={styles.farmerName} numberOfLines={1}>{farmerName}</Text>
                {farmerVerified && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="shield-checkmark" size={10} color="#fff" />
                    <Text style={styles.verifiedBadgeText}>Verified</Text>
                  </View>
                )}
              </View>
              {farmName ? (
                <View style={styles.farmerRow}>
                  <MaterialCommunityIcons name="barn" size={13} color="#4CAF50" />
                  <Text style={styles.farmerSubtext}>{farmName}</Text>
                </View>
              ) : null}
              {farmerLocation ? (
                <View style={styles.farmerRow}>
                  <Ionicons name="location-outline" size={13} color="#FF7043" />
                  <Text style={styles.farmerSubtext} numberOfLines={1}>{farmerLocation}</Text>
                </View>
              ) : null}
              {farmerPhone ? (
                <View style={styles.farmerRow}>
                  <Ionicons name="call-outline" size={13} color="#1565C0" />
                  <Text style={styles.farmerSubtext}>{farmerPhone}</Text>
                </View>
              ) : null}
              {farmerGlobalId ? (
                <View style={styles.farmerRow}>
                  <Ionicons name="id-card-outline" size={13} color="#9C27B0" />
                  <Text style={styles.farmerSubtext}>Farmer ID: {farmerGlobalId}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.descriptionText}>{description}</Text>
        </View>

        <View style={styles.divider} />

        {/* Quantity Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <View style={styles.quantityRow}>
            <TouchableOpacity
              style={[styles.qtyBtn, quantity <= 1 && styles.qtyBtnDisabled]}
              onPress={decreaseQty}
              disabled={quantity <= 1}
            >
              <Ionicons name="remove" size={20} color={quantity <= 1 ? '#ccc' : '#1B5E20'} />
            </TouchableOpacity>
            <View style={styles.qtyDisplay}>
              <Text style={styles.qtyText}>{quantity}</Text>
            </View>
            <TouchableOpacity style={styles.qtyBtn} onPress={increaseQty}>
              <Ionicons name="add" size={20} color="#1B5E20" />
            </TouchableOpacity>
            <Text style={styles.totalText}>
              Total: ₹{(price * quantity).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Related Products</Text>
            <FlatList
              data={relatedProducts}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, i) => String(item.product_id || item.id || i)}
              renderItem={({ item }) => (
                <RelatedProductCard item={item} onPress={navigateToRelated} />
              )}
              contentContainerStyle={{ paddingVertical: 8 }}
            />
          </View>
        )}
        {relatedLoading && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#4CAF50" />
          </View>
        )}
      </ScrollView>

      <ToastMessage ref={toastRef} />

      {/* Bottom Action Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.addToCartBtn, (!inStock || addingToCart) && styles.btnDisabled]}
          onPress={handleAddToCart}
          disabled={!inStock || addingToCart}
          activeOpacity={0.8}
        >
          {addingToCart ? (
            <ActivityIndicator size="small" color="#1B5E20" />
          ) : (
            <>
              <Ionicons name="cart-outline" size={20} color="#1B5E20" />
              <Text style={styles.addToCartText}>Add to Cart</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.buyNowBtn, (!inStock || buyingNow) && styles.btnDisabled]}
          onPress={handleBuyNow}
          disabled={!inStock || buyingNow}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={inStock ? ['#1B5E20', '#388E3C'] : ['#999', '#aaa']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buyNowGradient}
          >
            {buyingNow ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="flash" size={18} color="#fff" />
                <Text style={styles.buyNowText}>Buy Now</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Add-to-Cart Success Modal ── */}
      <Modal
        visible={cartSuccessVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCartSuccessVisible(false)}
      >
        <View style={styles.cartModalOverlay}>
          <View style={styles.cartModalBox}>
            <View style={styles.cartModalIcon}>
              <Ionicons name="checkmark-circle" size={52} color="#4CAF50" />
            </View>
            <Text style={styles.cartModalTitle}>Added to Cart!</Text>
            <Text style={styles.cartModalSub} numberOfLines={2}>
              {product?.name} (x{quantity}) is in your cart.
            </Text>
            <TouchableOpacity
              style={styles.cartModalViewBtn}
              onPress={() => { setCartSuccessVisible(false); navigation.navigate('Cart'); }}
            >
              <Ionicons name="cart" size={18} color="#fff" />
              <Text style={styles.cartModalViewText}>View Cart</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cartModalContinueBtn}
              onPress={() => setCartSuccessVisible(false)}
            >
              <Text style={styles.cartModalContinueText}>Continue Shopping</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F8E9',
  },
  goBackBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 20,
  },
  goBackText: { color: '#fff', fontWeight: '600' },

  /* Carousel */
  carouselContainer: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: '#f5f5f5',
  },
  carouselImage: { width: SCREEN_WIDTH, height: IMAGE_HEIGHT },
  noImage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: '#1B5E20', width: 24, borderRadius: 4 },
  dotInactive: { backgroundColor: 'rgba(0,0,0,0.25)' },
  carouselOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },

  /* Info Section */
  infoSection: { padding: 16 },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: { color: '#1B5E20', fontSize: 12, fontWeight: '600' },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  inStockBadge: { backgroundColor: '#E8F5E9' },
  outStockBadge: { backgroundColor: '#FFEBEE' },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockText: { fontSize: 12, fontWeight: '600' },
  productName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  price: { fontSize: 26, fontWeight: '800', color: '#1B5E20' },
  priceUnit: { fontSize: 14, color: '#888', fontWeight: '500' },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: { fontSize: 15, fontWeight: '700', color: '#333' },
  reviewText: { fontSize: 13, color: '#888' },

  /* Sections */
  divider: { height: 8, backgroundColor: '#F5F5F5' },
  section: { padding: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },

  /* Seller / Farmer Card */
  farmerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8F5E9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
  },
  farmerAvatarWrap: { marginRight: 14, position: 'relative' },
  farmerAvatarGrad: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  farmerAvatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  verifiedDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  farmerDetails: { flex: 1 },
  farmerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  farmerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B2A1B',
    flexShrink: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 2,
  },
  verifiedBadgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },
  farmerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  farmerSubtext: { fontSize: 12, color: '#666', flex: 1 },

  /* Description */
  descriptionText: { fontSize: 14, color: '#555', lineHeight: 22 },

  /* Quantity */
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#1B5E20',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  qtyBtnDisabled: { borderColor: '#ddd' },
  qtyDisplay: {
    minWidth: 48,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F1F8E9',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  qtyText: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  totalText: {
    marginLeft: 'auto',
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E20',
  },

  /* Related Products */
  relatedCard: {
    width: RELATED_CARD_WIDTH,
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    overflow: 'hidden',
  },
  relatedImage: { width: RELATED_CARD_WIDTH, height: 110 },
  noImageSmall: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
  },
  relatedInfo: { padding: 8 },
  relatedName: { fontSize: 13, fontWeight: '600', color: '#333' },
  relatedPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E20',
    marginTop: 2,
  },

  /* Bottom Bar */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 12,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  addToCartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1B5E20',
    backgroundColor: '#fff',
    gap: 6,
  },
  addToCartText: { fontSize: 15, fontWeight: '700', color: '#1B5E20' },
  buyNowBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  buyNowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  buyNowText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.5 },

  /* Add-to-Cart Success Modal */
  cartModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  cartModalBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  cartModalIcon: { marginBottom: 12 },
  cartModalTitle: { fontSize: 22, fontWeight: '800', color: '#1B5E20', marginBottom: 6 },
  cartModalSub: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  cartModalViewBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1B5E20',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  cartModalViewText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cartModalContinueBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#F1F8E9',
  },
  cartModalContinueText: { color: '#388E3C', fontWeight: '600', fontSize: 14 },
});
