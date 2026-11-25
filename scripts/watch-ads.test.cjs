const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const bridge = loadTs('example/src/components/watchAdsBridge.ts');
const ORIGIN = bridge.WATCH_ADS_URL;
const endpoint = `${ORIGIN}/api/payout/reward/lnurl?k1=offer-secret`;
const { bech32 } = require('../example/node_modules/bech32');
const encodeLnurl = (url, prefix = 'lnurl') =>
  bech32.encode(prefix, bech32.toWords(Buffer.from(url)), 4096);
const lnurl = encodeLnurl(endpoint);

// Exercise the shipped TypeScript with native APIs replaced by controlled fakes.
function loadTs(relativePath, mocks = {}, globals = {}) {
  const filename = path.resolve(root, relativePath);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: (name) =>
        Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name),
      URL,
      AbortController,
      console,
      setTimeout,
      clearTimeout,
      ...globals,
    },
    { filename }
  );
  return module.exports;
}

const bridgeMessage = (value) =>
  JSON.stringify({ type: 'kashir:ad-lnurl', lnurl: value });

function createWithdrawalHarness() {
  const storage = new Map();
  const events = [];
  const state = {
    hasWallet: true,
    loading: false,
    mintUrl: 'https://mint.example',
    quoteState: 0,
    mintFailures: 0,
    callbackMode: 'paid',
    metadata: {
      tag: 'withdrawRequest',
      minWithdrawable: 2000,
      maxWithdrawable: 2000,
      callback: `${ORIGIN}/api/payout/reward/callback?source=ads`,
      k1: 'claim-key',
    },
  };
  const QuoteState = { Unpaid: 0, Paid: 1, Pending: 2, Issued: 3 };
  const mintWallet = {
    async mintQuote(method, amount) {
      events.push({ type: 'quote', method, amount: amount.value });
      return { id: 'quote-1', request: 'lnbc20n1testinvoice' };
    },
    async checkMintQuote(id) {
      assert.equal(id, 'quote-1');
      return { state: state.quoteState };
    },
    async mint(id) {
      events.push({ type: 'mint', id });
      if (state.mintFailures-- > 0) throw new Error('Temporary mint failure');
      assert.equal(state.quoteState, QuoteState.Paid);
      state.quoteState = QuoteState.Issued;
    },
  };
  const repository = {
    async getWallet(mintUrl) {
      events.push({ type: 'wallet', mintUrl: mintUrl.url });
      return mintWallet;
    },
  };
  const walletManager = {
    getMultiMintWallet: () => (state.hasWallet ? repository : null),
    getActiveMintUrl: () => state.mintUrl,
    isWalletLoading: () => state.loading,
    hasWallet: () => state.hasWallet,
    notifyBalanceChanged: () => events.push({ type: 'balance' }),
  };
  const mocks = {
    '@react-native-async-storage/async-storage': {
      async getItem(key) {
        return storage.get(key) ?? null;
      },
      async setItem(key, value) {
        storage.set(key, value);
      },
      async getAllKeys() {
        return [...storage.keys()];
      },
      async multiGet(keys) {
        return keys.map((key) => [key, storage.get(key)]);
      },
    },
    'kashir': {
      CurrencyUnit: { Sat: { new: () => 'sat' } },
      MintUrl: { new: (value) => value },
      PaymentMethod: { Bolt11: { new: () => 'bolt11' } },
      SplitTarget: { None: { new: () => 'none' } },
      QuoteState,
    },
    '../components/watchAdsBridge': bridge,
    './WalletManager': { walletManager },
    './WalletOperationLock': {
      withWalletOperationLock: (operation) => operation(),
    },
  };
  const globals = {
    // Poll immediately in tests; retain real network-abort timers.
    setTimeout: (callback, delay) =>
      delay === 2000
        ? (queueMicrotask(callback), 0)
        : setTimeout(callback, delay),
    async fetch(value) {
      const url = new URL(value);
      const callback = url.pathname.endsWith('/callback');
      events.push({ type: callback ? 'callback' : 'metadata', url });
      if (callback) {
        const pending = [...storage.values()]
          .map(JSON.parse)
          .find((record) => record.state === 'pending');
        assert.ok(pending, 'Persist the invoice before requesting payment');
        assert.equal(url.searchParams.get('pr'), pending.invoice);
        if (
          state.callbackMode === 'paid' ||
          state.callbackMode === 'lost-response'
        )
          state.quoteState = QuoteState.Paid;
        if (state.callbackMode === 'lost-response')
          throw new Error('Network response lost');
      }
      return {
        ok: true,
        url: url.toString(),
        async json() {
          if (!callback) return state.metadata;
          return state.callbackMode === 'rejected'
            ? { status: 'ERROR', reason: 'Please retry the payout' }
            : { status: 'OK' };
        },
      };
    },
  };
  const reload = () =>
    loadTs('example/src/services/AdWithdrawalService.ts', mocks, globals);
  return { service: reload(), reload, storage, events, state, QuoteState };
}

test('the page bridge reports visible LNURLs, changes, and removal without initiating payment', () => {
  let href = null;
  let notify;
  const messages = [];
  const window = {
    location: { origin: ORIGIN },
    addEventListener() {},
    ReactNativeWebView: {
      postMessage: (value) => messages.push(JSON.parse(value)),
    },
  };
  window.top = window.self = window;
  const context = vm.createContext({
    window,
    document: {
      documentElement: {},
      addEventListener() {},
      querySelector: (selector) =>
        selector === '#payout .wallet-open[href]' && href
          ? { getAttribute: () => href }
          : null,
    },
    MutationObserver: class {
      constructor(callback) {
        notify = callback;
      }
      observe() {}
    },
  });
  vm.runInContext(bridge.WATCH_ADS_SCRIPT, context);
  href = `lightning:${lnurl.toUpperCase()}`;
  notify();
  notify();
  href = null;
  notify();
  assert.deepEqual(
    messages.map((message) => message.lnurl),
    [null, lnurl, null]
  );
  vm.runInContext(bridge.WATCH_ADS_SCRIPT, context);
  assert.equal(messages.length, 3, 'Do not install duplicate observers');
});

function createAdPageHarness() {
  const state = {
    completed: false,
    payout: null,
    focused: true,
    visible: true,
    button: null,
    clicks: 0,
  };
  const listeners = {};
  let notify;
  const window = {
    location: { origin: ORIGIN },
    ReactNativeWebView: { postMessage() {} },
    addEventListener: (event, callback) => {
      listeners[event] = callback;
    },
  };
  window.top = window.self = window;
  const completed = { parentElement: { querySelector: () => state.button } };
  const context = vm.createContext({
    window,
    document: {
      documentElement: {},
      get visibilityState() {
        return state.visible ? 'visible' : 'hidden';
      },
      hasFocus: () => state.focused,
      querySelector: (selector) =>
        selector === '#payout'
          ? state.payout
          : selector === '.actions #view-complete' && state.completed
            ? completed
            : null,
      addEventListener: (event, callback) => {
        listeners[event] = callback;
      },
    },
    getComputedStyle: (button) => ({ visibility: button.visibility }),
    MutationObserver: class {
      constructor(callback) {
        notify = callback;
      }
      observe() {}
    },
  });
  vm.runInContext(bridge.WATCH_ADS_SCRIPT, context);
  const nextButton = () => ({
    disabled: false,
    ariaDisabled: null,
    visible: true,
    visibility: 'visible',
    textContent: 'もっと見る',
    getAttribute(name) {
      return name === 'aria-disabled' ? this.ariaDisabled : null;
    },
    getClientRects() {
      return this.visible ? [{}] : [];
    },
    click() {
      state.clicks++;
    },
  });
  return { state, notify, listeners, nextButton };
}

test('the QR / LNURL tab is selected once when each payout appears', () => {
  const h = createAdPageHarness();
  const tab = h.nextButton();
  tab.disabled = true;
  const payout = {
    querySelector: (selector) =>
      selector === 'button#tab-qr[role="tab"]' ? tab : null,
  };
  h.notify();
  assert.equal(h.state.clicks, 0);
  h.state.payout = payout;
  h.notify();
  assert.equal(h.state.clicks, 0);
  tab.disabled = false;
  h.notify();
  assert.equal(h.state.clicks, 1);
  h.notify();
  assert.equal(h.state.clicks, 1);

  tab.getAttribute = (name) => (name === 'aria-selected' ? 'true' : null);
  h.state.payout = { ...payout };
  h.notify();
  assert.equal(h.state.clicks, 1, 'Leave the tab alone if already selected');
  tab.getAttribute = () => null;
  h.notify();
  assert.equal(h.state.clicks, 1, 'Respect later manual tab changes');
});

test('More is clicked only after the site confirms the countdown and enables the button', () => {
  const h = createAdPageHarness();
  h.state.button = h.nextButton();
  h.notify();
  assert.equal(
    h.state.clicks,
    0,
    'An uncompleted or non-reward ad must not auto-advance'
  );
  h.state.completed = true;
  h.state.button.disabled = true;
  h.notify();
  assert.equal(
    h.state.clicks,
    0,
    'Wait for the site to finish confirming the view'
  );
  h.state.button.disabled = false;
  h.notify();
  assert.equal(h.state.clicks, 1);
  h.notify();
  h.listeners.focus();
  assert.equal(h.state.clicks, 1, 'Click each completed ad only once');
  h.state.completed = false;
  h.state.button = h.nextButton();
  h.notify();
  assert.equal(h.state.clicks, 1, 'Wait for the next ad to finish too');
  h.state.completed = true;
  h.notify();
  assert.equal(h.state.clicks, 2);
});

test('completed ads only advance while the page is visible and focused', () => {
  const h = createAdPageHarness();
  h.state.button = h.nextButton();
  h.state.completed = true;
  h.state.visible = false;
  h.notify();
  assert.equal(h.state.clicks, 0);
  h.state.focused = false;
  h.state.visible = true;
  h.listeners.visibilitychange();
  assert.equal(h.state.clicks, 0);
  h.state.focused = true;
  h.listeners.focus();
  assert.equal(h.state.clicks, 1);
});

test('auto-advance ignores hidden buttons, other labels, and disabled accessibility states', () => {
  const h = createAdPageHarness();
  h.state.completed = true;
  h.state.button = h.nextButton();
  h.state.button.textContent = '受け取る';
  h.notify();
  assert.equal(
    h.state.clicks,
    0,
    'Leave receiving and withdrawal actions to the user'
  );
  h.state.button.textContent = 'もっと見る';
  h.state.button.ariaDisabled = 'true';
  h.notify();
  assert.equal(h.state.clicks, 0);
  h.state.button.ariaDisabled = null;
  h.state.button.visible = false;
  h.notify();
  assert.equal(h.state.clicks, 0);
  h.state.button.visible = true;
  h.state.button.visibility = 'hidden';
  h.notify();
  assert.equal(h.state.clicks, 0);
  h.state.button.visibility = 'visible';
  h.notify();
  assert.equal(h.state.clicks, 1);
});

test('bridge messages from other origins and malformed messages are ignored', () => {
  assert.equal(
    bridge.parseWatchAdsMessage('https://evil.example', bridgeMessage(lnurl)),
    undefined
  );
  assert.equal(
    bridge.parseWatchAdsMessage(`${ORIGIN}.evil.example`, bridgeMessage(lnurl)),
    undefined
  );
  assert.equal(bridge.parseWatchAdsMessage(ORIGIN, '{invalid'), undefined);
  assert.equal(
    bridge.parseWatchAdsMessage(ORIGIN, bridgeMessage('not-lnurl')),
    undefined
  );
  assert.equal(
    bridge.parseWatchAdsMessage(ORIGIN, bridgeMessage(lnurl)).lnurl,
    lnurl
  );
  assert.equal(
    bridge.parseWatchAdsMessage(ORIGIN, bridgeMessage(null)).lnurl,
    null
  );
});

test('a trusted payout LNURL starts one automatic withdrawal and errors can be retried', async () => {
  const hooks = [];
  let cursor;
  let calls = 0;
  let finish;
  let rejectPayment;
  let appStateChanged;
  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [
        hooks[index],
        (value) => {
          hooks[index] =
            typeof value === 'function' ? value(hooks[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect(effect) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { cleanup: effect() };
    },
  };
  const { WatchAdsScreen } = loadTs(
    'example/src/components/WatchAdsScreen.tsx',
    {
      'react': react,
      'react-native': {
        ActivityIndicator: 'ActivityIndicator',
        AppState: {
          addEventListener(event, callback) {
            assert.equal(event, 'change');
            appStateChanged = callback;
            return {
              remove() {
                appStateChanged = undefined;
              },
            };
          },
        },
        View: 'View',
        Text: 'Text',
        TouchableOpacity: 'Button',
        StyleSheet: { create: (value) => value },
      },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      'react-native-webview': { WebView: 'WebView' },
      '../services/AdWithdrawalService': {
        withdrawAdReward: () => {
          calls++;
          return new Promise((resolve, reject) => {
            finish = resolve;
            rejectPayment = reject;
          });
        },
      },
      './wallet/utils/errorUtils': {
        getErrorMessage: (error) => error.message,
      },
      './watchAdsBridge': bridge,
    }
  );
  const render = () => {
    cursor = 0;
    return WatchAdsScreen();
  };
  function find(element, type) {
    if (!element || typeof element !== 'object') return undefined;
    if (element.type === type) return element;
    return element.props.children
      .flat(Infinity)
      .map((child) => find(child, type))
      .find(Boolean);
  }
  let tree = render();
  const webView = find(tree, 'WebView');
  let focusRequests = 0;
  webView.props.ref.current = {
    requestFocus: () => {
      focusRequests++;
    },
  };
  assert.equal(focusRequests, 0);
  webView.props.onLoadEnd();
  assert.equal(
    focusRequests,
    1,
    'Focus the initial page so its first countdown can start'
  );
  appStateChanged('background');
  assert.equal(focusRequests, 1, 'Do not focus a backgrounded ad');
  appStateChanged('active');
  assert.equal(
    focusRequests,
    2,
    'Restore focus when returning to the visible ad'
  );
  assert.equal(
    webView.props.mediaPlaybackRequiresUserAction,
    false,
    'Allow the site to start its first video without an extra tap'
  );
  assert.equal(find(tree, 'Button'), undefined);
  const report = (url, data) =>
    find(tree, 'WebView').props.onMessage({ nativeEvent: { url, data } });
  report('https://evil.example', bridgeMessage(lnurl));
  report(ORIGIN, bridgeMessage(null));
  assert.equal(calls, 0);

  report(ORIGIN, bridgeMessage(lnurl));
  report(ORIGIN, bridgeMessage(lnurl));
  assert.equal(calls, 1);
  tree = render();
  assert.equal(find(tree, 'Button'), undefined);
  assert.match(JSON.stringify(tree), /Receiving your reward/);

  rejectPayment(new Error('Payout failed'));
  await new Promise((resolve) => setImmediate(resolve));
  report(ORIGIN, bridgeMessage(lnurl));
  assert.equal(calls, 1, 'Do not retry automatically after a failure');

  tree = render();
  const retry = find(tree, 'Button').props.onPress();
  assert.equal(calls, 2);
  finish(2n);
  await retry;
  tree = render();
  assert.equal(find(tree, 'Button'), undefined);
  assert.match(JSON.stringify(tree), /Received 2 sats/);
  report(ORIGIN, bridgeMessage(lnurl));
  assert.equal(calls, 2);
  for (const hook of hooks) hook?.cleanup?.();
  assert.equal(
    appStateChanged,
    undefined,
    'Remove the focus listener when leaving Watch Ads'
  );
});

test('withdrawal pays the selected mint invoice, mints the reward, and refreshes the wallet', async () => {
  const h = createWithdrawalHarness();
  assert.equal(await h.service.withdrawAdReward(lnurl), 2n);
  assert.equal(h.events.find((event) => event.type === 'quote').amount, 2n);
  const callback = h.events.find((event) => event.type === 'callback').url;
  assert.equal(callback.searchParams.get('k1'), 'claim-key');
  assert.equal(callback.searchParams.get('pr'), 'lnbc20n1testinvoice');
  assert.equal(callback.searchParams.get('source'), 'ads');
  assert.equal(h.events.filter((event) => event.type === 'mint').length, 1);
  assert.equal(h.events.filter((event) => event.type === 'balance').length, 1);
  assert.equal(JSON.parse([...h.storage.values()][0]).state, 'complete');
});

test('concurrent requests and repeated taps reuse the same withdrawal', async () => {
  const h = createWithdrawalHarness();
  const results = await Promise.all([
    h.service.withdrawAdReward(lnurl),
    h.service.withdrawAdReward(lnurl.toUpperCase()),
  ]);
  assert.deepEqual(results, [2n, 2n]);
  assert.equal(await h.service.withdrawAdReward(lnurl), 2n);
  for (const type of ['metadata', 'quote', 'callback', 'mint'])
    assert.equal(
      h.events.filter((event) => event.type === type).length,
      1,
      type
    );
});

test('a lost callback response still completes if the mint was paid', async () => {
  const h = createWithdrawalHarness();
  h.state.callbackMode = 'lost-response';
  assert.equal(await h.service.withdrawAdReward(lnurl), 2n);
  assert.equal(h.events.filter((event) => event.type === 'mint').length, 1);
});

test('an interrupted mint resumes after restart using the original mint and invoice', async () => {
  const h = createWithdrawalHarness();
  h.state.mintFailures = 1;
  await assert.rejects(
    h.service.withdrawAdReward(lnurl),
    /Temporary mint failure/
  );
  assert.equal(JSON.parse([...h.storage.values()][0]).state, 'pending');
  h.state.mintUrl = 'https://another-mint.example';
  await h.reload().resumePendingAdWithdrawals();
  assert.equal(JSON.parse([...h.storage.values()][0]).state, 'complete');
  assert.ok(
    h.events
      .filter((event) => event.type === 'wallet')
      .every((event) => event.mintUrl === 'https://mint.example')
  );
  assert.equal(h.events.filter((event) => event.type === 'quote').length, 1);
  assert.equal(h.events.filter((event) => event.type === 'callback').length, 1);
});

test('a rejected payout can be retried with the saved invoice', async () => {
  const h = createWithdrawalHarness();
  h.state.callbackMode = 'rejected';
  await assert.rejects(
    h.service.withdrawAdReward(lnurl),
    /Please retry the payout/
  );
  assert.equal(h.events.filter((event) => event.type === 'mint').length, 0);
  assert.equal(h.events.filter((event) => event.type === 'balance').length, 0);
  h.state.callbackMode = 'paid';
  assert.equal(await h.service.withdrawAdReward(lnurl), 2n);
  assert.equal(h.events.filter((event) => event.type === 'quote').length, 1);
});

test('payment timeouts retain the invoice and never report unpaid rewards as received', async () => {
  const h = createWithdrawalHarness();
  h.state.callbackMode = 'unpaid';
  await assert.rejects(h.service.withdrawAdReward(lnurl), /still pending/);
  assert.equal(JSON.parse([...h.storage.values()][0]).state, 'pending');
  assert.equal(h.events.filter((event) => event.type === 'mint').length, 0);
  assert.equal(h.events.filter((event) => event.type === 'balance').length, 0);
  h.state.callbackMode = 'paid';
  assert.equal(await h.service.withdrawAdReward(lnurl), 2n);
  assert.equal(h.events.filter((event) => event.type === 'quote').length, 1);
});

test('invalid LNURLs and foreign endpoints never reach the mint or network', async () => {
  for (const value of [
    lnurl.slice(0, -1),
    encodeLnurl(endpoint, 'other'),
    encodeLnurl('https://evil.example/withdraw'),
    encodeLnurl(endpoint.replace('https:', 'http:')),
  ]) {
    const h = createWithdrawalHarness();
    await assert.rejects(h.service.withdrawAdReward(value));
    assert.equal(h.events.length, 0);
  }
});

test('invalid bounds, non-withdrawal requests, and foreign callbacks cannot create invoices', async () => {
  for (const override of [
    { tag: 'payRequest' },
    { minWithdrawable: 3000 },
    { maxWithdrawable: -1 },
    { maxWithdrawable: Number.MAX_SAFE_INTEGER + 1 },
    { maxWithdrawable: 2500, minWithdrawable: 2500 },
    { k1: '' },
    { callback: 'https://evil.example/callback' },
  ]) {
    const h = createWithdrawalHarness();
    Object.assign(h.state.metadata, override);
    await assert.rejects(h.service.withdrawAdReward(lnurl));
    assert.equal(h.events.filter((event) => event.type === 'quote').length, 0);
    assert.equal(
      h.events.filter((event) => event.type === 'callback').length,
      0
    );
  }
});

test('a wallet and active mint are required; startup never starts an unrequested withdrawal', async () => {
  const h = createWithdrawalHarness();
  await h.service.resumePendingAdWithdrawals();
  assert.equal(h.events.length, 0);
  h.state.hasWallet = false;
  await assert.rejects(h.service.withdrawAdReward(lnurl), /Create or restore/);
  h.state.hasWallet = true;
  h.state.mintUrl = '';
  await assert.rejects(h.service.withdrawAdReward(lnurl), /Select a mint/);
  assert.equal(h.events.length, 0);
});
