# Bharanidharan Borewell Calculator

A client-side borewell estimate tool for drilling contractors. It uses progressive depth pricing, optional 7-inch and 10-inch casing charges, additional expenses, advance/refund handling, local saved estimates and rate templates, PDF export, printing, and WhatsApp sharing.

## Run it

Open `index.html` in a current Chrome, Edge, Firefox, or Safari browser. No build step, server, account, or backend is required. The calculator works locally in the browser. **PDF Download** opens the browser's print dialog with a clean A4 invoice layout; choose **Save as PDF** as the destination.

## How depth slabs are calculated

Each slab is an inclusive range. Its feet count is `ending depth − starting depth + 1`, and its charge is `feet in that slab × that slab's rate`. Rates apply only to their own feet. For example, with 1,000 feet at 1–100 @ ₹100, 101–300 @ ₹200, 301–500 @ ₹300 and 501–1,000 @ ₹400, the four charges are ₹10,000, ₹40,000, ₹60,000 and ₹2,00,000; drilling totals ₹3,10,000. Slabs may be edited or removed, but the calculation/export buttons stay disabled until the ranges start at foot 1, end at the total depth, contain no overlap or gap, and have valid rates.

Currency inputs accept up to two decimal places and calculations use integer paise. Borewell and slab depths use whole feet. Casing lengths may use up to two decimal places; their charge is rounded to the nearest paisa. Blank optional casing sections and a blank advance are treated as ₹0. An advance above the grand total is shown as a refund due.

## Local data

The current draft is saved automatically in this browser's `localStorage`. Use **Save estimate** to keep a named estimate, or **Saved estimates → Open** to restore one. In the drilling section, use **Save template** and **Apply** to reuse a set of depth slabs and rates. **Pudhiya Kanakku** clears the current draft after confirmation. Saved data stays on this device and browser; it is not synced or uploaded. Clearing browser site data removes it.

## GitHub Pages deployment (free)

The calculator is a standalone folder, so it can be deployed without changing the existing application's home page:

1. Create a new empty repository on GitHub (for example, `bharanidharan-borewell-calculator`).
2. Copy `index.html`, `style.css`, `script.js`, and `README.md` from this folder into the **root** of that repository.
3. Commit and push those files to the repository's `main` branch.
4. In GitHub, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Choose branch **main** and folder **/(root)**, then select **Save**.
7. Wait for the Pages deployment to finish. Open the URL shown on the Pages settings screen; it will look like `https://YOUR-USERNAME.github.io/bharanidharan-borewell-calculator/`.

For a repository named `YOUR-USERNAME.github.io`, the site URL is `https://YOUR-USERNAME.github.io/`. GitHub Pages is static hosting; no secrets, database, or paid service are used.

## Sample checks and expected totals

| Scenario | Inputs | Expected result |
|---|---|---:|
| One full-depth slab | 1–1,000 ft @ ₹200/ft | Drilling ₹2,00,000 |
| Progressive sample | 1–100 @ ₹100; 101–300 @ ₹200; 301–500 @ ₹300; 501–1,000 @ ₹400 | Drilling ₹3,10,000 |
| Irregular ranges | 1–50 @ ₹120; 51–150 @ ₹180; 151–400 @ ₹250 | Drilling ₹86,500 |
| Full sample estimate | Progressive sample + 7-inch 100 ft @ ₹250 + 10-inch 50 ft @ ₹400 + transport ₹5,000 + labour ₹3,000; advance ₹50,000 | Grand total ₹3,63,000; balance ₹3,13,000 |
| Advance exceeds total | Full sample estimate; advance ₹4,00,000 | Refund due ₹37,000 |
| No casing | Progressive sample; both casing categories blank | Casing ₹0.00 |

Additional validation checks: overlapping ranges, gaps, end depth above total depth, blank or negative values, invalid decimal precision, optional 7-inch only and 10-inch only casing, multiple expenses, refresh/restore from local storage, and widths of 320, 375, and 768 pixels. Invalid or incomplete calculations keep PDF, print, WhatsApp share, and named estimate saving disabled.
