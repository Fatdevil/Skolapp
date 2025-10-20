import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, TouchableOpacity } from 'react-native';
import CalendarScreen from './calendar/CalendarScreen';
import ChatScreen from './chat/ChatScreen';
import AdminScreen from './admin/AdminScreen';
import EventEditor from './events/EventEditor';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ToastProvider';

const Tab = createBottomTabNavigator();

function LogoutButton() {
  const { logout } = useAuth();
  const toast = useToast();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      toast.show('Kunde inte logga ut');
    }
  };

  return (
    <TouchableOpacity onPress={handleLogout} style={{ marginRight: 12 }} accessibilityRole="button">
      <Text style={{ color: '#93c5fd', fontWeight: '600' }}>Logga ut</Text>
    </TouchableOpacity>
  );
}

export default function Tabs() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#0b1220' },
        headerTitleStyle: { color: 'white' },
        headerTintColor: '#93c5fd',
        tabBarStyle: { backgroundColor: '#0b1220', borderTopColor: '#1f2937' },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#9ca3af',
        headerRight: () => <LogoutButton />
      }}
    >
      <Tab.Screen name="Kalender" component={CalendarScreen} />
      <Tab.Screen name="Chatt" component={ChatScreen} />
      <Tab.Screen name="Skapa" component={EventEditor} />
      {isStaff ? <Tab.Screen name="Admin" component={AdminScreen} /> : null}
    </Tab.Navigator>
  );
}