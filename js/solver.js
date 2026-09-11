// Core solver logic
// Based on logic.py (generic_solver.py) from the original Python code

/**
 * Calculate deterministic result for an equation
 * @param {string} form - Equation form
 * @param {number} x - Input value
 * @param {number} a - Coefficient a
 * @param {number} b - Coefficient b
 * @param {string} direction - 'forward' or 'inverse'
 * @returns {number|null} Calculated result
 */
function _calcEquation(form, x, a, b, direction) {
    try {
        if (x === null || x === undefined || isNaN(x)) {
            return null;
        }

        x = parseFloat(x);
        a = parseFloat(a);
        b = parseFloat(b);
        
        if (form === "log10(Y) = a + b * log10(X)") {
            if (direction === 'forward') {
                if (x <= 0) return null;
                const result = Math.pow(10, a + b * Math.log10(x));
                    return result;
            } else { // inverse
                if (x <= 0 || b === 0) return null;
                const result = Math.pow(10, (Math.log10(x) - a) / b);
                return result;
            }
        } else if (form === "Y = a + b * log10(X)") {
            if (direction === 'forward') {
                if (x <= 0) return null;
                const result = a + b * Math.log10(x);
                return result;
            } else { // inverse
                if (b === 0) return null;
                const result = Math.pow(10, (x - a) / b);
                return result;
            }
        } else if (form === "log10(Y) = a + b * X") {
            if (direction === 'forward') {
                const result = Math.pow(10, a + b * x);
                return result;
            } else { // inverse
                if (x <= 0 || b === 0) return null;
                const result = (Math.log10(x) - a) / b;
                return result;
            }
        }
    } catch (e) {
        return null;
    }
    return null;
}

/**
 * Validity range of one segment, expressed in the INPUT variable's space.
 *
 * `range_x` is always stated in terms of X. When solving forward that IS the
 * input, so it is returned unchanged. When solving inversely the input is Y,
 * so the bounds are pushed through the forward equation — otherwise a length
 * range gets reported as though it were a displacement range.
 *
 * @param {Object} segment - A model segment
 * @param {string} direction - 'forward' or 'inverse'
 * @returns {Object} {min, max} in input units; null on either side means unbounded
 */
function getSegmentDomain(segment, direction) {
    const rangeX = segment.range_x || [null, null];
    const minX = rangeX[0];
    const maxX = rangeX[1];

    if (direction === 'forward') {
        return { min: minX, max: maxX };
    }

    const { a, b } = segment.coefficients;
    const yAt = (x) => {
        if (x === null) return null;
        // _calcEquation refuses x <= 0 for the log-X forms, but a lower bound
        // of exactly 0 is a real bound, not an absent one: for
        // log10(Y) = a + b*log10(X) with b > 0, Y tends to 0 as X tends to 0.
        // Without this the domain reads "no lower bound" when it is [0, ...).
        if (x === 0 && segment.equation_form === 'log10(Y) = a + b * log10(X)') {
            return b > 0 ? 0 : null;
        }
        return _calcEquation(segment.equation_form, x, a, b, 'forward');
    };

    const yAtMinX = yAt(minX);
    const yAtMaxX = yAt(maxX);

    // A saturated segment (b = 0) maps every X to one Y, so it has no
    // invertible domain. _calcEquation already refuses to invert it.
    if (b === 0) return { min: null, max: null, degenerate: true };

    // b < 0 flips the mapping, so sort rather than assume ordering.
    if (yAtMinX === null || yAtMaxX === null || yAtMinX < yAtMaxX) {
        return { min: yAtMinX, max: yAtMaxX };
    }
    return { min: yAtMaxX, max: yAtMinX };
}

/**
 * Does a value fall inside one segment's domain?
 *
 * Bounds are half-open (`min <= v < max`) so that a value sitting exactly on
 * an internal breakpoint belongs to the upper branch and is matched once, not
 * twice. The relation's OVERALL upper bound is different: it is a published
 * limit of applicability, and a value exactly on it is inside the range the
 * authors state, so callers pass inclusiveMax for that case.
 *
 * @param {Object} domain - From getSegmentDomain()
 * @param {number} value - Input value, in the input variable's space
 * @param {boolean} [inclusiveMax=false] - Treat the upper bound as inclusive
 * @returns {boolean}
 */
function domainContains(domain, value, inclusiveMax = false) {
    if (!domain || domain.degenerate) return false;
    if (domain.min !== null && value < domain.min) return false;
    if (domain.max !== null) {
        if (inclusiveMax ? value > domain.max : value >= domain.max) return false;
    }
    return true;
}

/**
 * Validity range of a whole relation in the input variable's space: the union
 * across its segments, which are contiguous by construction.
 *
 * @param {Array} modelParams - Array of model segments
 * @param {string} direction - 'forward' or 'inverse'
 * @returns {Object|null} {min, max, unit, degenerate} — null bounds mean the
 *                        publication states no bound on that side
 */
function getInputDomain(modelParams, direction) {
    if (!modelParams || !modelParams.length) return null;

    const unitKey = direction === 'forward' ? 'x' : 'y';
    const unit = modelParams[0].units ? modelParams[0].units[unitKey] : null;

    let min = Infinity;
    let max = -Infinity;
    let sawUnboundedLow = false;
    let sawUnboundedHigh = false;
    let degenerate = true;

    for (const segment of modelParams) {
        const domain = getSegmentDomain(segment, direction);
        if (domain.degenerate) continue;
        degenerate = false;

        if (domain.min === null) sawUnboundedLow = true;
        else min = Math.min(min, domain.min);

        if (domain.max === null) sawUnboundedHigh = true;
        else max = Math.max(max, domain.max);
    }

    if (degenerate) return { min: null, max: null, unit, degenerate: true };

    return {
        min: sawUnboundedLow || min === Infinity ? null : min,
        max: sawUnboundedHigh || max === -Infinity ? null : max,
        unit,
        degenerate: false
    };
}

/**
 * Get the appropriate model segment for a given input value
 * @param {Array} modelParams - Array of model parameter objects
 * @param {number} convertedInput - Input value in model's native units
 * @param {string} direction - 'forward' or 'inverse'
 * @returns {Object|null} The matching segment or null
 */
function getTargetSegment(modelParams, convertedInput, direction) {
    if (convertedInput === null) return null;
    if (!modelParams.length) return null;

    // A saturated segment has no invertible domain, so it can never be matched
    // on input value; it is only reachable via the fallback below.
    for (const segment of modelParams) {
        if (domainContains(getSegmentDomain(segment, direction), convertedInput)) {
            return segment;
        }
    }

    // Second pass, inclusive at the top: catches a value sitting exactly on the
    // relation's published upper bound, which is inside the stated range.
    // Internal breakpoints cannot reach here - the half-open pass above already
    // assigned them to the upper branch.
    for (const segment of modelParams) {
        if (domainContains(getSegmentDomain(segment, direction), convertedInput, true)) {
            return segment;
        }
    }

    // Outside every segment: extrapolate the NEAREST branch, measured in the
    // input variable's own space. range_x is stated in X, so on an inverse
    // solve it has to be mapped through the forward equation before comparing -
    // testing a Y-space input against an X-space bound sent sub-floor inputs to
    // the saturated high-magnitude branch and returned negative magnitudes.
    //
    // "Nearest" rather than "first or last" also covers a value landing in a
    // gap between segments, which published rounding can open up.
    const first = modelParams[0];
    const last = modelParams[modelParams.length - 1];

    let nearest = null;
    let below = true;   // is the input below every invertible segment?
    let above = true;   // is it above every invertible segment?

    for (const segment of modelParams) {
        const domain = getSegmentDomain(segment, direction);
        if (domain.degenerate) continue;

        let distance = null;
        if (domain.min !== null && convertedInput < domain.min) {
            distance = domain.min - convertedInput;
            above = false;
        } else if (domain.max !== null && convertedInput > domain.max) {
            distance = convertedInput - domain.max;
            below = false;
        } else {
            // Unbounded on the relevant side: this segment already covers it.
            return segment;
        }

        if (nearest === null || distance < nearest.distance) {
            nearest = { distance, segment };
        }
    }

    // A saturated branch (b = 0) genuinely cannot be inverted: every X maps to
    // the same Y, so an input beyond it is not an extrapolation to attempt but
    // a question with no unique answer. Where the outermost segment on the side
    // the input lies is saturated, hand it back so the solver refuses rather
    // than inventing a length from a width that stopped growing. Segments are
    // ordered by range_x, so "outermost" is first or last.
    if (above && getSegmentDomain(last, direction).degenerate) return last;
    if (below && getSegmentDomain(first, direction).degenerate) return first;

    return nearest ? nearest.segment : last;
}

/**
 * Solve a scaling relationship
 * @param {Array} modelParams - Array of model segments
 * @param {number} inputVal - Input value
 * @param {string} inputUnit - Input unit
 * @param {string} direction - 'forward' or 'inverse'
 * @returns {Object} {result: number|null, unit: string|null, error: string|null}
 */
function solveRelationship(modelParams, inputVal, inputUnit, direction = 'forward') {
    const xKey = direction === 'forward' ? 'x' : 'y';
    const yKey = direction === 'forward' ? 'y' : 'x';
    
    try {
        const modelInputUnit = modelParams[0].units[xKey];
        let convertedInput;
        
        if (modelInputUnit) {
            convertedInput = convertUnits(inputVal, inputUnit, modelInputUnit);
        } else {
            convertedInput = inputVal;
        }
        
        const targetSegment = getTargetSegment(modelParams, convertedInput, direction);
        
        if (!targetSegment) {
            return { result: null, unit: null, error: "Could not identify a model segment." };
        }
        
        const result = _calcEquation(
            targetSegment.equation_form,
            convertedInput,
            targetSegment.coefficients.a,
            targetSegment.coefficients.b,
            direction
        );

        if (result === null) {
            return { result: null, unit: null, error: "Mathematical error during calculation." };
        }
        
        return { result: result, unit: targetSegment.units[yKey], error: null };
    } catch (e) {
        return { result: null, unit: null, error: e.message };
    }
}

/**
 * Check if input is outside the model's validity range
 * @param {Array} modelParams - Array of model segments
 * @param {number} inputVal - Input value
 * @param {string} inputUnit - Input unit
 * @param {string} direction - 'forward' or 'inverse'
 * @returns {string|null} Warning message or null
 */
function checkIfExtrapolating(modelParams, inputVal, inputUnit, direction = 'forward') {
    const xKey = direction === 'forward' ? 'x' : 'y';
    
    try {
        const modelInputUnit = modelParams[0].units[xKey];
        const convertedInput = modelInputUnit ? 
            convertUnits(inputVal, inputUnit, modelInputUnit) : inputVal;
        
        // Inclusive at the top: a value sitting exactly on the published upper
        // bound is inside the range the authors state, not an extrapolation.
        const isWithinAnyRange = modelParams.some(
            segment => domainContains(getSegmentDomain(segment, direction), convertedInput, true)
        );

        if (!isWithinAnyRange) {
            return "Warning: Input is outside the model's recommended validity range. Result is an extrapolation.";
        }
        
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Parse a std_dev_a field into a standard deviation.
 * Numeric values are used as-is (e.g. Yang et al. 2021). Leonard (2014)
 * stores the one-standard-deviation RANGE of the intercept as a string
 * (e.g. "-4.30 to -3.40" or "6.29-6.69"), so sigma is half the range
 * width, regardless of the order the bounds are written in.
 * @param {number|string|null} value - std_dev_a value from a model segment
 * @returns {number|null} Standard deviation, or null if not usable
 */
function parseStdDevA(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return isNaN(value) ? null : value;
    const range = String(value).match(/(-?\d+(?:\.\d+)?)\s*(?:to|–|-)\s*(-?\d+(?:\.\d+)?)/);
    if (range) {
        return Math.abs(parseFloat(range[2]) - parseFloat(range[1])) / 2;
    }
    const single = parseFloat(value);
    return isNaN(single) ? null : single;
}

/**
 * Which space each side of an equation form lives in.
 *
 * A published sigma always describes scatter in the relation's DEPENDENT
 * variable, in whatever space that variable appears in the equation. For
 * `Y = a + b*log10(X)` the dependent variable is a magnitude and appears
 * untransformed, so its sigma is in magnitude units - NOT in log10(Y).
 * Treating it as log10 scatter raises 10 to the power of a magnitude.
 *
 * Verified against every relation in scaling_models/: all 74 relation and
 * direction pairs that yield a magnitude resolve to 'linear', and all 174
 * that yield a dimension resolve to 'log10'.
 */
const SIGMA_SPACE = {
    'log10(Y) = a + b * log10(X)': { y: 'log10',  x: 'log10' },
    'Y = a + b * log10(X)':        { y: 'linear', x: 'log10' },
    'log10(Y) = a + b * X':        { y: 'log10',  x: 'linear' }
};

/**
 * Resolve the regression scatter that applies to one solve, and the space it
 * is expressed in.
 *
 * The segment is resolved first, so piecewise relations report the sigma of
 * the branch actually used. Solving inversely divides sigma by |b| and moves
 * it into the independent variable's space - the same Jacobian whether the
 * paper published total scatter (`log10_y_std_dev`) or the uncertainty on the
 * intercept (`std_dev_a`). Those two are algebraically the same perturbation:
 * shifting the intercept by sigma shifts the dependent variable by sigma in
 * its own space, and inverting a shifted intercept gives sigma/|b|. One code
 * path therefore covers both.
 *
 * @param {Array} modelParams - Array of model segments
 * @param {number} value - Input value, used to pick the active segment
 * @param {string} unit - Unit of the input value
 * @param {string} direction - 'forward' or 'inverse'
 * @returns {Object|null} {sigma, space: 'linear'|'log10', fromIntercept}, or
 *                        null when the segment publishes no usable sigma
 */
function scatterFor(modelParams, value, unit, direction = 'forward') {
    if (!modelParams || !modelParams.length) return null;

    try {
        const xKey = direction === 'forward' ? 'x' : 'y';
        const modelInputUnit = modelParams[0].units[xKey];
        const converted = modelInputUnit ? convertUnits(value, unit, modelInputUnit) : value;

        const segment = getTargetSegment(modelParams, converted, direction);
        if (!segment) return null;

        const spaces = SIGMA_SPACE[segment.equation_form];
        if (!spaces) return null;

        let sigma = (segment.log10_y_std_dev === null || segment.log10_y_std_dev === undefined)
            ? null : segment.log10_y_std_dev;
        let fromIntercept = false;

        if (sigma === null) {
            // No total scatter published; fall back to the uncertainty on the
            // intercept (Leonard 2014), which is a narrower quantity.
            sigma = parseStdDevA(segment.std_dev_a);
            fromIntercept = sigma !== null;
        }

        if (sigma === null || !isFinite(sigma) || sigma <= 0) return null;

        if (direction === 'forward') {
            return { sigma, space: spaces.y, fromIntercept };
        }

        // A saturated segment carries no information to invert.
        const b = segment.coefficients.b;
        if (b === 0) return null;

        return { sigma: sigma / Math.abs(b), space: spaces.x, fromIntercept };
    } catch (e) {
        return null;
    }
}

/**
 * Perturb a value by its regression scatter, in the correct space.
 *
 * @param {number} value - Deterministic result
 * @param {Object|null} scatter - From scatterFor()
 * @param {Function} [rng] - Uniform [0,1) source, for reproducible runs
 * @returns {number|null} Perturbed value, or null if it cannot be formed
 */
function applyScatter(value, scatter, rng = Math.random) {
    if (value === null || value === undefined || !isFinite(value)) return null;
    if (!scatter) return value;

    if (scatter.space === 'linear') {
        return randomNormal(value, scatter.sigma, rng);
    }

    // log10 space is only meaningful for a positive quantity.
    if (value <= 0) return null;
    return Math.pow(10, randomNormal(Math.log10(value), scatter.sigma, rng));
}

/**
 * Build a seeded pseudo-random generator, so a published Monte Carlo result
 * can be reproduced exactly. mulberry32: small, fast and adequate here - this
 * is uncertainty propagation, not cryptography.
 *
 * @param {number|string} seed - Any seed; strings are hashed
 * @returns {Function} Uniform [0,1) generator
 */
function makeRng(seed) {
    let h = 1779033703 ^ String(seed).length;
    for (let i = 0; i < String(seed).length; i++) {
        h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Solve one simulation run with optional uncertainty.
 *
 * Scatter is applied to the deterministic result in whichever space the
 * relation publishes it (see scatterFor), in BOTH directions. Previously this
 * added log10 scatter to magnitudes - which are already logarithmic - and
 * skipped model uncertainty entirely on inverse solves.
 *
 * @param {Array} modelParams - Array of model segments
 * @param {number} inputVal - Input value
 * @param {string} inputUnit - Input unit
 * @param {string} direction - 'forward' or 'inverse'
 * @param {boolean} includeModelUncertainty - Whether to include model uncertainty
 * @param {Function} [rng] - Uniform [0,1) source, for reproducible runs
 * @returns {Object} {result: number|null, unit: string|null}
 */
function solveOneSimulationRun(modelParams, inputVal, inputUnit, direction = 'forward',
                               includeModelUncertainty = true, rng = Math.random) {
    const xKey = direction === 'forward' ? 'x' : 'y';
    const yKey = direction === 'forward' ? 'y' : 'x';

    try {
        const modelInputUnit = modelParams[0].units[xKey];
        const convertedInput = modelInputUnit ?
            convertUnits(inputVal, inputUnit, modelInputUnit) : inputVal;

        const targetSegment = getTargetSegment(modelParams, convertedInput, direction);

        if (!targetSegment) {
            return { result: null, unit: null };
        }

        const result = _calcEquation(
            targetSegment.equation_form,
            convertedInput,
            targetSegment.coefficients.a,
            targetSegment.coefficients.b,
            direction
        );

        if (result === null) return { result: null, unit: null };

        if (!includeModelUncertainty) {
            return { result: result, unit: targetSegment.units[yKey] };
        }

        const scatter = scatterFor(modelParams, inputVal, inputUnit, direction);
        return { result: applyScatter(result, scatter, rng), unit: targetSegment.units[yKey] };
    } catch (e) {
        return { result: null, unit: null };
    }
}

/**
 * Calculate curve data for plotting
 * @param {Array} modelParams - Array of model segments
 * @param {Array} xValues - Array of x values
 * @param {string} inputUnit - Input unit
 * @param {string} direction - 'forward' or 'inverse'
 * @returns {Object} {yValues: Array, outputUnit: string}
 */
function calculateCurve(modelParams, xValues, inputUnit, direction = 'forward') {
    const yValues = [];
    let outputUnit = "";
    
    for (const x of xValues) {
        const {result, unit} = solveRelationship(modelParams, x, inputUnit, direction);
        yValues.push(result);
        
        if (result !== null && !outputUnit && unit) {
            outputUnit = unit;
        }
    }
    
    return { yValues, outputUnit };
}

/**
 * Generate random number from normal distribution
 * @param {number} mean - Mean of distribution
 * @param {number} stdDev - Standard deviation
 * @param {Function} [rng] - Uniform [0,1) source; pass a makeRng() closure for
 *                           a reproducible run. Defaults to Math.random.
 * @returns {number} Random value
 */
function randomNormal(mean, stdDev, rng = Math.random) {
    // Box-Muller transform. u1 must be non-zero, or log(0) gives -Infinity.
    let u1 = rng();
    while (u1 === 0) u1 = rng();
    const u2 = rng();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
}