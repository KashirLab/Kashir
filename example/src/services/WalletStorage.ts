import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { waitForAdWithdrawals } from './AdWithdrawalService';
import { SecureStorageService } from './SecureStorageService';
import { walletManager } from './WalletManager';

import {
  getWalletDatabasePath,
  removePrivateWalletBackup,
  walletDatabaseSuffixes,
  withWalletOperationLock,
} from './WalletOperationLock';

export async function resetWalletStorage(): Promise<void> {
  walletManager.reset();
  await waitForAdWithdrawals();

  await withWalletOperationLock(async () => {
    const walletDatabasePath = await getWalletDatabasePath();
    for (const suffix of walletDatabaseSuffixes) {
      const path = walletDatabasePath + suffix;
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
    }

    if (Platform.OS === 'ios') {
      const rewards = `${walletDatabasePath.slice(0, walletDatabasePath.lastIndexOf('/'))}/rewards`;
      if (await RNFS.exists(rewards)) await RNFS.unlink(rewards);
    }
    await removePrivateWalletBackup();
    await AsyncStorage.clear();
    if (!(await SecureStorageService.removeSeedPhrase())) {
      throw new Error('Failed to remove seed phrase from secure storage');
    }
  });
}
