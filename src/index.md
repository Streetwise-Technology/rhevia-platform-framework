---
title: Rhevia
sidebar: true
pager: false
toc: false
---

# Rhevia: Movement Intelligence

```js
import {orgName} from "./utils/org-meta.js";

const org = await FileAttachment("data/org.json").json();
const name = orgName(org);
```

Welcome to the Rhevia reporting platform. Select a report from the sidebar, or go directly:

```js
display(html`<div class="card" style="padding: 1.5rem;">
  <h3 style="margin-top: 0;">${name}</h3>
  <p>
    <a href="./${org}/">Executive Summary</a> ·
    <a href="./${org}/movement-report">Movement Report</a> ·
    <a href="./${org}/closing-remarks">Closing Remarks</a>
  </p>
</div>`);
```
