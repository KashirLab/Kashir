(() => {
  if (window.__kashirSafariWatchAdsObserver) return;

  const advancedButtons = new WeakSet();
  const initializedPayouts = new WeakSet();
  const attemptedRewards = new Set();
  let redeemingReward = false;
  const nextAdLabel = '次の広告を見る';
  const adCardSelector = 'article.vcard.compact-footer';
  const scrolledAdCards = new WeakSet();

  let screenLock;
  let requestingScreenLock = false;
  let screenLockRetry;
  let retriedScreenLock = false;

  async function keepScreenAwake() {
    if (document.visibilityState !== 'visible') return;
    if (requestingScreenLock || (screenLock && !screenLock.released)) return;

    requestingScreenLock = true;
    try {
      const lock = await navigator.wakeLock?.request('screen');
      if (!lock) return;
      screenLock = lock;
      lock.addEventListener(
        'release',
        () => {
          if (screenLock !== lock) return;
          screenLock = undefined;
          if (document.visibilityState !== 'visible' || retriedScreenLock) {
            return;
          }
          retriedScreenLock = true;
          screenLockRetry = setTimeout(keepScreenAwake, 1000);
        },
        { once: true }
      );
    } catch {
      // Safari can deny wake locks based on device or page state.
    } finally {
      requestingScreenLock = false;
    }
  }

  function refreshScreenLock() {
    clearTimeout(screenLockRetry);
    retriedScreenLock = false;
    keepScreenAwake();
  }

  function selectLnurlTab() {
    const payout = document.querySelector('#payout');
    if (!payout || initializedPayouts.has(payout)) return;

    const tab = payout.querySelector('button#tab-qr[role="tab"]');
    if (
      !tab ||
      tab.disabled ||
      tab.getAttribute('aria-disabled') === 'true' ||
      !tab.getClientRects().length
    ) {
      return;
    }

    initializedPayouts.add(payout);
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
  }

  function payoutNextAdControls() {
    return Array.from(
      document.querySelectorAll('#payout button.primary, #payout a[href="/"]')
    ).filter((control) => control.textContent.trim() === nextAdLabel);
  }

  function scrollDisplayedAd() {
    if (document.visibilityState !== 'visible') return;

    const ad = document.querySelector(adCardSelector);
    const video = ad?.querySelector('video');
    if (
      !ad ||
      scrolledAdCards.has(ad) ||
      !ad.getClientRects().length ||
      getComputedStyle(ad).visibility !== 'visible' ||
      ad.querySelector('.media-waiting') ||
      (video && video.readyState < 2) ||
      payoutNextAdControls().some((control) => control.getClientRects().length)
    ) {
      return;
    }

    scrolledAdCards.add(ad);
    window.requestAnimationFrame(() => {
      if (
        document.visibilityState !== 'visible' ||
        document.querySelector(adCardSelector) !== ad
      ) {
        scrolledAdCards.delete(ad);
        return;
      }
      window.scrollTo(0, document.scrollingElement.scrollHeight);
    });
  }

  function clickNextAd(button, label) {
    if (
      !button ||
      button.disabled ||
      button.getAttribute('aria-disabled') === 'true' ||
      button.textContent.trim() !== label ||
      !button.getClientRects().length ||
      getComputedStyle(button).visibility !== 'visible' ||
      advancedButtons.has(button)
    ) {
      return false;
    }

    advancedButtons.add(button);
    button.click();
    return true;
  }

  function advanceCompletedAd() {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;

    const completed = document.querySelector('.actions #view-complete');
    const button = completed?.parentElement?.querySelector('button#next-view');
    if (clickNextAd(button, 'もっと見る') || redeemingReward) return;
    payoutNextAdControls().some((control) => clickNextAd(control, nextAdLabel));
  }

  async function redeemReward() {
    if (redeemingReward || document.visibilityState !== 'visible') return;
    const payout = document.querySelector('#payout');
    if (!payout || !initializedPayouts.has(payout)) return;

    const link = payout.querySelector('.wallet-open[href]');
    const match = /^lightning:(lnurl1[0-9a-z]{1,4090})$/i.exec(
      link?.getAttribute('href') || ''
    );
    if (!match) return;

    const lnurl = match[1].toLowerCase();
    if (attemptedRewards.has(lnurl)) return;
    attemptedRewards.add(lnurl);
    redeemingReward = true;

    let status = payout.querySelector('[data-kashir-redemption-status]');
    if (!status) {
      status = document.createElement('p');
      status.setAttribute('data-kashir-redemption-status', '');
      status.setAttribute('role', 'status');
      payout.append(status);
    }
    status.textContent = 'Redeeming ad reward…';

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await browser.runtime.sendMessage({
          type: 'redeem-ad-reward',
          lnurl,
        });
        if (result?.amount) {
          status.textContent = `Received ${result.amount} sats in Kashir.`;
          return;
        }
        if (result?.retry !== 'true' || attempt === 2) {
          status.textContent =
            result?.error || 'Could not redeem the ad reward.';
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch {
      status.textContent =
        'Could not redeem the ad reward. Reload the page to retry.';
    } finally {
      redeemingReward = false;
      advanceCompletedAd();
    }
  }

  function updatePage() {
    selectLnurlTab();
    redeemReward();
    advanceCompletedAd();
    scrollDisplayedAd();
  }

  window.__kashirSafariWatchAdsObserver = new MutationObserver(updatePage);
  window.__kashirSafariWatchAdsObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'class', 'style'],
  });
  document.addEventListener('visibilitychange', updatePage);
  document.addEventListener('loadeddata', scrollDisplayedAd, true);
  window.addEventListener('focus', updatePage);
  updatePage();
  document.addEventListener('visibilitychange', refreshScreenLock);
  window.addEventListener('pageshow', refreshScreenLock);
  keepScreenAwake();
})();
