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
 * Hanks & Kanamori (1979): Mw = (2/3)*log10(M0) - C.
 *
 * One constant, defined once. The app previously used the classic dyne.cm
 * value of 10.7 while every model file and the verification suite assume
 * 6.07 in N.m - equivalent to 10.7367 - so Mw -> M0 -> A and Mw -> A
 * disagreed by a fixed 0.037 Mw, about 9% in area.
 *
 * 6.07 is adopted because it is the value Leonard (2014) used to build the
 * stored Table 3 and Table 4 coefficients, and this tool's job is to
 * reproduce published relations rather than re-derive them.
 */
const HK_CONSTANT_NM = 6.07;
const HK_CONSTANT_DYNE_CM = HK_CONSTANT_NM + (2 / 3) * 7;  // 10.7367

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
 * Hanks & Kanamori (1979) conversion from M0 to Mw
 * @param {number} m0Val - Seismic moment value
 * @param {string} m0Unit - Unit of seismic moment
 * @returns {number|null} Moment magnitude
 */
function m0ToMw(m0Val, m0Unit) {
    if (m0Val === null || m0Val === undefined || isNaN(m0Val)) return null;
    
    try {
        const m0InDyneCm = convertUnits(m0Val, m0Unit, 'dyne.cm');
        if (m0InDyneCm <= 0) return null;
        return (2/3) * Math.log10(m0InDyneCm) - HK_CONSTANT_DYNE_CM;
    } catch (e) {
        return null;
    }
}

/**
 * Hanks & Kanamori (1979) conversion from Mw to M0
 * @param {number} mwVal - Moment magnitude
 * @param {string} targetUnit - Target unit for M0
 * @returns {number|null} Seismic moment
 */
function mwToM0(mwVal, targetUnit) {
    if (mwVal === null || mwVal === undefined || isNaN(mwVal)) return null;
    
    try {
        const m0InDyneCm = Math.pow(10, (mwVal + HK_CONSTANT_DYNE_CM) * 1.5);
        return convertUnits(m0InDyneCm, 'dyne.cm', targetUnit);
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
