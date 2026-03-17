import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, TextInput, Dimensions, ScrollView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../../services/api';
import { useCart } from '../../context/CartContext';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = 82;
const CONTENT_WIDTH = SCREEN_WIDTH - SIDEBAR_WIDTH;
const GRID_CARD_WIDTH = (CONTENT_WIDTH - 36) / 2;

// ---------------------------------------------------------------------------
// Category data
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

const SORT_OPTIONS = [
  { key: 'default', label: 'Default' },
  { key: 'price_asc', label: 'Price: Low → High' },
  { key: 'price_desc', label: 'Price: High → Low' },
  { key: 'name_asc', label: 'Name: A → Z' },
  { key: 'rating', label: 'Top Rated' },
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

function getPrice(product) {
  return Number(product.price || product.current_price || 0);
}

function getVariety(product) {
  return product.variety || product.sub_category || product.tag || null;
}

// ---------------------------------------------------------------------------
// Rating Stars
// ---------------------------------------------------------------------------
const RatingStars = ({ rating, size = 12 }) => {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      {[...Array(5)].map((_, i) => (
        <Ionicons
          key={i}
          name={i < full ? 'star' : i === full && half ? 'star-half' : 'star-outline'}
          size={size}
          color={i < full || (i === full && half) ? '#FFA000' : '#ccc'}
        />
      ))}
      {rating > 0 && (
        <Text style={{ fontSize: size - 1, color: '#888', marginLeft: 3 }}>
          {rating.toFixed(1)}
        </Text>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Categories Screen
// ---------------------------------------------------------------------------
const Categories = ({ navigation, route }) => {
  const { category: initialCategory } = route.params || {};
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();
  const sidebarRef = useRef(null);

  // State
  const [selectedCategory, setSelectedCategory] = useState(
    initialCategory || CATEGORIES[0].name,
  );
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('default');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isGridView, setIsGridView] = useState(true);
  const [selectedVarieties, setSelectedVarieties] = useState(new Set());
  const [addingToCartId, setAddingToCartId] = useState(null);

  // ---------------------------------------------------------------------------
  // Fetch products
  // ---------------------------------------------------------------------------
  const fetchProducts = useCallback(async () => {
    try {
      const res = await api.get('/products', {
        params: { category: selectedCategory },
      });
      const data = res.data?.data || res.data?.products || [];
      setProducts(data);
    } catch (e) {
      console.log('Categories fetch error:', e.message);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    setIsLoading(true);
    setSearchQuery('');
    setSelectedVarieties(new Set());
    fetchProducts();
  }, [selectedCategory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProducts();
  }, [fetchProducts]);

  // ---------------------------------------------------------------------------
  // Variety chips (derived from products)
  // ---------------------------------------------------------------------------
  const varieties = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      const v = getVariety(p);
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [products]);

  const toggleVariety = (v) => {
    setSelectedVarieties((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Filtered + Sorted products
  // ---------------------------------------------------------------------------
  const filteredProducts = useMemo(() => {
    let list = [...products];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.product_name || '').toLowerCase().includes(q) ||
          getFarmerName(p).toLowerCase().includes(q),
      );
    }

    // Variety filter
    if (selectedVarieties.size > 0) {
      list = list.filter((p) => {
        const v = getVariety(p);
        return v && selectedVarieties.has(v);
      });
    }

    // Sort
    switch (sortKey) {
      case 'price_asc':
        list.sort((a, b) => getPrice(a) - getPrice(b));
        break;
      case 'price_desc':
        list.sort((a, b) => getPrice(b) - getPrice(a));
        break;
      case 'name_asc':
        list.sort((a, b) =>
          (a.name || a.product_name || '').localeCompare(b.name || b.product_name || ''),
        );
        break;
      case 'rating':
        list.sort((a, b) => getRating(b) - getRating(a));
        break;
      default:
        break;
    }

    return list;
  }, [products, searchQuery, sortKey, selectedVarieties]);

  // ---------------------------------------------------------------------------
  // Add to cart
  // ---------------------------------------------------------------------------
  const handleAddToCart = useCallback(
    async (product) => {
      const pid = product.id || product.product_id;
      setAddingToCartId(pid);
      try {
        const success = await addToCart(pid, 1);
        if (success) {
          Alert.alert('Added!', `${product.name || 'Product'} added to cart.`, [
            { text: 'OK' },
          ]);
        }
      } catch (e) {
        Alert.alert('Error', 'Failed to add to cart.');
      } finally {
        setAddingToCartId(null);
      }
    },
    [addToCart],
  );

  // ---------------------------------------------------------------------------
  // Category emoji lookup
  // ---------------------------------------------------------------------------
  const categoryEmoji = useMemo(() => {
    const found = CATEGORIES.find((c) => c.name === selectedCategory);
    return found?.emoji || '📦';
  }, [selectedCategory]);

  // ---------------------------------------------------------------------------
  // Render: Sidebar
  // ---------------------------------------------------------------------------
  const renderSidebar = () => (
    <ScrollView
      ref={sidebarRef}
      style={styles.sidebar}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.sidebarContent}
    >
      {CATEGORIES.map((cat) => {
        const isActive = cat.name === selectedCategory;
        return (
          <TouchableOpacity
            key={cat.name}
            onPress={() => setSelectedCategory(cat.name)}
            style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
            activeOpacity={0.7}
          >
            <Text style={styles.sidebarEmoji}>{cat.emoji}</Text>
            <Text
              style={[styles.sidebarText, isActive && styles.sidebarTextActive]}
              numberOfLines={1}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // ---------------------------------------------------------------------------
  // Render: Search + Sort + View Toggle
  // ---------------------------------------------------------------------------
  const renderToolbar = () => (
    <View style={styles.toolbar}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color="#888" style={{ marginLeft: 10 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search in ${selectedCategory}...`}
          placeholderTextColor="#aaa"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ paddingRight: 10 }}>
            <Ionicons name="close-circle" size={18} color="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort + View Toggle Row */}
      <View style={styles.sortRow}>
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setShowSortMenu(!showSortMenu)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="sort" size={16} color="#1B5E20" />
          <Text style={styles.sortBtnText}>
            {SORT_OPTIONS.find((s) => s.key === sortKey)?.label || 'Sort'}
          </Text>
          <Ionicons
            name={showSortMenu ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#666"
          />
        </TouchableOpacity>

        <View style={styles.viewToggle}>
          <TouchableOpacity
            onPress={() => setIsGridView(true)}
            style={[styles.viewToggleBtn, isGridView && styles.viewToggleBtnActive]}
          >
            <Ionicons name="grid-outline" size={16} color={isGridView ? '#1B5E20' : '#888'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsGridView(false)}
            style={[styles.viewToggleBtn, !isGridView && styles.viewToggleBtnActive]}
          >
            <Ionicons name="list-outline" size={16} color={!isGridView ? '#1B5E20' : '#888'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sort Dropdown */}
      {showSortMenu && (
        <View style={styles.sortDropdown}>
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.sortOption, sortKey === option.key && styles.sortOptionActive]}
              onPress={() => {
                setSortKey(option.key);
                setShowSortMenu(false);
              }}
            >
              <Text
                style={[
                  styles.sortOptionText,
                  sortKey === option.key && styles.sortOptionTextActive,
                ]}
              >
                {option.label}
              </Text>
              {sortKey === option.key && (
                <Ionicons name="checkmark" size={16} color="#1B5E20" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Variety Filter Chips */}
      {varieties.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {varieties.map((v) => {
            const isActive = selectedVarieties.has(v);
            return (
              <TouchableOpacity
                key={v}
                onPress={() => toggleVariety(v)}
                style={[styles.chip, isActive && styles.chipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {v}
                </Text>
                {isActive && <Ionicons name="close" size={12} color="#fff" style={{ marginLeft: 4 }} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  // ---------------------------------------------------------------------------
  // Render: Grid Product Card
  // ---------------------------------------------------------------------------
  const renderGridCard = ({ item }) => {
    const imageUri = getProductImage(item);
    const optimized = imageUri ? optimizeImageUrl(imageUri, { width: 300 }) : null;
    const price = getPrice(item);
    const name = item.name || item.product_name || '';
    const rating = getRating(item);
    const farmer = getFarmerName(item);
    const pid = item.id || item.product_id;
    const isAdding = addingToCartId === pid;

    return (
      <TouchableOpacity
        style={styles.gridCard}
        onPress={() =>
          navigation.navigate('ProductDetails', { product: item, productId: pid })
        }
        activeOpacity={0.85}
      >
        {/* Image */}
        {optimized ? (
          <Image source={{ uri: optimized }} style={styles.gridImage} resizeMode="cover" />
        ) : (
          <View style={styles.gridImageFallback}>
            <Text style={{ fontSize: 36 }}>{categoryEmoji}</Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.gridCardBody}>
          <Text style={styles.gridName} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.gridFarmer} numberOfLines={1}>
            {farmer}
          </Text>
          <RatingStars rating={rating} size={11} />
          <View style={styles.gridBottom}>
            <Text style={styles.gridPrice}>₹{price.toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.addCartBtn}
              onPress={() => handleAddToCart(item)}
              disabled={isAdding}
              activeOpacity={0.7}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="cart-outline" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ---------------------------------------------------------------------------
  // Render: List Product Card
  // ---------------------------------------------------------------------------
  const renderListCard = ({ item }) => {
    const imageUri = getProductImage(item);
    const optimized = imageUri ? optimizeImageUrl(imageUri, { width: 200 }) : null;
    const price = getPrice(item);
    const name = item.name || item.product_name || '';
    const rating = getRating(item);
    const farmer = getFarmerName(item);
    const pid = item.id || item.product_id;
    const isAdding = addingToCartId === pid;
    const unit = item.unit || 'kg';

    return (
      <TouchableOpacity
        style={styles.listCard}
        onPress={() =>
          navigation.navigate('ProductDetails', { product: item, productId: pid })
        }
        activeOpacity={0.85}
      >
        {/* Image */}
        {optimized ? (
          <Image source={{ uri: optimized }} style={styles.listImage} resizeMode="cover" />
        ) : (
          <View style={styles.listImageFallback}>
            <Text style={{ fontSize: 28 }}>{categoryEmoji}</Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.listCardBody}>
          <Text style={styles.listName} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.listFarmer} numberOfLines={1}>
            <Ionicons name="person-outline" size={11} color="#888" /> {farmer}
          </Text>
          <RatingStars rating={rating} size={12} />
          <View style={styles.listBottom}>
            <Text style={styles.listPrice}>
              ₹{price.toFixed(2)}
              <Text style={styles.listUnit}>/{unit}</Text>
            </Text>
            <TouchableOpacity
              style={styles.addCartBtnList}
              onPress={() => handleAddToCart(item)}
              disabled={isAdding}
              activeOpacity={0.7}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cart-outline" size={14} color="#fff" />
                  <Text style={styles.addCartBtnListText}>Add</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ---------------------------------------------------------------------------
  // Empty State
  // ---------------------------------------------------------------------------
  const EmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconBg}>
        <Text style={{ fontSize: 48 }}>{categoryEmoji}</Text>
      </View>
      <Text style={styles.emptyTitle}>No Products Found</Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery.trim()
          ? `No results for "${searchQuery}" in ${selectedCategory}`
          : `No ${selectedCategory} available right now`}
      </Text>
      {(searchQuery.trim() || selectedVarieties.size > 0) && (
        <TouchableOpacity
          style={styles.clearFilterBtn}
          onPress={() => {
            setSearchQuery('');
            setSelectedVarieties(new Set());
          }}
        >
          <Ionicons name="refresh-outline" size={16} color="#1B5E20" />
          <Text style={styles.clearFilterText}>Clear Filters</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ---------------------------------------------------------------------------
  // Category Header in Product Area
  // ---------------------------------------------------------------------------
  const ProductHeader = () => (
    <View style={styles.categoryHeaderRow}>
      <Text style={styles.categoryHeader}>
        {categoryEmoji} {selectedCategory}
      </Text>
      <Text style={styles.productCount}>{filteredProducts.length} products</Text>
    </View>
  );

  // ---------------------------------------------------------------------------
  // Main Render
  // ---------------------------------------------------------------------------
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Categories</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Cart')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="cart-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Body: Sidebar + Content */}
      <View style={styles.layout}>
        {/* Left Sidebar */}
        {renderSidebar()}

        {/* Right Content */}
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1B5E20" />
              <Text style={styles.loadingText}>Loading {selectedCategory}...</Text>
            </View>
          ) : isGridView ? (
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => String(item.id || item.product_id)}
              renderItem={renderGridCard}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#1B5E20']}
                  tintColor="#1B5E20"
                />
              }
              ListHeaderComponent={
                <>
                  {renderToolbar()}
                  <ProductHeader />
                </>
              }
              ListEmptyComponent={EmptyState}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => String(item.id || item.product_id)}
              renderItem={renderListCard}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#1B5E20']}
                  tintColor="#1B5E20"
                />
              }
              ListHeaderComponent={
                <>
                  {renderToolbar()}
                  <ProductHeader />
                </>
              }
              ListEmptyComponent={EmptyState}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },

  // Header
  header: {
    backgroundColor: '#1B5E20',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', flex: 1, marginLeft: 14 },

  // Layout
  layout: { flex: 1, flexDirection: 'row' },

  // Sidebar
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
  },
  sidebarContent: { paddingBottom: 20 },
  sidebarItem: {
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#FAFAFA',
  },
  sidebarItemActive: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 3,
    borderLeftColor: '#1B5E20',
  },
  sidebarEmoji: { fontSize: 22 },
  sidebarText: { fontSize: 10, color: '#666', textAlign: 'center', paddingHorizontal: 4 },
  sidebarTextActive: { color: '#1B5E20', fontWeight: '700' },

  // Content area
  content: { flex: 1 },

  // Toolbar
  toolbar: { paddingHorizontal: 10, paddingTop: 10 },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    paddingHorizontal: 8,
    paddingVertical: 0,
    height: 38,
  },

  // Sort row
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sortBtnText: { fontSize: 12, color: '#1B5E20', fontWeight: '500' },

  // View toggle
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  viewToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewToggleBtnActive: {
    backgroundColor: '#E8F5E9',
  },

  // Sort dropdown
  sortDropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  sortOptionActive: { backgroundColor: '#E8F5E9' },
  sortOptionText: { fontSize: 13, color: '#555' },
  sortOptionTextActive: { color: '#1B5E20', fontWeight: '600' },

  // Filter chips
  chipRow: { paddingVertical: 8, gap: 6 },
  chip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#1B5E20', borderColor: '#1B5E20' },
  chipText: { fontSize: 12, color: '#388E3C', fontWeight: '500' },
  chipTextActive: { color: '#fff' },

  // Category header
  categoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 8,
    marginTop: 4,
  },
  categoryHeader: { fontSize: 16, fontWeight: 'bold', color: '#1B5E20' },
  productCount: { fontSize: 12, color: '#888' },

  // Grid Layout
  gridContent: { padding: 10, paddingBottom: 30 },
  gridRow: { justifyContent: 'space-between', marginBottom: 10 },
  gridCard: {
    width: GRID_CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  gridImage: { width: '100%', height: 110 },
  gridImageFallback: {
    width: '100%',
    height: 110,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCardBody: { padding: 8 },
  gridName: { fontSize: 12, fontWeight: '600', color: '#333', lineHeight: 16 },
  gridFarmer: { fontSize: 10, color: '#888', marginTop: 2, marginBottom: 3 },
  gridBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  gridPrice: { fontSize: 14, fontWeight: 'bold', color: '#1B5E20' },
  addCartBtn: {
    backgroundColor: '#4CAF50',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // List Layout
  listContent: { padding: 10, paddingBottom: 30, gap: 8 },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  listImage: { width: 100, height: 110 },
  listImageFallback: {
    width: 100,
    height: 110,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCardBody: { flex: 1, padding: 10, justifyContent: 'space-between' },
  listName: { fontSize: 14, fontWeight: '600', color: '#333', lineHeight: 18 },
  listFarmer: { fontSize: 11, color: '#888', marginTop: 2 },
  listBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  listPrice: { fontSize: 16, fontWeight: 'bold', color: '#1B5E20' },
  listUnit: { fontSize: 12, fontWeight: 'normal', color: '#888' },
  addCartBtnList: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  addCartBtnListText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#888', fontSize: 14, marginTop: 12 },

  // Empty state
  emptyContainer: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 20 },
  emptyIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  clearFilterText: { fontSize: 13, color: '#1B5E20', fontWeight: '600' },
});

export default Categories;
