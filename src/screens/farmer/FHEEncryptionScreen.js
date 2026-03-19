/**
 * FHEEncryptionScreen.js
 *
 * All 4 tabs auto-load REAL database data â€” no manual input required.
 *   1. Encrypt Prices   â†’ farmer's own products from DB
 *   2. Verify Orders    â†’ farmer's orders, FHE bid check
 *   3. Market Analytics â†’ all available products across all farmers
 *   4. Transaction Ledger â†’ farmer's completed order earnings
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import ToastMessage from '../../utils/Toast';

// â”€â”€â”€ Palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const C = {
  bg       : '#F4F8F4',
  card     : '#FFFFFF',
  primary  : '#1B5E20',
  dark     : '#103A12',
  accent   : '#4CAF50',
  light    : '#E8F5E9',
  cipher   : '#001B14',
  cipherTxt: '#00FF9C',
  warn     : '#E65100',
  error    : '#B71C1C',
  errorBg  : '#FFEBEE',
  ok       : '#2E7D32',
  okBg     : '#E8F5E9',
  border   : '#C8E6C9',
  muted    : '#9E9E9E',
  stepBg   : '#F1F8E9',
};

const TABS = [
  { id: 'encrypt',   label: 'Encrypt',   icon: 'lock-closed-outline' },
  { id: 'bid',       label: 'Verify Bid',icon: 'checkmark-circle-outline' },
  { id: 'analytics', label: 'Analytics', icon: 'bar-chart-outline' },
  { id: 'ledger',    label: 'Ledger',    icon: 'receipt-outline' },
];

const fmt = (v) => `â‚¹${Number(v ?? 0).toLocaleString('en-IN')}`;

// â”€â”€â”€ Shared sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CipherBox = ({ text, label }) => (
  <View style={s.cipherBox}>
    <Text style={s.cipherLabel}>{label ?? 'ENCRYPTED VALUE'}</Text>
    <Text style={s.cipherText}>{text}</Text>
  </View>
);

const StepList = ({ steps }) => (
  <View style={s.stepsWrap}>
    <Text style={s.stepsTitle}>
      <Ionicons name="git-branch-outline" size={14} color={C.primary} />  Computation Steps
    </Text>
    {steps.map((step, i) => (
      <Text key={i} style={[s.stepLine, step.startsWith('  ') && s.stepIndent]}>{step}</Text>
    ))}
  </View>
);

const PrivacyBadge = ({ note }) => (
  <View style={s.privacyBadge}>
    <Ionicons name="shield-checkmark-outline" size={16} color={C.primary} />
    <Text style={s.privacyText}>{note}</Text>
  </View>
);

const EmptyState = ({ onRetry }) => (
  <View style={s.emptyWrap}>
    <Ionicons name="leaf-outline" size={48} color={C.border} />
    <Text style={s.emptyTitle}>No Data Found</Text>
    <Text style={s.emptyText}>
      Add products or receive orders to see FHE encryption in action.
    </Text>
    <TouchableOpacity style={s.retryBtn} onPress={onRetry}>
      <Ionicons name="refresh-outline" size={16} color={C.primary} />
      <Text style={s.retryTxt}>Refresh</Text>
    </TouchableOpacity>
  </View>
);

const LoadingState = () => (
  <View style={s.loadingWrap}>
    <ActivityIndicator size="large" color={C.primary} />
    <Text style={s.loadingText}>Fetching from databaseâ€¦</Text>
  </View>
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TAB 1 â€“ Encrypt Prices  (farmer's own products)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const EncryptTab = ({ toastRef }) => {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState(null); // product_id of expanded card

  const fetch = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await api.get('/fhe/farmer-products');
      setData(res.data);
    } catch (e) {
      toastRef.current?.show(e?.response?.data?.message || 'Failed to load products', 'error');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetch(); }, []);

  if (loading) return <LoadingState />;
  if (!data?.data?.length) return <EmptyState onRetry={() => fetch()} />;

  return (
    <View>
      <Text style={s.tabDesc}>
        Your product prices are encrypted using the BGV (FHE) scheme.
        The original value becomes unreadable â€” only you can decrypt it.
      </Text>

      <View style={s.dbBadge}>
        <Ionicons name="server-outline" size={14} color={C.ok} />
        <Text style={s.dbBadgeText}>
          {data.total_products} products loaded from your farm
        </Text>
      </View>

      {data.data.map(item => (
        <TouchableOpacity
          key={item.product_id}
          style={s.productCard}
          onPress={() => setExpanded(expanded === item.product_id ? null : item.product_id)}
          activeOpacity={0.88}
        >
          {/* Row header */}
          <View style={s.productCardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.productName}>{item.product_name}</Text>
              <Text style={s.productMeta}>
                {item.category}  Â·  {item.quantity} {item.status === 'available' ? 'âœ“ Available' : item.status}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.productPrice}>{fmt(item.original_amount)}</Text>
              <Ionicons
                name={expanded === item.product_id ? 'chevron-up' : 'chevron-down'}
                size={16} color={C.muted}
              />
            </View>
          </View>

          {/* Expanded FHE details */}
          {expanded === item.product_id && (
            <View style={{ marginTop: 10 }}>
              <View style={s.resultRow}>
                <Text style={s.resultLabel}>Scheme</Text>
                <Text style={s.resultValue}>{item.key_info?.cryptosystem}</Text>
              </View>
              <View style={s.resultRow}>
                <Text style={s.resultLabel}>Mode</Text>
                <Text style={s.resultValue}>{item.key_info?.mode}</Text>
              </View>
              <View style={s.resultRow}>
                <Text style={s.resultLabel}>Ciphertext Size</Text>
                <Text style={s.resultValue}>{item.ciphertext_size}</Text>
              </View>
              <CipherBox
                label="ENCRYPTED PRICE (public-safe)"
                text={item.encrypted_representation}
              />
              <StepList steps={item.steps} />
              <PrivacyBadge note={item.privacy_note} />
            </View>
          )}
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={s.refreshRowBtn} onPress={() => fetch(true)}>
        {refreshing
          ? <ActivityIndicator size="small" color={C.primary} />
          : <><Ionicons name="refresh-outline" size={16} color={C.primary} /><Text style={s.refreshRowTxt}>Refresh</Text></>
        }
      </TouchableOpacity>
    </View>
  );
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TAB 2 â€“ Verify Orders (FHE bid check on real orders)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BidTab = ({ toastRef }) => {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState(null);

  const fetch = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await api.get('/fhe/verify-orders');
      setData(res.data);
    } catch (e) {
      toastRef.current?.show(e?.response?.data?.message || 'Failed to load orders', 'error');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetch(); }, []);

  if (loading) return <LoadingState />;
  if (!data?.data?.length) return <EmptyState onRetry={() => fetch()} />;

  return (
    <View>
      <Text style={s.tabDesc}>
        Each order's price is verified homomorphically â€” the buyer's paid amount
        is compared with your minimum price without exposing either value.
      </Text>

      <View style={s.dbBadge}>
        <Ionicons name="server-outline" size={14} color={C.ok} />
        <Text style={s.dbBadgeText}>
          {data.total_orders} orders loaded from your account
        </Text>
      </View>

      {data.data.map(item => {
        const r = item.fhe_result;
        const accepted = r?.bid_accepted;
        return (
          <TouchableOpacity
            key={item.order_id}
            style={[s.productCard, { borderLeftWidth: 4, borderLeftColor: accepted ? C.accent : C.error }]}
            onPress={() => setExpanded(expanded === item.order_id ? null : item.order_id)}
            activeOpacity={0.88}
          >
            <View style={s.productCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.productName}>{item.product_name}</Text>
                <Text style={s.productMeta}>Buyer: {item.buyer_name}  Â·  Qty: {item.quantity}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={[s.verdictPill, { backgroundColor: accepted ? C.okBg : C.errorBg }]}>
                  <Ionicons
                    name={accepted ? 'checkmark-circle' : 'close-circle'}
                    size={14} color={accepted ? C.ok : C.error}
                  />
                  <Text style={[s.verdictPillText, { color: accepted ? C.ok : C.error }]}>
                    {r?.status ?? 'â€”'}
                  </Text>
                </View>
                <Ionicons
                  name={expanded === item.order_id ? 'chevron-up' : 'chevron-down'}
                  size={16} color={C.muted}
                />
              </View>
            </View>

            {expanded === item.order_id && r && (
              <View style={{ marginTop: 10 }}>
                {accepted && (
                  <View style={s.resultRow}>
                    <Text style={s.resultLabel}>Total Order Value</Text>
                    <Text style={[s.resultValue, { color: C.ok, fontWeight: '800' }]}>
                      {fmt(r.total_order_value)}
                    </Text>
                  </View>
                )}
                <CipherBox label="FARMER MIN PRICE (encrypted)" text={r.farmer_min_price_encrypted} />
                <CipherBox label="BUYER BID PRICE  (encrypted)" text={r.buyer_bid_price_encrypted} />
                <CipherBox label="DIFFERENCE       (encrypted)" text={r.diff_result_encrypted} />
                <View style={s.resultRow}>
                  <Text style={s.resultLabel}>Decrypted Sign</Text>
                  <Text style={s.resultValue}>{r.diff_decrypted_sign}</Text>
                </View>
                <StepList steps={r.steps} />
                <PrivacyBadge note={r.privacy_note} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={s.refreshRowBtn} onPress={() => fetch(true)}>
        {refreshing
          ? <ActivityIndicator size="small" color={C.primary} />
          : <><Ionicons name="refresh-outline" size={16} color={C.primary} /><Text style={s.refreshRowTxt}>Refresh</Text></>
        }
      </TouchableOpacity>
    </View>
  );
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TAB 3 â€“ Market Analytics (all farmers' products)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AnalyticsTab = ({ toastRef }) => {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await api.get('/fhe/market-analytics');
      setData(res.data);
    } catch (e) {
      toastRef.current?.show(e?.response?.data?.message || 'Failed to load analytics', 'error');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetch(); }, []);

  if (loading) return <LoadingState />;
  if (!data?.data) return <EmptyState onRetry={() => fetch()} />;

  const r = data.data;
  return (
    <View>
      <Text style={s.tabDesc}>
        All farmers' prices are submitted in encrypted form. The analytics engine
        computes market insights â€” without reading a single raw price value.
      </Text>

      <View style={s.dbBadge}>
        <Ionicons name="server-outline" size={14} color={C.ok} />
        <Text style={s.dbBadgeText}>
          {data.total_products} live market products analysed
        </Text>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={[s.statBox, { backgroundColor: C.light }]}>
          <Text style={s.statVal}>{fmt(r.average_price)}</Text>
          <Text style={s.statLbl}>Average</Text>
        </View>
        <View style={[s.statBox, { backgroundColor: '#FFF8E1' }]}>
          <Text style={s.statVal}>{fmt(r.total_price_sum)}</Text>
          <Text style={s.statLbl}>Total Sum</Text>
        </View>
        <View style={[s.statBox, { backgroundColor: '#E3F2FD' }]}>
          <Text style={s.statVal}>{r.count}</Text>
          <Text style={s.statLbl}>Farmers</Text>
        </View>
      </View>

      <View style={[s.resultCard, { marginTop: 0 }]}>
        <View style={s.resultRow}>
          <Text style={s.resultLabel}>Price Range</Text>
          <Text style={s.resultValue}>
            {fmt(r.price_range.min)} â€“ {fmt(r.price_range.max)}
          </Text>
        </View>

        <Text style={[s.stepsTitle, { marginTop: 12 }]}>
          <Ionicons name="lock-closed-outline" size={14} color={C.primary} />  Encrypted Submissions
        </Text>
        {r.encrypted_submissions.map((sub, i) => (
          <View key={i} style={s.subRow}>
            <Text style={s.subFarmer} numberOfLines={1}>{sub.farmer}</Text>
            <Text style={s.subCipher} numberOfLines={1}>{sub.encrypted_price}</Text>
          </View>
        ))}

        <StepList steps={r.steps} />
        <PrivacyBadge note={r.privacy_note} />
      </View>

      <TouchableOpacity style={s.refreshRowBtn} onPress={() => fetch(true)}>
        {refreshing
          ? <ActivityIndicator size="small" color={C.primary} />
          : <><Ionicons name="refresh-outline" size={16} color={C.primary} /><Text style={s.refreshRowTxt}>Refresh</Text></>
        }
      </TouchableOpacity>
    </View>
  );
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TAB 4 â€“ Transaction Ledger (farmer's completed earnings)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LedgerTab = ({ toastRef }) => {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await api.get('/fhe/transaction-ledger');
      setData(res.data);
    } catch (e) {
      toastRef.current?.show(e?.response?.data?.message || 'Failed to load ledger', 'error');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetch(); }, []);

  if (loading) return <LoadingState />;
  if (!data?.data) return <EmptyState onRetry={() => fetch()} />;

  const r = data.data;
  return (
    <View>
      <Text style={s.tabDesc}>
        Each sale is encrypted before being stored in the ledger.
        Only you can read the running total â€” individual amounts stay private.
      </Text>

      <View style={[s.verdictBanner, { backgroundColor: C.okBg, marginBottom: 16 }]}>
        <MaterialCommunityIcons name="currency-inr" size={28} color={C.ok} />
        <View>
          <Text style={[s.verdictText, { color: C.ok }]}>
            Total Earnings: {fmt(r.total_earnings)}
          </Text>
          <Text style={{ color: C.ok, fontSize: 12 }}>
            {r.transaction_count} transactions encrypted
          </Text>
        </View>
      </View>

      <View style={s.resultCard}>
        <Text style={s.stepsTitle}>Encrypted Ledger Entries</Text>
        {r.ledger.map((entry, i) => (
          <View key={i} style={s.ledgerEntry}>
            <View style={s.ledgerEntryTop}>
              <Text style={s.ledgerEntryNum}>#{entry.txn_number}</Text>
              <Text style={s.ledgerEntryBuyer}>{entry.buyer}</Text>
              <Text style={s.ledgerEntryCrop}>{entry.crop}</Text>
            </View>
            <Text style={s.ledgerCipherLine}>{entry.amount_encrypted}</Text>
            <View style={s.ledgerRunRow}>
              <Text style={s.ledgerRunLabel}>Running total (farmer view):</Text>
              <Text style={s.ledgerRunVal}>{fmt(entry.running_total)}</Text>
            </View>
          </View>
        ))}

        <StepList steps={r.steps} />
        <PrivacyBadge note={r.privacy_note} />
      </View>

      <TouchableOpacity style={s.refreshRowBtn} onPress={() => fetch(true)}>
        {refreshing
          ? <ActivityIndicator size="small" color={C.primary} />
          : <><Ionicons name="refresh-outline" size={16} color={C.primary} /><Text style={s.refreshRowTxt}>Refresh</Text></>
        }
      </TouchableOpacity>
    </View>
  );
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main Screen
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FHEEncryptionScreen = ({ navigation }) => {
  const insets   = useSafeAreaInsets();
  const [tab, setTab] = useState('encrypt');
  const toastRef = useRef(null);
  const activeTab = TABS.find(t => t.id === tab);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.dark} />

      {/* Header */}
      <LinearGradient
        colors={[C.dark, C.primary, '#2E7D32']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 10 }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerIconWrap}>
            <Ionicons name="shield-checkmark" size={28} color="#fff" />
          </View>
          <Text style={s.headerTitle}>FHE Encryption</Text>
          <Text style={s.headerSub}>Live data Â· BGV Scheme Â· Zero leakage</Text>
        </View>
        <View style={s.blob1} />
        <View style={s.blob2} />
      </LinearGradient>

      {/* Info strip */}
      <View style={s.infoStrip}>
        <Ionicons name="server-outline" size={15} color={C.primary} />
        <Text style={s.infoStripText}>Auto-loads from your farm database</Text>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[s.tabBtn, tab === t.id && s.tabBtnActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.8}
          >
            <Ionicons name={t.icon} size={16} color={tab === t.id ? C.primary : C.muted} />
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.tabHeading}>
          <Ionicons name={activeTab.icon} size={20} color={C.primary} />
          <Text style={s.tabHeadingText}>{activeTab.label}</Text>
        </View>

        {tab === 'encrypt'   && <EncryptTab   toastRef={toastRef} />}
        {tab === 'bid'       && <BidTab        toastRef={toastRef} />}
        {tab === 'analytics' && <AnalyticsTab  toastRef={toastRef} />}
        {tab === 'ledger'    && <LedgerTab     toastRef={toastRef} />}
      </ScrollView>

      <ToastMessage ref={toastRef} />
    </View>
  );
};

export default FHEEncryptionScreen;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Styles
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: { paddingBottom: 22, paddingHorizontal: 16, overflow: 'hidden', alignItems: 'center' },
  backBtn: { position: 'absolute', top: 0, left: 14, padding: 8, zIndex: 10 },
  headerCenter: { alignItems: 'center', marginTop: 4 },
  headerIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  headerSub  : { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2, letterSpacing: 0.8 },
  blob1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -80, right: -40,
  },
  blob2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(0,0,0,0.07)', bottom: -30, left: -20,
  },

  // Info strip
  infoStrip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.light,
    paddingHorizontal: 16, paddingVertical: 8, gap: 6,
  },
  infoStripText: { fontSize: 12, color: C.primary, fontWeight: '600' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: C.border,
    borderTopWidth: 1,
    borderTopColor: '#E6EFE6',
  },
  tabBtn      : { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: C.accent },
  tabLabel    : { fontSize: 10, color: C.muted, fontWeight: '600' },
  tabLabelActive: { color: C.primary, fontWeight: '700' },

  // Scroll & heading
  scroll     : { padding: 16 },
  tabHeading : { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  tabHeadingText: { fontSize: 16, fontWeight: '800', color: C.primary },

  // Tab description 
  tabDesc: {
    fontSize: 13, color: '#555', lineHeight: 19,
    backgroundColor: C.light, padding: 12, borderRadius: 10,
    marginBottom: 12, borderLeftWidth: 3, borderLeftColor: C.accent,
  },

  // DB badge
  dbBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FFF0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: 12, borderWidth: 1, borderColor: C.border,
  },
  dbBadgeText: { fontSize: 12, color: C.ok, fontWeight: '700' },

  // Product card (Tab 1 & 2)
  productCard: {
    backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.dark, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  productCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  productName  : { fontSize: 15, fontWeight: '800', color: '#222', marginBottom: 2 },
  productMeta  : { fontSize: 12, color: C.muted, fontWeight: '500' },
  productPrice : { fontSize: 16, fontWeight: '900', color: C.primary },

  // Verdict pill (Tab 2)
  verdictPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  verdictPillText: { fontSize: 11, fontWeight: '800' },

  // Result rows
  resultCard: {
    marginTop: 12, backgroundColor: C.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
    shadowColor: C.dark, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  resultRow  : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  resultLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  resultValue: { fontSize: 13, color: '#222', fontWeight: '700' },

  // Verdict banner (Tab 4)
  verdictBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14, marginBottom: 14 },
  verdictText: { fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },

  // Ciphertext box
  cipherBox: { backgroundColor: C.cipher, borderRadius: 10, padding: 12, marginVertical: 10 },
  cipherLabel: { fontSize: 9, color: 'rgba(0,255,156,0.6)', fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  cipherText : {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12, color: C.cipherTxt, letterSpacing: 1,
  },

  // Steps
  stepsWrap : { backgroundColor: C.stepBg, borderRadius: 10, padding: 12, marginTop: 12, borderLeftWidth: 3, borderLeftColor: C.accent },
  stepsTitle: { fontSize: 12, fontWeight: '700', color: C.primary, marginBottom: 8 },
  stepLine  : { fontSize: 11, color: '#444', lineHeight: 17, fontWeight: '500' },
  stepIndent: { paddingLeft: 12, color: '#666' },

  // Privacy badge
  privacyBadge: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12, backgroundColor: C.light, padding: 10, borderRadius: 10 },
  privacyText : { flex: 1, fontSize: 11, color: C.primary, fontStyle: 'italic', lineHeight: 16 },

  // Stats (Tab 3)
  statsRow : { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E6EFE6' },
  statVal  : { fontSize: 15, fontWeight: '900', color: C.primary },
  statLbl  : { fontSize: 10, color: '#555', fontWeight: '600', marginTop: 2 },

  // Encrypted submissions (Tab 3)
  subRow   : { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  subFarmer: { width: 100, fontSize: 12, fontWeight: '700', color: '#333' },
  subCipher: {
    flex: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10, color: '#777',
  },

  // Ledger entries (Tab 4)
  ledgerEntry   : { backgroundColor: C.stepBg, borderRadius: 10, padding: 12, marginBottom: 8 },
  ledgerEntryTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  ledgerEntryNum : { fontSize: 12, fontWeight: '900', color: C.primary, width: 30 },
  ledgerEntryBuyer: { fontSize: 13, fontWeight: '700', color: '#222', flex: 1 },
  ledgerEntryCrop : { fontSize: 12, color: C.muted, fontWeight: '600' },
  ledgerCipherLine: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10, color: '#888', marginBottom: 6,
  },
  ledgerRunRow : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ledgerRunLabel: { fontSize: 11, color: '#666', fontWeight: '600' },
  ledgerRunVal  : { fontSize: 13, fontWeight: '900', color: C.ok },

  // Refresh row
  refreshRowBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, marginTop: 8,
    borderWidth: 1, borderColor: C.border, borderRadius: 10, borderStyle: 'dashed',
  },
  refreshRowTxt: { fontSize: 13, color: C.primary, fontWeight: '700' },

  // Empty state
  emptyWrap  : { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle : { fontSize: 16, fontWeight: '800', color: '#555' },
  emptyText  : { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  retryBtn   : { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: C.primary },
  retryTxt   : { fontSize: 13, color: C.primary, fontWeight: '700' },

  // Loading state
  loadingWrap : { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText : { fontSize: 13, color: C.muted, fontWeight: '600' },
});
