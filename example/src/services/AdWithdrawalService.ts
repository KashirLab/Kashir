import AsyncStorage from '@react-native-async-storage/async-storage';
import { bech32 } from 'bech32';
import {
  CurrencyUnit,
  MintUrl,
  PaymentMethod,
  QuoteState,
  SplitTarget,
} from 'kashir';
import { WATCH_ADS_URL } from '../components/watchAdsBridge';
import { walletManager } from './WalletManager';
import { withWalletOperationLock } from './WalletOperationLock';

const STORAGE_PREFIX = '@cashu_ad_withdrawal:';
const activeWithdrawals = new Map<string, Promise<bigint>>();
let resuming = false;

interface PendingWithdrawal {
  state: 'pending';
  mintUrl: string;
  quoteId: string;
  invoice: string;
  amountSats: string;
  callback: string;
  k1: string;
}

interface CompletedWithdrawal {
  state: 'complete';
  amountSats: string;
}

function withdrawalUrl(lnurl: string): URL {
  const decoded = bech32.decode(lnurl.replace(/^lightning:/i, ''), 4096);
  if (decoded.prefix !== 'lnurl') throw new Error('Invalid withdrawal LNURL.');
  const bytes = bech32.fromWords(decoded.words);
  const url = new URL(
    decodeURIComponent(
      bytes.map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('')
    )
  );
  validateUrl(url);
  return url;
}

function validateUrl(url: URL) {
  if (url.origin !== WATCH_ADS_URL || url.username || url.password) {
    throw new Error('The withdrawal URL does not belong to the ads site.');
  }
}

async function fetchJson(url: URL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (response.url) validateUrl(new URL(response.url));
    if (!response.ok)
      throw new Error(
        'The withdrawal service could not be reached. Please retry.'
      );
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function processWithdrawal(key: string, url?: URL): Promise<bigint> {
  const stored = await AsyncStorage.getItem(key);
  let record: PendingWithdrawal | CompletedWithdrawal | null = stored
    ? JSON.parse(stored)
    : null;
  if (record?.state === 'complete') return BigInt(record.amountSats);

  const repository = walletManager.getMultiMintWallet();
  if (!repository || walletManager.isWalletLoading()) {
    throw new Error('Create or restore your Cashu wallet before withdrawing.');
  }
  const mintUrl = record?.mintUrl || walletManager.getActiveMintUrl();
  if (!mintUrl)
    throw new Error('Select a mint in Settings before withdrawing.');
  const mintWallet = await repository.getWallet(
    MintUrl.new({ url: mintUrl }),
    CurrencyUnit.Sat.new()
  );

  if (!record) {
    if (!url) throw new Error('The withdrawal request is missing.');
    const request = await fetchJson(url);
    if (request?.tag !== 'withdrawRequest') {
      throw new Error(
        typeof request?.reason === 'string'
          ? request.reason
          : 'This LNURL is not a withdrawal request.'
      );
    }
    const { minWithdrawable, maxWithdrawable, k1 } = request;
    if (
      !Number.isSafeInteger(minWithdrawable) ||
      !Number.isSafeInteger(maxWithdrawable) ||
      minWithdrawable < 0 ||
      maxWithdrawable <= 0 ||
      minWithdrawable > maxWithdrawable ||
      typeof k1 !== 'string' ||
      !k1 ||
      typeof request.callback !== 'string'
    )
      throw new Error('The withdrawal request is invalid.');
    const amountSats = BigInt(Math.floor(maxWithdrawable / 1000));
    if (amountSats <= 0n || amountSats * 1000n < BigInt(minWithdrawable)) {
      throw new Error('The reward is too small to receive in sats.');
    }
    const callback = new URL(request.callback);
    validateUrl(callback);
    const quote = await withWalletOperationLock(() =>
      mintWallet.mintQuote(
        PaymentMethod.Bolt11.new(),
        { value: amountSats },
        'Ad reward withdrawal',
        undefined
      )
    );
    record = {
      state: 'pending',
      mintUrl,
      quoteId: quote.id,
      invoice: quote.request,
      amountSats: amountSats.toString(),
      callback: callback.toString(),
      k1,
    };
    // Persist before submitting the invoice, so retries always use the same payment.
    await AsyncStorage.setItem(key, JSON.stringify(record));
  }

  const pending = record;
  const complete = async () => {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ state: 'complete', amountSats: pending.amountSats })
    );
    walletManager.notifyBalanceChanged();
    return BigInt(pending.amountSats);
  };
  const claimPaidQuote = async () => {
    const quote = await withWalletOperationLock(() =>
      mintWallet.checkMintQuote(pending.quoteId)
    );
    if (quote.state === QuoteState.Paid) {
      await withWalletOperationLock(() =>
        mintWallet.mint(pending.quoteId, SplitTarget.None.new(), undefined)
      );
      return true;
    }
    return quote.state === QuoteState.Issued;
  };

  if (await claimPaidQuote()) return complete();
  const callback = new URL(pending.callback);
  validateUrl(callback);
  callback.searchParams.set('k1', pending.k1);
  callback.searchParams.set('pr', pending.invoice);
  let rejection: string | undefined;
  try {
    const response = await fetchJson(callback);
    if (response?.status !== 'OK') {
      rejection =
        typeof response?.reason === 'string'
          ? response.reason
          : 'The withdrawal was not accepted. Please retry.';
    }
  } catch {
    // A lost response can still mean payment succeeded. Check the saved quote.
  }

  for (let attempt = 0; attempt < 60; attempt++) {
    let paid = false;
    try {
      // Poll serially; never issue overlapping mint requests for this quote.
      const quote = await withWalletOperationLock(() =>
        mintWallet.checkMintQuote(pending.quoteId)
      );
      paid = quote.state === QuoteState.Paid;
      if (quote.state === QuoteState.Issued) return complete();
    } catch {
      // Keep the quote for recovery if the mint is temporarily unreachable.
    }
    if (paid) {
      await withWalletOperationLock(() =>
        mintWallet.mint(pending.quoteId, SplitTarget.None.new(), undefined)
      );
      return complete();
    }
    if (rejection) throw new Error(rejection);
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Payment is still pending. Tap Withdraw to check again.');
}

function runWithdrawal(key: string, url?: URL): Promise<bigint> {
  if (!walletManager.hasWallet()) {
    return Promise.reject(
      new Error('Create or restore your Cashu wallet before withdrawing.')
    );
  }
  const active = activeWithdrawals.get(key);
  if (active) return active;
  const operation = processWithdrawal(key, url);
  activeWithdrawals.set(key, operation);
  const cleanup = () => activeWithdrawals.delete(key);
  operation.then(cleanup, cleanup);
  return operation;
}

export async function waitForAdWithdrawals(): Promise<void> {
  await Promise.allSettled(activeWithdrawals.values());
}

export async function withdrawAdReward(lnurl: string): Promise<bigint> {
  const url = withdrawalUrl(lnurl);
  return runWithdrawal(`${STORAGE_PREFIX}${url.toString()}`, url);
}

export async function resumePendingAdWithdrawals(): Promise<void> {
  if (resuming || !walletManager.hasWallet() || walletManager.isWalletLoading())
    return;
  resuming = true;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith(STORAGE_PREFIX)
    );
    const records = await AsyncStorage.multiGet(keys);
    await Promise.allSettled(
      records.map(async ([key, value]) => {
        if (value && JSON.parse(value).state === 'pending')
          await runWithdrawal(key);
      })
    );
  } catch {
    console.warn(
      'Could not check pending ad withdrawals. They will be retried when the wallet is ready.'
    );
  } finally {
    resuming = false;
  }
}
