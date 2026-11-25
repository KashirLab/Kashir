export const WATCH_ADS_URL = 'https://ads.example';

const MESSAGE_TYPE = 'kashir:ad-lnurl';

export const WATCH_ADS_LNURL_SCRIPT = `
(function () {
  if (window.top !== window.self || window.location.origin !== ${JSON.stringify(WATCH_ADS_URL)}) return;
  if (window.__kashirWatchAdsObserver) return;
  var previous;
  function reportLnurl() {
    var link = document.querySelector('#payout .wallet-open[href]');
    var match = link && /^lightning:(lnurl1[0-9a-z]+)$/i.exec(link.getAttribute('href') || '');
    var lnurl = match ? match[1].toLowerCase() : null;
    if (lnurl === previous) return;
    previous = lnurl;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: ${JSON.stringify(MESSAGE_TYPE)}, lnurl: lnurl }));
  }
  window.__kashirWatchAdsObserver = new MutationObserver(reportLnurl);
  window.__kashirWatchAdsObserver.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['href']
  });
  reportLnurl();
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
