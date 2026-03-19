import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    Keyboard,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../../context/CartContext';
import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const RECENT_SEARCHES_KEY = '@explore_recent_searches';

const CATEGORIES = [
  { name: 'All', emoji: '🌿' },
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
  return product.farmer_name || product.user?.full_name || product.user?.name || 'Local Farmer';
}

function getRating(product) {
  const r = product.average_rating || product.rating || 0;
  return Math.min(5, Math.max(0, parseFloat(r) || 0));
}

// ---------------------------------------------------------------------------
// Star Rating
// ---------------------------------------------------------------------------
const StarRating = ({ rating = 0, size = 11, color = '#FFC107' }) => {
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
// Product Card (Grid)
// ---------------------------------------------------------------------------
const ProductGridCard = ({ item, onPress, onAddToCart, isAdding }) => {
  const imgUrl = getProductImage(item);
  const optimized = imgUrl ? optimizeImageUrl(imgUrl, { width: 400, height: 400 }) : null;
  const price = item.current_price || item.price || 0;
  const unit = item.unit || 'kg';

  return (
    <TouchableOpacity style={styles.gridCard} activeOpacity={0.9} onPress={() => onPress(item)}>
      <View style={styles.gridImageWrapper}>
        {optimized ? (
          <Image source={{ uri: optimized }} style={styles.gridImage} resizeMode="cover" />
        ) : (
          <View style={[styles.gridImage, styles.noImage]}>
            <Ionicons name="leaf-outline" size={32} color="#66BB6A" />
          </View>
        )}
      </View>
      <View style={styles.gridInfo}>
        <Text style={styles.gridName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.gridFarmer} numberOfLines={1}>
          {getFarmerName(item)}
        </Text>
        <StarRating rating={getRating(item)} size={10} />
        <View style={styles.gridBottom}>
          <Text style={styles.gridPrice}>
            ₹{price}
            <Text style={styles.gridUnit}>/{unit}</Text>
          </Text>
          <TouchableOpacity
            style={[styles.addCartBtn, isAdding && styles.addCartBtnDisabled]}
            onPress={() => onAddToCart(item)}
            disabled={isAdding}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Product Card (List)
// ---------------------------------------------------------------------------
const ProductListCard = ({ item, onPress, onAddToCart, isAdding }) => {
  const imgUrl = getProductImage(item);
  const optimized = imgUrl ? optimizeImageUrl(imgUrl, { width: 200, height: 200 }) : null;
  const price = item.current_price || item.price || 0;
  const unit = item.unit || 'kg';

  return (
    <TouchableOpacity style={styles.listCard} activeOpacity={0.9} onPress={() => onPress(item)}>
      {optimized ? (
        <Image source={{ uri: optimized }} style={styles.listImage} resizeMode="cover" />
      ) : (
        <View style={[styles.listImage, styles.noImageList]}>
          <Ionicons name="leaf-outline" size={24} color="#66BB6A" />
        </View>
      )}
      <View style={styles.listInfo}>
        <Text style={styles.listName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.listFarmer} numberOfLines={1}>
          {getFarmerName(item)}
        </Text>
        <View style={styles.listMeta}>
          <StarRating rating={getRating(item)} size={10} />
          {item.category ? (
            <View style={styles.listCatBadge}>
              <Text style={styles.listCatText}>{item.category}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.listBottom}>
          <Text style={styles.listPrice}>
            ₹{price}
            <Text style={styles.listUnit}>/{unit}</Text>
          </Text>
          <TouchableOpacity
            style={[styles.listCartBtn, isAdding && styles.addCartBtnDisabled]}
            onPress={() => onAddToCart(item)}
            disabled={isAdding}
          >
            <Ionicons name="cart-outline" size={16} color="#1B5E20" />
            <Text style={styles.listCartText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#ccc" style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Explore({ navigation }) {
  const insets = useSafeAreaInsets();
  const { addToCart, fetchCart } = useCart();
  const searchTimerRef = useRef(null);
  const inputRef = useRef(null);

  const [allProducts, setAllProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [viewMode, setViewMode] = useState('grid');
  const [addingToCart, setAddingToCart] = useState({});
  const [recentSearches, setRecentSearches] = useState([]);
  const [showRecent, setShowRecent] = useState(false);
  const [searching, setSearching] = useState(false);

  // --------------------------------------------------
  // Data fetching
  // --------------------------------------------------
  useEffect(() => {
    fetchAllProducts();
    loadRecentSearches();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [allProducts, activeCategory, searchText]);

  const fetchAllProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/products');
      const data = res.data?.data || res.data || [];
      setAllProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('Explore products error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = () => {
    let result = [...allProducts];
    if (activeCategory !== 'All') {
      result = result.filter(
        (p) => (p.category || '').toLowerCase() === activeCategory.toLowerCase()
      );
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q) ||
          (p.farmer_name || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      );
    }
    setFilteredProducts(result);
  };

  const handleSearchAPI = async (query) => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await api.get('/products/search', { params: { q: query.trim() } });
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data) && data.length > 0) {
        setFilteredProducts(data);
      }
    } catch {
      // fallback to local filter already applied
    } finally {
      setSearching(false);
    }
  };

  // Debounced search
  const onSearchChange = (text) => {
    setSearchText(text);
    setShowRecent(text.length === 0);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.trim().length > 0) {
      searchTimerRef.current = setTimeout(() => {
        handleSearchAPI(text);
        saveRecentSearch(text.trim());
      }, 500);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllProducts();
    setRefreshing(false);
  }, []);

  // --------------------------------------------------
  // Recent Searches
  // --------------------------------------------------
  const loadRecentSearches = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch (_) {}
  };

  const saveRecentSearch = async (term) => {
    try {
      const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 10);
      setRecentSearches(updated);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (_) {}
  };

  const clearSearchHistory = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const selectRecentSearch = (term) => {
    setSearchText(term);
    setShowRecent(false);
    handleSearchAPI(term);
  };

  // --------------------------------------------------
  // Actions
  // --------------------------------------------------
  const handleAddToCart = async (product) => {
    const pid = product.product_id || product.id;
    if (addingToCart[pid]) return;
    setAddingToCart((prev) => ({ ...prev, [pid]: true }));
    try {
      await addToCart(pid, 1);
    } catch (e) {
      console.log('Add to cart error:', e.message);
    } finally {
      setAddingToCart((prev) => ({ ...prev, [pid]: false }));
    }
  };

  const navigateToProduct = (product) => {
    Keyboard.dismiss();
    navigation.navigate('ProductDetails', {
      productId: product.product_id || product.id,
      product,
    });
  };

  const selectCategory = (catName) => {
    setActiveCategory(catName);
  };

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  const renderGridItem = ({ item }) => (
    <ProductGridCard
      item={item}
      onPress={navigateToProduct}
      onAddToCart={handleAddToCart}
      isAdding={!!addingToCart[item.product_id || item.id]}
    />
  );

  const renderListItem = ({ item }) => (
    <ProductListCard
      item={item}
      onPress={navigateToProduct}
      onAddToCart={handleAddToCart}
      isAdding={!!addingToCart[item.product_id || item.id]}
    />
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="magnify" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>
        {searchText ? 'No products found' : 'No products available'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {searchText ? 'Try a different search term or category' : 'Pull down to refresh'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar backgroundColor="#103A12" barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Explore</Text>
          <TouchableOpacity
            style={styles.viewToggle}
            onPress={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
          >
            <Ionicons
              name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
              size={22}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color="#999" />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search products, farmers, categories..."
            placeholderTextColor="#bbb"
            value={searchText}
            onChangeText={onSearchChange}
            onFocus={() => setShowRecent(searchText.length === 0)}
            onBlur={() => setTimeout(() => setShowRecent(false), 200)}
            returnKeyType="search"
          />
          {searching && (
            <ActivityIndicator size="small" color="#4CAF50" style={{ marginRight: 4 }} />
          )}
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchText('');
                setShowRecent(false);
                filterProducts();
              }}
            >
              <Ionicons name="close-circle" size={20} color="#ccc" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* Category Chips */}
      <View style={styles.catContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.name}
              style={[styles.catChip, activeCategory === cat.name && styles.catChipActive]}
              onPress={() => selectCategory(cat.name)}
              activeOpacity={0.7}
            >
              <Text style={styles.catEmoji}>{cat.emoji}</Text>
              <Text
                style={[
                  styles.catChipText,
                  activeCategory === cat.name && styles.catChipTextActive,
                ]}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Recent Searches Overlay */}
      {showRecent && recentSearches.length > 0 && (
        <View style={styles.recentContainer}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent Searches</Text>
            <TouchableOpacity onPress={clearSearchHistory}>
              <Text style={styles.clearBtn}>Clear All</Text>
            </TouchableOpacity>
          </View>
          {recentSearches.map((term, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.recentItem}
              onPress={() => selectRecentSearch(term)}
            >
              <Ionicons name="time-outline" size={16} color="#999" />
              <Text style={styles.recentText}>{term}</Text>
              <Ionicons name="arrow-forward-outline" size={14} color="#ccc" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Results Count */}
      <View style={styles.resultsBar}>
        <Text style={styles.resultsText}>
          {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          {activeCategory !== 'All' ? ' in ' + activeCategory : ''}
        </Text>
      </View>

      {/* Product List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={{ marginTop: 12, color: '#888' }}>Loading products...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item, i) => String(item.product_id || item.id || i)}
          renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
          numColumns={viewMode === 'grid' ? 2 : 1}
          key={viewMode}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={[
            styles.listContent,
            filteredProducts.length === 0 && { flex: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#103A12', '#1B5E20', '#2E7D32']}
              tintColor="#1B5E20"
            />
          }
          ListEmptyComponent={EmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EDF6EE' },

  /* Header */
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  viewToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#333', padding: 0 },

  /* Category Chips */
  catContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  catScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F8F4',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  catChipActive: { backgroundColor: '#1B5E20' },
  catEmoji: { fontSize: 14 },
  catChipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  catChipTextActive: { color: '#fff', fontWeight: '600' },

  /* Recent Searches */
  recentContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5EFE6',
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 7,
    zIndex: 10,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recentTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  clearBtn: { fontSize: 13, color: '#E53935', fontWeight: '600' },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  recentText: { flex: 1, fontSize: 14, color: '#555' },

  /* Results Bar */
  resultsBar: { paddingHorizontal: 16, paddingVertical: 8 },
  resultsText: { fontSize: 13, color: '#888' },

  /* Loading */
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Grid Card */
  gridRow: { paddingHorizontal: 16, gap: 12 },
  gridCard: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E3ECE4',
    elevation: 3,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  gridImageWrapper: { position: 'relative' },
  gridImage: {
    width: '100%',
    height: 130,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  noImage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
  },
  gridInfo: { padding: 10 },
  gridName: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 2 },
  gridFarmer: { fontSize: 11, color: '#888', marginBottom: 4 },
  gridBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  gridPrice: { fontSize: 14, fontWeight: '800', color: '#1B5E20' },
  gridUnit: { fontSize: 11, fontWeight: '400', color: '#888' },
  addCartBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCartBtnDisabled: { opacity: 0.5 },

  /* List Card */
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 10,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E3ECE4',
    elevation: 3,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    gap: 12,
  },
  listImage: { width: 80, height: 80, borderRadius: 10 },
  noImageList: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
  },
  listInfo: { flex: 1 },
  listName: { fontSize: 14, fontWeight: '600', color: '#222' },
  listFarmer: { fontSize: 12, color: '#888', marginTop: 2 },
  listMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  listCatBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  listCatText: { fontSize: 10, color: '#1B5E20', fontWeight: '600' },
  listBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  listPrice: { fontSize: 15, fontWeight: '800', color: '#1B5E20' },
  listUnit: { fontSize: 11, fontWeight: '400', color: '#888' },
  listCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  listCartText: { fontSize: 12, fontWeight: '600', color: '#1B5E20' },

  /* Empty State */
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#444', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#888', marginTop: 4 },

  /* List Content */
  listContent: { paddingTop: 4, paddingBottom: 24 },
});
