import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerDevice } from './src/services/api';
import LoginScreen from './src/screens/LoginScreen';
import Tabs from './src/screens/Tabs';
import PrivacyConsentScreen from './src/screens/PrivacyConsentScreen';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { ToastProvider } from './src/components/ToastProvider';

const Stack = createNativeStackNavigator();

async function registerForPush() {
  let token = '';
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    const pushToken = await Notifications.getExpoPushTokenAsync();
    // @ts-ignore expo sdk typing quirk
    token = pushToken.data || pushToken;
  }
  if (token) {
    try {
      await registerDevice({ expoPushToken: token, classId: 'class-1' });
    } catch (error) {
      console.warn('Could not register push token', error);
    }
  }
}

function RootNavigator() {
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (user) {
      registerForPush().catch(() => undefined);
    }
  }, [user]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#3b82f6" />
        <Text style={styles.loadingText}>Laddar...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : user.privacyConsentAt ? (
        <Stack.Screen name="Tabs" component={Tabs} />
      ) : (
        <Stack.Screen name="PrivacyConsent" component={PrivacyConsentScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0b1220',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    color: 'white',
    marginTop: 12,
    fontWeight: '600'
  }
});