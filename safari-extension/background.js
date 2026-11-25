browser.runtime.onMessage.addListener((message, sender) => {
  if (
    message?.type !== 'redeem-ad-reward' ||
    (sender.frameId != null && sender.frameId !== 0)
  ) {
    return undefined;
  }

  const match = browser.runtime.getManifest().content_scripts[0].matches[0];
  if (!sender.url || new URL(sender.url).origin !== new URL(match).origin) {
    return undefined;
  }

  return browser.runtime.sendNativeMessage('com.kashir.ios', {
    lnurl: message.lnurl,
  });
});
