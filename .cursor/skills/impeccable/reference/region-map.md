> **Vendored copy.** The engine launcher, live-browser injector, design hooks, and update downloader are not included. Do not download binaries, run `npx impeccable`, install hooks, inject scripts into a page, or fetch remote skill updates. If a sentence below tells you to run a script or open a localhost live server, skip that sentence and use the written guidance.

# Region map

A region map names what is actually visible in the approved comp before asset production. It is not a page build or an asset approval.

4. Open the comparison sheets first to inspect affected crops together, then open individual crops where more detail is needed. Compare their bounds with the original. Inspect excluded foreground pixels as well as geometry errors. Every overlapping non-container code box is masked in full, including empty space inside it. Bound separate text elements separately so artwork in the gaps stays visible; a container describes their layout extent and never replaces its children. Correct the map and inspect again; use a new output directory each time. Zero errors does not certify crop accuracy. Coverage warnings are hints, not proof of completeness.

If the request ends at mapping, stop with the map, inspection report and unresolved findings. To continue a build, measure the inspected map with `comp-spec --comp <comp.png> --regions regions.json` and follow [new-work.md](new-work.md).

`--auto` produces horizontal band scaffolding, not element identification. It is optional and does not replace authoring a map.

## Containment

`parentId` identifies an enclosing `container: true` region. Parent and children keep separate IDs and crops. Containment never transfers approval.

## What varies independently

Split regions by what varies independently: content the site swaps (room photos, products, people), moving parts (anything a hover or the signature interaction moves), and structure (frames, surrounds, ornament). A window with open shutters onto a room is three kinds of region: the surround as a plate with a transparent opening, the room as an image region beneath it, and each shutter as its own plate. Overlapping regions are composited in the page. `comp-spec` flags a raster region whose note names a frame and the view it opens onto (`baked-composite`), and the plan and asset review shows it to the user first.

## Painted material

When measuring, `comp-spec` flags a `text`, `control` or `chrome` region, containers included, whose crop looks painted (`painted-pixels`: many colours, soft gradients) and lists it in its summary. The plan and asset review shows flagged regions, and those marked `codeDrawn` (painted material you chose to draw in code), to the user first. Do not leave the catch to them: if a region is painted material (a figure, a photograph, a metal or paper surface), classify it `plate`, `image` or `texture` now.

Comp crops are reference evidence only, never production assets. The map inspector marks its PNGs as comp-derived.
