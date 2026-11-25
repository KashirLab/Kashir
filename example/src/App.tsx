import React, { useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomTabNavigation } from './components/BottomTabNavigation';
import type { MainTabType } from './components/BottomTabNavigation';
import { SettingsScreen } from './components/SettingsScreen';
import { WalletScreen } from './components/WalletScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTabType>('wallet');
  const settingsVisible = activeTab === 'settings';

  return (
    <SafeAreaProvider style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.screen, settingsVisible && styles.hiddenScreen]}>
        <WalletScreen />
      </View>
      <View style={[styles.screen, !settingsVisible && styles.hiddenScreen]}>
        <SettingsScreen isVisible={settingsVisible} />
      </View>
      <BottomTabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  screen: {
    flex: 1,
  },
  hiddenScreen: {
    display: 'none',
  },
});
