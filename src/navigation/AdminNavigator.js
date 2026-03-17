import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AdminDashboard from '../screens/admin/AdminDashboard';
import AdminOrders from '../screens/admin/AdminOrders';
import VerificationPage from '../screens/admin/VerificationPage';
import AdminReport from '../screens/admin/AdminReport';
import UserManagement from '../screens/admin/UserManagement';
import CustomerManagement from '../screens/admin/CustomerManagement';
import TransporterManagement from '../screens/admin/TransporterManagement';
import FarmerDetails from '../screens/admin/FarmerDetails';
import CustomerDetails from '../screens/admin/CustomerDetails';
import DeliveryPersonDetails from '../screens/admin/DeliveryPersonDetails';
import TransporterDetails from '../screens/admin/TransporterDetails';
import AdminOrderTracking from '../screens/admin/AdminOrderTracking';
import AdminProfile from '../screens/admin/AdminProfile';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const SLIDE = { animation: 'slide_from_right', gestureEnabled: true, contentStyle: { backgroundColor: '#F4F8F4' } };

const ADMIN_TABS = [
  { name: 'Dashboard',    icon: 'home',                iconOff: 'home-outline',                 label: 'Dashboard' },
  { name: 'Orders',       icon: 'list',                iconOff: 'list-outline',                  label: 'Orders' },
  { name: 'Verification', icon: 'shield-checkmark',   iconOff: 'shield-checkmark-outline',      label: 'Verify' },
  { name: 'Reports',      icon: 'bar-chart',           iconOff: 'bar-chart-outline',             label: 'Reports' },
  { name: 'Users',        icon: 'people',              iconOff: 'people-outline',                label: 'Users' },
];

// ─── Modern Pill Tab Button ──────────────────────────────────────────────────
const AnimatedTabBtn = ({ item, onPress, isFocused }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pillAnim  = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(pillAnim, { toValue: isFocused ? 1 : 0, useNativeDriver: false, tension: 120, friction: 10 }).start();
    if (isFocused) Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 70, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 220, friction: 7, useNativeDriver: true }),
    ]).start();
  }, [isFocused]);
  const pillBg = pillAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(232,245,233,0)', '#E8F5E9'] });
  const pillW  = pillAnim.interpolate({ inputRange: [0, 1], outputRange: [32, 58] });
  return (
    <TouchableOpacity onPress={onPress} style={ts.tabBtn} activeOpacity={0.8}>
      <Animated.View style={[ts.pill, { backgroundColor: pillBg, width: pillW }]} />
      <Animated.View style={[ts.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name={isFocused ? item.icon : item.iconOff} size={22} color={isFocused ? '#1B5E20' : '#9E9E9E'} />
      </Animated.View>
      <Text style={[ts.label, isFocused && ts.labelActive]} numberOfLines={1} adjustsFontSizeToFit>{item.label}</Text>
    </TouchableOpacity>
  );
};

const AdminTabBar = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const pb = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 16 : 4);
  return (
    <View style={[ts.bar, { paddingBottom: pb }]}>
      {state.routes.map((route, index) => (
        <AnimatedTabBtn
          key={route.key}
          item={ADMIN_TABS[index] || { icon: 'ellipse', iconOff: 'ellipse-outline', label: route.name }}
          isFocused={state.index === index}
          onPress={() => { if (state.index !== index) navigation.navigate(route.name); }}
        />
      ))}
    </View>
  );
};

const ts = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderTopWidth: 0, paddingTop: 8,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    ...Platform.select({ android: { elevation: 20 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.10, shadowRadius: 14 } }),
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, position: 'relative' },
  pill: { position: 'absolute', top: 0, height: 38, borderRadius: 19, zIndex: 0 },
  iconWrap: { width: 28, height: 26, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  label: { fontSize: 9, color: '#9E9E9E', fontWeight: '500', marginTop: 1, zIndex: 1 },
  labelActive: { color: '#1B5E20', fontWeight: '700' },
});

const AdminTabs = () => (
  <Tab.Navigator tabBar={(props) => <AdminTabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tab.Screen name="Dashboard" component={AdminDashboard} />
    <Tab.Screen name="Orders" component={AdminOrders} />
    <Tab.Screen name="Verification" component={VerificationPage} />
    <Tab.Screen name="Reports" component={AdminReport} />
    <Tab.Screen name="Users" component={UserManagement} />
  </Tab.Navigator>
);

const AdminNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, ...SLIDE }}>
    <Stack.Screen name="AdminTabs" component={AdminTabs} options={{ animation: 'none' }} />
    <Stack.Screen name="CustomerManagement" component={CustomerManagement} />
    <Stack.Screen name="TransporterManagement" component={TransporterManagement} />
    <Stack.Screen name="FarmerDetails" component={FarmerDetails} />
    <Stack.Screen name="CustomerDetails" component={CustomerDetails} />
    <Stack.Screen name="DeliveryPersonDetails" component={DeliveryPersonDetails} />
    <Stack.Screen name="TransporterDetails" component={TransporterDetails} />
    <Stack.Screen name="AdminOrderTracking" component={AdminOrderTracking} />
    <Stack.Screen name="AdminProfile" component={AdminProfile} />
  </Stack.Navigator>
);

export default AdminNavigator;
