import React, { useMemo } from 'react';
import { Platform, Pressable, StatusBar, Text } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { StoreProvider } from './src/state/store';
import type { RootStackParamList } from './src/navigation/types';
import { fonts, useTheme } from './src/theme';
import DashboardScreen from './src/screens/DashboardScreen';
import AddAppsScreen from './src/screens/AddAppsScreen';
import ServiceDetailScreen from './src/screens/ServiceDetailScreen';
import ChatScreen from './src/screens/ChatScreen';
import DirectCheckScreen from './src/screens/DirectCheckScreen';
import ChangeFeedScreen from './src/screens/ChangeFeedScreen';
import AboutScreen from './src/screens/AboutScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): React.JSX.Element | null {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { scheme, c } = useTheme();

  const navTheme = useMemo<NavTheme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: c.ground,
        card: c.ground,
        text: c.ink,
        border: c.line,
        primary: c.link,
        notification: c.tint,
      },
    };
  }, [scheme, c]);

  // Wait for the fonts so text never flashes in the fallback face. If they
  // fail to load, render anyway with the system fallback.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <StoreProvider>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={c.ground} />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          initialRouteName="Dashboard"
          screenOptions={({ navigation }) => ({
            headerStyle: { backgroundColor: c.ground },
            headerTintColor: c.link,
            headerTitleStyle: { fontFamily: fonts.textBold, fontSize: 17, color: c.ink },
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.ground },
            // iOS draws its own "‹ Previous" button. Elsewhere, draw the same
            // one, so both platforms match; Android's system back still works.
            headerLeft:
              Platform.OS === 'ios'
                ? undefined
                : ({ canGoBack, label }) =>
                    canGoBack ? (
                      <Pressable
                        onPress={() => navigation.goBack()}
                        accessibilityRole="button"
                        accessibilityLabel={`Back to ${label ?? 'previous screen'}`}
                        hitSlop={10}
                      >
                        {({ pressed }) => (
                          <Text
                            style={{ fontFamily: fonts.text, fontSize: 17, color: c.link, opacity: pressed ? 0.6 : 1 }}
                          >
                            {`‹ ${label ?? 'Back'}`}
                          </Text>
                        )}
                      </Pressable>
                    ) : null,
          })}
        >
          {/* The large "Your apps" title is drawn by the screen itself, so it looks the same on every platform. */}
          <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Your apps', headerTitle: '' }} />
          <Stack.Screen name="AddApps" component={AddAppsScreen} options={{ title: 'Add apps' }} />
          <Stack.Screen
            name="ServiceDetail"
            component={ServiceDetailScreen}
            options={({ route }) => ({ title: route.params.name, headerTitle: '' })}
          />
          <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Ask about a service' }} />
          <Stack.Screen name="DirectCheck" component={DirectCheckScreen} options={{ title: 'Direct check' }} />
          <Stack.Screen name="ChangeFeed" component={ChangeFeedScreen} options={{ title: 'Changes' }} />
          <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </StoreProvider>
  );
}
