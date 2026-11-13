# Leonard (2014) transcription review

**Reviewed:** 2026-08-07 · **Data file:** `leonard_2014.json` · **Source:** Leonard, M. (2014), *Self-Consistent Earthquake Fault-Scaling Relations: Update and Extension to Stable Continental Strike-Slip Faults*, BSSA 104(6), 2953–2965, doi:10.1785/0120140087. The paper PDF is not redistributed here (publisher copyright); place a local copy in this directory — it is gitignored — to re-check any figure quoted below.

Triggered by a concern that the strike-slip displacement↔length behaviour was wrong. Every coefficient in the JSON was checked digit-by-digit against the paper's Table 3 (SI/metre relations) and Table 4 (Mw relations), against Leonard's self-consistency framework, and against OpenQuake's `Leonard2014_*` implementation for the Mw–A anchors (3.99/4.00/4.18/4.19 — all match).

## Framework used for verification

Leonard's relations are not independent regressions; they all derive from:

- `M0 = mu * A * D_Av` with `mu = 3.3e10 Pa` (`log10(mu) = 10.5185`)
- `W = C1 * L^(2/3)` up to width saturation (`C1 = 10^a(A_from_L seg 2)`; interplate SS 15.0, SCR SS 11.7)
- `D_Av = C2 * A^0.5` (`C2 = 10^a(D_from_A)`; interplate SS 10^-4.432, SCR SS 10^-4.149)
- `Mw = (2/3) * log10(M0[N·m]) - 6.07` (Hanks & Kanamori)

Every entry can therefore be cross-derived from the others. `tools/verify_models.mjs` automates these checks.

## Verdict summary

| Relation family | Verdict |
|---|---|
| `A_from_L`, `W_from_L`, `W_from_A` (all styles) | Faithful to Table 3, self-consistent — unchanged |
| `D_from_A`, `D_from_L`, `D_from_W` (all styles) | Faithful to Table 3, self-consistent — unchanged. **The strike-slip AD↔L coefficients are correct as published.** |
| `M0_from_A`, `M0_from_L`, `M0_from_W`, `M0_from_L_SR` | Faithful to Table 3, self-consistent — unchanged |
| `Mw_from_A`, `Mw_from_L`, `Mw_from_W` | Faithful to Table 4 — unchanged (see quirks below) |
| `Mw_from_L_SR` (SCR Dip-Slip, first segment) | **Corrected** — erratum 3 |
| `M0_from_D` (all four styles) | **Corrected** — erratum 1 |
| `Mw_from_D` (SCR Strike-Slip only) | **Corrected** — erratum 2 |

## Erratum 1 — `M0_from_D` (all four fault styles)

The paper's Table 3 `log(M0) = a + b·log(D_Av)` rows are algebraically inconsistent with the rest of the same table. From the framework, `A = (D/C2)^2`, so

```
M0 = mu * A * D = mu * D^3 / C2^2   =>   a = log10(mu) + 2*|log10(C2)|
```

The printed intercepts equal `log10(mu) + 1*|log10(C2)|` — C2 was not squared — in **all four** fault styles, to the third decimal. The result is ~4.4 log units of error in M0 (≈ 2.9 magnitude units): e.g. interplate SS at D_Av = 1 m gives Mw 3.9 instead of Mw 6.85.

Proof of intent: the paper's own **Table 4** Mw–D rows were computed with the *correct* algebra. `(2/3)·a_corrected − 6.07` reproduces the printed Table 4 intercepts (and their S(a) ranges) exactly for the three styles the paper got right:

| Fault style | Printed Table 3 a | Corrected a | (2/3)·a_corr − 6.07 | Table 4 prints |
|---|---|---|---|---|
| Interplate DS | 14.939 | **19.36** | 6.84 | 6.84 ✔ |
| Interplate SS | 14.95 | **19.38** | 6.85 | 6.85 ✔ |
| SCR DS | 14.66 | **18.79** | 6.46 | 6.46 ✔ |
| SCR SS | 14.67 | **18.82** | 6.47 | 3.71 ✘ (see erratum 2) |

Corrected S(a) ranges double the C2 half-width (`log10(mu) + 2·|S(a(D_from_A))|`); the transformed ranges likewise reproduce Table 4's printed ranges (e.g. interplate SS: (2/3)·[18.62, 20.16] − 6.07 = [6.34, 7.37] vs printed "6.34–7.38").

Before the correction, the app gave contradictory answers for the same physical question: Mw 7 → AD returned ~1.2 m via `Mw_from_D` but ~35 m via `M0_from_D`, and the chain AD(6 m) → M0 → L returned 5.9 km while direct AD → L returned ~1,500 km. Both routes now agree.

## Erratum 2 — SCR Strike-Slip `Mw_from_D`

The paper prints `a = 3.71` (S(a) 3.62–3.82) — exactly `(2/3)·14.67 − 6.07`, i.e. it inherits the Table 3 error above (a 1 m average-slip earthquake is not Mw 3.7). An earlier transcription of this repo silently changed the leading digit to 6.71, which is not derivable from anything. The self-consistent value is

```
a = (2/3)·18.82 − 6.07 = 6.47      (equivalently: Mw_from_A 4.18 + 2·(a(D_from_A) + 3) = 6.48; rounding)
```

with S(a) = (2/3)·[18.54, 19.14] − 6.07 = **"6.29-6.69"**. `range_x` restored to the paper's ">0" (the JSON had [0.2, null]).

## Erratum 3 — SCR Dip-Slip `Mw_from_L_SR`, first segment (added 2026-11-13)

Table 4 prints `a = 5.12` for `Mw = a + 0.953·log(L_SR)` (L_SR ≤ 15 km). Three things in the paper give 5.16 instead:

- the text on p. 2956: "which equates to Mw = 5.16 + 0.953 log(L_SR)";
- Table 3's `log M0 = 12.55 + 1.43·log L_SR` (metres), which converts to `(12.55 + 1.43·3 − 9.1)/1.5 = 5.16`;
- continuity: at 15 km the second segment gives `4.32 + 1.667·log(15) = 6.281`; 5.16 gives 6.281, whereas 5.12 gives 6.241 (a 0.04 Mw step).

Corrected to **5.16**. This is a reading of the paper's own text and Table 3, not a published erratum.

## Paper-internal quirks — kept as printed, documented here

1. **Breakpoint mismatch, interplate SS:** Table 3 relations transition at L = 40 km (W saturates at 17.5 km); Table 4's Mw–L transitions at 45 km (W = 19 km, matching Table 4's Mw–W range cap). Both are as printed; each family is internally continuous. Near-breakpoint differences ≤ ~0.04 Mw.
2. **Breakpoint mismatch, SCR SS:** Table 3's A/W relations saturate at L = 70 km (W = 20 km) while its D/M0 relations (and Table 4's Mw–L second segment) transition at 60 km (W = 18 km). The paper's Table 4 Mw–L range column is itself overlapping ("1.6–70" then ">60"); the JSON uses the continuity-correct 60/60 split (segments are continuous at 60 km, not at 70 km).
3. **`Mw_from_W` intercepts are ~+0.15 Mw high relative to Table 3** for interplate SS (3.88 vs derived 3.72), SCR DS (4.14 vs 3.99) and SCR SS (4.22 vs 4.07); interplate DS (3.63) matches exactly. At the interplate-SS saturation point (W = 19 km) the printed row gives Mw 7.08 while both Mw–L branches give 6.93. The pattern is consistent with these rows being carried over from Leonard (2010) Table 5 without re-deriving for the updated C1 (for interplate SS, 2010-era C1 ≈ 13 vs 2014's 15 predicts the +0.16 shift; interplate DS C1 was unchanged, and it is the one row that matches). **Kept as printed** since Table 4 is what the paper publishes and the attribution is inferential — but W→Mw will read ~0.15 Mw higher than W→M0→Mw. Candidate future correction: 3.72 / 3.99 / 4.07.
4. **Three S(a) ranges are printed high-to-low** in the paper (e.g. interplate SS `D_from_W` "−5.02 to −5.60") — transcribed verbatim; the app's sigma parser is order-insensitive.

## The case that triggered this review: strike-slip AD = 6 m → L ≈ 1,500 km

This is **the published model's genuine behaviour, not a transcription error**. For interplate SS beyond L ≈ 45 km, width saturates and `D_Av ∝ √L` (`log D = −2.310 + 0.5·log L`, metres — verified against Table 3 and derivable as `C2·√(W_sat·L)`). Forward, Leonard's median predicts modest average slip even for very long ruptures (100 km → 1.55 m; 300 km → 2.7 m; 450 km → 3.3 m), so inverting at 6 m lands at Mw ≈ 8.4 / L ≈ 1,400–1,500 km, consistently across D→L, D→Mw→L and (post-fix) D→M0→L.

Context for interpreting it:

- **Cross-model at 6 m (strike-slip):** Leonard AD→L ≈ 1,500 km; Thingbaijam et al. (2017) AD→L ≈ 713 km; Wells & Coppersmith AD→SRL ≈ 241 km; W&C MD→SRL ≈ 134 km. Equivalently, at AD = 6 m Leonard implies Mw 8.41 while W&C implies Mw 7.73. Leonard's D_Av is a *moment-derived, whole-rupture-plane average*, which for great strike-slip events sits well below field-measured surface displacements, and the √L branch inverts very steeply (L ∝ D²) — small model differences in D become huge differences in L.
- **Effective extrapolation:** although the printed validity range is open-ended (">40 km"), D_Av = 6 m is beyond the interplate strike-slip data Leonard fitted (his largest events have D_Av ≈ 3–5 m), so no in-app extrapolation warning fires even though the answer is an extrapolation of the median model.
- **Average vs maximum displacement:** Leonard (2014) defines **no maximum-displacement (MD) relation**; this app deliberately maps Leonard's D to **AD only**, and Leonard correctly never appears for MD queries (use Wells & Coppersmith MD↔SRL for that). Entering a maximum displacement into Leonard's AD slot roughly quadruples the inverted length (MD ≈ 2·AD empirically, and L ∝ D² on this branch).

## Related app fixes made with this review

- `js/solver.js` — Monte Carlo previously did `parseFloat("-4.30 to -3.40")` → σ = −4.30 (several orders of magnitude of spurious scatter on every Leonard run). Leonard's `std_dev_a` strings are the paper's *one-standard-deviation range of a* (Table 3 footnote), so σ is now `|hi − lo| / 2` (`parseStdDevA`); plain numeric values (Yang et al. 2021) behave as before.
- `js/solver.js` — inverse solving of a saturated (b = 0) segment, e.g. W→L for interplate SS with W ≥ 17.5 km, returned `Infinity`; it now returns the standard calculation error (length is genuinely unconstrained by a saturated width).

## Re-verifying

```
node tools/verify_models.mjs
```

asserts breakpoint continuity, all framework identities, the corrected values, spot calculations through the real `js/solver.js`, and the sigma parser. Pass a path as an argument to point the Leonard checks at an alternative copy of the file.
