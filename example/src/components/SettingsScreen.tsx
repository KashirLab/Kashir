import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import packageInfo from '../../package.json';
import { SecureStorageService } from '../services/SecureStorageService';
import { MintsList, MintUrlModal, SwapModal, useWallet } from './wallet';

interface SettingsScreenProps {
  isVisible: boolean;
  onResetWallet: () => Promise<void>;
}

export function SettingsScreen({
  isVisible,
  onResetWallet,
}: SettingsScreenProps) {
  const [hasSeedPhrase, setHasSeedPhrase] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [mintsRefreshToken, setMintsRefreshToken] = useState(0);

  const {
    multiMintWallet,
    mintUrls,
    activeMintUrl,
    isInitializing,
    isLoadingWallet,
    showMintUrlModal,
    promptForMintUrl,
    handleMintUrlSubmit,
    handleMintUrlModalClose,
    loadMintUrlsFromStorage,
    setActiveMint,
    removeMintUrl,
    updateTotalBalance,
    handleSwapBetweenMints,
  } = useWallet({ initializeOnMount: false });

  useEffect(() => {
    if (isVisible) {
      SecureStorageService.hasSeedPhrase().then(setHasSeedPhrase);
    }
  }, [isVisible]);

  useEffect(() => {
    if (isVisible && !showMintUrlModal) {
      loadMintUrlsFromStorage();
    }
  }, [isVisible, loadMintUrlsFromStorage, showMintUrlModal]);

  const handleViewSeedPhrase = async () => {
    try {
      const seedPhrase = await SecureStorageService.getSeedPhrase();
      if (seedPhrase) {
        Alert.alert('Seed Phrase', seedPhrase, [
          {
            text: 'Copy to Clipboard',
            onPress: () => {
              Clipboard.setString(seedPhrase);
              Alert.alert('Copied', 'Seed phrase copied to clipboard');
            },
          },
          { text: 'Close', style: 'cancel' },
        ]);
      } else {
        Alert.alert('No Seed Phrase', 'No seed phrase found in secure storage');
      }
    } catch {
      Alert.alert(
        'Error',
        'Failed to retrieve seed phrase. Authentication may have been cancelled.'
      );
    }
  };

  const handleRemoveSeedPhrase = () => {
    Alert.alert(
      'Remove Seed Phrase',
      'This deletes the seed phrase, wallet funds stored on this device, mint settings, and ad withdrawal history. Make sure you have a backup before continuing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await onResetWallet();
            } catch {
              Alert.alert('Reset Failed', 'Tap Remove Seed Phrase to retry.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wallet Settings</Text>
          <MintsList
            mintUrls={mintUrls}
            activeMintUrl={activeMintUrl}
            multiMintWallet={multiMintWallet}
            onSetActive={setActiveMint}
            onRemove={removeMintUrl}
            onAddMint={promptForMintUrl}
            onUpdateTotalBalance={updateTotalBalance}
            onSwap={() => setShowSwapModal(true)}
            refreshToken={mintsRefreshToken}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          {hasSeedPhrase ? (
            <>
              <TouchableOpacity
                style={styles.settingButton}
                onPress={handleViewSeedPhrase}
              >
                <Text style={styles.settingButtonText}>View Seed Phrase</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settingButton}
                disabled={isInitializing || isLoadingWallet}
                onPress={handleRemoveSeedPhrase}
              >
                <Text style={[styles.settingButtonText, styles.dangerText]}>
                  Remove Stored Seed Phrase
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.noSeedPhraseText}>No seed phrase stored</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>Version {packageInfo.version}</Text>
        </View>
      </ScrollView>

      <MintUrlModal
        visible={showMintUrlModal}
        onClose={handleMintUrlModalClose}
        onSubmit={handleMintUrlSubmit}
      />
      <SwapModal
        visible={showSwapModal}
        onClose={() => setShowSwapModal(false)}
        multiMintWallet={multiMintWallet}
        mintUrls={mintUrls}
        onSwap={handleSwapBetweenMints}
        onSwapComplete={async () => {
          await updateTotalBalance();
          setMintsRefreshToken((token) => token + 1);
        }}
      />
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
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 15,
  },
  settingButton: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  settingButtonText: {
    fontSize: 16,
    color: '#81b0ff',
  },
  dangerText: {
    color: '#ff6b6b',
  },
  noSeedPhraseText: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  aboutText: {
    fontSize: 14,
    color: '#888',
    paddingVertical: 10,
  },
});
