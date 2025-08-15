# CSIT321: Project

## Group: FYP-25-S2-12

## CSIT-25-S2-22: Client-Side Script Security Inspector

### Webbed: A Client-Side Script Security Inspector for everyone ![Project Logo](Assets/logo/Webbed128.png)
[Website](https://website-live-lh4w.onrender.com/)
Scan a website for JavaScript vulnerabilities and missing security headers — all using a browser extension.


### How do I install this extension? [Detailed instructions](https://docs.google.com/document/d/1ngDJaPOE-eq5YnhKlkv9R6mOWSeWzlUV/edit?usp=sharing&ouid=110512395928968253216&rtpof=true&sd=true)
1. Locate the Green (<> Code) button
2. Press the button and click "Download ZIP"
3. Locate the ZIP file in your computer (default C:/Users/<username>/Downloads)
4. Unzip the ZIP file. A folder will appear.
5. Open Google Chrome and navigate to: (chrome://extensions)
6. In the top right hand corner of the window, turn on "Enable Developer Mode"
7. In the top left hand corner below "Extensions", click on "Load unpacked"
8. Select the unzipped folder from step 4.
9. Click on the "puzzle" extension icon.
10. Select "Webbed | FYP25-S2-12"
11. The extension will open.





### What are these files?

- _metadata
    - For JS Blocker.

- Assets
    - styles.css -
    Styles for the extension written here.

- libs
    - acorn.min.js -
    External library used for traversing JavaScript source code.

    - jspdf.umd.min.js -
    External library used for generation of PDF report.

- utils
    - alerts.js -
    Template to display custom alerts in the extension.

- background.js -
Script running in the background. Initializes default whitelist and blacklist on installation via chrome.storage.local, etc.

- blacklist-overlay.js -
Overlay to indicate when a site has been blacklisted.

- content.js -
Contains the scanning logic for the extension. The main scanning function is located in index.js, but the scanning details reside in this file.

- index.html -
The main popup UI of the extension.

- index.js -
Main JavaScript file for the extension. Contains core functions.

- lists.js - 
Displays and filters the whitelist and blacklist in a table format.

- manifest.json -
Declares the name, version, permissions needed for the extension and the various scripts that we're using.

- preload-darkmode.js -
Preloads dark mode if previously enabled in the extension.

- rules.json -

Contains rules for JS Blocker.
