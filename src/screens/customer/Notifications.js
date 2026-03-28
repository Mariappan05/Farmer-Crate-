/**
 * Notifications.js
 * Customer notification center - conversion of Flutter NotificationsPage.dart
 *
 * Features:
 *   - GET /api/notifications
 *   - Swipe to dismiss / delete
 *   - Mark as read on tap
 *   - Type-based icons (order, delivery, payment, promo, system)
 *   - Mark All Read button
 *   - Pull to refresh, empty state
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Platform,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* --------------------------------------------------------------------------
 * TYPE CONFIG
 * ------------------------------------------------------------------------ */

const TYPE_CONFIG = {
  order: {
    icon: 'cube-outline',
    color: '#1B5E20',
    bg: '#E8F5E9',
    label: 'Order',
  },
  delivery: {
    icon: 'car-outline',
    color: '#E65100',
    bg: '#FFF3E0',
    label: 'Delivery',
  },
  payment: {
    icon: 'card-outline',
    color: '#1565C0',
    bg: '#E3F2FD',
    label: 'Payment',
  },
  promo: {
    icon: 'pricetag-outline',
    color: '#C62828',
    bg: '#FFEBEE',
    label: 'Promo',
  },
  system: {
    icon: 'notifications-outline',
    color: '#6A1B9A',
    bg: '#F3E5F5',
    label: 'System',
  },
};

const getTypeConfig = (type) => {
  if (!type) return TYPE_CONFIG.system;
  const lower = type.toLowerCase();
  if (lower.includes('order')) return TYPE_CONFIG.order;
  if (lower.includes('deliver') || lower.includes('ship')) return TYPE_CONFIG.delivery;
  if (lower.includes('pay') || lower.includes('transaction')) return TYPE_CONFIG.payment;
  if (lower.includes('promo') || lower.includes('offer') || lower.includes('sale') || lower.includes('discount')) return TYPE_CONFIG.promo;
  return TYPE_CONFIG[lower] || TYPE_CONFIG.system;
};

/* --------------------------------------------------------------------------
 * TIME HELPERS
 * ------------------------------------------------------------------------ */

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return weeks + 'w ago';
  return new Date(dateStr).toLocaleDateString();
};

/* --------------------------------------------------------------------------
 * SHIMMER BLOCK
 * ------------------------------------------------------------------------ */

const ShimmerBlock = ({ width: w, height: h, style, borderRadius = 8 }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#e0e0e0', '#f5f5f5'] });
  return <Animated.View style={[{ width: w, height: h, borderRadius, backgroundColor: bg }, style]} />;
};

/* --------------------------------------------------------------------------
 * NOTIFICATION ITEM (Swipeable)
 * ------------------------------------------------------------------------ */

const NotificationItem = ({ notification, onPress, onDelete }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const itemHeight = useRef(new Animated.Value(1)).current;
  const panStartX = useRef(0);
  const config = getTypeConfig(notification.type || notification.notification_type);
  const isRead = notification.is_read || notification.read;

  const handleSwipeStart = (evt) => {
    panStartX.current = evt.nativeEvent.pageX;
  };

  const handleSwipeMove = (evt) => {
    const dx = evt.nativeEvent.pageX - panStartX.current;
    if (dx < 0) {
      translateX.setValue(Math.max(dx, -SCREEN_WIDTH * 0.35));
    }
  };

  const handleSwipeEnd = (evt) => {
    const dx = evt.nativeEvent.pageX - panStartX.current;
    if (dx < -80) {
      // Swipe far enough ? delete
      Animated.parallel([
        Animated.timing(translateX, { toValue: -SCREEN_WIDTH, duration: 250, useNativeDriver: false }),
        Animated.timing(itemHeight, { toValue: 0, duration: 250, useNativeDriver: false, delay: 100 }),
      ]).start(() => onDelete(notification));
    } else {
      // Snap back
      Animated.spring(translateX, { toValue: 0, useNativeDriver: false }).start();
    }
  };

  const scaleY = itemHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const opacity = itemHeight;

  return (
    <Animated.View style={{ opacity, transform: [{ scaleY }] }}>
      {/* Delete background */}
      <View style={styles.deleteBackground}>
        <Ionicons name="trash-outline" size={24} color="#fff" />
        <Text style={styles.deleteText}>Delete</Text>
      </View>

      <Animated.View
        style={[styles.notifCard, !isRead && styles.notifUnread, { transform: [{ translateX }] }]}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleSwipeStart}
        onResponderMove={handleSwipeMove}
        onResponderRelease={handleSwipeEnd}
      >
        <TouchableOpacity
          style={styles.notifTouchable}
          activeOpacity={0.7}
          onPress={() => onPress(notification)}
        >
          {/* Unread dot */}
          {!isRead && <View style={styles.unreadDot} />}

          {/* Type icon */}
          <View style={[styles.notifIconWrap, { backgroundColor: config.bg }]}>
            <Ionicons name={config.icon} size={22} color={config.color} />
          </View>

          {/* Content */}
          <View style={styles.notifContent}>
            <View style={styles.notifHeader}>
              <Text style={[styles.notifTitle, !isRead && { fontWeight: '700' }]} numberOfLines={2}>
                {notification.title || notification.message?.split('\n')[0] || 'Notification'}
              </Text>
            </View>
            <Text style={styles.notifBody} numberOfLines={3}>
              {notification.message || notification.body || notification.description || ''}
            </Text>
            <View style={styles.notifFooter}>
              <View style={[styles.typeBadge, { backgroundColor: config.bg }]}>
                <Text style={[styles.typeBadgeText, { color: config.color }]}>{config.label}</Text>
              </View>
              <Text style={styles.timeAgo}>{timeAgo(notification.created_at || notification.createdAt)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

/* --------------------------------------------------------------------------
 * MAIN COMPONENT
 * ------------------------------------------------------------------------ */

const Notifications = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* -- Fetch ------------------------------------------------- */
  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/notifications');
      const data = res.data?.data || res.data?.notifications || res.data || [];
      const list = Array.isArray(data) ? data : [];
      // Sort newest first
      list.sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
      setNotifications(list);
    } catch (e) {
      console.log('Notification fetch error:', e.message);
      // If 404, keep empty
      if (e?.response?.status !== 404) {
        // Only show alert on non-404 errors
        // Alert.alert('Error', 'Failed to load notifications');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, []);

  /* -- Mark as read ----------------------------------------- */
  const handlePress = async (notif) => {
    const id = notif.id || notif._id || notif.notification_id;
    if (!notif.is_read && !notif.read) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => {
          const nId = n.id || n._id || n.notification_id;
          return nId === id ? { ...n, is_read: true, read: true } : n;
        }),
      );
      try {
        await api.put('/notifications/' + id + '/read');
      } catch (e) {
        try { await api.patch('/notifications/' + id, { is_read: true }); } catch (_) { /* silent */ }
      }
    }
    // Optionally navigate based on type
    if (notif.order_id) {
      navigation.navigate('OrderTracking', { orderId: notif.order_id });
    }
  };

  /* -- Delete single ---------------------------------------- */
  const handleDelete = async (notif) => {
    const id = notif.id || notif._id || notif.notification_id;
    setNotifications((prev) => prev.filter((n) => (n.id || n._id || n.notification_id) !== id));
    try {
      await api.delete('/notifications/' + id);
    } catch (e) {
      console.log('Delete notif error:', e.message);
    }
  };

  /* -- Mark all read ---------------------------------------- */
  const handleMarkAllRead = () => {
    const unread = notifications.filter((n) => !n.is_read && !n.read);
    if (unread.length === 0) return;

    Alert.alert(
      'Mark All Read',
      'Mark ' + unread.length + ' notification(s) as read?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark All',
          onPress: async () => {
            // Optimistic
            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read: true })));
            try {
              await api.put('/notifications/read-all');
            } catch (e) {
              try { await api.patch('/notifications/mark-all-read'); } catch (_) { /* silent */ }
            }
          },
        },
      ],
    );
  };

  /* -- Clear all -------------------------------------------- */
  const handleClearAll = () => {
    if (notifications.length === 0) return;
    Alert.alert(
      'Clear All',
      'Remove all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setNotifications([]);
            try {
              await api.delete('/notifications');
            } catch (e) {
              console.log('Clear all error:', e.message);
            }
          },
        },
      ],
    );
  };

  /* -- Counts ----------------------------------------------- */
  const unreadCount = notifications.filter((n) => !n.is_read && !n.read).length;

  /* -- Skeleton --------------------------------------------- */
  const renderSkeleton = () => (
    <View style={{ padding: 16, gap: 12 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.notifCard, { flexDirection: 'row', padding: 14, gap: 12 }]}>
          <ShimmerBlock width={48} height={48} borderRadius={24} />
          <View style={{ flex: 1, gap: 8 }}>
            <ShimmerBlock width="80%" height={14} />
            <ShimmerBlock width="100%" height={12} />
            <ShimmerBlock width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );

  /* -- Main ------------------------------------------------- */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={handleMarkAllRead} style={styles.headerBtn}>
              <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={styles.headerBtn}>
              <Ionicons name="trash-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Notification type summary bar */}
      {!loading && notifications.length > 0 && (
        <View style={styles.summaryBar}>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
            const count = notifications.filter((n) => {
              const tc = getTypeConfig(n.type || n.notification_type);
              return tc.label === cfg.label;
            }).length;
            if (count === 0) return null;
            return (
              <View key={key} style={[styles.summaryChip, { backgroundColor: cfg.bg }]}>
                <Ionicons name={cfg.icon} size={14} color={cfg.color} />
                <Text style={[styles.summaryChipText, { color: cfg.color }]}>{count}</Text>
              </View>
            );
          })}
        </View>
      )}

      {loading ? renderSkeleton() : (
        <FlatList
          data={notifications}
          keyExtractor={(item, idx) => String(item.id || item._id || item.notification_id || idx)}
          renderItem={({ item }) => (
            <NotificationItem
              notification={item}
              onPress={handlePress}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            notifications.length === 0 && { flex: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchNotifications(true); }}
              colors={['#1B5E20']}
              tintColor="#1B5E20"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-off-outline" size={64} color="#ccc" />
              </View>
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptySubtitle}>
                You're all caught up! New notifications will appear here.
              </Text>
              <TouchableOpacity
                style={styles.emptyRefreshBtn}
                onPress={() => fetchNotifications()}
              >
                <Ionicons name="refresh-outline" size={18} color="#1B5E20" />
                <Text style={styles.emptyRefreshText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

/* --------------------------------------------------------------------------
 * STYLES
 * ------------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EDF6EE' },

  headerBar: {
    backgroundColor: '#1B5E20',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#A5D6A7', marginTop: 1 },
  headerBtn: { padding: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },

  summaryBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  summaryChipText: { fontSize: 12, fontWeight: '600' },

  listContent: { padding: 12, paddingBottom: 32 },

  /* Delete background */
  deleteBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.35,
    backgroundColor: '#F44336',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    marginRight: 4,
  },
  deleteText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  /* Notification card */
  notifCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5EEE5',
    ...Platform.select({
      ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  notifUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
    backgroundColor: '#FCFFF5',
  },
  notifTouchable: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    alignItems: 'flex-start',
  },
  unreadDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  notifIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifContent: { flex: 1, paddingRight: 12 },
  notifHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  notifTitle: { fontSize: 14, fontWeight: '600', color: '#222', flex: 1, marginBottom: 4 },
  notifBody: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 6 },
  notifFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  typeBadgeText: { fontSize: 11, fontWeight: '600' },
  timeAgo: { fontSize: 11, color: '#aaa' },

  /* Empty */
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#333' },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    marginTop: 20,
  },
  emptyRefreshText: { fontSize: 14, fontWeight: '600', color: '#1B5E20' },
});

export default Notifications;
