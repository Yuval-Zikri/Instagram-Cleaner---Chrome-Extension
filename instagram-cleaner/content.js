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
      return true;
    } else if (message.action === "diagnose") {
      const result = diagnose();
      sendResponse(result);
      return true;
    }
  });

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Diagnostic function — returns info about what's on the current page.
   */
  function diagnose() {
    const url = window.location.href;
    const username = getUsernameFromUrl();

    const allLinks = Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.getAttribute('href'))
      .filter(h => h && (h.includes('follower') || h.includes('following') || h.includes(username)))
      .slice(0, 20);

    const statsLis = Array.from(document.querySelectorAll('ul li'))
      .slice(0, 10)
      .map(li => li.textContent.trim().replace(/\s+/g, ' ').slice(0, 80));

    const textMatches = Array.from(document.querySelectorAll('*'))
      .filter(el => el.childElementCount === 0 && /follower|following|עוקבים|נעקבים/i.test(el.textContent) && el.textContent.trim().length < 60)
      .slice(0, 10)
      .map(el => ({
        tag: el.tagName,
        text: el.textContent.trim(),
        parentTag: el.parentElement?.tagName,
        parentRole: el.parentElement?.getAttribute('role'),
        grandRole: el.parentElement?.parentElement?.getAttribute('role'),
        grandTag: el.parentElement?.parentElement?.tagName,
        parentHref: el.parentElement?.getAttribute('href') || el.parentElement?.parentElement?.getAttribute('href')
      }));

    return { url, username, allLinks, statsLis, textMatches };
  }

  /**
   * Extract the Instagram username from the current page URL.
   * e.g. https://www.instagram.com/yuval123/ => "yuval123"
   */
  function getUsernameFromUrl() {
    const match = window.location.pathname.match(/^\/([^\/]+)\/?/);
    return match ? match[1] : null;
  }

  /**
   * Multi-strategy search for followers/following clickable element.
   * Strategy order: URL-based href → text search → li stats → span walk-up
   */
  function findFollowersFollowingElement(type) {
    const username = getUsernameFromUrl();

    // Strategy 1: Exact href match using current username
    // e.g. href="/yuval123/followers/" OR href="/yuval123/following/"
    if (username) {
      const exactLink = document.querySelector(`a[href="/${username}/${type}/"], a[href^="/${username}/${type}"]`);
      if (exactLink) return exactLink;
    }

    // Strategy 2: Any <a> href that contains the type keyword
    const links = document.querySelectorAll('a[href]');
    for (let link of links) {
      const href = link.getAttribute('href') || '';
      if (href.includes(`/${type}/`) || href.endsWith(`/${type}`)) {
        return link;
      }
    }

    // Strategy 3: Text-based search across clickable elements
    // (handles cases where Instagram uses <span> or <button> instead of <a>)
    const hebrewMap = {
      followers: ['עוקבים'],
      following: ['נעקבים', 'במעקב']
    };
    const hebrewVariants = hebrewMap[type] || [];
    const keywords = [type, ...hebrewVariants];

    const clickables = document.querySelectorAll('a, button, [role="button"], [role="link"]');
    for (let el of clickables) {
      if (el.closest('[role="dialog"]')) continue; // skip modals
      const text = el.textContent.toLowerCase();
      if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
        return el;
      }
    }

    // Strategy 4: <li> stats — look for the number+text pair
    const liItems = document.querySelectorAll('ul li');
    for (let li of liItems) {
      const text = li.textContent.toLowerCase();
      if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
        // Return the best clickable inside, or the li itself
        const inner = li.querySelector('a, button, [role="button"]');
        return inner || li;
      }
    }

    // Strategy 5: Find any leaf <span> with matching text, then walk UP to find clickable ancestor
    const allSpans = document.querySelectorAll('span, div');
    for (let el of allSpans) {
      if (el.childElementCount > 0) continue; // leaf nodes only
      const text = el.textContent.trim().toLowerCase();
      if (!keywords.some(kw => text === kw.toLowerCase())) continue;

      let parent = el.parentElement;
      for (let i = 0; i < 8 && parent && parent.tagName !== 'BODY'; i++) {
        const tag = parent.tagName;
        const role = parent.getAttribute('role');
        if (tag === 'A' || tag === 'BUTTON' || role === 'button' || role === 'link') {
          return parent;
        }
        parent = parent.parentElement;
      }
    }

    return null;
  }

  function getModalScrollContainer() {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return null;

    const scrollableDivs = Array.from(dialog.querySelectorAll('div')).filter(div => {
      const style = window.getComputedStyle(div);
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        div.scrollHeight > div.clientHeight + 5
      );
    });

    if (scrollableDivs.length > 0) {
      scrollableDivs.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
      return scrollableDivs[0];
    }

    const someUserLink = dialog.querySelector('a[href^="/"]');
    if (someUserLink) {
      let parent = someUserLink.parentElement;
      while (parent && parent !== dialog) {
        if (parent.scrollHeight > parent.clientHeight + 5) return parent;
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
    const excludeList = new Set(['explore', 'direct', 'reels', 'stories', 'p', 'accounts', 'tv', 'ar', 'about', 'privacy', 'legal']);

    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && href.endsWith('/')) {
        const parts = href.split('/').filter(Boolean);
        if (parts.length === 1) {
          const username = parts[0];
          if (username.length > 0 && !excludeList.has(username)) {
            usernames.add(username);
          }
        }
      }
    });
    return usernames;
  }

  function closeModal() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    setTimeout(() => {
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
      dialogs.reverse().forEach(dialog => {
        const closeBtn = dialog.querySelector('[aria-label="Close"], [aria-label="סגור"]');
        if (closeBtn) { closeBtn.click(); return; }
        const svgClose = dialog.querySelector('svg[aria-label="Close"]');
        if (svgClose) {
          let el = svgClose;
          while (el && el !== dialog) {
            if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') { el.click(); return; }
            el = el.parentElement;
          }
        }
        const btn = dialog.querySelector('button');
        if (btn) btn.click();
      });
    }, 200);
  }

  async function processModal(type) {
    chrome.runtime.sendMessage({ action: "update_status", text: `Opening ${type}...` });

    const element = findFollowersFollowingElement(type);
    if (!element) {
      const diag = diagnose();
      throw new Error(
        `Could not find "${type}" on this page.\n` +
        `URL: ${diag.url}\n` +
        `Username detected: ${diag.username || 'NONE'}\n` +
        `Links found: ${diag.allLinks.join(', ') || 'none'}\n\n` +
        `Make sure you are on YOUR OWN profile page.`
      );
    }

    element.click();
    await sleep(2500);

    let dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) {
      await sleep(2000);
      dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) {
        throw new Error(`Modal failed to open for ${type}. Instagram may require you to click manually first.`);
      }
    }

    chrome.runtime.sendMessage({ action: "update_status", text: `Scanning ${type}...` });
    await sleep(1000);

    let container = getModalScrollContainer();
    if (!container) {
      await sleep(2000);
      container = getModalScrollContainer();
    }

    const allUsernames = new Set();

    if (container) {
      let lastScrollTop = -1;
      let scrollAttempts = 0;
      let noProgressCount = 0;

      while (true) {
        const currentBatch = extractUsernamesFromModal();
        const sizeBefore = allUsernames.size;
        currentBatch.forEach(u => allUsernames.add(u));

        chrome.runtime.sendMessage({
          action: "update_status",
          text: `Scanning ${type}... (${allUsernames.size} found)`
        });

        lastScrollTop = container.scrollTop;
        container.scrollTop += container.clientHeight * 2;

        const delay = Math.floor(Math.random() * 500) + 900;
        await sleep(delay);

        if (container.scrollTop === lastScrollTop) {
          scrollAttempts++;
          if (scrollAttempts >= 3) break;
          await sleep(1200);
        } else {
          scrollAttempts = 0;
          if (allUsernames.size === sizeBefore) {
            noProgressCount++;
            if (noProgressCount >= 5) break;
          } else {
            noProgressCount = 0;
          }
        }
      }
    } else {
      const currentBatch = extractUsernamesFromModal();
      currentBatch.forEach(u => allUsernames.add(u));
    }

    const finalBatch = extractUsernamesFromModal();
    finalBatch.forEach(u => allUsernames.add(u));

    closeModal();
    await sleep(1800);

    return Array.from(allUsernames);
  }

  async function startScan() {
    try {
      const followers = await processModal("followers");
      const following = await processModal("following");
      chrome.runtime.sendMessage({ action: "scan_complete", data: { followers, following } });
    } catch (err) {
      chrome.runtime.sendMessage({ action: "scan_error", error: err.message });
    }
  }

  async function performDomUnfollow(targetUsername) {
    let followingEl = findFollowersFollowingElement("following");
    if (!followingEl) {
      throw new Error("Could not find the 'Following' button.\nPlease navigate to YOUR OWN profile page first.");
    }

    followingEl.click();
    await sleep(2500);

    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) throw new Error("Could not open Following modal.");

    const searchInput = dialog.querySelector('input[type="text"], input:not([type="submit"]):not([type="checkbox"])');
    if (!searchInput) {
      closeModal();
      throw new Error("Search input not found in Following modal.");
    }

    searchInput.focus();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeInputValueSetter.call(searchInput, targetUsername);
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    await sleep(2500);

    const btns = Array.from(dialog.querySelectorAll('button, [role="button"]'));
    const followingBtn = btns.find(b => {
      const txt = b.textContent.trim();
      return txt === 'Following' || txt === 'נעקב' || txt === 'במעקב';
    });

    if (!followingBtn) {
      closeModal();
      throw new Error(`Could not find the Following button for "${targetUsername}".`);
    }

    followingBtn.click();
    await sleep(1800);

    const dialogs = document.querySelectorAll('div[role="dialog"]');
    const topDialog = dialogs[dialogs.length - 1];
    if (topDialog) {
      const allBtns = Array.from(topDialog.querySelectorAll('button, [role="button"]'));
      const confirmUnfollowBtn = allBtns.find(b => {
        const txt = b.textContent.trim().toLowerCase();
        return txt === 'unfollow' || txt === 'הסר עוקב' || txt === 'הסרת עוקב' || txt === 'ביטול מעקב';
      });
      if (confirmUnfollowBtn) {
        confirmUnfollowBtn.click();
        await sleep(1500);
      } else {
        closeModal();
        throw new Error("Confirm unfollow button not found.");
      }
    }

    closeModal();
  }
}
