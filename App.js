// Point d'entrée (section 11) : navigation par onglets, aucun paiement ni compte.
import React from 'react';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DashboardScreen from './src/screens/DashboardScreen';
import ExoskeletonScreen from './src/screens/ExoskeletonScreen';
import RunningScreen from './src/screens/RunningScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.primary, border: colors.border },
};

const icon = (glyph) =>
  function TabIcon({ color }) {
    return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
  };

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.muted,
          }}
        >
          <Tab.Screen name="Tableau de bord" component={DashboardScreen} options={{ tabBarIcon: icon('▦') }} />
          <Tab.Screen name="Exosquelette" component={ExoskeletonScreen} options={{ tabBarIcon: icon('✦') }} />
          <Tab.Screen name="Course" component={RunningScreen} options={{ tabBarIcon: icon('➶') }} />
          <Tab.Screen name="Lecture" component={ReaderScreen} options={{ tabBarIcon: icon('❒') }} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
