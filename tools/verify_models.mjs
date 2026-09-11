#!/usr/bin/env node
// Verification suite for every file under scaling_models/.
//
//   node tools/verify_models.mjs [path/to/alternate_leonard.json]
//
// Two layers:
//   1. A schema and structural check over ALL model files: recognised equation
//      forms, numeric coefficients, units present, contiguous non-overlapping
//      segment ranges, continuity at breakpoints, and a citation.
//   2. Model-specific checks where a paper has internal theoretical structure
//      worth testing. Leonard (2014) gets the full self-consistency framework
//      plus spot calculations run through the real js/solver.js and js/units.js.
//      Background and derivations: scaling_models/leonard_2014/REVIEW.md
//      Framework: M0 = mu*A*D_Av, W = C1*L^(2/3), D_Av = C2*sqrt(A),
//      mu = 3.3e10 Pa, Mw = (2/3)*log10(M0[N*m]) - 6.07.
//
// The optional argument overrides only the Leonard file, so the suite can be
// pointed at a pre-fix copy to confirm it still catches the known errata.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const leonardPath = process.argv[2] || join(root, 'scaling_models/leonard_2014/leonard_2014.json');

// Model files, in the same order js/models.js loads them.
const MODEL_FILES = [
    'scaling_models/leonard_2014/leonard_2014.json',
    'scaling_models/wells_coppersmith_1994/wells_coppersmith_1994.json',
    'scaling_models/somerville_2014/somerville_2014.json',
    'scaling_models/yang_etal_2021/yang_etal_2021.json',
    'scaling_models/stirling_etal_2024/stirling_etal_2024.json',
    'scaling_models/thingbaijam_etal_2017/thingbaijam_etal_2017.json',
    'scaling_models/strasser_etal_2010/strasser_etal_2010.json',
    'scaling_models/allen_hayes_2017/allen_hayes_2017.json'
];

const EQUATION_FORMS = [
    'log10(Y) = a + b * log10(X)',
    'Y = a + b * log10(X)',
    'log10(Y) = a + b * X'
];

const faultTypes = JSON.parse(readFileSync(leonardPath, 'utf8'))['Leonard 2014'].fault_types;

const LOG_MU = Math.log10(3.3e10); // 10.5185
const HK = (logM0) => (2 / 3) * logM0 - 6.07;

let failures = 0;
let checks = 0;
function check(cond, msg) {
    checks++;
    if (!cond) { failures++; console.log('FAIL  ' + msg); }
}
const near = (x, y, tol) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= tol;
const a0 = (ft, key) => faultTypes[ft][key][0].coefficients.a;

/**
 * Evaluate a segment in its natural output space at x: log10(Y) for the
 * log-log and log-linear forms, Mw for the "Y = a + b*log10(X)" form. That is
 * the right space for comparing two segments at a shared breakpoint.
 */
function evalAt(seg, x) {
    const { a, b } = seg.coefficients;
    return seg.equation_form === 'log10(Y) = a + b * X' ? a + b * x : a + b * Math.log10(x);
}

/** Mirror of solver.js parseStdDevA, used before the solver is loaded. */
function SIGMA_PARSEABLE(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0;
    const m = String(value).match(/(-?\d+(?:\.\d+)?)\s*(?:to|–|-)\s*(-?\d+(?:\.\d+)?)/);
    if (m) return Math.abs(parseFloat(m[2]) - parseFloat(m[1])) / 2 > 0;
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0;
}

// Both equation forms reduce to "a + b*log10(x)" (log10(Y) for Table 3, Mw for Table 4),
// which is the right space for continuity/consistency comparisons.
const evalLog = (seg, x) => seg.coefficients.a + seg.coefficients.b * Math.log10(x);

// ---- 0. Schema and structure over every model file ----
for (const rel of MODEL_FILES) {
    let doc;
    try {
        doc = JSON.parse(readFileSync(join(root, rel), 'utf8'));
    } catch (e) {
        check(false, `${rel}: readable, valid JSON (${e.message})`);
        continue;
    }

    const paperNames = Object.keys(doc);
    check(paperNames.length === 1, `${rel}: exactly one top-level paper key`);

    for (const paper of paperNames) {
        check(typeof doc[paper].citation === 'string' && doc[paper].citation.length > 20,
            `${paper}: has a citation`);
        check(typeof doc[paper].description === 'string',
            `${paper}: has a description`);
        check(doc[paper].fault_types && Object.keys(doc[paper].fault_types).length > 0,
            `${paper}: has fault_types`);

        for (const [style, rels] of Object.entries(doc[paper].fault_types || {})) {
            for (const [key, segs] of Object.entries(rels)) {
                const where = `${paper} / ${style} / ${key}`;
                check(key.includes('_from_'), `${where}: key is "<Y>_from_<X>"`);
                check(Array.isArray(segs) && segs.length > 0, `${where}: non-empty segment array`);
                if (!Array.isArray(segs)) continue;

                for (let i = 0; i < segs.length; i++) {
                    const seg = segs[i];
                    check(EQUATION_FORMS.includes(seg.equation_form),
                        `${where}[${i}]: recognised equation_form`);
                    check(typeof seg.coefficients?.a === 'number' && Number.isFinite(seg.coefficients.a) &&
                          typeof seg.coefficients?.b === 'number' && Number.isFinite(seg.coefficients.b),
                        `${where}[${i}]: finite numeric coefficients a and b`);
                    check(seg.units && 'x' in seg.units && 'y' in seg.units,
                        `${where}[${i}]: units declares both x and y`);
                    check(!('range_x' in seg) ||
                          (Array.isArray(seg.range_x) && seg.range_x.length === 2),
                        `${where}[${i}]: range_x is a two-element array`);
                    check(seg.log10_y_std_dev === undefined || typeof seg.log10_y_std_dev === 'number',
                        `${where}[${i}]: log10_y_std_dev is numeric when present`);
                    // Sigma should be parseable by the solver's own helper.
                    if (seg.std_dev_a !== undefined && seg.std_dev_a !== null) {
                        check(SIGMA_PARSEABLE(seg.std_dev_a),
                            `${where}[${i}]: std_dev_a parses to a positive sigma`);
                    }
                }

                // Units must agree across segments: solveRelationship reads
                // segment 0's units and applies them to whichever segment wins.
                const u0 = JSON.stringify(segs[0].units);
                check(segs.every(sg => JSON.stringify(sg.units) === u0),
                    `${where}: all segments share the same units`);

                // Ranges must be contiguous, and the relation continuous across them.
                for (let i = 0; i + 1 < segs.length; i++) {
                    const brk = segs[i].range_x?.[1];
                    check(brk !== null && brk !== undefined && brk === segs[i + 1].range_x?.[0],
                        `${where}: segments ${i}/${i + 1} meet at a shared breakpoint`);
                    if (brk === null || brk === undefined) continue;
                    const lo = evalAt(segs[i], brk);
                    const hi = evalAt(segs[i + 1], brk);
                    check(near(lo, hi, 0.05),
                        `${where}: continuous at breakpoint ${brk} (${lo.toFixed(3)} vs ${hi.toFixed(3)})`);
                }
            }
        }
    }
}

// ---- 1. Leonard 2014: structure, segment contiguity and continuity ----
for (const [ft, rels] of Object.entries(faultTypes)) {
    for (const [key, segs] of Object.entries(rels)) {
        for (const seg of segs) {
            check(typeof seg.coefficients?.a === 'number' && typeof seg.coefficients?.b === 'number',
                `${ft} ${key}: numeric coefficients`);
            check(seg.equation_form === 'log10(Y) = a + b * log10(X)' || seg.equation_form === 'Y = a + b * log10(X)',
                `${ft} ${key}: recognised equation_form`);
        }
        for (let i = 0; i + 1 < segs.length; i++) {
            const brk = segs[i].range_x[1];
            check(brk === segs[i + 1].range_x[0], `${ft} ${key}: segments ${i}/${i + 1} contiguous`);
            check(near(evalLog(segs[i], brk), evalLog(segs[i + 1], brk), 0.05),
                `${ft} ${key}: continuous at breakpoint ${brk} (${evalLog(segs[i], brk).toFixed(3)} vs ${evalLog(segs[i + 1], brk).toFixed(3)})`);
        }
    }
}

// ---- 2. Framework identities within each fault type ----
for (const ft of Object.keys(faultTypes)) {
    const dA = a0(ft, 'D_from_A');
    check(near(a0(ft, 'M0_from_A'), LOG_MU + dA, 0.02), `${ft}: a(M0_from_A) = log10(mu) + a(D_from_A)`);
    check(near(a0(ft, 'M0_from_D'), LOG_MU - 2 * dA, 0.02),
        `${ft}: a(M0_from_D) = log10(mu) + 2*|a(D_from_A)| (got ${a0(ft, 'M0_from_D')}, want ${(LOG_MU - 2 * dA).toFixed(2)})`);
    check(near(a0(ft, 'Mw_from_A'), HK(a0(ft, 'M0_from_A') + 9), 0.02), `${ft}: Mw_from_A consistent with M0_from_A`);
    check(near(a0(ft, 'Mw_from_D'), HK(a0(ft, 'M0_from_D')), 0.02),
        `${ft}: Mw_from_D consistent with M0_from_D (got ${a0(ft, 'Mw_from_D')}, want ${HK(a0(ft, 'M0_from_D')).toFixed(2)})`);
    // Mw_from_L segments against the M0_from_L segment with matching slope (b_M0 = 1.5*b_Mw).
    for (const mwSeg of faultTypes[ft].Mw_from_L) {
        const m0Seg = faultTypes[ft].M0_from_L.find(s => Math.abs(s.coefficients.b - 1.5 * mwSeg.coefficients.b) < 0.01);
        check(!!m0Seg && near(mwSeg.coefficients.a, HK(m0Seg.coefficients.a + 3 * m0Seg.coefficients.b), 0.05),
            `${ft}: Mw_from_L (b=${mwSeg.coefficients.b}) consistent with M0_from_L`);
    }
}

// ---- 3. Pins on the corrected entries (regression guard) ----
check(a0('Interplate Dip-Slip', 'M0_from_D') === 19.36, 'pin: Interplate DS M0_from_D a = 19.36');
check(a0('Interplate Strike-Slip', 'M0_from_D') === 19.38, 'pin: Interplate SS M0_from_D a = 19.38');
check(a0('SCR Dip-Slip', 'M0_from_D') === 18.79, 'pin: SCR DS M0_from_D a = 18.79');
check(a0('SCR Strike-Slip', 'M0_from_D') === 18.82, 'pin: SCR SS M0_from_D a = 18.82');
check(a0('SCR Strike-Slip', 'Mw_from_D') === 6.47, 'pin: SCR SS Mw_from_D a = 6.47');
check(faultTypes['SCR Strike-Slip'].Mw_from_D[0].range_x[0] === 0, 'pin: SCR SS Mw_from_D range starts at 0');

// ---- 4. Spot calculations through the real app code ----
const ctx = vm.createContext({ Math, parseFloat, isNaN, String, Number, Error, console });
vm.runInContext(readFileSync(join(root, 'js/units.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'js/solver.js'), 'utf8'), ctx);
const ss = faultTypes['Interplate Strike-Slip'];
const solve = (params, val, unit, dir) => vm.runInContext('solveRelationship', ctx)(params, val, unit, dir);

const adFromMw = solve(ss.Mw_from_D, 7, null, 'inverse');        // Mw 7 -> AD
check(near(adFromMw.result, 1.188, 0.03), `solver: IP SS Mw 7 -> AD = ${adFromMw.result?.toFixed(3)} m (want ~1.19)`);
const adFromM0 = solve(ss.M0_from_D, Math.pow(10, 19.605), 'Nm', 'inverse'); // same event via M0
check(near(adFromM0.result, 1.188, 0.04), `solver: IP SS M0(Mw7) -> AD = ${adFromM0.result?.toFixed(3)} m (want ~1.19; was ~35.6 pre-fix)`);

const lDirect = solve(ss.D_from_L, 6, 'm', 'inverse');            // AD 6 m -> L, direct
check(near(lDirect.result / 1e3, 1501, 30), `solver: IP SS AD 6 m -> L = ${(lDirect.result / 1e3).toFixed(0)} km (want ~1501)`);
const m0From6 = solve(ss.M0_from_D, 6, 'm', 'forward');
const lChained = solve(ss.M0_from_L, m0From6.result, 'Nm', 'inverse'); // AD 6 m -> M0 -> L
check(near(lChained.result / lDirect.result, 1.0, 0.05),
    `solver: chained AD->M0->L = ${(lChained.result / 1e3).toFixed(0)} km agrees with direct (was 5.9 km pre-fix)`);

const wSat = solve(ss.W_from_L, 20, 'km', 'inverse');             // saturated width -> L
check(wSat.result === null, 'solver: inverse of saturated (b=0) W_from_L returns null, not Infinity');

const parse = vm.runInContext('parseStdDevA', ctx);
check(near(parse('-4.30 to -3.40'), 0.45, 1e-9), 'parseStdDevA("-4.30 to -3.40") = 0.45');
check(near(parse('-5.02 to -5.60'), 0.29, 1e-9), 'parseStdDevA order-insensitive ("-5.02 to -5.60") = 0.29');
check(near(parse('3.73-4.33'), 0.30, 1e-9), 'parseStdDevA("3.73-4.33") = 0.30');
check(near(parse(0.12), 0.12, 1e-9), 'parseStdDevA(0.12) = 0.12 (numeric passthrough)');
check(parse(null) === null, 'parseStdDevA(null) = null');

// Monte Carlo scatter sanity: sigma of log10(AD) should be ~0.455 (=|−1.86−(−2.77)|/2), not ~4.3.
// Seeded, so a tolerance this tight cannot fail intermittently.
const mcRun = vm.runInContext('solveOneSimulationRun', ctx);
const makeRng = vm.runInContext('makeRng', ctx);
const logs = [];
{
    const rng = makeRng('verify-mc-scatter');
    for (let i = 0; i < 3000; i++) {
        const r = mcRun(ss.D_from_L, 100, 'km', 'forward', true, rng);
        if (r.result > 0) logs.push(Math.log10(r.result));
    }
}
const mean = logs.reduce((s, v) => s + v, 0) / logs.length;
const sd = Math.sqrt(logs.reduce((s, v) => s + (v - mean) ** 2, 0) / (logs.length - 1));
check(logs.length === 3000 && near(mean, 0.19, 0.05) && sd > 0.3 && sd < 0.6,
    `solver MC: IP SS L 100 km -> AD, log10 mean ${mean.toFixed(3)} (want ~0.19), sd ${sd.toFixed(3)} (want ~0.455)`);

// ---- 4b. New subduction models: pinned coefficients and spot values ----
const strasser = JSON.parse(readFileSync(
    join(root, 'scaling_models/strasser_etal_2010/strasser_etal_2010.json'), 'utf8'))['Strasser et al. 2010'].fault_types;
const allenHayes = JSON.parse(readFileSync(
    join(root, 'scaling_models/allen_hayes_2017/allen_hayes_2017.json'), 'utf8'))['Allen & Hayes 2017'].fault_types;

const pin = (segs, i, a, b, sigma, label) => {
    check(segs[i].coefficients.a === a && segs[i].coefficients.b === b,
        `pin: ${label} a=${a} b=${b} (got a=${segs[i].coefficients.a} b=${segs[i].coefficients.b})`);
    check(segs[i].log10_y_std_dev === sigma, `pin: ${label} sigma=${sigma}`);
};

// Values verified against OpenQuake hazardlib scalerel/strasser2010.py
pin(strasser['Subduction Interface'].A_from_Mw, 0, -3.476, 0.952, 0.304, 'Strasser interface A-Mw');
pin(strasser['Subduction Interface'].L_from_Mw, 0, -2.477, 0.585, 0.180, 'Strasser interface L-Mw');
pin(strasser['Subduction Interface'].W_from_Mw, 0, -0.882, 0.351, 0.173, 'Strasser interface W-Mw');
pin(strasser['Subduction Intraslab'].A_from_Mw, 0, -3.225, 0.890, 0.184, 'Strasser intraslab A-Mw');

// Values verified against OpenQuake hazardlib scalerel/allenhayes2017.py
pin(allenHayes['Subduction Interface (Bilinear)'].A_from_Mw, 0, -5.62, 1.22, 0.256, 'Allen-Hayes bilinear seg1');
pin(allenHayes['Subduction Interface (Bilinear)'].A_from_Mw, 1, 2.23, 0.31, 0.256, 'Allen-Hayes bilinear seg2');
pin(allenHayes['Subduction Interface (Linear)'].A_from_Mw, 0, -3.63, 0.96, 0.255, 'Allen-Hayes linear');
pin(allenHayes['Subduction Intraslab'].A_from_Mw, 0, -3.89, 0.96, 0.19, 'Allen-Hayes intraslab');

// Forward spot values, and round-tripping through the solver's inversion.
const spot = (segs, mag, expectedLogA, label) => {
    const fwd = solve(segs, mag, null, 'forward');
    check(near(Math.log10(fwd.result), expectedLogA, 0.01),
        `solver: ${label} Mw ${mag} -> A = ${fwd.result?.toFixed(0)} km^2 (log10 want ${expectedLogA})`);
    const back = solve(segs, fwd.result, 'km^2', 'inverse');
    check(near(back.result, mag, 0.01),
        `solver: ${label} Mw ${mag} round-trips through inversion (got ${back.result?.toFixed(3)})`);
};

spot(strasser['Subduction Interface'].A_from_Mw, 8.0, -3.476 + 0.952 * 8.0, 'Strasser interface');
spot(strasser['Subduction Intraslab'].A_from_Mw, 7.0, -3.225 + 0.890 * 7.0, 'Strasser intraslab');
spot(allenHayes['Subduction Interface (Bilinear)'].A_from_Mw, 8.0, -5.62 + 1.22 * 8.0, 'A&H bilinear (lower segment)');
spot(allenHayes['Subduction Interface (Bilinear)'].A_from_Mw, 9.0, 2.23 + 0.31 * 9.0, 'A&H bilinear (upper segment)');
spot(allenHayes['Subduction Interface (Linear)'].A_from_Mw, 8.0, -3.63 + 0.96 * 8.0, 'A&H linear');

// The bilinear breakpoint is discontinuous by ~0.003 log units from published
// rounding; assert it is small enough not to matter but present as documented.
const ahSegs = allenHayes['Subduction Interface (Bilinear)'].A_from_Mw;
const gap = Math.abs(evalAt(ahSegs[0], 8.63) - evalAt(ahSegs[1], 8.63));
check(gap > 0 && gap < 0.01, `A&H bilinear breakpoint gap is ${gap.toFixed(4)} log units (published rounding)`);

// ---- 4c. Input domains and sigma propagation ----
const domainOf = vm.runInContext('getInputDomain', ctx);
const extrapolating = vm.runInContext('checkIfExtrapolating', ctx);

// getInputDomain must never contradict checkIfExtrapolating: the domain is
// what the comparison table prints, the flag is what it prints beside it.
const PROBES = [1e-4, 0.05, 0.2, 1, 3, 6, 12, 40, 200, 1500, 1e4, 1e6, 1e10, 1e20];
for (const rel of MODEL_FILES) {
    const doc = JSON.parse(readFileSync(join(root, rel), 'utf8'));
    for (const [paper, body] of Object.entries(doc)) {
        for (const [style, rels] of Object.entries(body.fault_types || {})) {
            for (const [key, segs] of Object.entries(rels)) {
                for (const dir of ['forward', 'inverse']) {
                    const dom = domainOf(segs, dir);
                    check(dom !== null, `${paper}/${style}/${key} ${dir}: domain computed`);
                    if (!dom || dom.degenerate) continue;

                    const unit = segs[0].units[dir === 'forward' ? 'x' : 'y'];
                    check(dom.unit === unit,
                        `${paper}/${style}/${key} ${dir}: domain unit is the INPUT unit (${dom.unit} vs ${unit})`);
                    check(dom.min === null || dom.max === null || dom.min <= dom.max,
                        `${paper}/${style}/${key} ${dir}: domain min <= max`);

                    for (const v of PROBES) {
                        // Inclusive at the top, matching the solver: a value on
                        // the published upper bound is inside the stated range.
                        const inDomain = (dom.min === null || v >= dom.min) && (dom.max === null || v <= dom.max);
                        const flagged = extrapolating(segs, v, unit, dir) !== null;
                        // Inside the union must never be reported as extrapolation.
                        if (inDomain) {
                            check(!flagged,
                                `${paper}/${style}/${key} ${dir}: ${v} inside domain [${dom.min},${dom.max}] is not flagged`);
                        }
                    }
                }
            }
        }
    }
}

// The bug this suite was extended for: an inverse domain must be expressed in
// the input variable, not in range_x. Leonard's AD domain is not a length.
const leonardIPDS = faultTypes['Interplate Dip-Slip'].D_from_L;
const adDomain = domainOf(leonardIPDS, 'inverse');
check(adDomain.unit === 'm' && adDomain.max === null,
    `Leonard IP-DS AD domain is unbounded above (was printed as "0 - 5360 m", a length)`);
check(adDomain.min === null || adDomain.min < 1,
    `Leonard IP-DS AD domain lower bound is a displacement, not ${adDomain.min}`);

const tbSS = JSON.parse(readFileSync(
    join(root, 'scaling_models/thingbaijam_etal_2017/thingbaijam_etal_2017.json'), 'utf8')
)['Thingbaijam et al. 2017'].fault_types['Strike-Slip'].AD_from_L;
const tbDomain = domainOf(tbSS, 'inverse');
check(near(tbDomain.min, 0.138, 0.002) && near(tbDomain.max, 5.10, 0.02),
    `Thingbaijam SS AD domain = ${tbDomain.min?.toFixed(3)}-${tbDomain.max?.toFixed(2)} m (want 0.138-5.10; was printed as "6 - 580 m", L in km)`);
check(extrapolating(tbSS, 6, 'm', 'inverse') !== null,
    'Thingbaijam SS at AD 6 m is flagged as extrapolation (6 m > 5.10 m)');

// Sigma must pick up the 1/|b| Jacobian when the relation is inverted.
const sigmaSS = tbSS[0].log10_y_std_dev, bSS = tbSS[0].coefficients.b;
const lSS = solve(tbSS, 6, 'm', 'inverse').result;
check(near(lSS, 713.1, 0.5), `Thingbaijam SS AD 6 m -> L = ${lSS?.toFixed(1)} km`);
check(near(lSS / Math.pow(10, sigmaSS / Math.abs(bSS)), 318.7, 1) &&
      near(lSS * Math.pow(10, sigmaSS / Math.abs(bSS)), 1596, 5),
    `Thingbaijam SS inverse sigma = ${(sigmaSS / Math.abs(bSS)).toFixed(3)} gives 318.7-1596 km (raw sigma would give 377.7-1346)`);

// Saturated segments have no invertible domain, and must say so rather than
// reporting an unbounded range or Infinity.
const satW = faultTypes['Interplate Strike-Slip'].W_from_L;
const satDomain = domainOf(satW, 'inverse');
check(satDomain.max !== null && Number.isFinite(satDomain.max) && near(satDomain.max, 17602, 5),
    `Leonard IP-SS invertible W domain caps at ${satDomain.max?.toFixed(0)} m (width saturation)`);
check(solve(satW, 40000, 'm', 'inverse').result === null,
    'Leonard IP-SS W above saturation returns null, not Infinity');
check(extrapolating(satW, 40000, 'm', 'inverse') !== null,
    'Leonard IP-SS W above saturation is flagged as extrapolation (was reported in range)');

// Leonard publishes intercept uncertainty rather than total scatter; the
// comparison table falls back to it, so it must parse for every segment.
const parseSigma = vm.runInContext('parseStdDevA', ctx);
for (const [style, rels] of Object.entries(faultTypes)) {
    for (const [key, segs] of Object.entries(rels)) {
        for (let i = 0; i < segs.length; i++) {
            if (segs[i].std_dev_a === null || segs[i].std_dev_a === undefined) continue;
            const sg = parseSigma(segs[i].std_dev_a);
            check(sg !== null && sg > 0 && sg < 2,
                `Leonard ${style}/${key}[${i}]: std_dev_a "${segs[i].std_dev_a}" parses to a plausible sigma (${sg})`);
        }
    }
}

// ---- 4d. Sigma space, across every relation and both directions ----
//
// A published sigma describes scatter in the DEPENDENT variable, in whatever
// space that variable appears in the equation. For `Y = a + b*log10(X)` the
// dependent variable is a magnitude and appears untransformed, so its sigma is
// in magnitude units. Applying it as log10 scatter raises 10 to the power of a
// magnitude - the comparison table printed a +-1 sigma band of 3.86 to 11.67 on
// a result of 6.71, and Monte Carlo returned a standard deviation of 4.7.
//
// This is the generic form of that bug: any relation whose output is a
// magnitude must report 'linear', and any whose output is a physical dimension
// must report 'log10'. It holds for the whole corpus, present and future.
const scatterForFn = vm.runInContext('scatterFor', ctx);
const domainOfFn = vm.runInContext('getInputDomain', ctx);

/** A value comfortably inside a relation's domain, for probing. */
function probeInside(segs, dir) {
    const dom = domainOfFn(segs, dir);
    if (!dom || dom.degenerate) return null;
    const isMag = segs[0].units[dir === 'forward' ? 'x' : 'y'] === null;
    if (dom.min !== null && dom.max !== null) return (dom.min + dom.max) / 2;
    if (dom.min !== null) return isMag ? dom.min + 0.5 : dom.min * 2 || 1;
    if (dom.max !== null) return isMag ? dom.max - 0.5 : dom.max / 2;
    return isMag ? 7 : 1;
}

let sigmaSpaceChecked = 0;
for (const relPath of MODEL_FILES) {
    const doc = JSON.parse(readFileSync(join(root, relPath), 'utf8'));
    for (const [paper, body] of Object.entries(doc)) {
        for (const [style, rels] of Object.entries(body.fault_types || {})) {
            for (const [key, segs] of Object.entries(rels)) {
                const [yName, xName] = key.split('_from_');
                for (const dir of ['forward', 'inverse']) {
                    const outName = dir === 'forward' ? yName : xName;
                    const probe = probeInside(segs, dir);
                    if (probe === null) continue;
                    const unit = segs[0].units[dir === 'forward' ? 'x' : 'y'];
                    const sc = scatterForFn(segs, probe, unit, dir);
                    if (!sc) continue;

                    sigmaSpaceChecked++;
                    const wantLinear = outName === 'Mw';
                    check(sc.space === (wantLinear ? 'linear' : 'log10'),
                        `${paper}/${style}/${key} ${dir}: sigma space is ${sc.space}, want ` +
                        `${wantLinear ? 'linear' : 'log10'} (output ${outName})`);
                    check(sc.sigma > 0 && sc.sigma < 5,
                        `${paper}/${style}/${key} ${dir}: sigma ${sc.sigma} is plausible`);
                    if (wantLinear) {
                        check(sc.sigma < 1.5,
                            `${paper}/${style}/${key} ${dir}: magnitude sigma ${sc.sigma.toFixed(3)} < 1.5 Mw`);
                    }
                }
            }
        }
    }
}
check(sigmaSpaceChecked > 200,
    `sigma-space check covered ${sigmaSpaceChecked} relation/direction pairs`);

// ---- 4e. Monte Carlo agrees with the analytic sigma, in the right space ----
//
// Draws the distribution and compares its spread against what scatterFor says
// it should be. Pre-fix this failed on every `Y = a + b*log10(X)` forward
// relation (sd ~4.7 against sigma 0.24) and on every inverse relation (sd 0
// because model uncertainty was dropped entirely).
function mcSpread(segs, probe, unit, dir, space, seedLabel, n = 4000) {
    const rng = makeRng(seedLabel);
    const vals = [];
    for (let i = 0; i < n; i++) {
        const r = mcRun(segs, probe, unit, dir, true, rng);
        if (r.result === null || !Number.isFinite(r.result)) continue;
        if (space === 'log10') {
            if (r.result <= 0) continue;
            vals.push(Math.log10(r.result));
        } else {
            vals.push(r.result);
        }
    }
    if (vals.length < n * 0.9) return null;
    const m = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { mean: m, sd: Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1)), n: vals.length };
}

const MC_CASES = [
    ['Wells and Coppersmith 1994', 'All', 'Mw_from_A', 500, 'km^2', 'forward'],
    ['Wells and Coppersmith 1994', 'All', 'Mw_from_A', 7.0, null, 'inverse'],
    ['Wells and Coppersmith 1994', 'Strike-Slip', 'Mw_from_AD', 4.5, 'm', 'forward'],
    ['Stirling et al. 2024', 'Crustal (NZ NSHM 2022 - Preferred)', 'Mw_from_A', 500, 'km^2', 'forward'],
    ['Thingbaijam et al. 2017', 'Strike-Slip', 'L_from_Mw', 7.0, null, 'forward'],
    ['Thingbaijam et al. 2017', 'Strike-Slip', 'L_from_Mw', 100, 'km', 'inverse'],
    ['Strasser et al. 2010', 'Subduction Interface', 'A_from_Mw', 8.0, null, 'forward'],
    ['Leonard 2014', 'Interplate Strike-Slip', 'Mw_from_A', 500, 'km^2', 'forward']
];
for (const [paper, style, key, probe, unit, dir] of MC_CASES) {
    const doc = MODEL_FILES.map(f => JSON.parse(readFileSync(join(root, f), 'utf8')))
        .find(d => d[paper]);
    const segs = doc[paper].fault_types[style][key];
    const sc = scatterForFn(segs, probe, unit, dir);
    check(sc !== null, `MC ${paper}/${style}/${key} ${dir}: scatterFor returns a sigma`);
    if (!sc) continue;

    const stat = mcSpread(segs, probe, unit, dir, sc.space, `mc:${paper}:${key}:${dir}`);
    check(stat !== null, `MC ${paper}/${style}/${key} ${dir}: draws succeeded`);
    if (!stat) continue;

    // 4 standard errors on the sample sd: se(sd) ~ sd/sqrt(2n).
    const tol = 4 * sc.sigma / Math.sqrt(2 * stat.n);
    check(Math.abs(stat.sd - sc.sigma) < tol,
        `MC ${paper}/${style}/${key} ${dir}: sample sd ${stat.sd.toFixed(4)} matches sigma ` +
        `${sc.sigma.toFixed(4)} in ${sc.space} space (tol ${tol.toFixed(4)})`);

    const det = solve(segs, probe, unit, dir).result;
    const detInSpace = sc.space === 'log10' ? Math.log10(det) : det;
    check(Math.abs(stat.mean - detInSpace) < 4 * sc.sigma / Math.sqrt(stat.n),
        `MC ${paper}/${style}/${key} ${dir}: sample mean ${stat.mean.toFixed(4)} centred on the ` +
        `deterministic result ${detInSpace.toFixed(4)}`);
}

// With model uncertainty off, a simulation run must reproduce the deterministic
// solve exactly - every relation, both directions. One line, whole class of
// refactor error.
let exactChecked = 0;
for (const relPath of MODEL_FILES) {
    const doc = JSON.parse(readFileSync(join(root, relPath), 'utf8'));
    for (const [paper, body] of Object.entries(doc)) {
        for (const [style, rels] of Object.entries(body.fault_types || {})) {
            for (const [key, segs] of Object.entries(rels)) {
                for (const dir of ['forward', 'inverse']) {
                    const probe = probeInside(segs, dir);
                    if (probe === null) continue;
                    const unit = segs[0].units[dir === 'forward' ? 'x' : 'y'];
                    const det = solve(segs, probe, unit, dir).result;
                    const sim = mcRun(segs, probe, unit, dir, false).result;
                    if (det === null && sim === null) continue;
                    exactChecked++;
                    check(det === sim,
                        `${paper}/${style}/${key} ${dir}: solveOneSimulationRun with uncertainty off ` +
                        `equals solveRelationship (${sim} vs ${det})`);
                }
            }
        }
    }
}
check(exactChecked > 200, `deterministic-equivalence check covered ${exactChecked} pairs`);

// Same seed, same stream: a published Monte Carlo result must be reproducible.
{
    const wcA = JSON.parse(readFileSync(
        join(root, 'scaling_models/wells_coppersmith_1994/wells_coppersmith_1994.json'), 'utf8')
    )['Wells and Coppersmith 1994'].fault_types.All.Mw_from_A;
    const draw = (seed) => {
        const rng = makeRng(seed);
        return Array.from({ length: 25 }, () => mcRun(wcA, 500, 'km^2', 'forward', true, rng).result);
    };
    const a = draw('seed-one'), b = draw('seed-one'), c = draw('seed-two');
    check(JSON.stringify(a) === JSON.stringify(b), 'MC: the same seed reproduces the same stream exactly');
    check(JSON.stringify(a) !== JSON.stringify(c), 'MC: a different seed gives a different stream');
}

// ---- 4f. Segment selection outside the domain ----
//
// range_x is stated in X, so on an inverse solve it has to be mapped into the
// input's space before comparing. Testing a Y-space input against an X-space
// bound sent sub-floor inputs to the saturated high-magnitude branch: Allen &
// Hayes returned Mw -3.97 for a 10 km^2 rupture.
{
    const ah = JSON.parse(readFileSync(
        join(root, 'scaling_models/allen_hayes_2017/allen_hayes_2017.json'), 'utf8')
    )['Allen & Hayes 2017'].fault_types['Subduction Interface (Bilinear)'].A_from_Mw;
    for (const A of [1, 10, 30]) {
        const mw = solve(ah, A, 'km^2', 'inverse').result;
        check(mw !== null && mw > 3 && mw < 7,
            `A&H bilinear A=${A} km^2 -> Mw ${mw?.toFixed(2)} extrapolates the lower branch ` +
            `(was Mw -3.97 pre-fix, from the saturated upper branch)`);
    }
    check(near(solve(ah, 200000, 'km^2', 'inverse').result, 9.91, 0.05),
        'A&H bilinear above the breakpoint still uses the upper branch');
}

// Generic form: monotone in, monotone out. A direction-confused segment pick
// breaks monotonicity, so this catches the class rather than the instance.
let monotoneChecked = 0;
for (const relPath of MODEL_FILES) {
    const doc = JSON.parse(readFileSync(join(root, relPath), 'utf8'));
    for (const [paper, body] of Object.entries(doc)) {
        for (const [style, rels] of Object.entries(body.fault_types || {})) {
            for (const [key, segs] of Object.entries(rels)) {
                for (const dir of ['forward', 'inverse']) {
                    const dom = domainOfFn(segs, dir);
                    if (!dom || dom.degenerate) continue;
                    const unit = segs[0].units[dir === 'forward' ? 'x' : 'y'];
                    const isMag = unit === null;
                    const lo = dom.min !== null ? dom.min : (isMag ? 5 : 0.01);
                    const hi = dom.max !== null ? dom.max : (isMag ? 9 : lo * 1e3);
                    if (!(hi > lo)) continue;

                    // Probe well outside the range in the input's own metric.
                    const probes = (isMag
                        ? [lo - 2, lo - 0.5, lo, (lo + hi) / 2, hi, hi + 0.5, hi + 2]
                        : [lo / 100, lo / 10, lo, Math.sqrt(lo * hi), hi, hi * 10, hi * 100]
                    ).filter(v => v > 0);
                    const out = probes.map(v => solve(segs, v, unit, dir).result);
                    const defined = out.filter(v => v !== null);
                    if (defined.length < 2) continue;

                    monotoneChecked++;
                    check(defined.every(v => Number.isFinite(v)),
                        `${paper}/${style}/${key} ${dir}: finite outside the published range`);
                    let inc = true, dec = true;
                    for (let i = 1; i < out.length; i++) {
                        if (out[i] === null || out[i - 1] === null) continue;
                        if (!(out[i] >= out[i - 1])) inc = false;
                        if (!(out[i] <= out[i - 1])) dec = false;
                    }
                    check(inc || dec,
                        `${paper}/${style}/${key} ${dir}: monotone across and beyond its domain ` +
                        `(${out.map(v => v === null ? 'null' : v.toPrecision(3)).join(' ')})`);
                }
            }
        }
    }
}
check(monotoneChecked > 200, `monotonicity check covered ${monotoneChecked} relation/direction pairs`);

// ---- 4g. The published upper bound is inside the published range ----
let boundsChecked = 0;
for (const relPath of MODEL_FILES) {
    const doc = JSON.parse(readFileSync(join(root, relPath), 'utf8'));
    for (const [paper, body] of Object.entries(doc)) {
        for (const [style, rels] of Object.entries(body.fault_types || {})) {
            for (const [key, segs] of Object.entries(rels)) {
                for (const dir of ['forward', 'inverse']) {
                    const dom = domainOfFn(segs, dir);
                    if (!dom || dom.degenerate) continue;
                    const unit = segs[0].units[dir === 'forward' ? 'x' : 'y'];
                    for (const edge of [dom.min, dom.max]) {
                        if (edge === null || !Number.isFinite(edge) || edge <= 0) continue;
                        boundsChecked++;
                        check(extrapolating(segs, edge, unit, dir) === null,
                            `${paper}/${style}/${key} ${dir}: the published bound ${edge} is in range, ` +
                            `not an extrapolation`);
                    }
                }
            }
        }
    }
}
check(boundsChecked > 100, `bound-inclusivity check covered ${boundsChecked} bounds`);
{
    const wcSRL = JSON.parse(readFileSync(
        join(root, 'scaling_models/wells_coppersmith_1994/wells_coppersmith_1994.json'), 'utf8')
    )['Wells and Coppersmith 1994'].fault_types.All.Mw_from_SRL;
    check(extrapolating(wcSRL, 432, 'km', 'forward') === null,
        'W&C All SRL = 432 km, the exact published bound, is in range (was flagged pre-fix)');
    check(extrapolating(wcSRL, 432.1, 'km', 'forward') !== null,
        'W&C All SRL = 432.1 km is flagged as extrapolation');
}

// ---- 4h. Anti-regression pins on the numbers the audit reported ----
{
    const wcA = JSON.parse(readFileSync(
        join(root, 'scaling_models/wells_coppersmith_1994/wells_coppersmith_1994.json'), 'utf8')
    )['Wells and Coppersmith 1994'].fault_types.All.Mw_from_A;
    const det = solve(wcA, 500, 'km^2', 'forward').result;
    const sc = scatterForFn(wcA, 500, 'km^2', 'forward');
    check(near(det, 6.715, 0.005), `W&C All A=500 km^2 -> Mw ${det.toFixed(3)}`);
    check(sc.space === 'linear' && near(det - sc.sigma, 6.475, 0.005) && near(det + sc.sigma, 6.955, 0.005),
        `W&C All A=500 km^2 band ${(det - sc.sigma).toFixed(2)}-${(det + sc.sigma).toFixed(2)} Mw ` +
        `(was 3.86-11.67 pre-fix, from log-space sigma on a magnitude)`);

    const scInv = scatterForFn(wcA, 7.0, null, 'inverse');
    check(scInv.space === 'log10' && near(scInv.sigma, 0.2449, 0.001),
        `W&C All inverse sigma ${scInv.sigma.toFixed(4)} = 0.24/|0.98| in log10(A)`);
    const stat = mcSpread(wcA, 7.0, null, 'inverse', 'log10', 'pin:wc-inverse');
    check(stat && stat.sd > 0.2,
        `W&C All Mw 7 -> A carries model scatter (sd ${stat?.sd.toFixed(3)} in log10; was exactly 0 pre-fix)`);
}

// The app's M0 <-> Mw conversion must use the same constant the model files
// were built with, or every route through M0 drifts by a fixed 0.037 Mw.
// Leonard's own tables are the fixed point: his corrected M0_from_D intercept
// of 19.36 must map onto his printed Mw_from_D intercept of 6.84.
{
    const toMw = vm.runInContext('m0ToMw', ctx);
    const toM0 = vm.runInContext('mwToM0', ctx);
    check(near(toMw(Math.pow(10, 19.36), 'Nm'), 6.84, 0.005),
        `m0ToMw(10^19.36 Nm) = ${toMw(Math.pow(10, 19.36), 'Nm')?.toFixed(4)}, Leonard's printed ` +
        `Mw_from_D intercept 6.84 (was 6.873 under the dyne.cm 10.7 constant)`);
    check(near(vm.runInContext('HK_CONSTANT_NM', ctx), 6.07, 1e-9),
        'units.js HK_CONSTANT_NM is 6.07, matching the model files and this suite');
    check(near(toMw(toM0(7.5, 'Nm'), 'Nm'), 7.5, 1e-9), 'Mw -> M0 -> Mw round-trips exactly');
    check(near(toMw(1e27, 'dyne.cm'), toMw(1e20, 'Nm'), 1e-9),
        'm0ToMw agrees between dyne.cm and N.m');

    // Mw -> M0 -> A must agree with Mw -> A through the same paper.
    const ipss = faultTypes['Interplate Strike-Slip'];
    const viaM0 = solve(ipss.M0_from_A, toM0(7.0, 'Nm'), 'Nm', 'inverse').result / 1e6;
    const direct = solve(ipss.Mw_from_A, 7.0, null, 'inverse').result;
    check(near(viaM0 / direct, 1.0, 0.01),
        `Leonard IP-SS Mw 7 -> A agrees via M0 (${viaM0.toFixed(0)} km^2) and directly ` +
        `(${direct.toFixed(0)} km^2), ratio ${(viaM0 / direct).toFixed(4)} (was 1.09 pre-fix)`);
}

// ---- 4i. Structural: distinct parameters must not share a validity range ----
//
// Two relations predicting the SAME quantity from DIFFERENT inputs cannot
// share a fully bounded validity range - a length range is not a width range.
//
// Two exclusions keep this free of false positives:
//   - Relations sharing an X legitimately share breakpoints (Leonard's A, W, D
//     and M0 from L all break at 5360 m), so the rule keys on
//     same-Y-different-X only.
//   - An open-ended range carries little information and can coincide honestly:
//     Leonard states "> 0" for many relations, and his SCR dip-slip Mw_from_L
//     and Mw_from_W both start at 2.5 because W = L at the breakpoint. Only a
//     range bounded on BOTH sides is evidence of a copied cell.
for (const relPath of MODEL_FILES) {
    const doc = JSON.parse(readFileSync(join(root, relPath), 'utf8'));
    for (const [paper, body] of Object.entries(doc)) {
        for (const [style, rels] of Object.entries(body.fault_types || {})) {
            const byY = {};
            for (const [key, segs] of Object.entries(rels)) {
                const [yName, xName] = key.split('_from_');
                (byY[yName] = byY[yName] || []).push({ key, xName, segs });
            }
            for (const [yName, group] of Object.entries(byY)) {
                for (let i = 0; i < group.length; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        if (group[i].xName === group[j].xName) continue;
                        const bounded = (segs) => segs.every(s =>
                            Array.isArray(s.range_x) && s.range_x[0] !== null && s.range_x[1] !== null);
                        if (!bounded(group[i].segs) || !bounded(group[j].segs)) continue;
                        const ri = JSON.stringify(group[i].segs.map(s => s.range_x));
                        const rj = JSON.stringify(group[j].segs.map(s => s.range_x));
                        check(ri !== rj,
                            `${paper}/${style}: ${group[i].key} and ${group[j].key} predict ${yName} from ` +
                            `different inputs but share range_x ${ri} - one of them is a copy of the other`);
                    }
                }
            }
        }
    }
}

// ---- 4j. Segment keys are from a known set ----
//
// Unknown keys pass silently, so a typo ("slipMeasure" for "slip_measure")
// would be a no-op. Later phases extend this list as they add fields.
const SEGMENT_KEYS = new Set([
    'source', 'description', 'equation_form', 'coefficients',
    'std_dev_a', 'log10_y_std_dev', 'units', 'range_x', 'range_note'
]);
for (const relPath of MODEL_FILES) {
    const doc = JSON.parse(readFileSync(join(root, relPath), 'utf8'));
    for (const [paper, body] of Object.entries(doc)) {
        for (const [style, rels] of Object.entries(body.fault_types || {})) {
            for (const [key, segs] of Object.entries(rels)) {
                segs.forEach((seg, i) => {
                    for (const k of Object.keys(seg)) {
                        check(SEGMENT_KEYS.has(k),
                            `${paper}/${style}/${key}[${i}]: unknown segment key "${k}" - ` +
                            `add it to SEGMENT_KEYS if intended`);
                    }
                });
                // A segment carrying both sigma fields would have had them
                // applied on top of each other by the old Monte Carlo path.
                segs.forEach((seg, i) => {
                    const both = seg.log10_y_std_dev !== null && seg.log10_y_std_dev !== undefined &&
                                 seg.std_dev_a !== null && seg.std_dev_a !== undefined;
                    check(!both,
                        `${paper}/${style}/${key}[${i}]: declares both log10_y_std_dev and std_dev_a`);
                });
            }
        }
    }
}

// ---- 5. Documented paper quirks (informational, non-failing) ----
for (const ft of Object.keys(faultTypes)) {
    const derived = HK(a0(ft, 'M0_from_W') + 3 * 3.75);
    const delta = a0(ft, 'Mw_from_W') - derived;
    console.log(`QUIRK ${ft}: Mw_from_W printed ${a0(ft, 'Mw_from_W')} vs Table-3-derived ${derived.toFixed(2)} (delta ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}; kept as printed - see REVIEW.md)`);
}
console.log('QUIRK Interplate SS: Table 3 breaks at L=40 km, Table 4 Mw_from_L at 45 km (both as printed).');
console.log('QUIRK SCR SS: Table 3 A/W relations break at L=70 km, D/M0/Mw relations at 60 km (as printed).');

console.log(failures === 0
    ? `\nPASS  all ${checks} checks passed`
    : `\nFAIL  ${failures} of ${checks} checks failed`);
process.exit(failures === 0 ? 0 : 1);
