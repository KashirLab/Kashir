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
  WATCH_ADS_SCRIPT,
  parseWatchAdsMessage,
} from './watchAdsBridge';

interface WithdrawalStatus {
  lnurl: string;
  state: 'pending' | 'success' | 'error';
  message: string;
}

export function WatchAdsScreen() {
  const [hasError, setHasError] = useState(false);
  const [withdrawal, setWithdrawal] = useState<WithdrawalStatus | null>(null);
  const webView = useRef<WebView<WebViewProps>>(null);
  const attempts = useRef(new Map<string, WithdrawalStatus['state']>());
  const mounted = useRef(true);

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

  const receiveReward = async (lnurl: string) => {
    const attempt = attempts.current.get(lnurl);
    if (attempt && attempt !== 'error') return;
    attempts.current.set(lnurl, 'pending');
    setWithdrawal({
      lnurl,
      state: 'pending',
      message: 'Receiving your reward into your Cashu wallet...',
    });
    const finish = (state: 'success' | 'error', message: string) => {
      attempts.current.set(lnurl, state);
      if (mounted.current) {
        setWithdrawal((current) =>
          current?.lnurl === lnurl ? { lnurl, state, message } : current
        );
      }
    };
    try {
      const amount = await withdrawAdReward(lnurl);
      finish('success', `Received ${amount} sats in your Cashu wallet.`);
    } catch (error) {
      finish('error', getErrorMessage(error));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {withdrawal && (
        <View>
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.withdrawalMessage,
              withdrawal.state === 'error' && styles.withdrawalError,
            ]}
          >
            {withdrawal.message}
          </Text>
          {withdrawal.state === 'error' && (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.retryWithdrawalButton}
              onPress={() => receiveReward(withdrawal.lnurl)}
            >
              <Text style={styles.retryText}>Retry reward</Text>
            </TouchableOpacity>
          )}
        </View>
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
          injectedJavaScript={WATCH_ADS_SCRIPT}
          onMessage={({ nativeEvent }) => {
            const message = parseWatchAdsMessage(
              nativeEvent.url,
              nativeEvent.data
            );
            if (message?.lnurl && !attempts.current.has(message.lnurl)) {
              void receiveReward(message.lnurl);
            }
          }}
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
  retryWithdrawalButton: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0070d6',
  },
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
