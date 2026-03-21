# 🧼 Instagram Cleaner - Chrome Extension

![Version](https://img.shields.io/badge/VERSION-1.0-blue?style=for-the-badge) ![Status](https://img.shields.io/badge/STATUS-ACTIVE-success?style=for-the-badge) ![Platform](https://img.shields.io/badge/PLATFORM-CHROME-orange?style=for-the-badge) ![License](https://img.shields.io/badge/LICENSE-MIT-lightgrey?style=for-the-badge)

A robust, fully DOM-based Google Chrome extension designed to scan, beautifully identify, and carefully manage Instagram accounts that do not follow you back. 

Unlike other extensions that rely on hidden API calls—which often result in account suspensions or action blocks—Instagram Cleaner perfectly mimics human actions by engaging exclusively with the visual UI.

---

## 🛠️ Tech Stack

**Frontend Logic**
* <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Unofficial_JavaScript_logo_2.svg/1024px-Unofficial_JavaScript_logo_2.svg.png" width="16" height="16"> **Vanilla JavaScript** (ES6+) for ultra-lightweight performance
* <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/HTML5_logo_and_wordmark.svg/512px-HTML5_logo_and_wordmark.svg.png" width="16" height="16"> **HTML5 & CSS3** for minimal pop-up styling

**Chrome Ecosystem**
* 🧩 **Manifest V3** for modern, secure extension architecture
* 💾 **Chrome Local Storage API** for persistent cross-tab state management 
* 🔌 **Chrome Message Passing** connecting the Popup and Content runtime securely

---

## ✨ Features
* **Zero APIs:** Operates 100% on the front-end DOM, ensuring absolute safety for your Instagram account.
* **Intelligent Scanning Iteration:** Replicates human scrolling natively within the Followers modals to harvest users safely.
* **Persistent Local Storage:** Elegantly stores your lists. You can close the extension or refresh the tab without ever losing your progress. 
* **Automated GUI Unfollowing:** Includes a one-click process that actively opens the modal, searches the user, and securely clicks "unfollow" precisely just like you would.
* **Multi-Language Support (En/He):** Specially engineered to cleanly execute across both English (`Following`, `Unfollow`) and localized Hebrew (`במעקב`, `ביטול מעקב`) Instagram interfaces seamlessly.

---

## ⚙️ Installation
1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the `instagram-cleaner` folder.
6. The extension is installed and ready to use!

---

## 🚀 Usage Guide
1. Navigate directly to your **Instagram Profile Page**: `https://www.instagram.com/your_username/`
2. Click the **Instagram Cleaner** puzzle piece extension icon.
3. Click the shiny **Scan** button.
   - *Observation mode:* Watch nicely as the extension safely cycles through your follower modals, pulling records dynamically.
4. Once completed, a clean scrollable list of users not following you back will appear.
5. Click **Open** to visit their profile manually, or securely click **Unfollow** to quietly ask the macro to disconnect them inside the active tab.

---

## 📁 File Structure
- `manifest.json`: Configuration logic declaring V3 requirements alongside specific Chrome scope permissions.
- `popup.html` & `styles.css`: The sleek and minimal user interface logic.
- `popup.js`: Extension state management and DOM messaging relayer. 
- `content.js`: The algorithmic powerhouse responsible for engaging with the Instagram DOM accurately without interrupts.

---

## ⚠️ Disclaimer
This is an educational utility. Instagram randomly modifies its internal DOM structure and naming arrays via algorithmic A/B testing dynamically. This extension utilizes high-level hierarchy fallbacks to prevent brittle code collapse, but certain unexpected Meta modifications might require occasional CSS string updates.

*Built safely. Designed elegantly.*
