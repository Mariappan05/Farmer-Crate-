/**
 * AdminDashboard.js
 * Full admin dashboard – conversion of Flutter admin_homepage.dart (3022 lines)
 *
 * Features:
 *   - Dashboard stats: Total Farmers, Customers, Transporters, Active Orders, Revenue, Pending Verifications
 *   - Pending farmers / transporters lists with approve / reject
 *   - Quick-action cards navigating to User Management, Orders, Verification, Reports
 *   - Revenue chart (simplified bar chart)
 *   - Recent activity feed
 *   - Admin profile in header
 *   - Pull to refresh
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
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
import { optimizeImageUrl } from '../../services/cloudinaryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const formatCurrency = (v) =>
  '₹' +
  (parseFloat(v) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/* -------------------------------------------------------------------------- */
/*  SHIMMER                                                                    */
/* -------------------------------------------------------------------------- */

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
  const bg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#e0e0e0', '#f5f5f5'],
  });
  return (
    <Animated.View
      style={[{ width: w, height: h, borderRadius, backgroundColor: bg }, style]}
    />
  );
};

/* -------------------------------------------------------------------------- */
/*  STAT CARD                                                                  */
/* -------------------------------------------------------------------------- */

const StatCard = ({ title, value, icon, mcIcon, color, onPress }) => (
  <TouchableOpacity
    style={[styles.statCard, { borderLeftColor: color }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
      {mcIcon ? (
        <MaterialCommunityIcons name={mcIcon} size={24} color={color} />
      ) : (
        <Ionicons name={icon} size={24} color={color} />
      )}
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statTitle} numberOfLines={1}>
      {title}
    </Text>
  </TouchableOpacity>
);

/* -------------------------------------------------------------------------- */
/*  QUICK ACTION                                                               */
/* -------------------------------------------------------------------------- */

const QuickAction = ({ title, icon, mcIcon, color, onPress }) => (
  <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
    <LinearGradient colors={[color, color + 'CC']} style={styles.quickActionGradient}>
      {mcIcon ? (
        <MaterialCommunityIcons name={mcIcon} size={28} color="#fff" />
      ) : (
        <Ionicons name={icon} size={28} color="#fff" />
      )}
    </LinearGradient>
    <Text style={styles.quickActionLabel}>{title}</Text>
  </TouchableOpacity>
);

/* -------------------------------------------------------------------------- */
/*  SIMPLIFIED BAR CHART                                                       */
/* -------------------------------------------------------------------------- */

const SimpleBarChart = ({ data }) => {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartBars}>
        {data.map((d, i) => {
          const pct = (d.value / maxVal) * 100;
          return (
            <View key={i} style={styles.chartBarCol}>
              <Text style={styles.chartBarValue}>
                {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : d.value}
              </Text>
              <View style={styles.chartBarTrack}>
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: `${Math.max(pct, 4)}%`,
                      backgroundColor: d.color || '#4CAF50',
                    },
                  ]}
                />
              </View>
              <Text style={styles.chartBarLabel}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/*  PENDING USER CARD                                                          */
/* -------------------------------------------------------------------------- */

const PendingUserCard = ({ user, type, onApprove, onReject, busy }) => {
  const isFarmer = type === 'farmer';
  return (
    <View style={styles.pendingCard}>
      {/* Header */}
      <View style={styles.pendingCardHeader}>
        <View
          style={[
            styles.pendingAvatar,
            { backgroundColor: isFarmer ? '#E8F5E9' : '#E3F2FD' },
          ]}
        >
          <Ionicons
            name={isFarmer ? 'leaf' : 'car'}
            size={22}
            color={isFarmer ? '#388E3C' : '#1976D2'}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.pendingName}>
            {user.full_name || user.name || 'N/A'}
          </Text>
          <Text style={styles.pendingEmail}>{user.email || ''}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: '#FFF3E0' }]}>
          <Text style={[styles.statusBadgeText, { color: '#E65100' }]}>Pending</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.pendingDetails}>
        {!!user.phone && (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={14} color="#757575" />
            <Text style={styles.detailText}>{user.phone}</Text>
          </View>
        )}
        {isFarmer && !!user.farm_name && (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="barn" size={14} color="#757575" />
            <Text style={styles.detailText}>{user.farm_name}</Text>
          </View>
        )}
        {isFarmer &&
          !!(user.location || user.address || user.farm_location) && (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={14} color="#757575" />
              <Text style={styles.detailText}>
                {user.location || user.address || user.farm_location}
              </Text>
            </View>
          )}
        {!isFarmer && !!user.company_name && (
          <View style={styles.detailRow}>
            <Ionicons name="business-outline" size={14} color="#757575" />
            <Text style={styles.detailText}>{user.company_name}</Text>
          </View>
        )}
        {!isFarmer && !!user.vehicle_type && (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="truck" size={14} color="#757575" />
            <Text style={styles.detailText}>{user.vehicle_type}</Text>
          </View>
        )}
        {!isFarmer &&
          !!(user.documents || user.document_count) && (
            <View style={styles.detailRow}>
              <Ionicons name="document-text-outline" size={14} color="#757575" />
              <Text style={styles.detailText}>
                {user.document_count
                  ? `${user.document_count} documents`
                  : Array.isArray(user.documents)
                    ? `${user.documents.length} documents`
                    : 'Documents submitted'}
              </Text>
            </View>
          )}
      </View>

      {/* Actions */}
      <View style={styles.pendingActions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn]}
          onPress={() => onReject(user)}
          disabled={busy}
          activeOpacity={0.7}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#D32F2F" />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={18} color="#D32F2F" />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.approveBtn]}
          onPress={() => onApprove(user)}
          disabled={busy}
          activeOpacity={0.7}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.approveBtnText}>Approve</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/*  ACTIVITY ITEM                                                              */
/* -------------------------------------------------------------------------- */

const ActivityItem = ({ activity, isLast }) => {
  const icon =
    activity.type === 'order'
      ? 'cart-outline'
      : activity.type === 'user'
        ? 'person-add-outline'
        : activity.type === 'payment'
          ? 'cash-outline'
          : 'information-circle-outline';
  const color =
    activity.type === 'order'
      ? '#FF9800'
      : activity.type === 'user'
        ? '#4CAF50'
        : activity.type === 'payment'
          ? '#00897B'
          : '#2196F3';

  return (
    <View style={[styles.activityRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={[styles.activityIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.activityText}>
          {activity.message || activity.description || 'Activity'}
        </Text>
        <Text style={styles.activityTime}>
          {formatDate(activity.created_at || activity.date)}
        </Text>
      </View>
    </View>
  );
};

/* ========================================================================== */
/*  MAIN COMPONENT                                                             */
/* ========================================================================== */

const AdminDashboard = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState, clearSession } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* state ---------------------------------------------------------------- */
  const [stats, setStats] = useState({
    totalFarmers: 0,
    totalCustomers: 0,
    totalTransporters: 0,
    activeOrders: 0,
    totalRevenue: 0,
    pendingVerifications: 0,
  });
  const [pendingFarmers, setPendingFarmers] = useState([]);
  const [pendingTransporters, setPendingTransporters] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [busyId, setBusyId] = useState(null);

  /* fetch ---------------------------------------------------------------- */
  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      /* analytics / dashboard stats */
      let analyticsData = null;
      try {
        const { data } = await api.get('/admin/dashboard-stats');
        analyticsData = data;
      } catch {
        /* ignored */
      }

      if (analyticsData) {
        const d = analyticsData.data || analyticsData;
        setStats({
          totalFarmers: d.total_farmers ?? d.totalFarmers ?? 0,
          totalCustomers: d.total_customers ?? d.totalCustomers ?? 0,
          totalTransporters: d.total_transporters ?? d.totalTransporters ?? 0,
          activeOrders: d.active_orders ?? d.activeOrders ?? d.total_orders ?? 0,
          totalRevenue: d.total_revenue ?? d.totalRevenue ?? 0,
          pendingVerifications:
            d.pending_verifications ?? d.pendingVerifications ?? 0,
        });
        if (d.revenue_chart || d.revenueChart) {
          const chart = d.revenue_chart || d.revenueChart || [];
          setRevenueData(
            Array.isArray(chart)
              ? chart.map((c) => ({
                  label: c.label || c.month || '',
                  value: c.value || c.revenue || 0,
                  color: '#4CAF50',
                }))
              : [],
          );
        }
        if (d.recent_activity || d.recentActivity) {
          setRecentActivity(d.recent_activity || d.recentActivity || []);
        }
      }

      /* pending farmers */
      try {
        const { data: pf } = await api.get('/admin/farmers/pending');
        setPendingFarmers(Array.isArray(pf) ? pf : pf?.data || []);
      } catch (pfErr) {
        console.error('[AdminDashboard] fetchPendingFarmers error:', pfErr?.response?.data || pfErr?.message, '\nStatus:', pfErr?.response?.status);
        setPendingFarmers([]);
      }

      /* pending transporters */
      try {
        const { data: pt } = await api.get('/admin/transporters/pending');
        setPendingTransporters(Array.isArray(pt) ? pt : pt?.data || []);
      } catch (ptErr) {
        console.error('[AdminDashboard] fetchPendingTransporters error:', ptErr?.response?.data || ptErr?.message, '\nStatus:', ptErr?.response?.status);
        setPendingTransporters([]);
      }
    } catch (e) {
      console.error('[AdminDashboard] fetchDashboard error:', e?.response?.data || e?.message, '\nStatus:', e?.response?.status);
      if (!silent) Alert.alert('Error', e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard(true);
  };

  /* approve / reject ---------------------------------------------------- */
  const handleApproveFarmer = (farmer) => {
    const id = farmer.id || farmer.farmer_id || farmer.user_id;
    Alert.alert('Approve Farmer', `Approve ${farmer.full_name || farmer.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setBusyId(id);
          try {
            try {
              await api.put(`/admin/farmers/${id}/approve`);
            } catch {
              await api.put(`/farmers/${id}/approve`);
            }
            Alert.alert('Success', 'Farmer approved');
            fetchDashboard(true);
          } catch (e) {
            console.error('[AdminDashboard] approveFarmer error:', e?.response?.data || e?.message, '\nStatus:', e?.response?.status);
            Alert.alert('Error', e.message);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const handleRejectFarmer = (farmer) => {
    const id = farmer.id || farmer.farmer_id || farmer.user_id;
    Alert.alert('Reject Farmer', `Reject ${farmer.full_name || farmer.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setBusyId(id);
          try {
            try {
              await api.delete(`/admin/farmers/${id}/reject`);
            } catch {
              await api.delete(`/admin/farmers/${id}`);
            }
            Alert.alert('Rejected', 'Farmer rejected');
            fetchDashboard(true);
          } catch (e) {
            console.error('[AdminDashboard] rejectFarmer error:', e?.response?.data || e?.message, '\nStatus:', e?.response?.status);
            Alert.alert('Error', e.message);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const handleApproveTransporter = (tp) => {
    const id = tp.id || tp.transporter_id || tp.user_id;
    Alert.alert(
      'Approve Transporter',
      `Approve ${tp.full_name || tp.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setBusyId(id);
            try {
              try {
                await api.put(`/admin/transporters/${id}/approve`);
              } catch {
                await api.put(`/transporters/${id}/approve`);
              }
              Alert.alert('Success', 'Transporter approved');
              fetchDashboard(true);
            } catch (e) {
              console.error('[AdminDashboard] approveTransporter error:', e?.response?.data || e?.message, '\nStatus:', e?.response?.status);
              Alert.alert('Error', e.message);
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const handleRejectTransporter = (tp) => {
    const id = tp.id || tp.transporter_id || tp.user_id;
    Alert.alert(
      'Reject Transporter',
      `Reject ${tp.full_name || tp.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setBusyId(id);
            try {
              try {
                await api.delete(`/admin/transporters/${id}/reject`);
              } catch {
                await api.delete(`/admin/transporters/${id}`);
              }
              Alert.alert('Rejected', 'Transporter rejected');
              fetchDashboard(true);
            } catch (e) {
              console.error('[AdminDashboard] rejectTransporter error:', e?.response?.data || e?.message, '\nStatus:', e?.response?.status);
              Alert.alert('Error', e.message);
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  /* revenue fallback ---------------------------------------------------- */
  const chartData =
    revenueData.length > 0
      ? revenueData
      : [
          { label: 'Jan', value: 0, color: '#4CAF50' },
          { label: 'Feb', value: 0, color: '#4CAF50' },
          { label: 'Mar', value: 0, color: '#4CAF50' },
          { label: 'Apr', value: 0, color: '#4CAF50' },
          { label: 'May', value: 0, color: '#4CAF50' },
          { label: 'Jun', value: 0, color: '#4CAF50' },
        ];

  /* loading skeleton ---------------------------------------------------- */
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <LinearGradient
          colors={['#103A12', '#1B5E20', '#2E7D32']}
          style={styles.headerGradient}
        >
          <ShimmerBlock width={180} height={24} style={{ marginTop: 20 }} />
          <ShimmerBlock width={120} height={14} style={{ marginTop: 8 }} />
        </LinearGradient>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={styles.statsGrid}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <ShimmerBlock
                key={i}
                width={(SCREEN_WIDTH - 48) / 2 - 4}
                height={100}
                style={{ marginBottom: 12 }}
              />
            ))}
          </View>
          {[1, 2, 3].map((i) => (
            <ShimmerBlock
              key={i}
              width={SCREEN_WIDTH - 32}
              height={110}
              style={{ marginBottom: 12 }}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  /* ==================================================================== */
  /*  RENDER                                                               */
  /* ==================================================================== */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* ─── HEADER ─── */}
      <LinearGradient
        colors={['#103A12', '#1B5E20', '#2E7D32']}
        style={styles.headerGradient}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerGreeting}>Welcome back,</Text>
            <Text style={styles.headerName}>
              {authState?.user?.full_name || authState?.user?.name || 'Admin'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerAvatar}
            onPress={() => navigation.navigate('AdminProfile')}
          >
            {authState?.user?.profile_image ? (
              <Image
                source={{
                  uri: optimizeImageUrl(authState.user.profile_image, {
                    width: 80,
                  }),
                }}
                style={styles.headerAvatarImg}
              />
            ) : (
              <Ionicons name="person-circle-outline" size={42} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1B5E20']}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ─── STATS GRID ─── */}
        <View style={styles.statsGrid}>
          <StatCard
            title="Farmers"
            value={stats.totalFarmers}
            icon="leaf-outline"
            color="#388E3C"
            onPress={() => navigation.navigate('Users')}
          />
          <StatCard
            title="Customers"
            value={stats.totalCustomers}
            icon="people-outline"
            color="#1976D2"
            onPress={() => navigation.navigate('Users')}
          />
          <StatCard
            title="Transporters"
            value={stats.totalTransporters}
            mcIcon="truck"
            color="#F57C00"
            onPress={() => navigation.navigate('Users')}
          />
          <StatCard
            title="Active Orders"
            value={stats.activeOrders}
            icon="cart-outline"
            color="#7B1FA2"
            onPress={() => navigation.navigate('Orders')}
          />
          <StatCard
            title="Revenue"
            value={formatCurrency(stats.totalRevenue)}
            mcIcon="cash-multiple"
            color="#00897B"
            onPress={() => navigation.navigate('Reports')}
          />
          <StatCard
            title="Pending"
            value={stats.pendingVerifications}
            icon="shield-checkmark-outline"
            color="#D32F2F"
            onPress={() => navigation.navigate('Verification')}
          />
        </View>

        {/* ─── QUICK ACTIONS ─── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsRow}>
          <QuickAction
            title="Users"
            icon="people"
            color="#1B5E20"
            onPress={() => navigation.navigate('Users')}
          />
          <QuickAction
            title="Orders"
            icon="list"
            color="#1976D2"
            onPress={() => navigation.navigate('Orders')}
          />
          <QuickAction
            title="Verify"
            icon="shield-checkmark"
            color="#F57C00"
            onPress={() => navigation.navigate('Verification')}
          />
          <QuickAction
            title="Reports"
            icon="bar-chart"
            color="#7B1FA2"
            onPress={() => navigation.navigate('Reports')}
          />
        </View>

        {/* ─── REVENUE CHART ─── */}
        <Text style={styles.sectionTitle}>Revenue Overview</Text>
        <View style={styles.card}>
          <SimpleBarChart data={chartData} />
        </View>

        {/* ─── PENDING FARMERS ─── */}
        {pendingFarmers.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Pending Farmers</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Verification')}
              >
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {pendingFarmers.slice(0, 3).map((f, i) => (
              <PendingUserCard
                key={f.id || f.farmer_id || i}
                user={f}
                type="farmer"
                onApprove={handleApproveFarmer}
                onReject={handleRejectFarmer}
                busy={busyId === (f.id || f.farmer_id || f.user_id)}
              />
            ))}
          </>
        )}

        {/* ─── PENDING TRANSPORTERS ─── */}
        {pendingTransporters.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Pending Transporters</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Verification')}
              >
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {pendingTransporters.slice(0, 3).map((t, i) => (
              <PendingUserCard
                key={t.id || t.transporter_id || i}
                user={t}
                type="transporter"
                onApprove={handleApproveTransporter}
                onReject={handleRejectTransporter}
                busy={busyId === (t.id || t.transporter_id || t.user_id)}
              />
            ))}
          </>
        )}

        {/* ─── RECENT ACTIVITY ─── */}
        {recentActivity.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <View style={styles.card}>
              {recentActivity.slice(0, 10).map((a, i) => (
                <ActivityItem
                  key={i}
                  activity={a}
                  isLast={i === Math.min(recentActivity.length, 10) - 1}
                />
              ))}
            </View>
          </>
        )}

        {/* ─── EMPTY STATE ─── */}
        {pendingFarmers.length === 0 &&
          pendingTransporters.length === 0 &&
          recentActivity.length === 0 && (
            <View style={styles.emptyWrap}>
              <Ionicons name="checkmark-done-circle" size={56} color="#C8E6C9" />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySubtitle}>
                No pending verifications or recent activity.
              </Text>
            </View>
          )}
      </ScrollView>
    </View>
  );
};

/* ========================================================================== */
/*  STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  /* Header */
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerGreeting: { color: '#C8E6C9', fontSize: 14 },
  headerName: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 2 },
  headerAvatar: { marginLeft: 12 },
  headerAvatarImg: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: '#fff' },

  /* Stats */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  statCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: '#212121' },
  statTitle: { fontSize: 12, color: '#757575', marginTop: 2 },

  /* Quick Actions */
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  quickAction: { alignItems: 'center', width: 72 },
  quickActionGradient: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'center',
  },

  /* Chart */
  chartContainer: { paddingVertical: 8 },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    justifyContent: 'space-around',
  },
  chartBarCol: { alignItems: 'center', flex: 1 },
  chartBarValue: { fontSize: 9, color: '#757575', marginBottom: 2 },
  chartBarTrack: {
    width: 24,
    height: 110,
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBar: { width: '100%', borderRadius: 6 },
  chartBarLabel: { fontSize: 10, color: '#757575', marginTop: 4 },

  /* Section */
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#212121',
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
  },
  seeAll: { fontSize: 13, color: '#388E3C', fontWeight: '600' },

  /* Card */
  card: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  /* Pending card */
  pendingCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pendingCardHeader: { flexDirection: 'row', alignItems: 'center' },
  pendingAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingName: { fontSize: 15, fontWeight: '700', color: '#212121' },
  pendingEmail: { fontSize: 12, color: '#757575', marginTop: 1 },
  pendingDetails: { marginTop: 10, marginBottom: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailText: { fontSize: 13, color: '#424242', marginLeft: 6, flex: 1 },
  pendingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 10,
  },
  rejectBtn: { backgroundColor: '#FFEBEE' },
  rejectBtnText: {
    color: '#D32F2F',
    fontWeight: '600',
    marginLeft: 4,
    fontSize: 13,
  },
  approveBtn: { backgroundColor: '#388E3C' },
  approveBtnText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 4,
    fontSize: 13,
  },

  /* Status badge */
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },

  /* Activity */
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: { fontSize: 13, color: '#424242' },
  activityTime: { fontSize: 11, color: '#9E9E9E', marginTop: 1 },

  /* Empty */
  emptyWrap: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#424242',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9E9E9E',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default AdminDashboard;
