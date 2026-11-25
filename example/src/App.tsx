import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomTabNavigation } from './components/BottomTabNavigation';
import type { MainTabType } from './components/BottomTabNavigation';
import { SettingsScreen } from './components/SettingsScreen';
import { WalletScreen } from './components/WalletScreen';
import { WatchAdsScreen } from './components/WatchAdsScreen';
import { resumePendingAdWithdrawals } from './services/AdWithdrawalService';
import { walletManager } from './services/WalletManager';
import { resetWalletStorage } from './services/WalletStorage';

export default function App() {
  const [selectedTab, setSelectedTab] = useState<MainTabType>('wallet');
  const [hasWallet, setHasWallet] = useState(() => walletManager.hasWallet());
  const [isResetting, setIsResetting] = useState(false);
  const [resetCount, setResetCount] = useState(0);
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

  const resetWallet = async () => {
    setIsResetting(true);
    try {
      await resetWalletStorage();
      setSelectedTab('wallet');
      setResetCount((count) => count + 1);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <SafeAreaProvider style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View
        style={[styles.screen, activeTab !== 'wallet' && styles.hiddenScreen]}
      >
        <WalletScreen key={resetCount} />
      </View>
      {activeTab === 'watchAds' && <WatchAdsScreen />}
      <View style={[styles.screen, !settingsVisible && styles.hiddenScreen]}>
        <SettingsScreen
          key={resetCount}
          isVisible={settingsVisible}
          onResetWallet={resetWallet}
        />
      </View>
      <BottomTabNavigation
        activeTab={activeTab}
        showWatchAds={hasWallet}
        onTabChange={setSelectedTab}
      />
      {isResetting && (
        <View
          style={[StyleSheet.absoluteFill, styles.resetOverlay]}
          accessibilityViewIsModal
        >
          <ActivityIndicator size="large" />
        </View>
      )}
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
  resetOverlay: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hiddenScreen: {
    display: 'none',
  },
});
