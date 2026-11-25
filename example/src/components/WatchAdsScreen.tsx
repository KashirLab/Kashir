import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewProps } from 'react-native-webview';
import { withdrawAdReward } from '../services/AdWithdrawalService';
import { getErrorMessage } from './wallet/utils/errorUtils';
import {
  WATCH_ADS_URL,
  WATCH_ADS_LNURL_SCRIPT,
  parseWatchAdsMessage,
} from './watchAdsBridge';

interface WithdrawalStatus {
  lnurl: string;
  state: 'pending' | 'success' | 'error';
  message: string;
}

export function WatchAdsScreen() {
  const [hasError, setHasError] = useState(false);
  const [lnurl, setLnurl] = useState<string | null>(null);
  const [withdrawal, setWithdrawal] = useState<WithdrawalStatus | null>(null);
  const webView = useRef<WebView<WebViewProps>>(null);
  const withdrawing = useRef(false);
  const mounted = useRef(true);
  const targetLnurl =
    lnurl || (withdrawal?.state === 'error' ? withdrawal.lnurl : null);
  const isWithdrawing = withdrawal?.state === 'pending';
  const isReceived =
    withdrawal?.state === 'success' && withdrawal.lnurl === targetLnurl;

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') webView.current?.requestFocus();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, []);

  const handleWithdraw = async () => {
    if (!targetLnurl || withdrawing.current || isReceived) return;
    withdrawing.current = true;
    setWithdrawal({
      lnurl: targetLnurl,
      state: 'pending',
      message: 'Receiving your reward into your Cashu wallet...',
    });
    try {
      const amount = await withdrawAdReward(targetLnurl);
      if (mounted.current)
        setWithdrawal({
          lnurl: targetLnurl,
          state: 'success',
          message: `Received ${amount} sats in your Cashu wallet.`,
        });
    } catch (error) {
      if (mounted.current)
        setWithdrawal({
          lnurl: targetLnurl,
          state: 'error',
          message: getErrorMessage(error),
        });
    } finally {
      withdrawing.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Watch Ads</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Withdraw ad rewards to your Cashu wallet"
          accessibilityState={{
            disabled: !targetLnurl || isWithdrawing || isReceived,
            busy: isWithdrawing,
          }}
          disabled={!targetLnurl || isWithdrawing || isReceived}
          style={[
            styles.withdrawButton,
            (!targetLnurl || isWithdrawing || isReceived) &&
              styles.disabledButton,
          ]}
          onPress={handleWithdraw}
        >
          {isWithdrawing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.retryText}>
              {isReceived ? 'Received' : 'Withdraw'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
      {withdrawal && (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.withdrawalMessage,
            withdrawal.state === 'error' && styles.withdrawalError,
          ]}
        >
          {withdrawal.message}
        </Text>
      )}
      {hasError ? (
        <View style={styles.messageContainer}>
          <Text style={styles.message}>Unable to load ads.</Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={() => setHasError(false)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webView}
          style={styles.webView}
          source={{ uri: WATCH_ADS_URL }}
          originWhitelist={[
            'http://*',
            'https://*',
            'about:srcdoc',
            'lightning:*',
          ]}
          injectedJavaScript={WATCH_ADS_LNURL_SCRIPT}
          onMessage={({ nativeEvent }) => {
            const message = parseWatchAdsMessage(
              nativeEvent.url,
              nativeEvent.data
            );
            if (message) setLnurl(message.lnurl);
          }}
          onLoadStart={() => setLnurl(null)}
          // The site's countdown only runs while document.hasFocus() is true.
          onLoadEnd={() => webView.current?.requestFocus()}
          onShouldStartLoadWithRequest={({ url }) => !/^lightning:/i.test(url)}
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.messageContainer, styles.loadingOverlay]}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.message}>Loading ads...</Text>
            </View>
          )}
          onError={() => setHasError(true)}
          onHttpError={() => setHasError(true)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  withdrawButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0070d6',
    minWidth: 104,
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.5 },
  withdrawalMessage: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: '#ccc',
    fontSize: 14,
  },
  withdrawalError: { color: '#ff6b6b' },
  webView: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  messageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  message: {
    marginTop: 16,
    color: '#ccc',
    fontSize: 16,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#444',
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
