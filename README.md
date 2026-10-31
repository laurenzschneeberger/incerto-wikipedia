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

* **A desk of pages.** Clicking a link to another article opens it in a new column to the right
  instead of leaving the page, the way Andy Matuschak's working notes work. Each column scrolls on its
  own; as you scroll the desk sideways, earlier pages slide under later ones and shrink to a spine with
  their title set vertically (click a spine to bring it back). A faint grey × at the top left of each page closes it (it darkens when the pointer comes
  near). The open pages are kept in the address (`?stacked=…`), so reload and Back work.
* **Contents.** The left column lists the sections of the page you are reading. The ‹ chevron
  folds it to a thin rail (› or a click on the rail opens it again); this is remembered.
* **Bibliography.** References, Notes, Sources, Further reading, External links and similar
  sections are set like the book's bibliography: `[241]` labels hanging in the margin, one column,
  justified. Clicking a label jumps back to where it was cited.
* **Header.** ¶ (Wikipedia's main menu), the Wikipedia globe and an italic wordmark on the left; search
  in a compact yellow callout and the ‡ menu on the right.
* **Title row.** The title and the ☞ notebook share one line.
* **Speed.** Hovering or pressing a link starts loading the article, so it usually opens at once;
  pages are cached, typeset off-screen and inserted in one go, images load lazily, and covered
  pages aren't painted.
* **The ‡ menu.** Talk, Edit, View history, the language list and Appearance: page width, text
  size and colour.
* **Topic tables.** Navboxes become yellow callouts with bold group names.
* **Quieter chrome.** The footer, Donate / Create account / Log in and the page tabs are gone.
* **Highlights and notes.** Select text and choose *Highlight* or *Note*; a selection already looks
  like the highlight it would become. A highlight with a note ends in a thin red rule. Click any
  highlight and its yellow Post-it unfolds above it: click the text to edit, × to delete the note,
  *remove highlight* to remove it. Links inside a highlight still work as links. Everything is kept
  per article in `chrome.storage.local`.
* **Notebook.** The ☞ (a manicule, the pointing hand readers drew in margins) opens every highlight
  and note on that page, grouped by section. Click one to jump to it; download them all as Markdown.

## How the desk loads pages

Pages opened on the desk come from Wikipedia's own API on the same site
(`/w/api.php?action=parse`), are typeset like the first page, and are handed to Wikipedia's
scripts (`page-hook.js`) so collapsible tables and the like still work.
