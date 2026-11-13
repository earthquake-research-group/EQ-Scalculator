# CLAUDE.md

## Project Overview

EQ-Scalculator is a client-side web application for calculating, comparing, and exploring empirical earthquake fault-scaling relationships. It is deployed as a static site on GitHub Pages.

## Repository

`james-lagreca/EQ-Scalculator` is the canonical repository: all work happens here, and the live site is served from its `master` branch. `earthquake-research-group/EQ-Scalculator` is a fork that has lagged far behind; do not start work there or treat it as current. Before building on any branch, check that it descends from this repository's `master`.

## Tech Stack

- Vanilla JavaScript (ES6+), HTML5, CSS3
- Plotly.js 2.26.0 (charting, loaded via CDN)
- PapaParse 5.4.1 (CSV parsing, loaded via CDN)
- No build tools, bundlers, or package manager — all static files served directly

## Project Structure

```
index.html          — Single-page application entry point
styles.css          — All styling (responsive, CSS Grid + Flexbox)
js/
  app.js            — Main UI logic, tab management, form handling (~1800 lines)
  solver.js         — Core math solver, validity domains, regression scatter
  models.js         — Model loading and lookup via fetch()
  units.js          — Unit conversions and the two moment-magnitude conventions
  format.js         — Number, unit and plot formatting
scaling_models/     — JSON data files for 8 empirical scaling model sets
tools/
  verify_models.mjs — Verification suite for the model files and the solver
```

## Running Locally

No build step. The model files are loaded with `fetch()`, which browsers block on `file://` pages (in Chromium the page opens but no models load), so serve the folder locally (`python3 -m http.server 8000`) and open `http://localhost:8000`.

## Code Conventions

- **JS functions/variables**: camelCase (`calculateDeterministic`, `currentBatchData`)
- **Constants**: UPPERCASE (`CONVERSIONS_TO_METER`, `UNIT_OPTIONS`)
- **CSS classes**: kebab-case (`tab-content`, `form-group`, `btn-primary`)
- **HTML IDs**: camelCase (`inputValue`, `selectedModel`)
- JSDoc-style comments on functions with `@param` and `@returns`

## Architecture Notes

- All computation is client-side — no backend
- Scaling model data is lazy-loaded from JSON files in `scaling_models/`
- Three equation forms: `log10(Y) = a + b*log10(X)`, `Y = a + b*log10(X)`, `log10(Y) = a + b*X`
- Monte Carlo simulation uses Box-Muller transform for normal distribution sampling; model weights are relative and normalised at run time
- Parameters: Mw, M0, L, W, A, SRL, AD, MD with unit conversions (km/m, km²/m², Nm/dyne.cm)
- A published sigma is applied in the space of the relation's dependent variable: magnitude units for Mw, log10 for dimensions (`scatterFor` in `solver.js`). Leonard (2014) intercept ranges (`std_dev_a` strings) are applied one side at a time, as printed
- M0 ↔ Mw is offered in two conventions (`MW_CONVENTIONS` in `units.js`): Hanks & Kanamori (1979) and the (log M0 − 9.1)/1.5 form stated in Leonard (2014)
- Where a paper publishes both directions of a regression, the lookup uses the published one for the direction asked for, never the algebraic inverse of the other
- Departures from a paper's printed values are documented beside the data (`scaling_models/leonard_2014/REVIEW.md`), never applied silently

## Testing

Run `node tools/verify_models.mjs` after any change to `scaling_models/`, `js/solver.js`, `js/units.js` or `js/models.js`; it must report that all checks passed. It covers the model files and the solver, not the interface, so also exercise the five tabs in a browser: Deterministic Calculation, Monte Carlo Simulation, Explore Relationships, Model Comparison, and Chain Calculations.
