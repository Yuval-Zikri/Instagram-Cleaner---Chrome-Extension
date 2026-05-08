document.addEventListener("DOMContentLoaded", () => {
  const scanBtn = document.getElementById("scan-btn");
  const statusEl = document.getElementById("status");
  const userList = document.getElementById("user-list");

  // Load existing results from storage to prevent losing the list
  chrome.storage.local.get(['nonFollowers'], (result) => {
    if (result.nonFollowers && result.nonFollowers.length > 0) {
      statusEl.textContent = `Loaded ${result.nonFollowers.length} users from previous scan.`;
      renderResults(result.nonFollowers);
    }
  });

  // Listen for storage changes (e.g., when content.js removes a user)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.nonFollowers) {
      renderResults(changes.nonFollowers.newValue || []);
      const count = changes.nonFollowers.newValue ? changes.nonFollowers.newValue.length : 0;
      statusEl.textContent = `Found ${count} users not following back.`;
    }
  });

  scanBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes("instagram.com")) {
      statusEl.textContent = "Please go to an Instagram profile first.";
      return;
    }

    scanBtn.disabled = true;
    userList.innerHTML = "";
    statusEl.textContent = "Starting scan...";

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      chrome.tabs.sendMessage(tab.id, { action: "start_scan" });
    } catch (err) {
      statusEl.textContent = "Error: Please refresh the Instagram page.";
      scanBtn.disabled = false;
      console.error(err);
    }
  });

  // ── Diagnose button ──────────────────────────────────────────────────────────
  const diagBtn = document.getElementById("diag-btn");
  if (diagBtn) {
    diagBtn.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url.includes("instagram.com")) {
        statusEl.textContent = "Please go to Instagram first.";
        return;
      }
      diagBtn.disabled = true;
      statusEl.textContent = "Running diagnosis...";
      userList.innerHTML = "";

      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      } catch (e) { /* already injected */ }

      chrome.tabs.sendMessage(tab.id, { action: "diagnose" }, (res) => {
        diagBtn.disabled = false;
        if (chrome.runtime.lastError || !res) {
          statusEl.textContent = "Diagnose failed: " + (chrome.runtime.lastError?.message || "no response");
          return;
        }
        // Show results in the list
        statusEl.textContent = "Diagnosis complete — see details below:";
        const items = [
          `🌐 URL: ${res.url}`,
          `👤 Username detected: ${res.username || "❌ NONE — not on a profile page!"}`,
          `🔗 Follower/following links: ${res.allLinks.length > 0 ? res.allLinks.join(" | ") : "❌ NONE FOUND"}`,
          `📋 Stats <li> items: ${res.statsLis.length > 0 ? res.statsLis.join(" | ") : "none"}`,
          `🔍 Text matches: ${res.textMatches.length > 0 ? res.textMatches.map(m => `[${m.tag}] "${m.text}" parent=${m.parentTag}(role=${m.parentRole}) href=${m.parentHref}`).join(" | ") : "none"}`,
        ];
        userList.innerHTML = items.map(txt => {
          const li = document.createElement("li");
          li.style.cssText = "font-size:10px;word-break:break-all;padding:4px 0;border-bottom:1px solid #eee;";
          li.textContent = txt;
          return li.outerHTML;
        }).join("");
      });
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "update_status") {
      statusEl.textContent = message.text;
    } else if (message.action === "scan_complete") {
      const { followers, following } = message.data;
      const notFollowingBack = following.filter(user => !followers.includes(user));
      
      // Save to storage
      chrome.storage.local.set({ nonFollowers: notFollowingBack }, () => {
        statusEl.textContent = `Found ${notFollowingBack.length} users not following back.`;
        scanBtn.disabled = false;
      });
    } else if (message.action === "scan_error") {
      statusEl.textContent = `Error: ${message.error}`;
      scanBtn.disabled = false;
    }
  });

  function renderResults(users) {
    userList.innerHTML = "";
    if (!users || users.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Everyone you follow follows you back!";
      userList.appendChild(li);
      return;
    }

    users.forEach(username => {
      const li = document.createElement("li");
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "username";
      nameSpan.textContent = username;
      
      const btnGroup = document.createElement("div");

      const openBtn = document.createElement("button");
      openBtn.className = "open-btn";
      openBtn.textContent = "Open";
      openBtn.onclick = () => {
        chrome.tabs.create({ url: `https://instagram.com/${username}` });
      };

      const unfollowBtn = document.createElement("button");
      unfollowBtn.className = "open-btn unfollow-btn";
      unfollowBtn.textContent = "Unfollow";
      unfollowBtn.style.backgroundColor = "#ff4d4f";
      unfollowBtn.style.color = "white";
      unfollowBtn.style.marginLeft = "8px";
      unfollowBtn.onclick = async () => {
        unfollowBtn.textContent = "...";
        unfollowBtn.disabled = true;
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url.includes("instagram.com")) {
            unfollowBtn.textContent = "Failed";
            unfollowBtn.style.backgroundColor = "gray";
            alert("You must be on Instagram to unfollow.");
            return;
        }

        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
        } catch (e) {
          console.error("Script injection failed", e);
        }

        chrome.tabs.sendMessage(tab.id, { action: "unfollow_dom", username: username }, (res) => {
           if (chrome.runtime.lastError || !res || !res.success) {
             unfollowBtn.textContent = "Failed";
             unfollowBtn.style.backgroundColor = "gray";
             const errorMsg = (res && res.error) ? res.error : (chrome.runtime.lastError?.message || "Connection closed/Script not injected");
             console.error("DOM Unfollow failed", errorMsg);
             alert(`Action Failed:\n${errorMsg}\n\n(נא לרענן את העמוד ולנסות שוב)`);
           } else {
             // Success! Remove from storage.
             chrome.storage.local.get(['nonFollowers'], (data) => {
               let list = data.nonFollowers || [];
               list = list.filter(u => u !== username);
               chrome.storage.local.set({ nonFollowers: list });
             });
           }
        });
      };

      btnGroup.appendChild(openBtn);
      btnGroup.appendChild(unfollowBtn);
      
      li.appendChild(nameSpan);
      li.appendChild(btnGroup);
      userList.appendChild(li);
    });
  }
});
