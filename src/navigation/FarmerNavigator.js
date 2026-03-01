import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import FarmerHome from '../screens/farmer/FarmerHome';
import AddProduct from '../screens/farmer/AddProduct';
import FarmerOrders from '../screens/farmer/FarmerOrders';
import FarmerProfile from '../screens/farmer/FarmerProfile';
import SellingHistory from '../screens/farmer/SellingHistory';
import EditProduct from '../screens/farmer/EditProduct';
import ProductDetail from '../screens/farmer/ProductDetail';
import ContactAdmin from '../screens/farmer/ContactAdmin';
import FarmerOrderTracking from '../screens/farmer/FarmerOrderTracking';
import FAQ from '../screens/common/FAQ';
import HelpSupport from '../screens/common/HelpSupport';
import Feedback from '../screens/common/Feedback';
import AppInfo from '../screens/common/AppInfo';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const SLIDE = { animation: 'slide_from_right', gestureEnabled: true, contentStyle: { backgroundColor: '#fff' } };

const FARMER_TABS = [
  { name: 'Home',    icon: 'home',    iconOff: 'home-outline',    label: 'Home' },
  { name: 'Orders',  icon: 'receipt', iconOff: 'receipt-outline',  label: 'Orders' },
  { name: 'History', icon: 'time',    iconOff: 'time-outline',     label: 'History' },
  { name: 'Profile', icon: 'person',  iconOff: 'person-outline',   label: 'Profile' },
];

const AnimatedTabButton = ({ item, onPress, isFocused }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dotAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(dotAnim, { toValue: isFocused ? 1 : 0, useNativeDriver: true, tension: 80, friction: 8 }).start();
    if (isFocused) {
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 7, useNativeDriver: true }),
      ]).start();
    }
  }, [isFocused]);
  return (
    <TouchableOpacity onPress={onPress} style={ts.tabBtn} activeOpacity={1}>
      <Animated.View style={[ts.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name={isFocused ? item.icon : item.iconOff} size={24} color={isFocused ? '#1B5E20' : '#9E9E9E'} />
      </Animated.View>
      <Text style={[ts.label, isFocused && ts.labelActive]}>{item.label}</Text>
      <Animated.View style={[ts.dot, { transform: [{ scaleX: dotAnim }], opacity: dotAnim }]} />
    </TouchableOpacity>
  );
};

const FarmerTabBar = ({ state, navigation }) => (
  <View style={ts.bar}>
    {state.routes.map((route, index) => {
      const item = FARMER_TABS[index] || { icon: 'ellipse', iconOff: 'ellipse-outline', label: route.name };
      return (
        <AnimatedTabButton
          key={route.key}
          item={item}
          isFocused={state.index === index}
          onPress={() => {
            if (state.index !== index) navigation.navigate(route.name);
          }}
        />
      );
    })}
  </View>
);

const ts = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
    paddingBottom: Platform.OS === 'ios' ? 20 : 6, paddingTop: 6,
    height: Platform.OS === 'ios' ? 82 : 66,
    ...Platform.select({ android: { elevation: 12 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 8 } }),
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  iconWrap: { width: 32, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, color: '#9E9E9E', fontWeight: '500', marginTop: 2 },
  labelActive: { color: '#1B5E20', fontWeight: '700' },
  dot: { position: 'absolute', bottom: -2, width: 20, height: 3, borderRadius: 2, backgroundColor: '#1B5E20' },
});

const FarmerTabs = () => (
  <Tab.Navigator tabBar={(props) => <FarmerTabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tab.Screen name="Home" component={FarmerHome} />
    <Tab.Screen name="Orders" component={FarmerOrders} />
    <Tab.Screen name="History" component={SellingHistory} />
    <Tab.Screen name="Profile" component={FarmerProfile} />
  </Tab.Navigator>
);

const FarmerNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, ...SLIDE }}>
    <Stack.Screen name="FarmerTabs" component={FarmerTabs} options={{ animation: 'none' }} />
    <Stack.Screen name="AddProduct" component={AddProduct} />
    <Stack.Screen name="EditProduct" component={EditProduct} />
    <Stack.Screen name="ProductDetail" component={ProductDetail} />
    <Stack.Screen name="ContactAdmin" component={ContactAdmin} />
    <Stack.Screen name="FarmerOrderTracking" component={FarmerOrderTracking} />
    <Stack.Screen name="FAQ" component={FAQ} />
    <Stack.Screen name="HelpSupport" component={HelpSupport} />
    <Stack.Screen name="Feedback" component={Feedback} />
    <Stack.Screen name="AppInfo" component={AppInfo} />
  </Stack.Navigator>
);

export default FarmerNavigator;
