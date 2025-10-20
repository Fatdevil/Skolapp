import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import CalendarScreen from './calendar/CalendarScreen';
import ChatScreen from './chat/ChatScreen';
import AdminScreen from './admin/AdminScreen';
import EventEditor from './events/EventEditor';
const Tab=createBottomTabNavigator();
export default function Tabs(){
  return(<Tab.Navigator screenOptions={{headerShown:false}}>
    <Tab.Screen name="Kalender" component={CalendarScreen}/>
    <Tab.Screen name="Chatt" component={ChatScreen}/>
    <Tab.Screen name="Skapa" component={EventEditor}/>
    <Tab.Screen name="Admin" component={AdminScreen}/>
  </Tab.Navigator>);
}