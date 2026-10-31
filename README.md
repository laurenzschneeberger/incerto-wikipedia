# Incerto for Wikipedia

A Chrome extension that typesets Wikipedia like Nassim Taleb's *Technical Incerto*
(*Statistical Consequences of Fat Tails*).

## Install

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick this repository's folder (clone it or download the ZIP first).
3. Open any Wikipedia article. The toolbar icon (a Goudy "T") opens the settings: switch it on or off,
   and pick one of three header styles and one of three styles for the topic tables (navboxes).

## What it copies from the book

The book is set in LaTeX with the **classicthesis** style (André Miede) plus the
**lettrine** package for the drop cap. The extension reproduces those choices:

| Book (LaTeX) | Wikipedia |
| --- | --- |
| Palatino via `mathpazo` with old-style figures | **TeX Gyre Pagella** (the open Palatino clone), `onum` on |
| `\spacedlowsmallcaps` section titles in maroon, e.g. "3.10  RUIN AND PATH DEPENDENCE" | `h2` numbered 1, 2, 3, lowercase small caps, letterspaced, `#8F3838` |
| italic subsections | `h3` numbered 1.1, 1.2, set in italic |
| bold run-in `\paragraph` heads | `h4`–`h6` run into their paragraph |
| `lettrine` with the **GoudyIn** font in red, next words in small caps | first letter of the lead in Goudy Initials (spans four lines), the bold subject in small caps |
| "Figure 3.17:" in maroon, italic caption | figure captions numbered and italicised |
| hyperref: refs in blue `#0F65A0`, citations in green `#377E21` on the baseline, "[219]" | same for links and `[1]` citations, lettered notes become italic superscripts |
| yellow `tcolorbox` (`#FFFDDB` fill, yellow rule) | infoboxes, sidebars, maintenance notices, quote boxes |
| justified text, indented paragraphs, no indent after a heading | same |
| booktabs tables | wikitables lose vertical rules |

Back-matter sections (References, See also, External links ...) are unnumbered like `\section*`.
Colours were sampled from the book's PDF. Wikipedia's dark mode gets a matching night palette.

## Fonts and licences

* `fonts/pagella-*.woff2`: TeX Gyre Pagella, GUST Font License (`licenses/`).
* `fonts/goudy-initialen.woff2`: Goudy Initialen from the CTAN `initials` bundle, the same font
  `\usepackage{GoudyIn}` loads (`licenses/Goudy-Initialen.txt`).

## Beyond the book

* **Bibliography.** References, Notes, Sources, Further reading, External links and similar
  sections are set like the book's bibliography: `[241]` labels hanging in the margin, one column,
  justified. Clicking a label jumps back to where it was cited.
* **Quieter chrome.** The footer, Donate / Create account / Log in, and the Article / Talk / Read /
  Edit / View history tabs are gone. Talk, Edit and View history live in the `···` Tools menu,
  together with the language list (with a filter). Contents is folded into the button beside the
  title. All dropdowns and the search suggestions are set in Pagella.
* **Highlights and margin notes.** Select text in an article and choose *Highlight* or *Note*.
  Notes appear as numbered italic sidenotes in the right margin. Click a highlight to add a note or
  remove it, click a note to edit it. Everything is kept per article in `chrome.storage.local`, so it
  is still there when you come back.

### Header styles
* **Running head**: "Wikipedia" in maroon spaced small caps, italic tagline, hairline below.
* **Frontispiece**: a Goudy initial W, the rest in small caps, search in a yellow callout, double rule.
* **Book page**: italic wordmark, the article title as a running head, like a printed page.

### Topic-table styles
* **Index**: booktabs rules, italic group names, ink links, no colour.
* **Callout**: the yellow box, bold group names.
* **Prose**: the table becomes paragraphs with run-in group heads.
