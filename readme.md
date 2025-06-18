# CSIT321: Project

## Group: FYP-25-S2-12

## CSIT-25-S2-22: Client-Side Script Security Inspector

- Assets
    - styles.css -
    Styles for the extension written here.

- _metadata
    - For JS Blocker.

- libs
    - acorn.min.js -
    External library used for traversing JavaScript source code.

    - jspdf.umd.min.js -
    External library used for generation of PDF report.

- background.js -
Script running in the background. Initializes default whitelist and blacklist on installation via chrome.storage.local, etc.

- content.js -
The scanning logic JavaScript for the extension. The main scanning function is located in index.js but the scanning logic is all inside content.js

- index.html -
The main popup for the extension.

- index.js -
Main JavaScript for the extension. The necessary functions of the extension is written in here.

- lists.js - 
Displays and filters the whitelist and blacklist in a table format, etc.

- manifest.json -
To declare the name, version, permissions needed for the extension and the various script that we're using.

- preload-darkmode.js -
JS script to preload darkmode if extension was set to dark mode previously.

- rules.json -
Rules for JS Blocker.
