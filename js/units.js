// Unit conversion utilities
// Based on helpers.py from the original Python code

const UNIT_OPTIONS = {
    'Mw': ['N/A'],
    'M0': ['Nm', 'dyne.cm'],
    'A': ['km^2', 'm^2'],
    'L': ['km', 'm'],
    'W': ['km', 'm'],
    'SRL': ['km', 'm'],
    'AD': ['m'],
    'MD': ['m']
};

const CONVERSIONS_TO_METER = {
    'm': 1.0,
    'km': 1000.0
};

const CONVERSIONS_TO_METERSQ = {
    'm^2': 1.0,
    'km^2': 1e6
};

const CONVERSIONS_TO_NM = {
    'Nm': 1.0,
    'dyne.cm': 1.0e-7
};

const CONVERSIONS_TO_M_PER_YR = {
    'm/yr': 1.0,
    'mm/yr': 0.001,
    'm/Myr': 1.0e-6
};

/**
 * Moment-magnitude conventions, written as Mw = (log10(M0 [N m]) - C) / 1.5.
 *
 *  - C = 9.05: Hanks & Kanamori (1979), M = (2/3)*log10(M0 [dyne cm]) - 10.7.
 *    The same line in N m: (2/3)*(log10(M0) + 7) - 10.7.
 *  - C = 9.1:  Mw = (log10(M0 [N m]) - 9.1) / 1.5, the form Leonard (2014)
 *    states for his Table 4 (Discussion, citing Kanamori and Anderson 1975,
 *    Kanamori 1978, and Purcaru and Berckhemer 1978). Written the other way
 *    it is (2/3)*log10(M0) - 6.0667; the 6.07 used here previously was that
 *    figure rounded to two decimals.
 *
 * The two differ by a constant 1/30 (0.033) of a magnitude unit: a factor of
 * 10^0.05 = 1.12 in M0 at fixed Mw, and about 8% in area where Mw scales with
 * log10(A) at unit slope. Neither is wrong; what matters is using the convention of
 * the paper being chained through. Both are therefore offered wherever M0 and
 * Mw are converted, instead of one being imposed on every model: a route such
 * as Mw -> M0 -> A through Leonard (2014) needs C = 9.1 to agree with his
 * direct Mw -> A relation, while the 10.7 form is the one most magnitude
 * regressions quote.
 */
const MW_CONSTANT_HANKS_KANAMORI = 9.05;
const MW_CONSTANT_LEONARD = 9.1;

/**
 * The conversions offered for M0 <-> Mw, in the order they are listed.
 *
 * `id` is the model ID shown in the dropdowns. It must not contain " - "
 * (space, hyphen, space): the interface splits model IDs there into paper and
 * fault type. The second ID uses a true minus sign for that reason.
 */
const MW_CONVENTIONS = [
    {
        id: 'Hanks & Kanamori (1979) Definition',
        constant: MW_CONSTANT_HANKS_KANAMORI,
        provenance: 'Hanks & Kanamori (1979) moment magnitude definition, ' +
            'Mw = (2/3) log10(M0 [dyne cm]) \u2212 10.7'
    },
    {
        id: 'Mw = (log10 M0 \u2212 9.1) / 1.5 (as stated in Leonard 2014)',
        constant: MW_CONSTANT_LEONARD,
        provenance: 'Moment magnitude as stated in Leonard (2014), ' +
            'Mw = (log10(M0 [N m]) \u2212 9.1) / 1.5'
    }
];

/**
 * Convert a value from one unit to another
 * @param {number} value - The value to convert
 * @param {string} fromUnit - The unit to convert from
 * @param {string} toUnit - The unit to convert to
 * @returns {number} The converted value
 */
function convertUnits(value, fromUnit, toUnit) {
    if (fromUnit === toUnit || fromUnit === null || toUnit === null) {
        return value;
    }
    
    if (value === null || value === undefined) {
        return null;
    }

    // Length conversions
    if (fromUnit in CONVERSIONS_TO_METER && toUnit in CONVERSIONS_TO_METER) {
        const valueInBase = value * CONVERSIONS_TO_METER[fromUnit];
        return valueInBase / CONVERSIONS_TO_METER[toUnit];
    }

    // Area conversions
    if (fromUnit in CONVERSIONS_TO_METERSQ && toUnit in CONVERSIONS_TO_METERSQ) {
        const valueInBase = value * CONVERSIONS_TO_METERSQ[fromUnit];
        return valueInBase / CONVERSIONS_TO_METERSQ[toUnit];
    }
    
    // Moment conversions
    if (fromUnit in CONVERSIONS_TO_NM && toUnit in CONVERSIONS_TO_NM) {
        const valueInBase = value * CONVERSIONS_TO_NM[fromUnit];
        return valueInBase / CONVERSIONS_TO_NM[toUnit];
    }
    
    // Slip Rate conversions
    if (fromUnit in CONVERSIONS_TO_M_PER_YR && toUnit in CONVERSIONS_TO_M_PER_YR) {
        const valueInBase = value * CONVERSIONS_TO_M_PER_YR[fromUnit];
        return valueInBase / CONVERSIONS_TO_M_PER_YR[toUnit];
    }

    throw new Error(`Cannot convert from '${fromUnit}' to '${toUnit}'`);
}

/**
 * Convert seismic moment to moment magnitude
 * @param {number} m0Val - Seismic moment value
 * @param {string} m0Unit - Unit of seismic moment
 * @param {number} [constant] - Convention constant C (see MW_CONVENTIONS);
 *                              Hanks & Kanamori (1979) when omitted
 * @returns {number|null} Moment magnitude
 */
function m0ToMw(m0Val, m0Unit, constant = MW_CONSTANT_HANKS_KANAMORI) {
    if (m0Val === null || m0Val === undefined || isNaN(m0Val)) return null;

    try {
        const m0InNm = convertUnits(m0Val, m0Unit, 'Nm');
        if (m0InNm <= 0) return null;
        return (Math.log10(m0InNm) - constant) / 1.5;
    } catch (e) {
        return null;
    }
}

/**
 * Convert moment magnitude to seismic moment
 * @param {number} mwVal - Moment magnitude
 * @param {string} targetUnit - Target unit for M0
 * @param {number} [constant] - Convention constant C (see MW_CONVENTIONS);
 *                              Hanks & Kanamori (1979) when omitted
 * @returns {number|null} Seismic moment
 */
function mwToM0(mwVal, targetUnit, constant = MW_CONSTANT_HANKS_KANAMORI) {
    if (mwVal === null || mwVal === undefined || isNaN(mwVal)) return null;

    try {
        const m0InNm = Math.pow(10, 1.5 * mwVal + constant);
        return convertUnits(m0InNm, 'Nm', targetUnit);
    } catch (e) {
        return null;
    }
}

/**
 * Get available units for a given parameter
 * @param {string} param - The parameter name
 * @returns {string[]} Array of available units
 */
function getUnitsForParam(param) {
    return UNIT_OPTIONS[param] || ['N/A'];
}

/**
 * Get standard/default unit for a parameter
 * @param {string} param - The parameter name
 * @returns {string} Default unit
 */
function getStandardUnit(param) {
    const standardUnits = {
        'A': 'km^2',
        'L': 'km',
        'W': 'km',
        'SRL': 'km',
        'AD': 'm',
        'MD': 'm',
        'M0': 'Nm',
        'Mw': null
    };
    return standardUnits[param] || null;
}
