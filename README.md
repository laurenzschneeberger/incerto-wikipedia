# Incerto for Wikipedia

A Chrome extension that typesets Wikipedia like Nassim Taleb's *Technical Incerto*
(*Statistical Consequences of Fat Tails*).

## Install

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick this `taleb-wikipedia` folder.
3. Open any Wikipedia article. Click the toolbar icon (a Goudy "T") to toggle it off and on.

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
