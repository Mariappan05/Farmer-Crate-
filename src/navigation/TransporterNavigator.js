import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TransporterDashboard from '../screens/transporter/TransporterDashboard';
import OrderStatus from '../screens/transporter/OrderStatus';
import OrderHistoryPage from '../screens/transporter/OrderHistoryPage';
import VehiclePage from '../screens/transporter/VehiclePage';
import TransporterProfile from '../screens/transporter/TransporterProfile';
import AddDeliveryPerson from '../screens/transporter/AddDeliveryPerson';
import BillPreview from '../screens/transporter/BillPreview';
import BillAction from '../screens/transporter/BillAction';
import OrderDetail from '../screens/transporter/OrderDetail';
import OrderTracking from '../screens/common/OrderTracking';
import QRScan from '../screens/transporter/QRScan';
import FAQ from '../screens/common/FAQ';
import HelpSupport from '../screens/common/HelpSupport';
import Feedback from '../screens/common/Feedback';
import AppInfo from '../screens/common/AppInfo';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const SLIDE = { animation: 'slide_from_right', gestureEnabled: true, contentStyle: { backgroundColor: '#F4F8F4' } };

const TRANS_TABS = [
  { name: 'Dashboard', icon: 'apps',    iconOff: 'apps-outline',    label: 'Dashboard' },
  { name: 'Orders',    icon: 'list',    iconOff: 'list-outline',    label: 'Orders' },
  { name: 'History',   icon: 'time',    iconOff: 'time-outline',    label: 'History' },
  { name: 'Vehicles',  icon: 'car',     iconOff: 'car-outline',     label: 'Vehicles' },
  { name: 'Profile',   icon: 'person',  iconOff: 'person-outline',  label: 'Profile' },
];

// --- Modern Pill Tab Button --------------------------------------------------
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
  const pillW  = pillAnim.interpolate({ inputRange: [0, 1], outputRange: [36, 64] });
  return (
    <TouchableOpacity onPress={onPress} style={ts.tabBtn} activeOpacity={0.8}>
      <Animated.View style={[ts.pill, { backgroundColor: pillBg, width: pillW }]} />
      <Animated.View style={[ts.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name={isFocused ? item.icon : item.iconOff} size={22} color={isFocused ? '#1B5E20' : '#9E9E9E'} />
      </Animated.View>
      <Text style={[ts.label, isFocused && ts.labelActive]} numberOfLines={1}>{item.label}</Text>
    </TouchableOpacity>
  );
};

const TransporterTabBar = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const pb = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 16 : 4);
  return (
    <View style={[ts.bar, { paddingBottom: pb }]}>
      {state.routes.map((route, index) => (
        <AnimatedTabBtn
          key={route.key}
          item={TRANS_TABS[index] || { icon: 'ellipse', iconOff: 'ellipse-outline', label: route.name }}
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
  iconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  label: { fontSize: 10, color: '#9E9E9E', fontWeight: '500', marginTop: 1, zIndex: 1 },
  labelActive: { color: '#1B5E20', fontWeight: '700' },
});

const TransporterTabs = () => (
  <Tab.Navigator tabBar={(props) => <TransporterTabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tab.Screen name="Dashboard" component={TransporterDashboard} />
    <Tab.Screen name="Orders" component={OrderStatus} />
    <Tab.Screen name="History" component={OrderHistoryPage} />
    <Tab.Screen name="Vehicles" component={VehiclePage} />
    <Tab.Screen name="Profile" component={TransporterProfile} />
  </Tab.Navigator>
);

const TransporterNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, ...SLIDE }}>
    <Stack.Screen name="TransporterTabs" component={TransporterTabs} options={{ animation: 'none' }} />
    <Stack.Screen name="AddDeliveryPerson" component={AddDeliveryPerson} />
    <Stack.Screen name="BillPreview" component={BillPreview} />
    <Stack.Screen name="BillAction" component={BillAction} />
    <Stack.Screen name="OrderDetail" component={OrderDetail} />
    <Stack.Screen name="OrderTracking" component={OrderTracking} />
    <Stack.Screen name="QRScan" component={QRScan} />
    <Stack.Screen name="FAQ" component={FAQ} />
    <Stack.Screen name="HelpSupport" component={HelpSupport} />
    <Stack.Screen name="Feedback" component={Feedback} />
    <Stack.Screen name="AppInfo" component={AppInfo} />
  </Stack.Navigator>
);

export default TransporterNavigator;
