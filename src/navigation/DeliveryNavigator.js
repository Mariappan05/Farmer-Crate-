import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DeliveryDashboard from '../screens/delivery/DeliveryDashboard';
import QRScanner from '../screens/delivery/QRScanner';
import DeliveryEarnings from '../screens/delivery/DeliveryEarnings';
import DeliveryHistory from '../screens/delivery/DeliveryHistory';
import DeliveryProfile from '../screens/delivery/DeliveryProfile';
import OrderDetails from '../screens/delivery/OrderDetails';
import OrderUpdatePage from '../screens/delivery/OrderUpdatePage';
import FAQ from '../screens/common/FAQ';
import HelpSupport from '../screens/common/HelpSupport';
import Feedback from '../screens/common/Feedback';
import AppInfo from '../screens/common/AppInfo';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const SLIDE = { animation: 'slide_from_right', gestureEnabled: true, contentStyle: { backgroundColor: '#F4F8F4' } };

const DEL_TABS = [
  { name: 'Dashboard', icon: 'bicycle',    iconOff: 'bicycle-outline',    label: 'Dashboard' },
  { name: 'Scanner',   icon: 'qr-code',    iconOff: 'qr-code-outline',    label: 'Scanner' },
  { name: 'Earnings',  icon: 'wallet',     iconOff: 'wallet-outline',     label: 'Earnings' },
  { name: 'History',   icon: 'time',       iconOff: 'time-outline',       label: 'History' },
  { name: 'Profile',   icon: 'person',     iconOff: 'person-outline',     label: 'Profile' },
];

// ─── Modern Pill Tab Button ──────────────────────────────────────────────────
const AnimatedTabBtn = ({ item, onPress, isFocused }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pillAnim  = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(pillAnim, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: false,
      tension: 120,
      friction: 10,
    }).start();
    if (isFocused) {
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.88, duration: 70,  useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1,    tension: 220, friction: 7, useNativeDriver: true }),
      ]).start();
    }
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

const DeliveryTabBar = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const pb = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 16 : 4);
  return (
    <View style={[ts.bar, { paddingBottom: pb }]}>
      {state.routes.map((route, index) => (
        <AnimatedTabBtn
          key={route.key}
          item={DEL_TABS[index] || { icon: 'ellipse', iconOff: 'ellipse-outline', label: route.name }}
          isFocused={state.index === index}
          onPress={() => { if (state.index !== index) navigation.navigate(route.name); }}
        />
      ))}
    </View>
  );
};

const ts = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    paddingTop: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      android: { elevation: 20 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.10, shadowRadius: 14 },
    }),
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 0,
    height: 38,
    borderRadius: 19,
    zIndex: 0,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    fontSize: 10,
    color: '#9E9E9E',
    fontWeight: '500',
    marginTop: 1,
    zIndex: 1,
  },
  labelActive: {
    color: '#1B5E20',
    fontWeight: '700',
  },
});

const DeliveryTabs = () => (
  <Tab.Navigator tabBar={(props) => <DeliveryTabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tab.Screen name="Dashboard" component={DeliveryDashboard} />
    <Tab.Screen name="Scanner" component={QRScanner} />
    <Tab.Screen name="Earnings" component={DeliveryEarnings} />
    <Tab.Screen name="History" component={DeliveryHistory} />
    <Tab.Screen name="Profile" component={DeliveryProfile} />
  </Tab.Navigator>
);

const DeliveryNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, ...SLIDE }}>
    <Stack.Screen name="DeliveryTabs" component={DeliveryTabs} options={{ animation: 'none' }} />
    <Stack.Screen name="OrderDetails" component={OrderDetails} />
    <Stack.Screen name="OrderUpdate" component={OrderUpdatePage} />
    <Stack.Screen name="FAQ" component={FAQ} />
    <Stack.Screen name="HelpSupport" component={HelpSupport} />
    <Stack.Screen name="Feedback" component={Feedback} />
    <Stack.Screen name="AppInfo" component={AppInfo} />
  </Stack.Navigator>
);

export default DeliveryNavigator;
