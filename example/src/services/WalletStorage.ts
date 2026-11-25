import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { waitForAdWithdrawals } from './AdWithdrawalService';
import { SecureStorageService } from './SecureStorageService';
import { walletManager } from './WalletManager';

export const walletDatabasePath = `${RNFS.DocumentDirectoryPath}/cdk_multimint_wallet.db`;

export async function resetWalletStorage(): Promise<void> {
  walletManager.reset();
  await waitForAdWithdrawals();

  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const path = walletDatabasePath + suffix;
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  }

  await AsyncStorage.clear();
  if (!(await SecureStorageService.removeSeedPhrase())) {
    throw new Error('Failed to remove seed phrase from secure storage');
  }
}
