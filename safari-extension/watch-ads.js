(() => {
  if (window.__kashirSafariWatchAdsObserver) return;

  const advancedButtons = new WeakSet();
  const initializedPayouts = new WeakSet();
  const attemptedRewards = new Set();
  let redeemingReward = false;

  let screenLock;
  let requestingScreenLock = false;

  async function keepScreenAwake() {
    if (document.visibilityState !== 'visible' || !navigator.wakeLock) return;
    if (requestingScreenLock || (screenLock && !screenLock.released)) return;

    requestingScreenLock = true;
    try {
      screenLock = await navigator.wakeLock.request('screen');
    } catch {
      // Safari can deny wake locks based on device or page state.
    } finally {
      requestingScreenLock = false;
    }
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
    Array.from(
      document.querySelectorAll('#payout button.primary, #payout a[href="/"]')
    ).some((control) => clickNextAd(control, '次の広告を見る'));
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
  }

  window.__kashirSafariWatchAdsObserver = new MutationObserver(updatePage);
  window.__kashirSafariWatchAdsObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'class', 'style'],
  });
  document.addEventListener('visibilitychange', keepScreenAwake);
  window.addEventListener('pageshow', keepScreenAwake);
  keepScreenAwake();
  document.addEventListener('visibilitychange', updatePage);
  window.addEventListener('focus', updatePage);
  updatePage();
})();
