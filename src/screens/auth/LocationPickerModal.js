/**
 * LocationPickerModal.js
 *
 * ZERO native map dependencies — no react-native-maps, no WebView.
 * Works with the existing dev-client APK without any rebuild.
 *
 * Why: react-native-maps calls MapView.java at native startup which crashes
 * with "API key not found" before any JS runs, so it cannot be caught in JS.
 * This version uses only expo-location + Nominatim HTTP API.
 *
 * Features:
 *  - Nominatim search (debounced, India-restricted)
 *  - GPS "Detect my location" via expo-location
 *  - Selected location preview card (city, district, state, pincode, zone, address)
 *  - Confirm fills all 6 fields in the parent form
 *
 * Props:
 *   visible    {boolean}
 *   onClose    {() => void}
 *   onConfirm  {(fields) => void}
 *     fields = { address, city, pincode, zone, state, district }
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  ScrollView,
  Keyboard,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import axios from 'axios';

const NOM = 'https://nominatim.openstreetmap.org';
const HDR = { 'User-Agent': 'FarmerCrate/1.0 (farmercrate@app)', Accept: 'application/json' };

// ── Parse Nominatim address object → form fields ──────────────────────────────
function parseAddr(addr, displayName) {
  const zone =
    addr.suburb        ||
    addr.neighbourhood ||
    addr.quarter       ||
    addr.locality      ||
    addr.residential   ||
    addr.hamlet        ||
    addr.village       ||
    addr.road          ||
    addr.town          ||
    '';

  return {
    address:  displayName || '',
    city:     addr.city || addr.town || addr.village || addr.municipality || addr.county || '',
    pincode:  addr.postcode || '',
    zone,
    state:    addr.state || '',
    district: addr.state_district || addr.district || addr.county || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LocationPickerModal({ visible, onClose, onConfirm }) {
  const insets      = useSafeAreaInsets();
  const debRef      = useRef(null);
  const inputRef    = useRef(null);

  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [gpsLoading,  setGpsLoading]  = useState(false);
  const [selected,    setSelected]    = useState(null);   // parsed fields
  const [showResults, setShowResults] = useState(false);

  // Reset every time modal is opened
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
    console.log('[LocationPicker] Searching:', q.trim());
    try {
      const res = await axios.get(`${NOM}/search`, {
        params: {
          format: 'json', q: q.trim(),
          addressdetails: 1, limit: 8, countrycodes: 'in',
        },
        headers: HDR,
        timeout: 10000,
      });
      console.log('[LocationPicker] Results:', res.data?.length);
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
    if (debRef.current) clearTimeout(debRef.current);
    if (text.trim().length >= 3) {
      debRef.current = setTimeout(() => doSearch(text), 600);
    } else {
      setResults([]);
    }
  }, [doSearch]);

  // ── Select a search result ────────────────────────────────────────────────
  const handleSelect = useCallback((item) => {
    Keyboard.dismiss();
    setShowResults(false);
    const fields = parseAddr(item.address || {}, item.display_name);
    console.log('[LocationPicker] Selected:', fields.city, '|', fields.district, '| zone:', fields.zone);
    setQuery(item.display_name);
    setSelected(fields);
  }, []);

  // ── GPS detect ────────────────────────────────────────────────────────────
  const handleGPS = useCallback(async () => {
    console.log('[LocationPicker] GPS detect pressed');
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[LocationPicker] Permission:', status);
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to detect your position.');
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
      console.log('[LocationPicker] Reverse geocode:', res.data?.display_name);
      if (res.data?.address) {
        const fields = parseAddr(res.data.address, res.data.display_name);
        console.log('[LocationPicker] GPS fields — zone:', fields.zone, '| city:', fields.city);
        setQuery(res.data.display_name || '');
        setSelected(fields);
        setShowResults(false);
      } else {
        Alert.alert('Error', 'Could not determine address for your location.');
        console.warn('[LocationPicker] Reverse geocode returned no address');
      }
    } catch (err) {
      console.error('[LocationPicker] GPS error:', err?.message, err?.code, err);
      Alert.alert('GPS Error', err?.message || 'Could not detect location. Check permissions.');
    } finally {
      setGpsLoading(false);
    }
  }, []);

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!selected) {
      Alert.alert('No location', 'Search for or detect a location first.');
      return;
    }
    console.log('[LocationPicker] Confirming:', selected);
    onConfirm(selected);
  }, [selected, onConfirm]);

  // ── Result row ────────────────────────────────────────────────────────────
  const renderItem = ({ item, index }) => {
    const parts = item.display_name.split(',');
    const main  = parts.slice(0, 2).join(',').trim();
    const sub   = parts.slice(2, 5).join(',').trim();
    return (
      <TouchableOpacity
        style={[styles.resultRow, index === 0 && { borderTopWidth: 0 }]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.72}
      >
        <View style={styles.resultIconWrap}>
          <Ionicons name="location-outline" size={18} color="#43A047" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.resultMain} numberOfLines={1}>{main}</Text>
          {sub ? <Text style={styles.resultSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#ccc" />
      </TouchableOpacity>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />

        {/* ── Header ── */}
        <LinearGradient colors={['#2E7D32', '#43A047']} style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.backBtn}
            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Choose Location</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── GPS button ── */}
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

          {/* ── Divider ── */}
          <View style={styles.divRow}>
            <View style={styles.divLine} />
            <Text style={styles.divText}>OR SEARCH</Text>
            <View style={styles.divLine} />
          </View>

          {/* ── Search bar ── */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#666" style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Type city, area or pincode…"
              placeholderTextColor="#999"
              value={query}
              onChangeText={handleQueryChange}
              returnKeyType="search"
              onSubmitEditing={() => { if (debRef.current) clearTimeout(debRef.current); doSearch(query); }}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching
              ? <ActivityIndicator size="small" color="#43A047" style={{ marginLeft: 6 }} />
              : query.length > 0
                ? (
                  <TouchableOpacity onPress={() => {
                    setQuery(''); setResults([]); setShowResults(false); setSelected(null);
                  }}>
                    <Ionicons name="close-circle" size={20} color="#bbb" />
                  </TouchableOpacity>
                )
                : null
            }
          </View>

          {/* ── No-results hint ── */}
          {showResults && !searching && results.length === 0 && (
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={22} color="#ccc" />
              <Text style={styles.noResultsText}>No results. Try a different search term.</Text>
            </View>
          )}

          {/* ── Results list ── */}
          {showResults && results.length > 0 && (
            <View style={styles.resultsList}>
              {results.map((item, idx) => (
                <View key={String(idx)}>
                  {renderItem({ item, index: idx })}
                </View>
              ))}
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
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>CITY</Text>
                  <Text style={styles.fieldValue}>{selected.city || '—'}</Text>
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>DISTRICT</Text>
                  <Text style={styles.fieldValue}>{selected.district || '—'}</Text>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>STATE</Text>
                  <Text style={styles.fieldValue}>{selected.state || '—'}</Text>
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>PINCODE</Text>
                  <Text style={styles.fieldValue}>{selected.pincode || '—'}</Text>
                </View>
              </View>

              <View style={[styles.fieldRow, { borderBottomWidth: 0 }]}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>ZONE / AREA</Text>
                  <Text style={styles.fieldValue}>{selected.zone || '—'}</Text>
                </View>
              </View>

              <View style={styles.addrRow}>
                <Ionicons name="home-outline" size={14} color="#888" style={{ marginTop: 2, marginRight: 6 }} />
                <Text style={styles.addrText} numberOfLines={3}>{selected.address}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Fixed footer: confirm button ── */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selected}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={selected ? ['#2E7D32', '#43A047'] : ['#BDBDBD', '#BDBDBD']}
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

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },
  backBtn:     { padding: 4 },
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
  divRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  divLine: { flex: 1, height: 1, backgroundColor: '#D8D8D8' },
  divText: { fontSize: 11, fontWeight: '700', color: '#AAA', letterSpacing: 1 },

  // Search bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 8,
    borderWidth: 1.5, borderColor: '#C8E6C9',
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 3,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#212121', paddingVertical: 0 },

  // No results
  noResults: {
    alignItems: 'center', paddingVertical: 28, gap: 8,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#EEE', marginBottom: 14,
  },
  noResultsText: { fontSize: 13, color: '#AAA' },

  // Results list
  resultsList: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E0E0E0',
    overflow: 'hidden', marginBottom: 16,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 5,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  resultIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center',
    marginRight: 12, flexShrink: 0,
  },
  resultMain: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 2 },
  resultSub:  { fontSize: 12, color: '#777' },

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
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  fieldCol: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 11,
  },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', color: '#999',
    letterSpacing: 0.8, marginBottom: 3, textTransform: 'uppercase',
  },
  fieldValue: { fontSize: 14, fontWeight: '500', color: '#1A1A1A' },

  addrRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: '#FAFAFA',
  },
  addrText: { flex: 1, fontSize: 12, color: '#555', lineHeight: 18 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#E8F5E9',
    elevation: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1, shadowRadius: 6,
  },
  confirmBtn: { borderRadius: 14, overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14, gap: 10,
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
});
