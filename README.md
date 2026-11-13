# EQ-Scalculator

**Earthquake scaling relationship calculator** — solve, compare and explore empirical
fault-scaling relations between earthquake source parameters, entirely in the browser.

**→ [james-lagreca.github.io/EQ-Scalculator](https://james-lagreca.github.io/EQ-Scalculator/)**

<!-- TODO: after the first Zenodo release, add the DOI badge here. -->

## What it does

Relates the standard earthquake source parameters — moment magnitude (Mw), seismic moment
(M0), rupture length (L), width (W), area (A), surface rupture length (SRL), and average
(AD) and maximum (MD) displacement — using published empirical relations.

| Tab | Purpose |
| --- | --- |
| Deterministic | One value, or a CSV batch, through a chosen relation |
| Monte Carlo | Propagate input and model-regression uncertainty into a distribution |
| Explore | Plot any relation as a curve, across models and fault styles |
| Comparison | The same input through many models side by side, with ±1σ and validity flags |
| Chain | Multi-step calculations, e.g. Mw → A → AD |

Every relation can be solved in **both directions**. Where a paper publishes a regression
in each direction (Wells & Coppersmith, 1994), the published regression for the direction
asked for is used. Otherwise the inverse is an exact algebraic inversion of the stored
relation, not a separate regression — reasonable where the slope is theoretically fixed
(as in Leonard's framework), but be aware of regression dilution when inverting an
ordinary least-squares fit.

**Moment magnitude** is offered in two conventions wherever M0 and Mw are converted:
Hanks & Kanamori (1979), Mw = ⅔·log₁₀(M0 [dyne·cm]) − 10.7, and
Mw = (log₁₀(M0 [N·m]) − 9.1) / 1.5, the form Leonard (2014) states. They differ by a
constant 0.033 magnitude units. Use the convention of the paper you are chaining through.

**Model uncertainty** is applied in the space the source publishes it: magnitude units for
relations that give Mw, log₁₀ units for relations that give a dimension. Leonard (2014)
publishes a one-standard-deviation *range* of each intercept instead of a scatter, and the
range is often not centred on the intercept; each side is used as printed, so no symmetry
is assumed. Relations whose source gives no standard deviation (Stirling et al., 2024) are
run without model uncertainty, and the Monte Carlo tab says so. Monte Carlo model weights
are relative and are normalised when the simulation runs.

Relations may be **piecewise**: a relation is stored as an ordered list of segments with
validity ranges, so bilinear and trilinear models are represented natively, and the app
warns when an input falls outside a model's published range.

## Scaling models included

| Model | Coverage |
| --- | --- |
| Wells & Coppersmith (1994) | Global crustal; all styles, strike-slip, reverse, normal |
| Leonard (2014) | Interplate and SCR, dip-slip and strike-slip; all 10 permutations |
| Somerville (2014) | SCR moment–area, four estimation methods |
| Thingbaijam et al. (2017) | Reverse, normal, strike-slip, subduction interface |
| Yang et al. (2021) | Australian SCR reverse-faulting surface ruptures |
| Stirling et al. (2024) | NZ NSHM 2022 magnitude–area, crustal and subduction |
| Strasser et al. (2010) | Subduction interface and intraslab |
| Allen & Hayes (2017) | Subduction interface (linear and bilinear) and intraslab |

Full references are listed in the app's References section and in the `citation` field of
each file under `scaling_models/`.

## Coefficient accuracy

Coefficients are transcribed from the primary literature, and the transcriptions are
checked by an automated suite:

```sh
node tools/verify_models.mjs
```

This validates every model file against the schema and, for models with an internal
theoretical structure, checks that structure holds — segment continuity at breakpoints,
and for Leonard (2014) the full self-consistency framework (M0 = μ·A·D̄, W = C1·L^⅔,
D̄ = C2·√A) plus spot calculations run through the real solver.

Where a **published table is internally inconsistent**, the correction and its derivation
are documented next to the data rather than applied silently. See
[`scaling_models/leonard_2014/REVIEW.md`](scaling_models/leonard_2014/REVIEW.md), which
records three such errata in Leonard (2014) and the evidence for the corrected values.

Source-paper PDFs are deliberately **not** redistributed here (publisher copyright); they
are gitignored, so you can keep local copies for verification. Cite the DOIs.

## Running locally

No build step and no dependencies. The model files are loaded with `fetch()`, which
browsers block for a page opened straight from disk (in Chromium the page opens but no
models load), so serve the folder with any static file server:

```sh
git clone https://github.com/james-lagreca/EQ-Scalculator.git
cd EQ-Scalculator
python3 -m http.server 8000     # then open http://localhost:8000
```

Plotly and PapaParse load from a CDN, so first load needs a network connection.

## Adding a model

1. Create `scaling_models/<model>/<model>.json` following the schema of any existing file:
   a top-level paper name, then `fault_types` → `"<Y>_from_<X>"` → an array of segments,
   each with `equation_form`, `coefficients` (`a`, `b`), `units`, `range_x`, and a σ
   (`log10_y_std_dev`, or `std_dev_a` for uncertainty on the intercept: either a number,
   or the published one-standard-deviation range as a string such as `"3.61-3.73"`, whose
   two sides are then used as printed). Omit both if the source publishes none.
2. Add one line to the `modelFiles` array in `js/models.js`.
3. Run `node tools/verify_models.mjs`.

Parameters, dropdowns and available model lists are all derived from the data — no other
registration is needed unless you introduce a new parameter symbol, which also needs an
entry in `PARAMETER_ALIASES` (`js/models.js`) and `UNIT_OPTIONS` (`js/units.js`).

## Citing

Please cite **both** this tool and the underlying paper for whichever relation you used —
the coefficients are the original authors' work. Citation metadata for the tool is in
[`CITATION.cff`](CITATION.cff).

## Licence

[MIT](LICENSE). The transcribed coefficients remain facts reported in the cited
literature; the encoding, corrections and software are MIT-licensed.

Parts of this project were developed with assistance from Claude Code.
