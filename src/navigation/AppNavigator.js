import React from 'react';
import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

const AppTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#fff' },
};

const SLIDE_RIGHT = {
  animation: 'slide_from_right',
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  contentStyle: { backgroundColor: '#fff' },
};
const FADE = {
  animation: 'fade',
  contentStyle: { backgroundColor: '#1B5E20' },
};

// Auth Screens
import SplashScreen from '../screens/SplashScreen';
import GetStartedScreen from '../screens/GetStartedScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import OtpScreen from '../screens/auth/OtpScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import DeliveryPasswordResetScreen from '../screens/auth/DeliveryPasswordResetScreen';
import GoogleProfileCompletion from '../screens/auth/GoogleProfileCompletion';

// Admin
import AdminNavigator from './AdminNavigator';

// Farmer
import FarmerNavigator from './FarmerNavigator';

// Customer
import CustomerNavigator from './CustomerNavigator';

// Transporter
import TransporterNavigator from './TransporterNavigator';

// Delivery
import DeliveryNavigator from './DeliveryNavigator';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  const { authState } = useAuth();

  if (authState.isLoading) {
    return (
      <View style={loadingStyles.container}>
        <View style={loadingStyles.outerRing}>
          <View style={loadingStyles.innerCircle}>
            <Image
              source={require('../../assets/FarmerCrate_Logo.jpg')}
              style={loadingStyles.logoImg}
              resizeMode="contain"
            />
          </View>
        </View>
        <ActivityIndicator size="large" color="#ffffff" style={{ marginTop: 32 }} />
      </View>
    );
  }

  const getRoleNavigator = (role) => {
    switch (role) {
      case 'admin': return <Stack.Screen name="Admin" component={AdminNavigator} />;
      case 'farmer': return <Stack.Screen name="Farmer" component={FarmerNavigator} />;
      case 'customer': return <Stack.Screen name="Customer" component={CustomerNavigator} />;
      case 'transporter': return <Stack.Screen name="Transporter" component={TransporterNavigator} />;
      case 'delivery': return <Stack.Screen name="Delivery" component={DeliveryNavigator} />;
      default: return null;
    }
  };

  return (
    <NavigationContainer theme={AppTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {authState.token && authState.role ? (
          // Authenticated — show role dashboard
          getRoleNavigator(authState.role)
        ) : (
          // Unauthenticated — show auth flow
          <>
            <Stack.Screen name="Splash" component={SplashScreen} options={FADE} />
            <Stack.Screen name="GetStarted" component={GetStartedScreen} options={FADE} />
            <Stack.Screen name="Login" component={LoginScreen} options={SLIDE_RIGHT} />
            <Stack.Screen name="Signup" component={SignupScreen} options={SLIDE_RIGHT} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={SLIDE_RIGHT} />
            <Stack.Screen name="Otp" component={OtpScreen} options={SLIDE_RIGHT} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={SLIDE_RIGHT} />
            <Stack.Screen name="DeliveryPasswordReset" component={DeliveryPasswordResetScreen} options={SLIDE_RIGHT} />
            <Stack.Screen name="GoogleProfileCompletion" component={GoogleProfileCompletion} options={SLIDE_RIGHT} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1B5E20',
  },
  outerRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  innerCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoImg: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
});

export default AppNavigator;
