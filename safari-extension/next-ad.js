(() => {
  const advancedButtons = new WeakSet();
  const initializedPayouts = new WeakSet();

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

  function updatePage() {
    selectLnurlTab();
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
