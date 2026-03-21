chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "unfollow_success" && message.username) {
    // Update storage
    chrome.storage.local.get(['nonFollowers'], (result) => {
      let list = result.nonFollowers || [];
      list = list.filter(u => u !== message.username);
      chrome.storage.local.set({ nonFollowers: list }, () => {
        // Close the tab that sent the message
        if (sender.tab) {
          chrome.tabs.remove(sender.tab.id);
        }
      });
    });
    return true;
  }

  if (message.action === "close_me" && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  }
});
