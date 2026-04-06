/**
 * TransporterLive.js
 * Live delivery simulation - conversion of Flutter transpoterlive.dart (880 lines)
 *
 * Features:
 *   - Multi-stage delivery simulation
 *   - Emoji timeline with icons per stage
 *   - Progress percentage bar
 *   - ETA/estimated time display
 *   - Animated progress indicator
 *   - Feedback dialog after delivery (star rating + comment)
 *   - Support bottom sheet with contact options
 *   - Auto-refresh tracking every 10 seconds
 *   - Order details card
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* --------------------------------------------------------------------------
 * DELIVERY STAGES
 * ------------------------------------------------------------------------ */

const STAGES = [
  { key: 'placed',              label: 'Order Placed',         icon: 'receipt-outline',      emoji: '\uD83D\uDCE5', color: '#FF9800', desc: 'Your order has been placed successfully.' },
  { key: 'confirmed',           label: 'Farmer Accepted',      icon: 'checkmark-circle-outline', emoji: '\u2705', color: '#2196F3', desc: 'Farmer has accepted your order.' },
  { key: 'assigned',            label: 'Transporters Assigned', icon: 'person-outline', emoji: '\uD83D\uDE9A', color: '#9C27B0', desc: 'Transporters are assigned for your order.' },
  { key: 'pickup_assigned',     label: 'Pickup Assigned',      icon: 'car-outline',          emoji: '\uD83D\uDE97', color: '#FF5722', desc: 'A pickup delivery person has been assigned.' },
  { key: 'pickup_in_progress',  label: 'Pickup In Progress',   icon: 'bicycle-outline',      emoji: '\uD83D\uDEB4', color: '#00BCD4', desc: 'Pickup is currently in progress.' },
  { key: 'picked_up',           label: 'Picked Up',            icon: 'cube-outline',         emoji: '\uD83D\uDCE6', color: '#2196F3', desc: 'Your order has been picked up from the farmer.' },
  { key: 'received',            label: 'Received at Hub',      icon: 'business-outline',     emoji: '\uD83C\uDFE2', color: '#00897B', desc: 'The order has reached the transporter hub.' },
  { key: 'shipped',             label: 'Shipped',              icon: 'boat-outline',         emoji: '\uD83D\uDEA2', color: '#3F51B5', desc: 'The order has been shipped to destination city.' },
  { key: 'in_transit',          label: 'In Transit',           icon: 'navigate-outline',     emoji: '\uD83D\uDE9B', color: '#3949AB', desc: 'Your order is currently in transit.' },
  { key: 'reached_destination', label: 'Received at Destination',  icon: 'location-outline',     emoji: '\uD83D\uDCCD', color: '#673AB7', desc: 'The order has been received at the destination hub.' },
  { key: 'out_for_delivery',    label: 'Out for Delivery',     icon: 'bicycle-outline',      emoji: '\uD83D\uDEB4', color: '#00BCD4', desc: 'Your order is out for final delivery.' },
  { key: 'delivered',           label: 'Delivered',            icon: 'checkmark-circle',     emoji: '\uD83C\uDF89', color: '#4CAF50', desc: 'Your order has been delivered successfully!' },
];

const STATUS_MAP = {
  pending: 0,
  placed: 0,
  accepted: 1,
  confirmed: 1,
  assigned: 2,
  pickup_assigned: 3,
  pickup_in_progress: 4,
  processing: 2,
  picked_up: 5,
  received: 6,
  shipped: 7,
  in_transit: 8,
  reached_destination: 9,
  out_for_delivery: 10,
  out_delivery: 10,
  delivered: 11,
  completed: 11,
  cancelled: -1,
};

const getStageIndex = (status) => {
  const key = (status || 'pending').toLowerCase().replace(/\s+/g, '_');
  return STATUS_MAP[key] !== undefined ? STATUS_MAP[key] : 0;
};

/* --------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------ */

const formatCurrency = (a) => '\u20B9' + (parseFloat(a) || 0).toFixed(2);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const getETA = (stageIndex) => {
  const etaMinutes = [240, 200, 170, 140, 110, 85, 60, 35, 15, 0];
  const mins = etaMinutes[stageIndex] || 0;
  if (mins === 0) return 'Delivered';
  if (mins >= 60) return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'min';
  return mins + ' min';
};

/* --------------------------------------------------------------------------
 * ANIMATED PROGRESS BAR
 * ------------------------------------------------------------------------ */

const ProgressBar = ({ progress }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: progress, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    if (progress < 1) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [progress]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[liveStyles.progressContainer, { transform: [{ scaleY: pulseAnim }] }]}>
      <View style={liveStyles.progressTrack}>
        <Animated.View style={[liveStyles.progressFill, { width }]} />
      </View>
    </Animated.View>
  );
};

/* --------------------------------------------------------------------------
 * EMOJI TIMELINE
 * ------------------------------------------------------------------------ */

const EmojiTimeline = ({ currentIndex }) => (
  <View style={liveStyles.emojiRow}>
    {STAGES.map((stage, idx) => {
      const isCompleted = idx <= currentIndex;
      const isActive = idx === currentIndex;
      return (
        <View key={stage.key} style={liveStyles.emojiItem}>
          <View style={[
            liveStyles.emojiCircle,
            isCompleted && { backgroundColor: stage.color + '20', borderColor: stage.color },
            isActive && { transform: [{ scale: 1.2 }] },
          ]}>
            <Text style={{ fontSize: isActive ? 22 : 18 }}>{stage.emoji}</Text>
          </View>
          {idx < STAGES.length - 1 && (
            <View style={[liveStyles.emojiConnector, isCompleted && idx < currentIndex && { backgroundColor: stage.color }]} />
          )}
          <Text style={[liveStyles.emojiLabel, isActive && { color: stage.color, fontWeight: '700' }]} numberOfLines={2}>
            {stage.label}
          </Text>
        </View>
      );
    })}
  </View>
);

/* --------------------------------------------------------------------------
 * FEEDBACK DIALOG
 * ------------------------------------------------------------------------ */

const FeedbackDialog = ({ visible, onClose, onSubmit }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit(rating, comment);
    setSubmitting(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={liveStyles.feedbackOverlay}>
        <View style={liveStyles.feedbackCard}>
          <Text style={liveStyles.feedbackTitle}>Rate Your Delivery</Text>
          <Text style={liveStyles.feedbackSub}>How was your delivery experience?</Text>

          {/* Star rating */}
          <View style={liveStyles.starRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <TouchableOpacity key={s} onPress={() => setRating(s)}>
                <Ionicons
                  name={s <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color={s <= rating ? '#FFC107' : '#DDD'}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={liveStyles.ratingLabel}>
            {rating === 5 ? 'Excellent!' : rating === 4 ? 'Good' : rating === 3 ? 'Average' : rating === 2 ? 'Below Average' : 'Poor'}
          </Text>

          {/* Comment */}
          <TextInput
            style={liveStyles.feedbackInput}
            placeholder="Add a comment (optional)"
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={3}
            value={comment}
            onChangeText={setComment}
            textAlignVertical="top"
          />

          {/* Buttons */}
          <View style={liveStyles.feedbackActions}>
            <TouchableOpacity style={liveStyles.feedbackSkip} onPress={onClose}>
              <Text style={liveStyles.feedbackSkipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={liveStyles.feedbackSubmit} onPress={handleSubmit} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={liveStyles.feedbackSubmitText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

/* --------------------------------------------------------------------------
 * SUPPORT BOTTOM SHEET
 * ------------------------------------------------------------------------ */

const SupportSheet = ({ visible, onClose, transporter }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: visible ? 1 : 0, duration: 300, useNativeDriver: true }).start();
  }, [visible]);

  if (!visible) return null;

  const options = [
    { icon: 'call-outline', label: 'Call Transporter', onPress: () => transporter?.phone && Linking.openURL('tel:' + transporter.phone) },
    { icon: 'mail-outline', label: 'Email Support', onPress: () => Linking.openURL('mailto:support@farmercrate.com') },
    { icon: 'chatbubble-outline', label: 'Chat Support', onPress: () => Alert.alert('Chat', 'Chat support coming soon') },
    { icon: 'help-circle-outline', label: 'FAQ / Help', onPress: () => Alert.alert('Help', 'Visit our help center') },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={liveStyles.sheetOverlay} activeOpacity={1} onPress={onClose}>
        <View style={liveStyles.sheetContent}>
          <View style={liveStyles.sheetHandle} />
          <Text style={liveStyles.sheetTitle}>Need Help?</Text>
          <Text style={liveStyles.sheetSub}>Choose a support option below</Text>
          {options.map((opt, idx) => (
            <TouchableOpacity key={idx} style={liveStyles.sheetOption} onPress={() => { onClose(); opt.onPress(); }}>
              <View style={liveStyles.sheetOptionIcon}>
                <Ionicons name={opt.icon} size={22} color="#1B5E20" />
              </View>
              <Text style={liveStyles.sheetOptionText}>{opt.label}</Text>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

/* --------------------------------------------------------------------------
 * MAIN COMPONENT
 * ------------------------------------------------------------------------ */

const TransporterLive = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { order: initialOrder, transporter: initialTransporter, orderId } = route.params || {};

  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [supportVisible, setSupportVisible] = useState(false);
  const intervalRef = useRef(null);

  const currentIndex = getStageIndex(order?.status);
  const isCancelled = (order?.status || '').toLowerCase() === 'cancelled';
  const isDelivered = currentIndex >= STAGES.length - 1;
  const progress = isCancelled ? 0 : Math.min(1, currentIndex / (STAGES.length - 1));

  const transporter = order?.transporter || initialTransporter || {};
  const deliveryPerson = order?.delivery_person || {};
  const items = order?.items || order?.order_items || [];

  /* -- Fetch ------------------------------------------------- */
  const fetchOrder = useCallback(async () => {
    try {
      const id = orderId || order?.order_id || order?.id;
      if (!id) return;
      const res = await api.get('/orders/' + id);
      const o = res.data?.data || res.data?.order || res.data;
      if (o) setOrder(o);
    } catch (e) {
      console.log('TransporterLive fetch error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [orderId, order]);

  useEffect(() => {
    if (!initialOrder || orderId) fetchOrder();
  }, [orderId]);

  /* -- Auto-refresh every 10s -------------------------------- */
  useEffect(() => {
    intervalRef.current = setInterval(fetchOrder, 10000);
    return () => clearInterval(intervalRef.current);
  }, [fetchOrder]);

  /* -- Show feedback on delivery ----------------------------- */
  useEffect(() => {
    if (isDelivered && !isCancelled) {
      const timer = setTimeout(() => setFeedbackVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isDelivered]);

  /* -- Feedback submit --------------------------------------- */
  const handleFeedbackSubmit = async (rating, comment) => {
    try {
      const id = order?.order_id || order?.id;
      await api.post('/orders/' + id + '/feedback', { rating, comment });
      Alert.alert('Thank you!', 'Your feedback has been submitted.');
    } catch (e) {
      console.log('Feedback error:', e.message);
      Alert.alert('Thanks!', 'Feedback noted.');
    }
  };

  /* -- Loading state ----------------------------------------- */
  if (loading && !order) {
    return (
      <View style={[liveStyles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={liveStyles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={liveStyles.headerTitle}>Live Tracking</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={{ color: '#888', marginTop: 12 }}>Loading tracking...</Text>
        </View>
      </View>
    );
  }

  const currentStage = STAGES[currentIndex] || STAGES[0];

  return (
    <View style={[liveStyles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <View style={liveStyles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={liveStyles.headerTitle}>Live Tracking</Text>
        <TouchableOpacity onPress={() => setSupportVisible(true)}>
          <Ionicons name="help-circle-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Current stage highlight */}
        <View style={[liveStyles.stageHighlight, { borderLeftColor: currentStage.color }]}>
          <Text style={{ fontSize: 32 }}>{currentStage.emoji}</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[liveStyles.stageLabel, { color: currentStage.color }]}>{currentStage.label}</Text>
            <Text style={liveStyles.stageDesc}>{currentStage.desc}</Text>
          </View>
        </View>

        {/* Progress bar + percentage */}
        <View style={liveStyles.progressCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={liveStyles.progressTitle}>Delivery Progress</Text>
            <Text style={liveStyles.progressPercent}>{Math.round(progress * 100)}%</Text>
          </View>
          <ProgressBar progress={progress} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={16} color="#1B5E20" />
              <Text style={liveStyles.etaText}>ETA: {getETA(currentIndex)}</Text>
            </View>
            <Text style={liveStyles.stageCount}>Stage {currentIndex + 1}/{STAGES.length}</Text>
          </View>
        </View>

        {/* Emoji Timeline */}
        <View style={liveStyles.timelineCard}>
          <Text style={liveStyles.sectionTitle}>Delivery Timeline</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <EmojiTimeline currentIndex={currentIndex} />
          </ScrollView>
        </View>

        {/* Stage list (detailed) */}
        <View style={liveStyles.stagesCard}>
          <Text style={liveStyles.sectionTitle}>All Stages</Text>
          {STAGES.map((stage, idx) => {
            const isCompleted = idx <= currentIndex;
            const isActive = idx === currentIndex;
            return (
              <View key={stage.key} style={liveStyles.stageRow}>
                <View style={[
                  liveStyles.stageDot,
                  isCompleted && { backgroundColor: stage.color },
                ]}>
                  <Ionicons name={isCompleted ? stage.icon.replace('-outline', '') : stage.icon} size={16} color={isCompleted ? '#fff' : '#bbb'} />
                </View>
                {idx < STAGES.length - 1 && (
                  <View style={[liveStyles.stageConnector, isCompleted && idx < currentIndex && { backgroundColor: stage.color }]} />
                )}
                <View style={[liveStyles.stageContent, isActive && { backgroundColor: stage.color + '10' }]}>
                  <Text style={[liveStyles.stageRowLabel, isActive && { color: stage.color, fontWeight: '700' }]}>
                    {stage.emoji} {stage.label}
                  </Text>
                  {isActive && <Text style={[liveStyles.stageRowStatus, { color: stage.color }]}>In Progress</Text>}
                  {isCompleted && !isActive && <Text style={liveStyles.stageRowDone}>Completed</Text>}
                </View>
              </View>
            );
          })}
        </View>

        {/* Order details card */}
        {order && (
          <View style={liveStyles.orderCard}>
            <Text style={liveStyles.sectionTitle}>Order Details</Text>
            <View style={liveStyles.orderRow}>
              <Text style={liveStyles.orderLabel}>Order ID</Text>
              <Text style={liveStyles.orderValue}>#{order.order_id || order.id}</Text>
            </View>
            <View style={liveStyles.orderRow}>
              <Text style={liveStyles.orderLabel}>Date</Text>
              <Text style={liveStyles.orderValue}>{formatDate(order.created_at || order.order_date)}</Text>
            </View>
            {order.total_amount && (
              <View style={liveStyles.orderRow}>
                <Text style={liveStyles.orderLabel}>Total</Text>
                <Text style={[liveStyles.orderValue, { color: '#1B5E20', fontWeight: '700' }]}>{formatCurrency(order.total_amount)}</Text>
              </View>
            )}
            {items.length > 0 && (
              <View style={liveStyles.orderRow}>
                <Text style={liveStyles.orderLabel}>Items</Text>
                <Text style={liveStyles.orderValue}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
        )}

        {/* Transporter card */}
        {(transporter.name || transporter.username || transporter.full_name) && (
          <View style={liveStyles.personCard}>
            <View style={liveStyles.personAvatar}>
              <MaterialCommunityIcons name="truck" size={24} color="#1B5E20" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={liveStyles.personRole}>Transporter</Text>
              <Text style={liveStyles.personName}>{transporter.name || transporter.username || transporter.full_name}</Text>
              {(transporter.vehicle_type || transporter.vehicle_number) && (
                <Text style={liveStyles.personDetail}>
                  {[transporter.vehicle_type, transporter.vehicle_number].filter(Boolean).join(' \u2022 ')}
                </Text>
              )}
            </View>
            {transporter.phone && (
              <TouchableOpacity style={liveStyles.callBtn} onPress={() => Linking.openURL('tel:' + transporter.phone)}>
                <Ionicons name="call" size={18} color="#1B5E20" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Delivery person card */}
        {(deliveryPerson.name || deliveryPerson.username || deliveryPerson.full_name) && (
          <View style={liveStyles.personCard}>
            <View style={liveStyles.personAvatar}>
              <Ionicons name="bicycle" size={24} color="#1B5E20" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={liveStyles.personRole}>Delivery Person</Text>
              <Text style={liveStyles.personName}>{deliveryPerson.name || deliveryPerson.username || deliveryPerson.full_name}</Text>
            </View>
            {deliveryPerson.phone && (
              <TouchableOpacity style={liveStyles.callBtn} onPress={() => Linking.openURL('tel:' + deliveryPerson.phone)}>
                <Ionicons name="call" size={18} color="#1B5E20" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Support button */}
        <TouchableOpacity style={liveStyles.supportBtn} onPress={() => setSupportVisible(true)}>
          <Ionicons name="headset-outline" size={20} color="#1B5E20" />
          <Text style={liveStyles.supportBtnText}>Need Help?</Text>
        </TouchableOpacity>

        <Text style={liveStyles.refreshNote}>Auto-refreshes every 10 seconds</Text>
      </ScrollView>

      {/* Feedback dialog */}
      <FeedbackDialog
        visible={feedbackVisible}
        onClose={() => setFeedbackVisible(false)}
        onSubmit={handleFeedbackSubmit}
      />

      {/* Support sheet */}
      <SupportSheet
        visible={supportVisible}
        onClose={() => setSupportVisible(false)}
        transporter={transporter}
      />
    </View>
  );
};

/* --------------------------------------------------------------------------
 * STYLES
 * ------------------------------------------------------------------------ */

const liveStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF5EF' },

  headerBar: {
    backgroundColor: '#1B5E20',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  /* Stage highlight */
  stageHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  stageLabel: { fontSize: 18, fontWeight: '700' },
  stageDesc: { fontSize: 13, color: '#888', marginTop: 4, lineHeight: 18 },

  /* Progress */
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E3EDE4',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  progressTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  progressPercent: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  progressContainer: { borderRadius: 6, overflow: 'hidden' },
  progressTrack: { height: 10, backgroundColor: '#E0E0E0', borderRadius: 5 },
  progressFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 5 },
  etaText: { fontSize: 13, color: '#1B5E20', fontWeight: '600' },
  stageCount: { fontSize: 12, color: '#888' },

  /* Emoji timeline */
  timelineCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E3EDE4',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12 },
  emojiRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  emojiItem: { alignItems: 'center', width: 70 },
  emojiCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    marginBottom: 4,
  },
  emojiConnector: { width: 26, height: 3, backgroundColor: '#E0E0E0', position: 'absolute', right: -13, top: 22 },
  emojiLabel: { fontSize: 10, color: '#888', textAlign: 'center', marginTop: 4 },

  /* Stages card */
  stagesCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  stageRow: { flexDirection: 'row', minHeight: 56 },
  stageDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  stageConnector: { position: 'absolute', left: 16, top: 34, width: 2, height: 22, backgroundColor: '#E0E0E0' },
  stageContent: { flex: 1, marginLeft: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  stageRowLabel: { fontSize: 14, color: '#666' },
  stageRowStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  stageRowDone: { fontSize: 12, color: '#4CAF50', marginTop: 2 },

  /* Order card */
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  orderLabel: { fontSize: 14, color: '#888' },
  orderValue: { fontSize: 14, fontWeight: '600', color: '#333' },

  /* Person cards */
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  personRole: { fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: '500' },
  personName: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
  personDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  callBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Support button */
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 8,
  },
  supportBtnText: { fontSize: 15, fontWeight: '600', color: '#1B5E20' },

  refreshNote: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 8 },

  /* Feedback dialog */
  feedbackOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  feedbackCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' },
  feedbackTitle: { fontSize: 20, fontWeight: '700', color: '#1B5E20', marginBottom: 4 },
  feedbackSub: { fontSize: 14, color: '#888', marginBottom: 16 },
  starRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  ratingLabel: { fontSize: 14, color: '#888', marginBottom: 16 },
  feedbackInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    marginBottom: 16,
    color: '#333',
  },
  feedbackActions: { flexDirection: 'row', gap: 12, width: '100%' },
  feedbackSkip: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center' },
  feedbackSkipText: { fontSize: 14, color: '#888', fontWeight: '500' },
  feedbackSubmit: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#1B5E20', alignItems: 'center' },
  feedbackSubmitText: { fontSize: 14, color: '#fff', fontWeight: '600' },

  /* Support sheet */
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheetContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#1B5E20' },
  sheetSub: { fontSize: 14, color: '#888', marginBottom: 16 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  sheetOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sheetOptionText: { flex: 1, fontSize: 15, color: '#333', fontWeight: '500' },
});

export default TransporterLive;
