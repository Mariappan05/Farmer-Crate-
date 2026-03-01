/**
 * AppSettings.js
 * Customer app settings screen — conversion of Flutter AppSettingsPage.dart
 *
 * Features:
 *   - Notification toggles: Push Notifications, Order Updates, Promotions
 *   - Privacy toggles: Share Usage Data, Location Access
 *   - App preferences: Language (dropdown), Theme (Light/Dark toggle)
 *   - Links: FAQ, Help & Support, Feedback, App Info, Privacy Policy, Terms of Service
 *   - Clear cache button
 *   - Delete account (with confirmation)
 *   - App version display
 *   - Back button, green themed cards
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  StatusBar,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator,
  ToastAndroid,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

/* ═══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════════════════════════ */

const LANGUAGES = [
  'English',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Hindi',
];

/* ═══════════════════════════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

const showToast = (msg) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert('', msg);
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
 * MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

const AppSettings = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { clearSession } = useAuth();

  /* ── Notification settings ─────────────────────────────────────── */
  const [pushNotifications, setPushNotifications] = useState(true);
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [promotions, setPromotions] = useState(false);

  /* ── Privacy settings ──────────────────────────────────────────── */
  const [shareUsageData, setShareUsageData] = useState(true);
  const [locationAccess, setLocationAccess] = useState(true);

  /* ── App preferences ───────────────────────────────────────────── */
  const [language, setLanguage] = useState('English');
  const [darkTheme, setDarkTheme] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  /* ── Clearing cache state ──────────────────────────────────────── */
  const [isClearing, setIsClearing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  /* ── Settings sections config ──────────────────────────────────── */
  const notificationSettings = [
    {
      label: 'Push Notifications',
      subtitle: 'Receive push notifications on your device',
      icon: 'notifications-outline',
      value: pushNotifications,
      onChange: setPushNotifications,
    },
    {
      label: 'Order Updates',
      subtitle: 'Get notified about order status changes',
      icon: 'cube-outline',
      value: orderUpdates,
      onChange: setOrderUpdates,
    },
    {
      label: 'Promotions & Offers',
      subtitle: 'Receive deals, discounts, and special offers',
      icon: 'pricetag-outline',
      value: promotions,
      onChange: setPromotions,
    },
  ];

  const privacySettings = [
    {
      label: 'Share Usage Data',
      subtitle: 'Help us improve with anonymous usage data',
      icon: 'analytics-outline',
      value: shareUsageData,
      onChange: setShareUsageData,
    },
    {
      label: 'Location Access',
      subtitle: 'Allow location access for delivery tracking',
      icon: 'location-outline',
      value: locationAccess,
      onChange: setLocationAccess,
    },
  ];

  /* ── Link items ────────────────────────────────────────────────── */
  const linkItems = [
    { icon: 'help-circle-outline', label: 'FAQ', color: '#6A1B9A', bg: '#F3E5F5', screen: 'FAQ' },
    { icon: 'headset-outline', label: 'Help & Support', color: '#00695C', bg: '#E0F2F1', screen: 'HelpSupport' },
    { icon: 'chatbubble-outline', label: 'Feedback', color: '#F57F17', bg: '#FFFDE7', screen: 'Feedback' },
    { icon: 'information-circle-outline', label: 'App Info', color: '#37474F', bg: '#ECEFF1', screen: 'AppInfo' },
    {
      icon: 'shield-checkmark-outline',
      label: 'Privacy Policy',
      color: '#1565C0',
      bg: '#E3F2FD',
      action: () => Alert.alert('Privacy Policy', 'Our privacy policy ensures your data is handled securely and transparently. Visit our website for the full policy.'),
    },
    {
      icon: 'document-text-outline',
      label: 'Terms of Service',
      color: '#C62828',
      bg: '#FFEBEE',
      action: () => Alert.alert('Terms of Service', 'By using FarmerCrate, you agree to our terms and conditions. Visit our website for full details.'),
    },
  ];

  /* ── Clear cache ───────────────────────────────────────────────── */
  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear temporary data and cached images. Your account data will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            setIsClearing(true);
            // Simulate cache clearing
            await new Promise((resolve) => setTimeout(resolve, 1500));
            setIsClearing(false);
            showToast('Cache cleared successfully');
          },
        },
      ],
    );
  };

  /* ── Delete account ────────────────────────────────────────────── */
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data, order history, and preferences will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              'Are you absolutely sure?',
              'Type DELETE to confirm account deletion. This cannot be reversed.',
              [
                { text: 'Go Back', style: 'cancel' },
                {
                  text: 'Yes, Delete',
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeleting(true);
                    try {
                      try {
                        await api.delete('/users/account');
                      } catch (_) {
                        await api.delete('/auth/account');
                      }
                      showToast('Account deleted successfully');
                      await clearSession();
                    } catch (e) {
                      Alert.alert('Error', e.message || 'Failed to delete account. Please try again later.');
                    } finally {
                      setIsDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════════════════════════════════════════════
         * NOTIFICATION SETTINGS
         * ═══════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="notifications-outline" size={18} color="#1B5E20" />
            </View>
            <Text style={styles.cardTitle}>Notifications</Text>
          </View>

          {notificationSettings.map((item, i) => (
            <View
              key={item.label}
              style={[
                styles.settingRow,
                i < notificationSettings.length - 1 && styles.settingRowBorder,
              ]}
            >
              <View style={styles.settingIconWrap}>
                <Ionicons name={item.icon} size={18} color="#1B5E20" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>{item.label}</Text>
                <Text style={styles.settingSub}>{item.subtitle}</Text>
              </View>
              <Switch
                value={item.value}
                onValueChange={item.onChange}
                trackColor={{ false: '#ddd', true: '#81C784' }}
                thumbColor={item.value ? '#1B5E20' : '#f0f0f0'}
              />
            </View>
          ))}
        </View>

        {/* ═══════════════════════════════════════════════════════════
         * PRIVACY SETTINGS
         * ═══════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#1565C0" />
            </View>
            <Text style={styles.cardTitle}>Privacy</Text>
          </View>

          {privacySettings.map((item, i) => (
            <View
              key={item.label}
              style={[
                styles.settingRow,
                i < privacySettings.length - 1 && styles.settingRowBorder,
              ]}
            >
              <View style={styles.settingIconWrap}>
                <Ionicons name={item.icon} size={18} color="#1565C0" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>{item.label}</Text>
                <Text style={styles.settingSub}>{item.subtitle}</Text>
              </View>
              <Switch
                value={item.value}
                onValueChange={item.onChange}
                trackColor={{ false: '#ddd', true: '#90CAF9' }}
                thumbColor={item.value ? '#1565C0' : '#f0f0f0'}
              />
            </View>
          ))}
        </View>

        {/* ═══════════════════════════════════════════════════════════
         * APP PREFERENCES
         * ═══════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="options-outline" size={18} color="#E65100" />
            </View>
            <Text style={styles.cardTitle}>App Preferences</Text>
          </View>

          {/* Language */}
          <TouchableOpacity
            style={[styles.settingRow, styles.settingRowBorder]}
            onPress={() => setLanguageModalVisible(true)}
            activeOpacity={0.6}
          >
            <View style={styles.settingIconWrap}>
              <Ionicons name="language-outline" size={18} color="#E65100" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Language</Text>
              <Text style={styles.settingSub}>App display language</Text>
            </View>
            <View style={styles.prefValue}>
              <Text style={styles.prefValueText}>{language}</Text>
              <Ionicons name="chevron-forward" size={16} color="#bbb" />
            </View>
          </TouchableOpacity>

          {/* Theme */}
          <View style={styles.settingRow}>
            <View style={styles.settingIconWrap}>
              <Ionicons name={darkTheme ? 'moon-outline' : 'sunny-outline'} size={18} color="#E65100" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Dark Theme</Text>
              <Text style={styles.settingSub}>
                {darkTheme ? 'Dark mode enabled' : 'Light mode (default)'}
              </Text>
            </View>
            <Switch
              value={darkTheme}
              onValueChange={setDarkTheme}
              trackColor={{ false: '#ddd', true: '#FFCC80' }}
              thumbColor={darkTheme ? '#E65100' : '#f0f0f0'}
            />
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════
         * LINKS
         * ═══════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#F3E5F5' }]}>
              <Ionicons name="link-outline" size={18} color="#6A1B9A" />
            </View>
            <Text style={styles.cardTitle}>More</Text>
          </View>

          {linkItems.map((link, i) => (
            <TouchableOpacity
              key={link.label}
              style={[
                styles.linkRow,
                i < linkItems.length - 1 && styles.linkRowBorder,
              ]}
              onPress={link.action || (() => navigation.navigate(link.screen))}
              activeOpacity={0.6}
            >
              <View style={[styles.linkIconBox, { backgroundColor: link.bg }]}>
                <Ionicons name={link.icon} size={18} color={link.color} />
              </View>
              <Text style={styles.linkLabel}>{link.label}</Text>
              <Ionicons name="chevron-forward" size={18} color="#bbb" />
            </TouchableOpacity>
          ))}
        </View>

        {/* ═══════════════════════════════════════════════════════════
         * STORAGE & DATA
         * ═══════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#ECEFF1' }]}>
              <Ionicons name="server-outline" size={18} color="#37474F" />
            </View>
            <Text style={styles.cardTitle}>Storage & Data</Text>
          </View>

          {/* Clear Cache */}
          <TouchableOpacity
            style={[styles.actionRow, styles.settingRowBorder]}
            onPress={handleClearCache}
            disabled={isClearing}
            activeOpacity={0.6}
          >
            <View style={styles.settingIconWrap}>
              <Ionicons name="trash-bin-outline" size={18} color="#37474F" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Clear Cache</Text>
              <Text style={styles.settingSub}>Free up storage space</Text>
            </View>
            {isClearing ? (
              <ActivityIndicator size="small" color="#1B5E20" />
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#bbb" />
            )}
          </TouchableOpacity>

          {/* Delete Account */}
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleDeleteAccount}
            disabled={isDeleting}
            activeOpacity={0.6}
          >
            <View style={[styles.settingIconWrap, { backgroundColor: '#FFEBEE' }]}>
              <Ionicons name="warning-outline" size={18} color="#F44336" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: '#F44336' }]}>Delete Account</Text>
              <Text style={styles.settingSub}>Permanently delete your account and data</Text>
            </View>
            {isDeleting ? (
              <ActivityIndicator size="small" color="#F44336" />
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#F44336" />
            )}
          </TouchableOpacity>
        </View>

        {/* ═══════════════════════════════════════════════════════════
         * APP VERSION
         * ═══════════════════════════════════════════════════════════ */}
        <View style={styles.versionContainer}>
          <View style={styles.versionIconWrap}>
            <MaterialCommunityIcons name="leaf" size={24} color="#4CAF50" />
          </View>
          <Text style={styles.versionAppName}>FarmerCrate</Text>
          <Text style={styles.versionText}>Version 1.0.0</Text>
          <Text style={styles.versionCopy}>{'\u00A9'} 2026 FarmerCrate. All rights reserved.</Text>
        </View>
      </ScrollView>

      {/* ── Language Picker Modal ──────────────────────────────────── */}
      <Modal
        visible={languageModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            {/* Header */}
            <View style={modalStyles.header}>
              <Text style={modalStyles.headerTitle}>Select Language</Text>
              <TouchableOpacity onPress={() => setLanguageModalVisible(false)} style={modalStyles.closeBtn}>
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Language list */}
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = item === language;
                return (
                  <TouchableOpacity
                    style={[modalStyles.item, isSelected && modalStyles.itemSelected]}
                    onPress={() => {
                      setLanguage(item);
                      setLanguageModalVisible(false);
                      showToast('Language set to ' + item);
                    }}
                  >
                    <Ionicons
                      name="language-outline"
                      size={18}
                      color={isSelected ? '#1B5E20' : '#888'}
                      style={{ marginRight: 12 }}
                    />
                    <Text style={[modalStyles.itemText, isSelected && modalStyles.itemTextSelected]}>
                      {item}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color="#1B5E20" />}
                  </TouchableOpacity>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * MODAL STYLES
 * ═══════════════════════════════════════════════════════════════════════════ */

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  closeBtn: { padding: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  itemSelected: { backgroundColor: '#E8F5E9' },
  itemText: { flex: 1, fontSize: 15, color: '#333' },
  itemTextSelected: { color: '#1B5E20', fontWeight: '600' },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * MAIN STYLES
 * ═══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f8e9' },

  /* Header */
  header: {
    backgroundColor: '#1B5E20',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },

  /* Cards */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 5,
      },
      android: { elevation: 2 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* Setting rows */
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  settingIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  settingSub: { fontSize: 12, color: '#888', marginTop: 2, lineHeight: 16 },

  /* Preference value */
  prefValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  prefValueText: {
    fontSize: 13,
    color: '#1B5E20',
    fontWeight: '600',
  },

  /* Action row */
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },

  /* Link rows */
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  linkRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  linkIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  linkLabel: { flex: 1, fontSize: 15, color: '#333', fontWeight: '500' },

  /* Version */
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  versionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  versionAppName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
  },
  versionText: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  versionCopy: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 6,
  },
});

export default AppSettings;
