// content.js
if (typeof window.hasInjectedCleaner === 'undefined') {
  window.hasInjectedCleaner = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "start_scan") {
      startScan().catch(err => {
        chrome.runtime.sendMessage({ action: "scan_error", error: err.message });
      });
    } else if (message.action === "unfollow_dom") {
      performDomUnfollow(message.username).then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true; // Keep message channel open for async
    }
  });

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function findLinkByHrefIncludes(str) {
    const links = document.querySelectorAll('a[href]');
    for (let link of links) {
      if (link.getAttribute('href').includes(`/${str}/`)) {
        return link;
      }
    }
    return null;
  }

  function getModalScrollContainer() {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return null;
    
    const scrollableDivs = Array.from(dialog.querySelectorAll('div')).filter(div => {
      const style = window.getComputedStyle(div);
      return (style.overflowY === 'auto' || style.overflowY === 'scroll') && div.scrollHeight > div.clientHeight;
    });
    
    if (scrollableDivs.length > 0) {
      return scrollableDivs[0];
    }
    
    const someUserLink = dialog.querySelector('a[href^="/"]');
    if(someUserLink) {
        let parent = someUserLink.parentElement;
        while(parent && parent !== dialog) {
            if(parent.scrollHeight > parent.clientHeight) return parent;
            parent = parent.parentElement;
        }
    }

    return null;
  }

  function extractUsernamesFromModal() {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return new Set();

    const usernames = new Set();
    const links = dialog.querySelectorAll('a[href]');
    
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && href.endsWith('/')) {
        const username = href.replace(/\//g, '');
        const excludeList = ['explore', 'direct', 'reels', 'stories', 'p'];
        if (username.length > 0 && !excludeList.includes(username)) {
           usernames.add(username);
        }
      }
    });
    return usernames;
  }

  function closeModal() {
    // Close all open dialogs from top to bottom
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    dialogs.reverse().forEach(dialog => {
      const closeDivs = dialog.querySelectorAll('svg[aria-label="Close"], line, polyline');
      let clicked = false;
      closeDivs.forEach(el => {
        let parent = el;
        while (parent && parent !== dialog) {
            if (parent.tagName === 'BUTTON' || parent.getAttribute('role') === 'button' || parent.click) {
                if(parent.click) {
                    parent.click();
                    clicked = true;
                    break;
                }
            }
            parent = parent.parentElement;
        }
      });
      
      if(!clicked) {
          const btn = dialog.querySelector('button');
          if(btn) btn.click();
      }
    });
  }

  async function processModal(type) {
    chrome.runtime.sendMessage({ action: "update_status", text: `Opening ${type}...` });
    
    const link = findLinkByHrefIncludes(type);
    if (!link) {
      throw new Error(`Could not find the ${type} link on this page. Are you on a profile page?`);
    }

    link.click();
    await sleep(2000);
    
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) {
      throw new Error("Modal failed to open.");
    }

    chrome.runtime.sendMessage({ action: "update_status", text: `Scanning ${type}...` });

    let container = getModalScrollContainer();
    if(!container) {
        await sleep(1500);
        container = getModalScrollContainer();
    }

    const allUsernames = new Set();
    
    if (container) {
      let lastScrollTop = -1;
      let scrollAttempts = 0;
      
      while (true) {
        const currentBatch = extractUsernamesFromModal();
        currentBatch.forEach(u => allUsernames.add(u));
        
        chrome.runtime.sendMessage({ action: "update_status", text: `Scanning ${type}... (${allUsernames.size} found)` });

        lastScrollTop = container.scrollTop;
        container.scrollTop = container.scrollHeight;
        
        const delay = Math.floor(Math.random() * 400) + 800;
        await sleep(delay);
        
        if (container.scrollTop === lastScrollTop) {
          scrollAttempts++;
          if (scrollAttempts >= 3) break;
          await sleep(1000);
        } else {
          scrollAttempts = 0;
        }
      }
    } else {
      const currentBatch = extractUsernamesFromModal();
      currentBatch.forEach(u => allUsernames.add(u));
    }
    
    const finalBatch = extractUsernamesFromModal();
    finalBatch.forEach(u => allUsernames.add(u));
    
    closeModal();
    await sleep(1500);

    return Array.from(allUsernames);
  }

  async function startScan() {
    try {
      const followers = await processModal("followers");
      const following = await processModal("following");
      
      chrome.runtime.sendMessage({ 
        action: "scan_complete", 
        data: { followers, following } 
      });
      
    } catch (err) {
      chrome.runtime.sendMessage({ action: "scan_error", error: err.message });
    }
  }

  async function performDomUnfollow(targetUsername) {
    let followingLink = findLinkByHrefIncludes("following");
    
    if (!followingLink) {
      const allLinks = document.querySelectorAll('a, [role="link"]');
      for (let link of allLinks) {
         const txt = link.textContent;
         if (txt.includes('נעקבים') || txt.includes('following')) {
            followingLink = link;
            break;
         }
      }
    }

    if (!followingLink) {
      throw new Error("Could not find the 'Following/נעקבים' button on this page page.\nPlease navigate to your profile page first.");
    }
    
    followingLink.click();
    await sleep(2000); 
    
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) throw new Error("Could not open Following modal.");

    const searchInput = dialog.querySelector('input');
    if (!searchInput) {
      closeModal();
      throw new Error("Search input not found.");
    }

    searchInput.focus();
    
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeInputValueSetter.call(searchInput, targetUsername);
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    await sleep(2500); 
    
    const btns = Array.from(dialog.querySelectorAll('button, [role="button"]'));
    const followingBtn = btns.find(b => {
      const txt = b.textContent.trim();
      return txt === 'Following' || txt === 'נעקב' || txt === 'במעקב';
    });

    if (!followingBtn) {
      closeModal();
      throw new Error("Could not find the Following button.");
    }

    followingBtn.click();
    await sleep(1500);

    const dialogs = document.querySelectorAll('div[role="dialog"]');
    const topDialog = dialogs[dialogs.length - 1]; 
    if (topDialog) {
      const allBtns = Array.from(topDialog.querySelectorAll('button, [role="button"]'));
      const confirmUnfollowBtn = allBtns.find(b => {
        const txt = b.textContent.trim();
        return txt === 'Unfollow' || txt === 'הסר עוקב' || txt === 'הסרת עוקב' || txt === 'ביטול מעקב';
      });
      
      if (confirmUnfollowBtn) {
        confirmUnfollowBtn.click();
        await sleep(1500);
      } else {
        closeModal();
        throw new Error("Confirm unfollow button not found.");
      }
    }

    // Close all modals
    closeModal();
  }
}
