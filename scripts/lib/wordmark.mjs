/**
 * The wordmark, drawn once.
 *
 * ## The mark
 *
 * Four abstract marks were drawn and rejected — crosshairs, a dial, an
 * aperture, a geometric S. The pattern in all four was the same: a symbol was
 * being made to carry the meaning, and the meaning of this product is carried
 * by its data. Every one of them needed a paragraph to explain, and a mark that
 * needs explaining has already lost.
 *
 * So the identity is the name, set properly. The one typographic move is the
 * crossbar: the double `t` sits exactly where "sight" meets "true", and its two
 * crossbars are run together into a single rule that overshoots both letters.
 * That is the datum — the reference line the whole product measures against —
 * drawn from the spelling of the name rather than bolted on beside it.
 *
 * ## Why the rule sits at 0.56em
 *
 * It sat at 0.325em everywhere for months and it was wrong everywhere. An
 * absolutely positioned child of an inline element resolves `top` against that
 * element's content area, which is the font's ascent plus descent — not the
 * line box, and not the cap height. Plex Sans Condensed carries an ascent near
 * 1.02em, so 0.325em landed about 0.70em above the baseline, which is the top
 * of a lowercase t rather than its crossbar. The mark read as a line floating
 * over the word instead of a line the word is measured against, on the film, on
 * every card, and on the article cover.
 *
 * 0.56em was found by rendering five candidates and looking at them. It is a
 * measured value, not a computed one, because the only thing that settles it is
 * whether the rule meets the two crossbars.
 *
 * ## Why this file exists
 *
 * The same twelve lines were pasted into four builders. When the position was
 * wrong it was wrong in four places, and a fix to one would have left three
 * marks disagreeing about where the datum goes.
 */

const round = (value) => Number(value.toFixed(2));

/** The rule's height, at the crossbar of the two t's. Measured, not derived. */
export const CROSSBAR_TOP = 0.56;

/** Shared type for the mark. Emit once per document, inside the style block. */
export const WORDMARK_CSS = `
  /* text-transform is reset explicitly. The footer uppercases everything in it
     and swallowed the wordmark whole — a lowercase mark set in capitals is a
     different mark, and the crossbar rule then lands nowhere near a crossbar. */
  .wm { font-family: 'Plex Condensed', sans-serif; font-weight: 600;
        letter-spacing: -0.022em; line-height: 1; white-space: nowrap;
        display: inline-block; text-transform: none; }
  .wm-tt { position: relative; }
  /* Absolute, because it must not add width to the word. See the note above on
     why this is ${CROSSBAR_TOP}em and not the 0.325em it was. */
  .wm-tt i { position: absolute; left: -0.10em; right: -0.16em;
             top: ${CROSSBAR_TOP}em; display: block; }
`;

/**
 * The mark itself.
 *
 * The rule's thickness scales with the size and never falls under 1.5px: below
 * that it disappears in a video encode, and a datum nobody can see is not a
 * datum.
 */
export function wordmark({ size = 64, colour = '#e8e8e8', rule = '#f2857c' } = {}) {
  const unit = size / 64;
  const thickness = round(Math.max(1.5, 3.4 * unit));

  return `<span class="wm" style="font-size:${round(size)}px;color:${colour}">
    <span>sigh</span><span class="wm-tt">tt<i style="background:${rule};height:${thickness}px"></i></span><span>rue</span>
  </span>`;
}
