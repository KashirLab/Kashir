(() => {
  const advancedButtons = new WeakSet();
  const initializedPayouts = new WeakSet();
  const attemptedRewards = new Set();

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

  function advanceCompletedAd() {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;

    const completed = document.querySelector('.actions #view-complete');
    const button = completed?.parentElement?.querySelector('button#next-view');
    if (
      !button ||
      button.disabled ||
      button.getAttribute('aria-disabled') === 'true' ||
      button.textContent.trim() !== 'もっと見る' ||
      !button.getClientRects().length ||
      getComputedStyle(button).visibility !== 'visible' ||
      advancedButtons.has(button)
    ) {
      return;
    }

    advancedButtons.add(button);
    button.click();
  }

  async function redeemReward() {
    if (document.visibilityState !== 'visible') return;
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

    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Redeeming ad reward…';
    payout.append(status);

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
    }
  }

  function updatePage() {
    selectLnurlTab();
    void redeemReward();
    advanceCompletedAd();
  }

  new MutationObserver(updatePage).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'class', 'style'],
  });
  document.addEventListener('visibilitychange', updatePage);
  window.addEventListener('focus', updatePage);
  updatePage();
})();
