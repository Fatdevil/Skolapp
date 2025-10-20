import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerDevice } from './src/services/api';
import LoginScreen from './src/screens/LoginScreen';
import Tabs from './src/screens/Tabs';
const Stack = createNativeStackNavigator();
async function registerForPush(){
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
    // @ts-ignore
    token = pushToken.data || pushToken;
  }
  if (token) { try { await registerDevice({ expoPushToken: token, classId: 'class-1' }); } catch {} }
}
export default function App(){
  useEffect(()=>{ registerForPush(); },[]);
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown:false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Tabs" component={Tabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}