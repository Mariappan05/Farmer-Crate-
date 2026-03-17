import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  StatusBar,
  Switch,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';

const InfoRow = ({ icon, mcIcon, label, value }) => (
  <View style={styles.infoRow}>
    <View style={styles.infoIconWrap}>
      {mcIcon ? (
        <MaterialCommunityIcons name={mcIcon} size={20} color="#1B5E20" />
      ) : (
        <Ionicons name={icon} size={20} color="#1B5E20" />
      )}
    </View>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value || 'N/A'}
      </Text>
    </View>
  </View>
);

const MenuRow = ({ icon, mcIcon, label, sublabel, onPress, danger, rightElement }) => (
  <TouchableOpacity
    style={styles.menuRow}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[styles.menuIconWrap, danger && { backgroundColor: '#FFEBEE' }]}>
      {mcIcon ? (
        <MaterialCommunityIcons name={mcIcon} size={22} color={danger ? '#C62828' : '#1B5E20'} />
      ) : (
        <Ionicons name={icon} size={22} color={danger ? '#C62828' : '#1B5E20'} />
      )}
    </View>
    <View style={styles.menuContent}>
      <Text style={[styles.menuLabel, danger && { color: '#C62828' }]}>{label}</Text>
      {!!sublabel && <Text style={styles.menuSublabel}>{sublabel}</Text>}
    </View>
    {rightElement || <Ionicons name="chevron-forward" size={18} color="#bbb" />}
  </TouchableOpacity>
);

const AdminProfile = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState, clearSession } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const user = authState?.user || {};
  const name = user.full_name || user.name || 'Admin';
  const email = user.email || 'N/A';
  const phone = user.mobile_number || user.phone || 'N/A';
  const role = user.role || 'Admin';
  const isActive = user.is_active !== false;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const handleLogout = () => setLogoutModalVisible(true);

  const confirmLogout = async () => {
    setLogoutModalVisible(false);
    try { await clearSession(); } catch (e) { console.log('Logout error:', e.message); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <LinearGradient
          colors={['#1B5E20', '#388E3C', '#4CAF50']}
          style={styles.headerGradient}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <Ionicons name="shield-checkmark" size={44} color="#fff" />
            </View>
            <Text style={styles.adminName}>{name}</Text>
            <View style={styles.roleBadge}>
              <MaterialCommunityIcons name="shield-crown" size={14} color="#1B5E20" />
              <Text style={styles.roleBadgeText}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </Text>
            </View>
            {isActive && (
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active Account</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* ── Account Info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          <View style={styles.card}>
            <InfoRow icon="mail-outline" label="Email Address" value={email} />
            <View style={styles.divider} />
            <InfoRow icon="call-outline" label="Mobile Number" value={phone} />
            <View style={styles.divider} />
            <InfoRow
              mcIcon="shield-account"
              label="Role"
              value={role.charAt(0).toUpperCase() + role.slice(1)}
            />
            {!!user.last_login && (
              <>
                <View style={styles.divider} />
                <InfoRow
                  icon="time-outline"
                  label="Last Login"
                  value={formatDate(user.last_login)}
                />
              </>
            )}
            {!!user.created_at && (
              <>
                <View style={styles.divider} />
                <InfoRow
                  icon="calendar-outline"
                  label="Account Created"
                  value={formatDate(user.created_at)}
                />
              </>
            )}
          </View>
        </View>

        {/* ── Preferences ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            <MenuRow
              icon="notifications-outline"
              label="Push Notifications"
              sublabel="Receive alerts for new orders and users"
              rightElement={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{ false: '#ddd', true: '#A5D6A7' }}
                  thumbColor={notificationsEnabled ? '#1B5E20' : '#f4f3f4'}
                />
              }
            />
          </View>
        </View>

        {/* ── Navigation ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Links</Text>
          <View style={styles.card}>
            <MenuRow
              icon="people-outline"
              label="User Management"
              sublabel="Manage customers, farmers, transporters"
              onPress={() => navigation.navigate('AdminTabs', { screen: 'Users' })}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="receipt-outline"
              label="Orders"
              sublabel="View and track all orders"
              onPress={() => navigation.navigate('AdminTabs', { screen: 'Orders' })}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="checkmark-circle-outline"
              label="Verifications"
              sublabel="Pending approvals"
              onPress={() => navigation.navigate('AdminTabs', { screen: 'Verification' })}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="bar-chart-outline"
              label="Reports"
              sublabel="Analytics and insights"
              onPress={() => navigation.navigate('AdminTabs', { screen: 'Reports' })}
            />
          </View>
        </View>

        {/* ── Logout ── */}
        <View style={[styles.section, { marginBottom: 30 }]}>
          <View style={styles.card}>
            <MenuRow
              icon="log-out-outline"
              label="Logout"
              sublabel="Sign out of your account"
              onPress={handleLogout}
              danger
            />
          </View>
        </View>
      </ScrollView>

      {/* ─── Logout Confirmation Modal ─── */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.logoutOverlay}>
          <View style={styles.logoutModal}>
            <View style={styles.logoutIconCircle}>
              <Ionicons name="log-out-outline" size={36} color="#fff" />
            </View>
            <Text style={styles.logoutModalTitle}>Sign Out</Text>
            <Text style={styles.logoutModalMsg}>
              Are you sure you want to sign out from your account?
            </Text>
            <View style={styles.logoutModalBtns}>
              <TouchableOpacity
                style={styles.logoutCancelBtn}
                onPress={() => setLogoutModalVisible(false)}
              >
                <Text style={styles.logoutCancelText}>Stay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutConfirmBtn}
                onPress={confirmLogout}
              >
                <Ionicons name="log-out-outline" size={16} color="#fff" />
                <Text style={styles.logoutConfirmText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  headerGradient: {
    paddingBottom: 36,
  },
  backBtn: {
    margin: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  adminName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
    gap: 4,
  },
  roleBadgeText: {
    fontSize: 13,
    color: '#1B5E20',
    fontWeight: '600',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#69F0AE',
  },
  activeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },

  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  divider: { height: 1, backgroundColor: '#F5F5F5', marginHorizontal: 16 },

  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#333', fontWeight: '500' },

  // Menu row
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuContent: { flex: 1 },
  menuLabel: { fontSize: 14, color: '#333', fontWeight: '500' },
  menuSublabel: { fontSize: 12, color: '#888', marginTop: 2 },

  // Logout Modal
  logoutOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  logoutModal: { width: '82%', backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', elevation: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16 },
  logoutIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: '#E53935', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  logoutModalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  logoutModalMsg: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  logoutModalBtns: { flexDirection: 'row', width: '100%', gap: 12 },
  logoutCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F5F5F5', alignItems: 'center' },
  logoutCancelText: { fontSize: 15, color: '#555', fontWeight: '600' },
  logoutConfirmBtn: { flex: 1.5, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E53935', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, elevation: 4, shadowColor: '#E53935', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
  logoutConfirmText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});

export default AdminProfile;
