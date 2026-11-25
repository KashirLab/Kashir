import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomTabNavigation } from './components/BottomTabNavigation';
import type { MainTabType } from './components/BottomTabNavigation';
import { SettingsScreen } from './components/SettingsScreen';
import { WalletScreen } from './components/WalletScreen';
import { WatchAdsScreen } from './components/WatchAdsScreen';
import { resumePendingAdWithdrawals } from './services/AdWithdrawalService';
import { walletManager } from './services/WalletManager';

export default function App() {
  const [selectedTab, setSelectedTab] = useState<MainTabType>('wallet');
  const [hasWallet, setHasWallet] = useState(() => walletManager.hasWallet());
  const activeTab =
    selectedTab === 'watchAds' && !hasWallet ? 'wallet' : selectedTab;
  const settingsVisible = activeTab === 'settings';

  useEffect(() => {
    const updateWallet = () => {
      const ready = walletManager.hasWallet();
      setHasWallet(ready);
      if (ready) {
        resumePendingAdWithdrawals();
      } else {
        setSelectedTab((tab) => (tab === 'watchAds' ? 'wallet' : tab));
      }
    };
    const unsubscribe = walletManager.subscribe(updateWallet);
    updateWallet();
    return unsubscribe;
  }, []);

  return (
    <SafeAreaProvider style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View
        style={[styles.screen, activeTab !== 'wallet' && styles.hiddenScreen]}
      >
        <WalletScreen />
      </View>
      {activeTab === 'watchAds' && <WatchAdsScreen />}
      <View style={[styles.screen, !settingsVisible && styles.hiddenScreen]}>
        <SettingsScreen isVisible={settingsVisible} />
      </View>
      <BottomTabNavigation
        activeTab={activeTab}
        showWatchAds={hasWallet}
        onTabChange={setSelectedTab}
      />
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
