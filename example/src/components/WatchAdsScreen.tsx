import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const WATCH_ADS_URL = 'https://ads.example';

export function WatchAdsScreen() {
  const [hasError, setHasError] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Watch Ads</Text>
      </View>
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
          style={styles.webView}
          source={{ uri: WATCH_ADS_URL }}
          originWhitelist={['http://*', 'https://*', 'about:srcdoc']}
          domStorageEnabled
          allowsInlineMediaPlayback
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
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
