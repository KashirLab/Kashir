(() => {
  const advancedButtons = new WeakSet();
  const initializedPayouts = new WeakSet();
  const handedOffRewards = new Set();
  let claimTappedAt = -Infinity;

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

  function openWalletForReward() {
    if (document.visibilityState !== 'visible') return;
    const payout = document.querySelector('#payout');
    if (!payout || !initializedPayouts.has(payout)) return;

    const link = payout.querySelector('.wallet-open[href]');
    const match = /^lightning:(lnurl1[0-9a-z]{1,4090})$/i.exec(
      link?.getAttribute('href') || ''
    );
    if (!match) return;

    const lnurl = match[1].toLowerCase();
    const url = `kashir-wallet://ad-withdraw?lnurl=${lnurl}`;
    // Safari only allows some app links while a real tap is still active.
    if (
      handedOffRewards.has(lnurl) ||
      performance.now() - claimTappedAt > 1000 ||
      navigator.userActivation?.isActive === false
    ) {
      return;
    }

    handedOffRewards.add(lnurl);
    window.location.assign(url);
  }

  function updatePage() {
    selectLnurlTab();
    openWalletForReward();
    advanceCompletedAd();
  }

  new MutationObserver(updatePage).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'href',
      'disabled',
      'aria-disabled',
      'hidden',
      'class',
      'style',
    ],
  });
  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const button = event.target.closest('button, a, [role="button"]');
      if (button?.textContent.trim() !== '受け取り') return;
      claimTappedAt = performance.now();
    },
    true
  );
  document.addEventListener('visibilitychange', updatePage);
  window.addEventListener('focus', updatePage);
  updatePage();
})();
