// Model loading and management

let allModels = {};
let canonicalParams = new Set();

const PARAMETER_ALIASES = {
    'L': 'L',
    'W': 'W',
    'A': 'A',
    'D': 'AD',
    'AD': 'AD',
    'MD': 'MD',
    'M0': 'M0',
    'Mw': 'Mw',
    'SRL': 'SRL',
    'L_SR': 'SRL',
    // No grouping - keep SRL separate from L
};

/**
 * Load all scaling models from JSON file
 */
async function loadAllModels() {
    try {
        allModels = {};
        
        // List of all model files to load
        const modelFiles = [
            'scaling_models/leonard_2014/leonard_2014.json',
            'scaling_models/wells_coppersmith_1994/wells_coppersmith_1994.json',
            'scaling_models/somerville_2014/somerville_2014.json',
            'scaling_models/yang_etal_2021/yang_etal_2021.json',
            'scaling_models/stirling_etal_2024/stirling_etal_2024.json',
            'scaling_models/thingbaijam_etal_2017/thingbaijam_etal_2017.json',
            'scaling_models/strasser_etal_2010/strasser_etal_2010.json',
            'scaling_models/allen_hayes_2017/allen_hayes_2017.json'
        ];
        
        // Load all models
        for (const file of modelFiles) {
            try {
                const response = await fetch(file);
                const data = await response.json();
                Object.assign(allModels, data);
            } catch (error) {
                console.warn(`Could not load ${file}:`, error);
            }
        }
        
        // Extract all canonical parameters
        for (const paperName in allModels) {
            const paper = allModels[paperName];
            if (!paper.fault_types) continue;
            
            for (const faultType in paper.fault_types) {
                const fault = paper.fault_types[faultType];
                for (const key in fault) {
                    const [y, x] = key.split('_from_');
                    canonicalParams.add(PARAMETER_ALIASES[y] || y);
                    canonicalParams.add(PARAMETER_ALIASES[x] || x);
                }
            }
        }
        
        console.log('Loaded models:', Object.keys(allModels));
        console.log('Available parameters:', Array.from(canonicalParams));
        
        return true;
    } catch (error) {
        console.error('Error loading models:', error);
        return false;
    }
}

/**
 * Find all available models grouped by paper name for optgroup rendering.
 * Returns the same model info as findAvailableModels but nested by paper.
 * @param {string} inputVar - Input parameter
 * @param {string} outputVar - Output parameter
 * @returns {Object} { paperName: { modelId: {paper, fault, key, direction}, ... }, ... }
 */
function findAvailableModelsGrouped(inputVar, outputVar) {
    const grouped = {};

    // Handle Hanks & Kanamori virtual model
    if ((inputVar === 'M0' && outputVar === 'Mw') ||
        (inputVar === 'Mw' && outputVar === 'M0')) {
        grouped['Conversions'] = {
            'Hanks & Kanamori (1979) Definition': {
                paper: 'virtual', fault: 'virtual',
                key: 'virtual', direction: 'virtual'
            }
        };
    }

    for (const paperName in allModels) {
        const paper = allModels[paperName];
        for (const faultName in paper.fault_types) {
            const fault = paper.fault_types[faultName];
            for (const relationshipKey in fault) {
                const [y, x] = relationshipKey.split('_from_');
                const canonicalY = PARAMETER_ALIASES[y] || y;
                const canonicalX = PARAMETER_ALIASES[x] || x;

                let modelId = `${paperName} - ${faultName}`;
                let direction = null;

                if (canonicalX === inputVar && canonicalY === outputVar) {
                    if (x === 'SRL' || x === 'L_SR') modelId += ` (from ${x})`;
                    direction = 'forward';
                } else if (canonicalY === inputVar && canonicalX === outputVar) {
                    if (y === 'SRL' || y === 'L_SR') modelId += ` (from ${y})`;
                    direction = 'inverse';
                }

                if (direction !== null) {
                    if (!grouped[paperName]) grouped[paperName] = {};
                    grouped[paperName][modelId] = {
                        paper: paperName, fault: faultName,
                        key: relationshipKey, direction
                    };
                }
            }
        }
    }
    return grouped;
}

/**
 * Find all available models for a given input-output parameter pair
 * @param {string} inputVar - Input parameter
 * @param {string} outputVar - Output parameter
 * @returns {Object} Dictionary of available models
 */
function findAvailableModels(inputVar, outputVar) {
    const models = {};
    
    // Handle Hanks & Kanamori (1979) for M0-Mw conversions
    if ((inputVar === 'M0' && outputVar === 'Mw') || 
        (inputVar === 'Mw' && outputVar === 'M0')) {
        models['Hanks & Kanamori (1979) Definition'] = {
            paper: 'virtual',
            fault: 'virtual',
            key: 'virtual',
            direction: 'virtual'
        };
    }
    
    // Search through all loaded models
    for (const paperName in allModels) {
        const paper = allModels[paperName];
        for (const faultName in paper.fault_types) {
            const fault = paper.fault_types[faultName];
            
            for (const relationshipKey in fault) {
                const [y, x] = relationshipKey.split('_from_');
                const canonicalY = PARAMETER_ALIASES[y] || y;
                const canonicalX = PARAMETER_ALIASES[x] || x;
                
                let modelId = `${paperName} - ${faultName}`;
                
                // Forward direction: Input matches X, Output matches Y
                if (canonicalX === inputVar && canonicalY === outputVar) {
                    if (x === 'SRL' || x === 'L_SR') {
                        modelId += ` (from ${x})`;
                    }
                    models[modelId] = {
                        paper: paperName,
                        fault: faultName,
                        key: relationshipKey,
                        direction: 'forward'
                    };
                }
                
                // Inverse direction: Input matches Y, Output matches X
                else if (canonicalY === inputVar && canonicalX === outputVar) {
                    if (y === 'SRL' || y === 'L_SR') {
                        modelId += ` (from ${y})`;
                    }
                    models[modelId] = {
                        paper: paperName,
                        fault: faultName,
                        key: relationshipKey,
                        direction: 'inverse'
                    };
                }
            }
        }
    }
    
    return models;
}

/**
 * Get the relationship parameters for a specific model
 * @param {string} paperName - Name of the paper
 * @param {string} faultType - Type of fault
 * @param {string} relationshipKey - Key of the relationship
 * @returns {Array|null} Array of relationship parameters or null
 */
function getRelationshipParams(paperName, faultType, relationshipKey) {
    try {
        return allModels[paperName].fault_types[faultType][relationshipKey];
    } catch (e) {
        return null;
    }
}

/**
 * Get all unique parameters available in loaded models
 * @returns {Array} Sorted array of parameter names
 */
function getAllParameters() {
    return Array.from(canonicalParams).sort();
}

/**
 * Get a user-friendly description of a model
 * @param {string} paperName - Name of the paper
 * @returns {string} Description
 */
function getModelDescription(paperName) {
    try {
        return allModels[paperName].description || paperName;
    } catch (e) {
        return paperName;
    }
}

/**
 * Get the bibliographic citation for a model.
 * @param {string} paperName - Name of the paper
 * @returns {string|null} Citation string, or null if the file carries none
 */
function getModelCitation(paperName) {
    try {
        return allModels[paperName].citation || null;
    } catch (e) {
        return null;
    }
}

/**
 * Render the References section from the loaded model files, linking any
 * DOI found in the citation string. Sorted by paper name.
 */
function renderReferences() {
    const list = document.getElementById('referenceList');
    if (!list) return;

    const items = Object.keys(allModels).sort().map(paperName => {
        const citation = getModelCitation(paperName);
        const text = citation || `${paperName} (citation pending).`;
        const linked = escapeHtml(text).replace(
            /(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,}\/[^\s,;)]+)/i,
            (_m, doi) => `<a href="https://doi.org/${doi}" rel="noopener">doi:${doi}</a>`
        );
        const description = getModelDescription(paperName);
        const note = description && description !== paperName
            ? `<br><span class="reference-note">${escapeHtml(description)}</span>`
            : '';
        return `<li>${linked}${note}</li>`;
    });

    list.innerHTML = items.join('');

    const count = document.getElementById('modelCount');
    if (count) {
        count.textContent = `${Object.keys(allModels).length} scaling models · `;
    }
}

/**
 * Escape a string for safe interpolation into HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Get all available fault types for a given paper
 * @param {string} paperName - Name of the paper
 * @returns {Array} Array of fault type names
 */
function getFaultTypes(paperName) {
    try {
        return Object.keys(allModels[paperName].fault_types);
    } catch (e) {
        return [];
    }
}