/**
 * LocationPickerModal.js
 *
 * Pure React-Native location search picker — NO react-native-maps, NO WebView.
 * Uses Nominatim (OpenStreetMap) for search + reverse geocoding.
 * Uses expo-location for optional GPS detection.
 *
 * Why no MapView: react-native-maps initialises Google Maps SDK at render-time
 * which hard-crashes the app without a valid Google API key in the APK.
 * This implementation is completely Google-free and needs no API key.
 *
 * Props:
 *   visible    {boolean}
 *   onClose    {() => void}
 *   onConfirm  {(fields) => void}
 *     fields = { address, city, pincode, zone, state, district }
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import axios from 'axios';

const NOM  = 'https://nominatim.openstreetmap.org';
const HDR  = { 'User-Agent': 'FarmerCrate/1.0 (farmercrate@app)', Accept: 'application/json' };

// ── Parse a Nominatim address object into our form fields ─────────────────────
function parseNominatim(addr, displayName) {
  return {
    address:  displayName || '',
    city:     addr.city || addr.town || addr.village || addr.municipality || addr.county || '',
    pincode:  addr.postcode || '',
    zone:     addr.suburb || addr.neighbourhood || addr.village || addr.hamlet || '',
    state:    addr.state || '',
    district: addr.state_district || addr.district || addr.county || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LocationPickerModal({ visible, onClose, onConfirm }) {
  const insets = useSafeAreaInsets();

  // ── State ─────────────────────────────────────────────────────────────────
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [gpsLoading,   setGpsLoading]   = useState(false);
  const [selected,     setSelected]     = useState(null);   // parsed fields object
  const [showResults,  setShowResults]  = useState(false);
  const debounceRef = useRef(null);
  const inputRef    = useRef(null);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setSearching(false);
      setGpsLoading(false);
      setSelected(null);
      setShowResults(false);
    }
  }, [visible]);

  // ── Nominatim search ──────────────────────────────────────────────────────
  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    console.log('[LocationPicker] Searching Nominatim for:', q);
    try {
      const res = await axios.get(`${NOM}/search`, {
        params: { format: 'json', q: q.trim(), addressdetails: 1, limit: 8, countrycodes: 'in' },
        headers: HDR,
        timeout: 10000,
      });
      console.log('[LocationPicker] Search results count:', res.data?.length);
      setResults(res.data || []);
      setShowResults(true);
    } catch (err) {
      console.error('[LocationPicker] Search error:', err?.message, err?.response?.status);
      setResults([]);
      setShowResults(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback((text) => {
    setQuery(text);
    setShowResults(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length >= 3) {
      debounceRef.current = setTimeout(() => doSearch(text), 600);
    } else {
      setResults([]);
    }
  }, [doSearch]);

  // ── Select a result ───────────────────────────────────────────────────────
  const handleSelect = useCallback((item) => {
    Keyboard.dismiss();
    setShowResults(false);
    const fields = parseNominatim(item.address || {}, item.display_name);
    console.log('[LocationPicker] Selected:', fields);
    setQuery(item.display_name);
    setSelected(fields);
  }, []);

  // ── GPS detect ────────────────────────────────────────────────────────────
  const handleGPS = useCallback(async () => {
    console.log('[LocationPicker] GPS button pressed');
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[LocationPicker] Location permission status:', status);
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to detect your location.');
        console.warn('[LocationPicker] Location permission denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      console.log('[LocationPicker] GPS coords:', latitude, longitude);

      const res = await axios.get(`${NOM}/reverse`, {
        params: { format: 'json', lat: latitude, lon: longitude, addressdetails: 1 },
        headers: HDR,
        timeout: 10000,
      });
      console.log('[LocationPicker] Reverse geocode result:', res.data?.display_name);
      if (res.data?.address) {
        const fields = parseNominatim(res.data.address, res.data.display_name);
        setQuery(res.data.display_name || '');
        setSelected(fields);
        setShowResults(false);
      } else {
        Alert.alert('Error', 'Could not find address for your location.');
        console.error('[LocationPicker] Reverse geocode returned no address:', res.data);
      }
    } catch (err) {
      console.error('[LocationPicker] GPS error:', err?.message, err?.code);
      Alert.alert('GPS Error', err?.message || 'Could not detect location. Check location permissions and try again.');
    } finally {
      setGpsLoading(false);
    }
  }, []);

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!selected) {
      Alert.alert('Nothing selected', 'Search or detect your location first.');
      return;
    }
    console.log('[LocationPicker] Confirming selection:', selected);
    onConfirm(selected);
  }, [selected, onConfirm]);

  // ── Render a single search result row ─────────────────────────────────────
  const renderResult = ({ item }) => {
    const parts = item.display_name.split(',');
    const main  = parts.slice(0, 2).join(',').trim();
    const sub   = parts.slice(2, 5).join(',').trim();
    return (
      <TouchableOpacity style={styles.resultRow} onPress={() => handleSelect(item)} activeOpacity={0.7}>
        <View style={styles.resultIcon}>
          <Ionicons name="location-outline" size={18} color="#43A047" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.resultMain} numberOfLines={1}>{main}</Text>
          {sub ? <Text style={styles.resultSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />

        {/* ── Header ── */}
        <LinearGradient colors={['#2E7D32', '#43A047']} style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}
            hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Choose Location</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── GPS Button ── */}
            <TouchableOpacity
              style={styles.gpsBtn}
              onPress={handleGPS}
              disabled={gpsLoading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#1565C0', '#1976D2']} style={styles.gpsBtnInner}>
                {gpsLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="locate" size={20} color="#fff" />}
                <Text style={styles.gpsBtnText}>
                  {gpsLoading ? 'Detecting location…' : 'Detect My Current Location'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR SEARCH</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* ── Search bar ── */}
            <View style={styles.searchBarWrapper}>
              <Ionicons name="search-outline" size={20} color="#666" style={{ marginRight: 8 }} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder="Type city, area, pincode…"
                placeholderTextColor="#999"
                value={query}
                onChangeText={handleQueryChange}
                returnKeyType="search"
                onSubmitEditing={() => doSearch(query)}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {searching
                ? <ActivityIndicator size="small" color="#43A047" style={{ marginLeft: 6 }} />
                : query.length > 0
                  ? <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setShowResults(false); setSelected(null); }}>
                      <Ionicons name="close-circle" size={20} color="#bbb" />
                    </TouchableOpacity>
                  : null
              }
            </View>

            {/* ── Search result list ── */}
            {showResults && results.length > 0 && (
              <View style={styles.resultsList}>
                {results.map((item, idx) => (
                  <View key={idx}>
                    {renderResult({ item })}
                    {idx < results.length - 1 && <View style={styles.resultSep} />}
                  </View>
                ))}
              </View>
            )}
            {showResults && results.length === 0 && !searching && (
              <View style={styles.noResults}>
                <Ionicons name="search-outline" size={22} color="#bbb" />
                <Text style={styles.noResultsText}>No results found. Try a different search.</Text>
              </View>
            )}

            {/* ── Selected location card ── */}
            {selected && (
              <View style={styles.selectedCard}>
                <View style={styles.selectedHeader}>
                  <Ionicons name="checkmark-circle" size={20} color="#43A047" />
                  <Text style={styles.selectedHeaderText}>Location Selected</Text>
                </View>

                <View style={styles.fieldRow}>
                  <MaterialCommunityIcons name="city" size={16} color="#666" style={styles.fieldIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>City</Text>
                    <Text style={styles.fieldValue}>{selected.city || '—'}</Text>
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <Ionicons name="business-outline" size={16} color="#666" style={styles.fieldIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>District</Text>
                    <Text style={styles.fieldValue}>{selected.district || '—'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>State</Text>
                    <Text style={styles.fieldValue}>{selected.state || '—'}</Text>
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <Ionicons name="map-outline" size={16} color="#666" style={styles.fieldIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Zone / Area</Text>
                    <Text style={styles.fieldValue}>{selected.zone || '—'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Pincode</Text>
                    <Text style={styles.fieldValue}>{selected.pincode || '—'}</Text>
                  </View>
                </View>

                <View style={[styles.fieldRow, { borderBottomWidth: 0 }]}>
                  <Ionicons name="home-outline" size={16} color="#666" style={styles.fieldIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Full Address</Text>
                    <Text style={styles.fieldValue} numberOfLines={3}>{selected.address || '—'}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Spacer for confirm button */}
            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Confirm button (floating footer) ── */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selected}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={selected ? ['#2E7D32', '#43A047'] : ['#A5D6A7', '#A5D6A7']}
              style={styles.confirmBtnInner}
            >
              <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
              <Text style={styles.confirmBtnText}>Use This Location</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7F5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 3,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  body: { padding: 16 },

  // GPS button
  gpsBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  gpsBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14, gap: 10,
  },
  gpsBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#DDD' },
  dividerText: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1 },

  // Search bar
  searchBarWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 8,
    borderWidth: 1.5, borderColor: '#C8E6C9',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 3,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#212121', paddingVertical: 0 },

  // Results
  resultsList: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E0E0E0',
    overflow: 'hidden', marginBottom: 16,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 5,
  },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  resultIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center',
    marginRight: 12, marginTop: 1, flexShrink: 0,
  },
  resultMain: { fontSize: 14, fontWeight: '600', color: '#212121', marginBottom: 2 },
  resultSub:  { fontSize: 12, color: '#777' },
  resultSep:  { height: 1, backgroundColor: '#F0F0F0', marginLeft: 58 },

  noResults: {
    alignItems: 'center', paddingVertical: 24, gap: 8,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 16,
  },
  noResultsText: { fontSize: 13, color: '#999', textAlign: 'center' },

  // Selected card
  selectedCard: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#A5D6A7',
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#43A047', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 5,
  },
  selectedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E8F5E9', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#C8E6C9',
  },
  selectedHeaderText: { fontSize: 14, fontWeight: '700', color: '#2E7D32' },
  fieldRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  fieldIcon: { marginRight: 12, marginTop: 2, flexShrink: 0 },
  fieldLabel: { fontSize: 11, color: '#888', marginBottom: 3, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { fontSize: 14, color: '#1A1A1A', fontWeight: '500' },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#E8F5E9',
    elevation: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1, shadowRadius: 6,
  },
  confirmBtn: { borderRadius: 14, overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.55 },
  confirmBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14, gap: 10,
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
});
