import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';

export const WALLET_GROUP = 'group.kashir';
const databaseName = 'cdk_multimint_wallet.db';
const privateDatabasePath = `${RNFS.DocumentDirectoryPath}/${databaseName}`;
export const walletDatabaseSuffixes = ['', '-wal', '-shm', '-journal'];
let databasePathPromise: Promise<string> | undefined;

async function resolveDatabasePath(): Promise<string> {
  const container =
    await NativeModules.WalletOperationLock.sharedContainer(WALLET_GROUP);
  const directory = `${container}/wallet`;
  if (!(await RNFS.exists(directory))) {
    // Publish the database and its recovery files together before either process opens it.
    const staging = `${container}/wallet-migration`;
    if (await RNFS.exists(staging)) await RNFS.unlink(staging);
    await RNFS.mkdir(staging);
    for (const suffix of walletDatabaseSuffixes.filter(
      (suffix) => suffix !== '-shm'
    )) {
      const source = privateDatabasePath + suffix;
      if (await RNFS.exists(source)) {
        await RNFS.copyFile(source, `${staging}/${databaseName}${suffix}`);
      }
    }
    await RNFS.moveFile(staging, directory);
  }
  return `${directory}/${databaseName}`;
}

export function getWalletDatabasePath(): Promise<string> {
  if (Platform.OS !== 'ios') return Promise.resolve(privateDatabasePath);
  databasePathPromise ??= resolveDatabasePath().catch((error: unknown) => {
    databasePathPromise = undefined;
    throw error;
  });
  return databasePathPromise;
}

export async function removePrivateWalletBackup(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  for (const suffix of walletDatabaseSuffixes) {
    const path = privateDatabasePath + suffix;
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  }
}

export async function withWalletOperationLock<T>(
  operation: () => Promise<T>
): Promise<T> {
  if (Platform.OS !== 'ios') return operation();

  const lock = NativeModules.WalletOperationLock;
  if (!lock) {
    throw new Error('The iOS wallet lock is unavailable. Rebuild Kashir.');
  }

  const lease = await lock.acquire(await getWalletDatabasePath());

  try {
    return await operation();
  } finally {
    await lock.releaseLease(lease);
  }
}
