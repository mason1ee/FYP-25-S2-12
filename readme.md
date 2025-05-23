# CSIT321: Project

## Group: FYP-25-S2-12

## CSIT-25-S2-22: Client-Side Script Security Inspector

- index.js -
Main JavaScript for the extension. The necessary functions of the extension is written in here.

- content.js -
The scanning logic JavaScript for the extension. The main scanning function is located in index.js but the scanning logic is all inside content.js

- manifest.json -
To declare the permissions needed for the extension and the various script that we're using

- acorn.min.js -
External library used for traversing JavaScript source code. This is necessary in order to perform static code analysis for JavaScript

- styles.css -
Style for the extension written here.

- index.html -
The main popup for the extension.
