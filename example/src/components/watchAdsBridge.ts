export const WATCH_ADS_URL = 'https://ads.example';

const MESSAGE_TYPE = 'kashir:ad-lnurl';

export const WATCH_ADS_SCRIPT = `
(function () {
  if (window.top !== window.self || window.location.origin !== ${JSON.stringify(WATCH_ADS_URL)}) return;
  if (window.__kashirWatchAdsObserver) return;
  var previous;
  var advancedButtons = new WeakSet();
  var initializedPayouts = new WeakSet();
  function selectLnurlTab() {
    var payout = document.querySelector('#payout');
    if (!payout || initializedPayouts.has(payout)) return;
    var tab = payout.querySelector('button#tab-qr[role="tab"]');
    if (!tab || tab.disabled || tab.getAttribute('aria-disabled') === 'true' || !tab.getClientRects().length) return;
    initializedPayouts.add(payout);
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
  }
  function reportLnurl() {
    var link = document.querySelector('#payout .wallet-open[href]');
    var match = link && /^lightning:(lnurl1[0-9a-z]+)$/i.exec(link.getAttribute('href') || '');
    var lnurl = match ? match[1].toLowerCase() : null;
    if (lnurl === previous) return;
    previous = lnurl;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: ${JSON.stringify(MESSAGE_TYPE)}, lnurl: lnurl }));
  }
  function advanceCompletedAd() {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    var completed = document.querySelector('.actions #view-complete');
    var button = completed && completed.parentElement.querySelector('button#next-view');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    if (button.textContent.trim() !== 'もっと見る' || !button.getClientRects().length) return;
    if (getComputedStyle(button).visibility !== 'visible' || advancedButtons.has(button)) return;
    advancedButtons.add(button);
    button.click();
  }
  function updatePage() {
    selectLnurlTab();
    reportLnurl();
    advanceCompletedAd();
  }
  window.__kashirWatchAdsObserver = new MutationObserver(updatePage);
  window.__kashirWatchAdsObserver.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['href', 'disabled', 'aria-disabled', 'hidden', 'class', 'style']
  });
  document.addEventListener('visibilitychange', updatePage);
  window.addEventListener('focus', updatePage);
  updatePage();
})();
true;
`;

export function parseWatchAdsMessage(
  pageUrl: string,
  data: string
): { lnurl: string | null } | undefined {
  try {
    if (new URL(pageUrl).origin !== WATCH_ADS_URL || data.length > 8192) {
      return undefined;
    }
    const message = JSON.parse(data);
    if (message?.type !== MESSAGE_TYPE) return undefined;
    if (message.lnurl === null) return { lnurl: null };
    if (
      typeof message.lnurl === 'string' &&
      message.lnurl.length <= 4096 &&
      /^lnurl1[0-9a-z]+$/i.test(message.lnurl)
    ) {
      return { lnurl: message.lnurl.toLowerCase() };
    }
  } catch {
    // Ignore messages from unrelated page scripts and frames.
  }
  return undefined;
}
