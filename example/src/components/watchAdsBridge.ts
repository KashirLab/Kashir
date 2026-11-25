import safariManifest from '../../../safari-extension/manifest.json';

export const WATCH_ADS_URL =
  safariManifest.content_scripts[0].matches[0].replace(/\/\*$/, '');

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
  var nextAdLabel = '次の広告を見る';
  var adCardSelector = 'article.vcard.compact-footer';
  var scrolledAdCards = new WeakSet();
  function payoutNextAdControls() {
    return Array.from(document.querySelectorAll('#payout button.primary, #payout a[href="/"]')).filter(function (control) {
      return control.textContent.trim() === nextAdLabel;
    });
  }
  function scrollDisplayedAd() {
    if (document.visibilityState !== 'visible') return;
    var ad = document.querySelector(adCardSelector);
    var video = ad && ad.querySelector('video');
    if (!ad || scrolledAdCards.has(ad) || !ad.getClientRects().length ||
      getComputedStyle(ad).visibility !== 'visible' || ad.querySelector('.media-waiting') ||
      (video && video.readyState < 2) ||
      payoutNextAdControls().some(function (control) { return control.getClientRects().length; })) return;
    scrolledAdCards.add(ad);
    window.requestAnimationFrame(function () {
      if (document.visibilityState !== 'visible' || document.querySelector(adCardSelector) !== ad) {
        scrolledAdCards.delete(ad);
        return;
      }
      window.scrollTo(0, document.scrollingElement.scrollHeight);
    });
  }
  function clickNextAd(button, label) {
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
    if (button.textContent.trim() !== label || !button.getClientRects().length) return false;
    if (getComputedStyle(button).visibility !== 'visible' || advancedButtons.has(button)) return false;
    advancedButtons.add(button);
    button.click();
    return true;
  }
  function advanceCompletedAd() {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    var completed = document.querySelector('.actions #view-complete');
    var button = completed && completed.parentElement.querySelector('button#next-view');
    if (clickNextAd(button, 'もっと見る')) return;
    payoutNextAdControls().some(function (control) {
      return clickNextAd(control, nextAdLabel);
    });
  }
  function updatePage() {
    selectLnurlTab();
    reportLnurl();
    advanceCompletedAd();
    scrollDisplayedAd();
  }
  window.__kashirWatchAdsObserver = new MutationObserver(updatePage);
  window.__kashirWatchAdsObserver.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['href', 'disabled', 'aria-disabled', 'hidden', 'class', 'style']
  });
  document.addEventListener('visibilitychange', updatePage);
  document.addEventListener('loadeddata', scrollDisplayedAd, true);
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
