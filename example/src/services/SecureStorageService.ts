import * as Keychain from 'react-native-keychain';
import { Platform } from 'react-native';
import { WALLET_GROUP } from './WalletOperationLock';

const SEED_PHRASE_KEY = 'wallet_seed_phrase';
const SERVICE_NAME = 'KashirWallet';
const sharedSeedOptions = {
  service: 'KashirSharedWalletSeed',
  accessGroup: WALLET_GROUP,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const sharedMintOptions = {
  ...sharedSeedOptions,
  service: 'KashirSharedWalletMint',
};

export class SecureStorageService {
  /**
   * Check if keychain is available
   */
  private static async isKeychainAvailable(): Promise<boolean> {
    try {
      // Test if keychain module is properly linked
      if (
        !Keychain ||
        typeof Keychain.getSupportedBiometryType !== 'function'
      ) {
        return false;
      }
      await Keychain.getSupportedBiometryType();
      return true;
    } catch (error) {
      console.warn('Keychain not available:', error);
      return false;
    }
  }

  /**
   * Store the seed phrase securely using react-native-keychain
   */
  static async storeSeedPhrase(seedPhrase: string): Promise<boolean> {
    const available = await this.isKeychainAvailable();
    if (!available) {
      console.warn('Keychain not available, cannot store seed phrase securely');
      return false;
    }

    try {
      if (Platform.OS === 'ios') {
        return Boolean(
          await Keychain.setGenericPassword(
            SEED_PHRASE_KEY,
            seedPhrase,
            sharedSeedOptions
          )
        );
      }
      await Keychain.setInternetCredentials(
        SERVICE_NAME,
        SEED_PHRASE_KEY,
        seedPhrase,
        {
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }
      );
      return true;
    } catch (error) {
      console.error('Failed to store seed phrase:', error);
      return false;
    }
  }

  /**
   * Retrieve the seed phrase securely using react-native-keychain
   */
  static async getSeedPhrase(): Promise<string | null> {
    const available = await this.isKeychainAvailable();
    if (!available) {
      console.warn('Keychain not available, cannot retrieve seed phrase');
      return null;
    }

    try {
      if (Platform.OS === 'ios') {
        const shared = await Keychain.getGenericPassword(sharedSeedOptions);
        if (shared) return shared.password;
      }
      const credentials = await Keychain.getInternetCredentials(SERVICE_NAME);

      if (credentials && credentials.password) {
        if (Platform.OS === 'ios') {
          if (!(await this.storeSeedPhrase(credentials.password))) {
            throw new Error(
              'Could not migrate the wallet seed to the shared Keychain.'
            );
          }
          await Keychain.resetInternetCredentials({ server: SERVICE_NAME });
        }
        return credentials.password;
      }
      return null;
    } catch (error) {
      console.error('Failed to retrieve seed phrase:', error);
      return null;
    }
  }

  /**
   * Check if a seed phrase exists in secure storage
   */
  static async hasSeedPhrase(): Promise<boolean> {
    const available = await this.isKeychainAvailable();
    if (!available) {
      return false;
    }

    try {
      // Updated API for react-native-keychain v10.0.0 - service is now part of options object
      if (
        Platform.OS === 'ios' &&
        (await Keychain.hasGenericPassword(sharedSeedOptions))
      ) {
        return true;
      }
      const credentials = await Keychain.hasInternetCredentials({
        server: SERVICE_NAME,
      });
      return credentials;
    } catch (error) {
      console.warn(
        'SecureStorageService: Error checking for credentials:',
        error
      );
      // If we can't check (e.g., user cancelled biometric), assume it doesn't exist
      return false;
    }
  }

  /**
   * Remove the seed phrase from secure storage
   */
  static async removeSeedPhrase(): Promise<boolean> {
    const available = await this.isKeychainAvailable();
    if (!available) {
      return false;
    }

    try {
      // Updated API for react-native-keychain v10.0.0 - service is now part of options object
      if (Platform.OS === 'ios') {
        await Keychain.resetGenericPassword(sharedMintOptions);
        await Keychain.resetGenericPassword(sharedSeedOptions);
      }
      await Keychain.resetInternetCredentials({ server: SERVICE_NAME });
      return true;
    } catch (error) {
      console.error('Failed to remove seed phrase:', error);
      return false;
    }
  }

  static async setSharedActiveMint(url: string): Promise<void> {
    if (Platform.OS !== 'ios') return;
    if (url) {
      const saved = await Keychain.setGenericPassword(
        'active_mint',
        url,
        sharedMintOptions
      );
      if (!saved) throw new Error('Could not save the active mint for Safari.');
    } else {
      await Keychain.resetGenericPassword(sharedMintOptions);
    }
  }

  /**
   * Check if biometric authentication is available
   */
  static async isBiometricAvailable(): Promise<boolean> {
    const available = await this.isKeychainAvailable();
    if (!available) {
      return false;
    }

    try {
      const biometryType = await Keychain.getSupportedBiometryType();
      return biometryType !== null;
    } catch {
      return false;
    }
  }
}
