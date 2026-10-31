# Incerto for Wikipedia

A Chrome extension that typesets Wikipedia like Nassim Taleb's *Technical Incerto*
(*Statistical Consequences of Fat Tails*).

## Install

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick this repository's folder (clone it or download the ZIP first).
3. Open any Wikipedia article. The toolbar icon (a Goudy "T") switches the typesetting on or off.

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
* The manicule icon is the U+261E outline from GNU FreeSerif (GPL with font exception).

## Beyond the book

* **Bibliography.** References, Notes, Sources, Further reading, External links and similar
  sections are set like the book's bibliography: `[241]` labels hanging in the margin, one column,
  justified. Clicking a label jumps back to where it was cited.
* **Header.** Italic "Wikipedia" on the left, search in a compact yellow callout on the right.
* **Title row.** The title, the ☞ notebook and the ‡ menu share one line. ¶ opens Wikipedia's main
  menu. Contents is a fixed column on the left (hidden on windows narrower than 1000px).
* **The ‡ menu.** Talk, Edit, View history, the language list and Appearance: article width, text
  size and colour.
* **Topic tables.** Navboxes become yellow callouts with bold group names.
* **Quieter chrome.** The footer, Donate / Create account / Log in, and the Article / Talk / Read /
  Edit / View history tabs are gone. Talk, Edit and View history live in the ‡ menu. All dropdowns and the search suggestions are set in Pagella.
* **Highlights and margin notes.** Select text and choose *Highlight* or *Note*; a selection already
  looks like the highlight it would become. Notes sit in the margin right of the article as yellow
  Post-its, with × to delete. Links inside a highlight still work as links; click the highlighted
  text itself to add a note or remove it. Everything is kept per article in `chrome.storage.local`.
* **Notebook.** The ☞ (a manicule, the pointing hand readers drew in margins) opens every highlight
  and note on the page, grouped by section. Click one to jump to it; download them all as Markdown.
