import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StoreProvider } from './src/state/store';
import type { RootStackParamList } from './src/navigation/types';
import DashboardScreen from './src/screens/DashboardScreen';
import AddAppsScreen from './src/screens/AddAppsScreen';
import ServiceDetailScreen from './src/screens/ServiceDetailScreen';
import ChatScreen from './src/screens/ChatScreen';
import DirectCheckScreen from './src/screens/DirectCheckScreen';
import ChangeFeedScreen from './src/screens/ChangeFeedScreen';
import AboutScreen from './src/screens/AboutScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): React.JSX.Element {
  return (
    <StoreProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Dashboard"
          screenOptions={{ headerStyle: { backgroundColor: '#101828' }, headerTintColor: '#ffffff' }}
        >
          <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Your Apps' }} />
          <Stack.Screen name="AddApps" component={AddAppsScreen} options={{ title: 'Add apps' }} />
          <Stack.Screen
            name="ServiceDetail"
            component={ServiceDetailScreen}
            options={({ route }) => ({ title: route.params.name })}
          />
          <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Ask the chat' }} />
          <Stack.Screen name="DirectCheck" component={DirectCheckScreen} options={{ title: 'Direct check' }} />
          <Stack.Screen name="ChangeFeed" component={ChangeFeedScreen} options={{ title: 'Change feed' }} />
          <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </StoreProvider>
  );
}
