// Main application logic

let currentBatchData = null;
let includeModelUncertainty = true;
let selectedModelsWeights = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Initializing EQ-Scalculator...');
    
    const loaded = await loadAllModels();
    
    if (!loaded) {
        const errorMsg = `
            <div style="padding: 40px; text-align: center;">
                <div class="error">
                    <h2>Error loading models</h2>
                    <p>Could not load scaling model files. Please check:</p>
                    <ul style="text-align: left; margin: 20px auto; max-width: 500px;">
                        <li>JSON files are in correct locations</li>
                        <li>Browser console for specific errors (F12)</li>
                        <li>Files are valid JSON format</li>
                    </ul>
                    <p>Try refreshing the page.</p>
                </div>
            </div>
        `;
        document.querySelector('.container').innerHTML = errorMsg;
        return;
    }
    
    if (Object.keys(allModels).length === 0) {
        const warningMsg = `
            <div style="padding: 40px; text-align: center;">
                <div class="warning">
                    <h2>No models loaded</h2>
                    <p>No scaling models were found. Please ensure JSON files exist in the scaling_models directory.</p>
                </div>
            </div>
        `;
        document.querySelector('.container').innerHTML = warningMsg;
        return;
    }
    
    console.log(`Successfully loaded ${Object.keys(allModels).length} model(s)`);
    initializeUI();
    renderReferences();
});

function initializeUI() {
    const params = getAllParameters();
    
    console.log('Available parameters:', params);
    
    if (params.length === 0) {
        showError('detResults', 'No parameters found in loaded models. Check JSON files.');
        return;
    }
    
    // Populate all parameter dropdowns
    populateSelect('inputParam', params);
    populateSelect('outputParam', params);
    populateSelect('mcInputParam', params);
    populateSelect('mcOutputParam', params);
    populateSelect('plotXParam', params);
    populateSelect('plotYParam', params);
    
    // Set default values - ensure they exist in params
    const defaultInput = params.includes('Mw') ? 'Mw' : params[0];
    const defaultOutput = params.includes('A') ? 'A' : (params[1] || params[0]);
    
    document.getElementById('inputParam').value = defaultInput;
    document.getElementById('outputParam').value = defaultOutput;
    document.getElementById('mcInputParam').value = defaultInput;
    document.getElementById('mcOutputParam').value = defaultOutput;
    document.getElementById('plotXParam').value = defaultInput;
    document.getElementById('plotYParam').value = defaultOutput;
    
    // Populate comparison tab dropdowns
    populateSelect('cmpInputParam', params);
    populateSelect('cmpOutputParam', params);
    document.getElementById('cmpInputParam').value = defaultInput;
    document.getElementById('cmpOutputParam').value = defaultOutput;

    // Populate chain calculator start dropdown
    populateSelect('chainStartParam', params);
    document.getElementById('chainStartParam').value = defaultInput;

    // Initialize configurations
    updateDeterministicConfig();
    updateMonteCarloConfig();
    updateComparisonConfig();
    updateChainStartUnit();

    console.log('UI initialized successfully');
}

function populateSelect(elementId, options, selectedValue = null) {
    const select = document.getElementById(elementId);
    select.innerHTML = '';

    options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        select.appendChild(opt);
    });

    if (selectedValue) {
        select.value = selectedValue;
    }
}

/**
 * Populate a unit <select>. Option values stay as the raw unit strings the
 * solver expects; only the visible label is prettified ("km^2" -> "km²").
 * @param {string} elementId
 * @param {string[]} units
 * @param {string} [selectedValue]
 */
function populateUnitSelect(elementId, units, selectedValue = null) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = '';

    units.forEach(unit => {
        const opt = document.createElement('option');
        opt.value = unit;
        opt.textContent = formatUnit(unit) || unit;
        select.appendChild(opt);
    });

    if (selectedValue) select.value = selectedValue;
}

/**
 * Populate a <select> with <optgroup> elements grouped by paper name.
 * Each option's value is the full modelId string; the visible text is the fault type only.
 * @param {string} elementId
 * @param {Object} groupedModels - { groupLabel: { modelId: modelInfo, ... }, ... }
 */
function populateSelectGrouped(elementId, groupedModels) {
    const select = document.getElementById(elementId);
    select.innerHTML = '';

    let totalOptions = 0;
    for (const groupLabel in groupedModels) {
        const group = groupedModels[groupLabel];
        const modelIds = Object.keys(group);
        if (modelIds.length === 0) continue;

        const optgroup = document.createElement('optgroup');
        optgroup.label = groupLabel;

        for (const modelId of modelIds) {
            const opt = document.createElement('option');
            opt.value = modelId;
            // Show only the fault type portion as the visible text
            const dashIdx = modelId.indexOf(' - ');
            opt.textContent = dashIdx !== -1 ? modelId.substring(dashIdx + 3) : modelId;
            optgroup.appendChild(opt);
            totalOptions++;
        }
        select.appendChild(optgroup);
    }

    if (totalOptions === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No models available';
        select.appendChild(opt);
    }
}

// Tab switching
function switchTab(index) {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach((tab, i) => {
        tab.classList.toggle('active', i === index);
    });
    
    contents.forEach((content, i) => {
        content.classList.toggle('active', i === index);
    });
    
    if (index === 2) {
        setTimeout(() => updatePlot(), 100);
    }
}

// Toggle calculation mode
function toggleCalcMode() {
    const mode = document.querySelector('input[name="calcMode"]:checked').value;
    document.getElementById('singleInputSection').classList.toggle('hidden', mode === 'batch');
    document.getElementById('batchInputSection').classList.toggle('hidden', mode === 'single');
}

// Update deterministic calculation configuration
function updateDeterministicConfig() {
    const inputParam = document.getElementById('inputParam').value;
    const outputParam = document.getElementById('outputParam').value;

    // Use grouped optgroup dropdown for model selection
    const groupedModels = findAvailableModelsGrouped(inputParam, outputParam);
    populateSelectGrouped('selectedModel', groupedModels);

    // Update units
    const inputUnits = getUnitsForParam(inputParam);
    const outputUnits = getUnitsForParam(outputParam);

    populateUnitSelect('inputUnit', inputUnits, inputUnits[0]);
    populateUnitSelect('outputUnit', outputUnits, outputUnits[0]);
}

// Update Monte Carlo configuration
function updateMonteCarloConfig() {
    const inputParam = document.getElementById('mcInputParam').value;
    const outputParam = document.getElementById('mcOutputParam').value;
    
    // Update units
    const inputUnits = getUnitsForParam(inputParam);
    const outputUnits = getUnitsForParam(outputParam);
    
    populateUnitSelect('mcInputUnit', inputUnits, inputUnits[0]);
    populateUnitSelect('mcOutputUnit', outputUnits, outputUnits[0]);
    
    // Update model selection
    updateMCModelList();
}

function updateMCModelList() {
    const inputParam = document.getElementById('mcInputParam').value;
    const outputParam = document.getElementById('mcOutputParam').value;
    const groupedModels = findAvailableModelsGrouped(inputParam, outputParam);

    const container = document.getElementById('mcModelList');
    container.innerHTML = '';
    selectedModelsWeights = {};

    // Flatten to count total models for default weight calculation
    const allModelIds = Object.values(groupedModels).flatMap(g => Object.keys(g));
    // Equal weights, to two decimals. They need not total exactly 100: weights
    // are relative and are normalised when the simulation runs. The earlier
    // floor(100 / n) left the 29 area-to-magnitude models at 3% each, a total
    // of 87%, and the Run button stayed disabled until the weights were edited
    // by hand; 24 of the 40 parameter pairs were affected.
    const defaultWeight = allModelIds.length > 0
        ? Math.round(10000 / allModelIds.length) / 100 : 0;

    let index = 0;
    for (const groupLabel in groupedModels) {
        const group = groupedModels[groupLabel];
        const modelIds = Object.keys(group);
        if (modelIds.length === 0) continue;

        // Paper group header
        const header = document.createElement('div');
        header.className = 'mc-model-group-header';
        header.textContent = groupLabel;
        container.appendChild(header);

        for (const modelId of modelIds) {
            const item = document.createElement('div');
            item.className = 'model-weight-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `model_${index}`;
            checkbox.checked = true;
            checkbox.onchange = updateTotalWeight;

            const label = document.createElement('label');
            label.htmlFor = `model_${index}`;
            // Show only fault type portion
            const dashIdx = modelId.indexOf(' - ');
            label.textContent = dashIdx !== -1 ? modelId.substring(dashIdx + 3) : modelId;

            const weightInput = document.createElement('input');
            weightInput.type = 'number';
            weightInput.min = 0;
            weightInput.max = 100;
            weightInput.step = 'any';
            weightInput.value = defaultWeight;
            weightInput.dataset.modelId = modelId;
            weightInput.oninput = updateTotalWeight;

            const weightLabel = document.createElement('span');
            weightLabel.textContent = '%';
            weightLabel.style.marginLeft = '5px';

            item.appendChild(checkbox);
            item.appendChild(label);
            item.appendChild(weightInput);
            item.appendChild(weightLabel);
            container.appendChild(item);

            selectedModelsWeights[modelId] = defaultWeight;
            index++;
        }
    }

    updateTotalWeight();
}

function updateTotalWeight() {
    let total = 0;
    const inputs = document.querySelectorAll('#mcModelList input[type="number"]');
    
    selectedModelsWeights = {};
    
    let hasNegative = false;
    inputs.forEach(input => {
        const checkbox = input.parentElement.querySelector('input[type="checkbox"]');
        if (checkbox.checked) {
            const weight = parseFloat(input.value) || 0;
            if (weight < 0) hasNegative = true;
            total += weight;
            selectedModelsWeights[input.dataset.modelId] = weight;
        }
    });
    
    // Weights are relative: runMonteCarlo divides each by their sum. Equal
    // defaults can miss 100 by rounding (three models at 33.33%), so anything
    // within half a percent is shown as 100%.
    const sumsTo100 = Math.abs(total - 100) < 0.5;
    const totalElem = document.getElementById('totalWeight');
    totalElem.textContent = sumsTo100
        ? '100%'
        : `${Math.round(total * 100) / 100}% (normalised to 100% when run)`;
    totalElem.style.color = sumsTo100 ? '' : 'var(--warn)';
    
    const runBtn = document.getElementById('mcRunBtn');
    runBtn.disabled = hasNegative || !(total > 0) || Object.keys(selectedModelsWeights).length === 0;
}

function toggleModelUncertainty(element) {
    element.classList.toggle('active');
    includeModelUncertainty = element.classList.contains('active');
}

// Deterministic calculation
async function calculateDeterministic() {
    const inputParam = document.getElementById('inputParam').value;
    const outputParam = document.getElementById('outputParam').value;
    const selectedModelId = document.getElementById('selectedModel').value;
    const mode = document.querySelector('input[name="calcMode"]:checked').value;
    
    console.log('Calculate clicked:', { inputParam, outputParam, selectedModelId, mode });
    
    if (!selectedModelId) {
        showError('detResults', 'Please select a model.');
        return;
    }
    
    // Show loading state
    const resultsDiv = document.getElementById('detResults');
    resultsDiv.innerHTML = '<div class="spinner"></div>';
    
    // Use setTimeout to prevent blocking
    setTimeout(() => {
        try {
            if (mode === 'single') {
                calculateSingle();
            } else {
                calculateBatch();
            }
        } catch (error) {
            console.error('Calculation error:', error);
            showError('detResults', `Calculation failed: ${error.message}`);
        }
    }, 100);
}

function calculateSingle() {
    console.log('Starting single calculation...');
    
    const inputParam = document.getElementById('inputParam').value;
    const outputParam = document.getElementById('outputParam').value;
    const inputValue = parseFloat(document.getElementById('inputValue').value);
    const inputUnit = document.getElementById('inputUnit').value;
    const outputUnit = document.getElementById('outputUnit').value;
    const selectedModelId = document.getElementById('selectedModel').value;
    
    console.log('Inputs:', { inputParam, outputParam, inputValue, inputUnit, outputUnit, selectedModelId });
    
    // Validation
    if (isNaN(inputValue)) {
        showError('detResults', 'Please enter a valid numeric input value.');
        return;
    }
    
    if (!selectedModelId) {
        showError('detResults', 'Please select a model.');
        return;
    }
    
    const models = findAvailableModels(inputParam, outputParam);
    console.log('Available models:', models);
    
    const modelInfo = models[selectedModelId];
    console.log('Selected model info:', modelInfo);
    
    if (!modelInfo) {
        showError('detResults', 'Selected model not found. Please choose another model.');
        return;
    }
    
    let result, resultUnit, warning = null;
    
    try {
        // M0 <-> Mw by definition, in the convention the selected entry stands for
        if (modelInfo.paper === 'virtual') {
            console.log('Using moment magnitude definition:', selectedModelId);
            if (inputParam === 'M0') {
                result = m0ToMw(inputValue, inputUnit, modelInfo.mwConstant);
                resultUnit = null;
            } else {
                result = mwToM0(inputValue, inputUnit === 'N/A' ? 'Nm' : inputUnit, modelInfo.mwConstant);
                resultUnit = 'Nm';
            }
        } else {
            console.log('Loading relationship params...');
            const params = getRelationshipParams(modelInfo.paper, modelInfo.fault, modelInfo.key);
            console.log('Params:', params);
            
            if (!params) {
                showError('detResults', 'Could not load model parameters. Please try another model.');
                return;
            }
            
            console.log('Solving relationship...');
            const solved = solveRelationship(params, inputValue, inputUnit, modelInfo.direction);
            console.log('Solved:', solved);
            
            if (solved.error) {
                showError('detResults', 'Calculation error: ' + solved.error);
                return;
            }
            
            result = solved.result;
            resultUnit = solved.unit;
            
            if (result !== null) {
                warning = checkIfExtrapolating(params, inputValue, inputUnit, modelInfo.direction);
            }
        }
        
        console.log('Final result:', { result, resultUnit, warning });
        displayResult(result, resultUnit, outputParam, outputUnit, warning, modelInfo, inputValue, inputUnit);

    } catch (error) {
        console.error('Error in calculateSingle:', error);
        showError('detResults', `Error: ${error.message}`);
    }
}

/**
 * Render a model's validity domain as human-readable text, in the unit the
 * user is actually entering.
 *
 * A published range is the authors' claimed applicability, so an open bound is
 * stated as such rather than shown as a dash or silently squared off.
 *
 * @param {Object|null} domain - From getInputDomain(): {min, max, unit, degenerate}
 * @param {string} param - Input parameter symbol, e.g. 'AD'
 * @param {string} displayUnit - Unit the user is entering values in
 * @returns {string} Text for the validity-range cell
 */
function describeDomain(domain, param, displayUnit) {
    if (!domain) return 'Not specified';
    if (domain.degenerate) return 'Not invertible (saturated)';

    // Domain arrives in model-native units; show it in the user's unit.
    const toDisplay = (v) => {
        if (v === null) return null;
        if (!domain.unit || !displayUnit || displayUnit === 'N/A') return v;
        try {
            return convertUnits(v, domain.unit, displayUnit);
        } catch (e) {
            return v;
        }
    };

    const unitLabel = formatUnit(displayUnit && displayUnit !== 'N/A' ? displayUnit : domain.unit);
    const suffix = unitLabel ? ` ${unitLabel}` : '';
    const lo = toDisplay(domain.min);
    const hi = toDisplay(domain.max);

    // Bounds are read at a glance, so 3 significant figures rather than 4.
    const q = (v) => formatQuantity(v, param, 3);

    if (lo === null && hi === null) return 'No bounds published';
    if (hi === null) return `${q(lo)}${suffix} and above (no upper bound published)`;
    if (lo === null) return `up to ${q(hi)}${suffix} (no lower bound published)`;
    return `${q(lo)} – ${q(hi)}${suffix}`;
}

/**
 * Describe where a result came from: paper, fault style, and the table or
 * figure the active segment was transcribed from.
 * @param {Object} modelInfo - {paper, fault, key, direction}
 * @param {number} inputValue - Input value, to identify the active segment
 * @param {string} inputUnit - Unit of the input value
 * @returns {string} HTML for the provenance line, or '' if unavailable
 */
function buildProvenance(modelInfo, inputValue, inputUnit) {
    if (!modelInfo || modelInfo.paper === 'virtual') {
        const text = (modelInfo && modelInfo.provenance) || 'Moment magnitude definition';
        return `<div class="provenance">${escapeHtml(text)}</div>`;
    }

    const parts = [escapeHtml(modelInfo.paper), escapeHtml(modelInfo.fault)];

    try {
        const params = getRelationshipParams(modelInfo.paper, modelInfo.fault, modelInfo.key);
        if (params && params.length) {
            const unitKey = modelInfo.direction === 'forward' ? 'x' : 'y';
            const modelUnit = params[0].units[unitKey];
            const converted = modelUnit ? convertUnits(inputValue, inputUnit, modelUnit) : inputValue;
            const segment = getTargetSegment(params, converted, modelInfo.direction);
            if (segment && segment.source) parts.push(escapeHtml(segment.source));
            if (params.length > 1 && segment) {
                parts.push(`segment ${params.indexOf(segment) + 1} of ${params.length}`);
            }
        }
    } catch (e) {
        // Provenance is supplementary; never let it break the result display.
    }

    if (modelInfo.direction === 'inverse') parts.push('solved inversely');

    return `<div class="provenance">${parts.join('<span class="provenance-sep">·</span>')}</div>`;
}

function displayResult(result, resultUnit, outputParam, outputUnit, warning, modelInfo, inputValue, inputUnit) {
    const resultsDiv = document.getElementById('detResults');
    
    if (result === null) {
        showError('detResults', 'Calculation failed. Please check your inputs.');
        return;
    }
    
    let finalResult = result;
    let finalUnit = resultUnit;
    
    // Convert to target output unit if needed
    if (outputUnit !== 'N/A' && resultUnit) {
        try {
            finalResult = convertUnits(result, resultUnit, outputUnit);
            finalUnit = outputUnit;
        } catch (e) {
            // Keep original units if conversion fails
        }
    }
    
    // Convert M0 to Mw if output is magnitude
    if (outputParam === 'Mw' && resultUnit) {
        finalResult = m0ToMw(result, resultUnit);
        finalUnit = 'Mw';
    }
    
    const unitSuffix = formatUnit(finalUnit)
        ? ` <span class="metric-unit">${formatUnit(finalUnit)}</span>` : '';

    let html = `
        <div class="result-box">
            <h3>Result</h3>
            <div class="metric">
                <div class="metric-label">${outputParam}</div>
                <div class="metric-value">${formatQuantity(finalResult, outputParam)}${unitSuffix}</div>
            </div>
            ${buildProvenance(modelInfo, inputValue, inputUnit)}
    `;

    if (warning) {
        html += `<div class="warning">${warning}</div>`;
    }

    html += '</div>';
    resultsDiv.innerHTML = html;
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            currentBatchData = results.data;
            displayBatchPreview(results.meta.fields);
        },
        error: function(error) {
            showError('detResults', 'Error reading file: ' + error.message);
        }
    });
}

function displayBatchPreview(columns) {
    const preview = document.getElementById('batchPreview');
    const columnSelection = document.getElementById('columnSelection');
    
    preview.classList.remove('hidden');
    
    columnSelection.innerHTML = `
        <div class="form-group">
            <label for="batchInputColumn">Select Input Column</label>
            <select id="batchInputColumn">
                ${columns.map(col => `<option value="${col}">${col}</option>`).join('')}
            </select>
        </div>
    `;
}

function calculateBatch() {
    if (!currentBatchData) {
        showError('detResults', 'Please upload a file first.');
        return;
    }
    
    const inputColumn = document.getElementById('batchInputColumn')?.value;
    if (!inputColumn) {
        showError('detResults', 'Please select an input column.');
        return;
    }
    
    const inputParam = document.getElementById('inputParam').value;
    const outputParam = document.getElementById('outputParam').value;
    const inputUnit = document.getElementById('inputUnit').value;
    const outputUnit = document.getElementById('outputUnit').value;
    const selectedModelId = document.getElementById('selectedModel').value;
    
    const models = findAvailableModels(inputParam, outputParam);
    const modelInfo = models[selectedModelId];
    if (!modelInfo) {
        showError('detResults', 'Selected model not found. Please choose another model.');
        return;
    }
    
    const outputColumnName = `${outputParam}_${outputUnit}`;
    
    const results = currentBatchData.map(row => {
        const inputValue = parseFloat(row[inputColumn]);
        if (isNaN(inputValue)) {
            return { ...row, [outputColumnName]: null };
        }
        
        let result, resultUnit;
        
        if (modelInfo.paper === 'virtual') {
            if (inputParam === 'M0') {
                result = m0ToMw(inputValue, inputUnit, modelInfo.mwConstant);
                resultUnit = null;
            } else {
                result = mwToM0(inputValue, 'Nm', modelInfo.mwConstant);
                resultUnit = 'Nm';
            }
        } else {
            const params = getRelationshipParams(modelInfo.paper, modelInfo.fault, modelInfo.key);
            const solved = solveRelationship(params, inputValue, inputUnit, modelInfo.direction);
            result = solved.result;
            resultUnit = solved.unit;
        }
        
        if (result !== null && outputUnit !== 'N/A' && resultUnit) {
            try {
                result = convertUnits(result, resultUnit, outputUnit);
            } catch (e) {}
        }
        
        return { ...row, [outputColumnName]: result };
    });
    
    displayBatchResults(results);
}

function displayBatchResults(results) {
    const resultsDiv = document.getElementById('detResults');
    
    const headers = Object.keys(results[0]);
    const tableRows = results.slice(0, 10).map(row => {
        return '<tr>' + headers.map(h => `<td>${row[h] !== null ? row[h] : 'N/A'}</td>`).join('') + '</tr>';
    }).join('');
    
    const html = `
        <div class="result-box">
            <div class="success">Batch calculation complete. Processed ${results.length} rows.</div>
            <h4>Preview (first 10 rows)</h4>
            <table class="stat-table">
                <thead>
                    <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
            <button class="btn-primary download-btn" onclick="downloadBatchResults()">Download Full Results (CSV)</button>
        </div>
    `;
    
    resultsDiv.innerHTML = html;
    window.batchResults = results;
}

function downloadBatchResults() {
    if (!window.batchResults) return;
    
    const csv = Papa.unparse(window.batchResults);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eq_scalculator_results.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// Monte Carlo simulation
function runMonteCarlo() {
    const inputParam = document.getElementById('mcInputParam').value;
    const outputParam = document.getElementById('mcOutputParam').value;
    const inputValue = parseFloat(document.getElementById('mcInputValue').value);
    const inputUnit = document.getElementById('mcInputUnit').value;
    const outputUnit = document.getElementById('mcOutputUnit').value;
    const numSims = parseInt(document.getElementById('mcSimulations').value);
    
    const uncType = document.querySelector('input[name="uncType"]:checked').value;
    const uncValue = parseFloat(document.getElementById('mcUncertainty').value);
    
    // Validate before running, so a failure names its cause
    if (isNaN(inputValue)) {
        showError('mcResults', 'Please enter a valid numeric input value.');
        return;
    }
    if (!Number.isInteger(numSims) || numSims < 1 || numSims > MAX_MC_SIMULATIONS) {
        showError('mcResults', `Number of simulations must be a whole number between 1 and ${MAX_MC_SIMULATIONS}.`);
        return;
    }
    if (uncType !== 'none' && !(uncValue >= 0)) {
        showError('mcResults', 'Enter the input uncertainty as zero or a positive number, or choose no input uncertainty.');
        return;
    }

    const resultsDiv = document.getElementById('mcResults');
    resultsDiv.innerHTML = '<div class="spinner"></div>';
    
    setTimeout(() => {
        const results = [];
        const models = findAvailableModels(inputParam, outputParam);
        const modelIds = Object.keys(selectedModelsWeights);
        // Weights are relative: normalise them so they sum to 1
        const weightSum = modelIds.reduce((sum, id) => sum + selectedModelsWeights[id], 0);
        const weights = modelIds.map(id => selectedModelsWeights[id] / weightSum);

        // Bookkeeping reported with the results
        const diagnostics = {
            requested: numSims,
            failed: 0,             // draws with no valid result (e.g. a non-positive sampled input)
            extrapolated: 0,       // draws whose sampled input lay outside the model's stated range
            noSigma: new Set(),    // selected models whose source gives no uncertainty
            modelUncertainty: includeModelUncertainty
        };
        
        for (let i = 0; i < numSims; i++) {
            // Apply input uncertainty
            let currentInput = inputValue;
            if (uncType === 'absolute' && uncValue > 0) {
                currentInput = randomNormal(inputValue, uncValue);
            } else if (uncType === 'percentage' && uncValue > 0) {
                currentInput = randomNormal(inputValue, inputValue * uncValue / 100);
            }
            
            // Randomly select model based on weights
            const rand = Math.random();
            let cumWeight = 0;
            let selectedModelId = modelIds[0];
            
            for (let j = 0; j < modelIds.length; j++) {
                cumWeight += weights[j];
                if (rand <= cumWeight) {
                    selectedModelId = modelIds[j];
                    break;
                }
            }
            
            const modelInfo = models[selectedModelId];
            let result, resultUnit;
            
            if (modelInfo.paper === 'virtual') {
                if (inputParam === 'M0') {
                    result = m0ToMw(currentInput, inputUnit, modelInfo.mwConstant);
                    resultUnit = null;
                } else {
                    result = mwToM0(currentInput, 'Nm', modelInfo.mwConstant);
                    resultUnit = 'Nm';
                }
            } else {
                const params = getRelationshipParams(modelInfo.paper, modelInfo.fault, modelInfo.key);
                const solved = solveOneSimulationRun(params, currentInput, inputUnit, 
                    modelInfo.direction, includeModelUncertainty);
                result = solved.result;
                resultUnit = solved.unit;
                if (result !== null) {
                    if (includeModelUncertainty && !diagnostics.noSigma.has(selectedModelId) &&
                        scatterFor(params, currentInput, inputUnit, modelInfo.direction) === null) {
                        diagnostics.noSigma.add(selectedModelId);
                    }
                    if (checkIfExtrapolating(params, currentInput, inputUnit, modelInfo.direction)) {
                        diagnostics.extrapolated++;
                    }
                }
            }
            
            if (result !== null) {
                if (outputUnit !== 'N/A' && resultUnit) {
                    try {
                        result = convertUnits(result, resultUnit, outputUnit);
                    } catch (e) {}
                }
                if (outputParam === 'Mw' && resultUnit) {
                    result = m0ToMw(result, resultUnit);
                }
            }
            if (result !== null && isFinite(result)) {
                results.push(result);
            } else {
                diagnostics.failed++;
            }
        }
        
        displayMonteCarloResults(results, outputParam, outputUnit, diagnostics);
    }, 100);
}

/** Upper limit on Monte Carlo draws, matching the form's own maximum. */
const MAX_MC_SIMULATIONS = 50000;

/**
 * Plain-language notes on what a Monte Carlo distribution does and does not
 * include, from the bookkeeping gathered during the run.
 * @param {Object|null} diagnostics - From runMonteCarlo()
 * @returns {string} HTML for a warning box, or '' when there is nothing to say
 */
function buildMonteCarloNotes(diagnostics) {
    if (!diagnostics) return '';
    const notes = [];

    if (diagnostics.failed > 0) {
        notes.push(`${diagnostics.failed} of ${diagnostics.requested} draws gave no valid result and were ` +
            `discarded (typically a sampled input at or below zero). The statistics describe the remaining ` +
            `draws only, which truncates the input distribution.`);
    }
    if (diagnostics.extrapolated > 0) {
        notes.push(`${diagnostics.extrapolated} of ${diagnostics.requested} draws used an input outside ` +
            `the selected model's stated validity range (extrapolation).`);
    }
    if (diagnostics.modelUncertainty && diagnostics.noSigma.size > 0) {
        notes.push(`No model uncertainty was applied for: ` +
            `${[...diagnostics.noSigma].map(escapeHtml).join('; ')}. The source gives no standard deviation ` +
            `for the relation or segment used, so these draws are deterministic and the spread shown is ` +
            `too narrow.`);
    }

    if (notes.length === 0) return '';
    return `<div class="warning"><ul style="margin:0; padding-left:20px;">` +
        `${notes.map(n => `<li>${n}</li>`).join('')}</ul></div>`;
}

function displayMonteCarloResults(results, outputParam, outputUnit, diagnostics = null) {
    if (results.length === 0) {
        showError('mcResults', 'Simulation failed for all runs. Check that the input value is ' +
            'greater than zero where the relation requires it and that the selected models can be evaluated.');
        return;
    }
    
    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    const std = Math.sqrt(results.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / results.length);
    const sortedResults = [...results].sort((a, b) => a - b);
    const percentile = p => sortedResults[Math.min(sortedResults.length - 1, Math.floor(results.length * p))];
    const p2_5 = percentile(0.025);
    const p16 = percentile(0.16);
    const p50 = percentile(0.50);
    const p84 = percentile(0.84);
    const p97_5 = percentile(0.975);
    // The sorted array gives the extremes without spreading it into Math.min/max
    const minVal = sortedResults[0];
    const maxVal = sortedResults[sortedResults.length - 1];
    const notesHtml = buildMonteCarloNotes(diagnostics);
    
    const trace = {
        x: results,
        type: 'histogram',
        marker: {
            color: 'rgba(138, 51, 36, 0.65)',
            line: { color: THEME.accent, width: 0.5 }
        },
        nbinsx: 50
    };

    const layout = plotLayout({
        xaxis: { title: `${outputParam}${formatUnit(outputUnit) ? ` (${formatUnit(outputUnit)})` : ''}` },
        yaxis: { title: 'Frequency' },
        bargap: 0.04
    });
    
    const unitDisplay = formatUnit(outputUnit) ? ` (${formatUnit(outputUnit)})` : '';
    
    const html = `
        <div class="result-box">
            <h3>Simulation Results</h3>
            <div id="mcPlot" style="width: 100%; height: 400px;"></div>
            ${notesHtml}
            <h3 style="margin-top: 30px;">Summary Statistics for ${outputParam}${unitDisplay}</h3>
            <table class="stat-table">
                <thead>
                    <tr>
                        <th>Statistic</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Count</td><td>${results.length}</td></tr>
                    <tr><td>Mean</td><td>${formatQuantity(mean, outputParam)}</td></tr>
                    <tr><td>Std Dev</td><td>${formatQuantity(std, outputParam)}</td></tr>
                    <tr><td>Min</td><td>${formatQuantity(minVal, outputParam)}</td></tr>
                    <tr><td>2.5th Percentile</td><td>${formatQuantity(p2_5, outputParam)}</td></tr>
                    <tr><td>16th Percentile</td><td>${formatQuantity(p16, outputParam)}</td></tr>
                    <tr><td>50th Percentile (Median)</td><td>${formatQuantity(p50, outputParam)}</td></tr>
                    <tr><td>84th Percentile</td><td>${formatQuantity(p84, outputParam)}</td></tr>
                    <tr><td>97.5th Percentile</td><td>${formatQuantity(p97_5, outputParam)}</td></tr>
                    <tr><td>Max</td><td>${formatQuantity(maxVal, outputParam)}</td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    document.getElementById('mcResults').innerHTML = html;
    Plotly.newPlot('mcPlot', [trace], layout, PLOT_CONFIG);
}

/**
 * Sweep values for the Explore tab's x axis.
 *
 * Derived from the union of the plotted relations' published domains rather
 * than one hard-coded decade range for every parameter - which swept
 * displacement out to 10 km of slip and width out to 10 000 km. Padded half a
 * decade (or half a magnitude unit) each side so the extrapolated tails are
 * visible without dominating the plot.
 *
 * @param {string} param - Parameter symbol on the x axis
 * @param {string|null} unit - Unit the axis is drawn in
 * @param {Object} models - From findAvailableModels()
 * @param {number} [nPoints=240] - Samples across the sweep
 * @returns {number[]} Ascending x values
 */
function buildPlotSweep(param, unit, models, nPoints = 240) {
    const isMagnitude = param === 'Mw';
    let lo = Infinity;
    let hi = -Infinity;

    for (const modelId in models) {
        const info = models[modelId];
        if (info.paper === 'virtual') continue;
        const params = getRelationshipParams(info.paper, info.fault, info.key);
        if (!params || !params.length) continue;

        const domain = getInputDomain(params, info.direction);
        if (!domain || domain.degenerate) continue;

        for (const bound of [domain.min, domain.max]) {
            if (bound === null || !isFinite(bound)) continue;
            let v = bound;
            if (domain.unit && unit) {
                try { v = convertUnits(bound, domain.unit, unit); } catch (e) { /* keep native */ }
            }
            if (!isFinite(v) || (!isMagnitude && v <= 0)) continue;
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
        }
    }

    // Every relation on this axis is unbounded: fall back to sensible defaults.
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) {
        if (isMagnitude) { lo = 4.5; hi = 9.0; }
        else if (param === 'M0') { lo = 1e15; hi = 1e22; }
        else { lo = 0.1; hi = 1e4; }
    }

    const values = [];
    if (isMagnitude) {
        const min = lo - 0.5;
        const max = hi + 0.5;
        const step = (max - min) / (nPoints - 1);
        for (let i = 0; i < nPoints; i++) values.push(min + i * step);
    } else {
        const min = Math.log10(lo) - 0.5;
        const max = Math.log10(hi) + 0.5;
        const step = (max - min) / (nPoints - 1);
        for (let i = 0; i < nPoints; i++) values.push(Math.pow(10, min + i * step));
    }
    return values;
}

// Plotting
function updatePlot() {
    const xParam = document.getElementById('plotXParam').value;
    const yParam = document.getElementById('plotYParam').value;
    const xScale = document.getElementById('plotXScale').value;
    const yScale = document.getElementById('plotYScale').value;
    
    const plotDiv = document.getElementById('plotDiv');
    
    if (!xParam || !yParam) {
        plotDiv.innerHTML = '<div class="warning">Please select both X and Y parameters.</div>';
        return;
    }
    
    const models = findAvailableModels(xParam, yParam);
    
    if (Object.keys(models).length === 0) {
        plotDiv.innerHTML = '<div class="warning">No models found for this parameter combination. Try different parameters.</div>';
        return;
    }
    
    try {
        const traces = [];
        const xUnit = getStandardUnit(xParam);
        const yUnit = getStandardUnit(yParam);
        
        const xValues = buildPlotSweep(xParam, xUnit, models);
        
        let validTraces = 0;
        
        for (const modelId in models) {
            const modelInfo = models[modelId];
            
            if (modelInfo.paper === 'virtual') {
                // M0 <-> Mw by definition: no model file, just the convention's constant
                if (xParam === 'Mw' && yParam === 'M0') {
                    const yValues = xValues.map(mw => mwToM0(mw, yUnit || 'Nm', modelInfo.mwConstant));
                    traces.push({
                        x: xValues,
                        y: yValues,
                        mode: 'lines',
                        name: modelId,
                        line: { width: 3, dash: 'dot' }
                    });
                    validTraces++;
                } else if (xParam === 'M0' && yParam === 'Mw') {
                    const yValues = xValues.map(m0 => m0ToMw(m0, xUnit || 'Nm', modelInfo.mwConstant));
                    traces.push({
                        x: xValues,
                        y: yValues,
                        mode: 'lines',
                        name: modelId,
                        line: { width: 3, dash: 'dot' }
                    });
                    validTraces++;
                }
                continue;
            }
            
            const params = getRelationshipParams(modelInfo.paper, modelInfo.fault, modelInfo.key);
            
            if (!params || !params.length) {
                console.warn(`No parameters found for ${modelId}`);
                continue;
            }
            
            const { yValues, outputUnit } = calculateCurve(params, xValues, xUnit, modelInfo.direction);
            
            // Convert units if needed
            const convertedY = yValues.map(y => {
                if (y === null) return null;
                if (yUnit && outputUnit && yUnit !== outputUnit) {
                    try {
                        return convertUnits(y, outputUnit, yUnit);
                    } catch (e) {
                        return y;
                    }
                }
                return y;
            });
            
            // Split the curve at the model's validity limits: solid where the
            // authors state the relation applies, dashed where the app is
            // continuing the end segment beyond it. getTargetSegment extends
            // the nearest branch silently, so without this the plot gives an
            // extrapolation the same weight as a published fit.
            const validPoints = xValues.map((x, i) => ({
                x,
                y: convertedY[i],
                inRange: checkIfExtrapolating(params, x, xUnit, modelInfo.direction) === null
            })).filter(p => p.y !== null && !isNaN(p.y) && isFinite(p.y));

            if (validPoints.length > 0) {
                const colour = PLOT_COLORWAY[validTraces % PLOT_COLORWAY.length];
                const inRange = validPoints.map(p => p.inRange ? p.y : null);
                // Repeat the boundary points so the two traces meet rather than
                // leaving a gap where the curve crosses its validity limit.
                const outOfRange = validPoints.map((p, i) => {
                    if (!p.inRange) return p.y;
                    const prev = validPoints[i - 1];
                    const next = validPoints[i + 1];
                    return (prev && !prev.inRange) || (next && !next.inRange) ? p.y : null;
                });

                traces.push({
                    x: validPoints.map(p => p.x),
                    y: inRange,
                    mode: 'lines',
                    name: modelId,
                    legendgroup: modelId,
                    connectgaps: false,
                    line: { width: 1.6, color: colour }
                });

                if (outOfRange.some(v => v !== null)) {
                    traces.push({
                        x: validPoints.map(p => p.x),
                        y: outOfRange,
                        mode: 'lines',
                        name: `${modelId} (extrapolated)`,
                        legendgroup: modelId,
                        showlegend: false,
                        hoverinfo: 'skip',
                        connectgaps: false,
                        line: { width: 1.2, color: colour, dash: 'dot' },
                        opacity: 0.55
                    });
                }
                validTraces++;
            }
        }
        
        if (validTraces === 0) {
            plotDiv.innerHTML = '<div class="warning">Could not generate plot data for the selected models. The models may not support this parameter range.</div>';
            return;
        }
        
        const layout = plotLayout({
            xaxis: { title: `${xParam}${formatUnit(xUnit) ? ` (${formatUnit(xUnit)})` : ''}`, type: xScale },
            yaxis: { title: `${yParam}${formatUnit(yUnit) ? ` (${formatUnit(yUnit)})` : ''}`, type: yScale },
            hovermode: 'closest',
            showlegend: true,
            legend: { orientation: 'v', x: 1.02, y: 1, xanchor: 'left' },
            margin: { l: 64, r: 210, t: 20, b: 56 }
        });
        
        Plotly.newPlot('plotDiv', traces, layout, PLOT_CONFIG);
    } catch (error) {
        console.error('Plot error:', error);
        plotDiv.innerHTML = `<div class="error">Error generating plot: ${error.message}</div>`;
    }
}

// ─────────────────────────────────────────────
// FEATURE 2: MODEL COMPARISON
// ─────────────────────────────────────────────

function updateComparisonConfig() {
    const inputParam = document.getElementById('cmpInputParam').value;
    const outputParam = document.getElementById('cmpOutputParam').value;

    const inputUnits = getUnitsForParam(inputParam);
    const outputUnits = getUnitsForParam(outputParam);
    populateUnitSelect('cmpInputUnit', inputUnits, inputUnits[0]);
    populateUnitSelect('cmpOutputUnit', outputUnits, outputUnits[0]);

    updateComparisonModelList();
}

function updateComparisonModelList() {
    const inputParam = document.getElementById('cmpInputParam').value;
    const outputParam = document.getElementById('cmpOutputParam').value;
    const groupedModels = findAvailableModelsGrouped(inputParam, outputParam);

    const container = document.getElementById('cmpModelList');
    container.innerHTML = '';

    let hasModels = false;
    for (const groupLabel in groupedModels) {
        const group = groupedModels[groupLabel];
        const modelIds = Object.keys(group);
        if (modelIds.length === 0) continue;
        hasModels = true;

        const header = document.createElement('div');
        header.className = 'cmp-model-group-header';
        header.textContent = groupLabel;
        container.appendChild(header);

        for (const modelId of modelIds) {
            const item = document.createElement('div');
            item.className = 'cmp-model-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.modelId = modelId;
            checkbox.checked = true;
            checkbox.className = 'cmp-model-checkbox';

            const label = document.createElement('label');
            const dashIdx = modelId.indexOf(' - ');
            label.textContent = dashIdx !== -1 ? modelId.substring(dashIdx + 3) : modelId;

            item.appendChild(checkbox);
            item.appendChild(label);
            container.appendChild(item);
        }
    }

    if (!hasModels) {
        container.innerHTML = '<div class="warning">No models available for this parameter combination.</div>';
    }
}

function selectAllComparisonModels(checked) {
    document.querySelectorAll('.cmp-model-checkbox').forEach(cb => { cb.checked = checked; });
}

function runComparison() {
    const inputParam = document.getElementById('cmpInputParam').value;
    const outputParam = document.getElementById('cmpOutputParam').value;
    const inputValue = parseFloat(document.getElementById('cmpInputValue').value);
    const inputUnit = document.getElementById('cmpInputUnit').value;
    const outputUnit = document.getElementById('cmpOutputUnit').value;

    if (isNaN(inputValue)) {
        showError('cmpResults', 'Please enter a valid numeric input value.');
        return;
    }

    const checkedBoxes = document.querySelectorAll('.cmp-model-checkbox:checked');
    if (checkedBoxes.length === 0) {
        showError('cmpResults', 'Please select at least one model.');
        return;
    }

    document.getElementById('cmpResults').innerHTML = '<div class="spinner"></div>';

    setTimeout(() => {
        try {
            const allModelsFlat = findAvailableModels(inputParam, outputParam);
            const rows = [];

            checkedBoxes.forEach(cb => {
                const modelId = cb.dataset.modelId;
                const modelInfo = allModelsFlat[modelId];
                if (!modelInfo) return;

                let result = null, resultUnit = null, scatter = null, warning = null;
                let sigmaIsIntercept = false;

                if (modelInfo.paper === 'virtual') {
                    if (inputParam === 'M0') {
                        result = m0ToMw(inputValue, inputUnit, modelInfo.mwConstant);
                        resultUnit = null;
                    } else {
                        result = mwToM0(inputValue, 'Nm', modelInfo.mwConstant);
                        resultUnit = 'Nm';
                    }
                } else {
                    const params = getRelationshipParams(modelInfo.paper, modelInfo.fault, modelInfo.key);
                    if (!params) return;

                    const solved = solveRelationship(params, inputValue, inputUnit, modelInfo.direction);
                    if (solved.error || solved.result === null) return;

                    result = solved.result;
                    resultUnit = solved.unit;

                    // Sigma, and the space it acts in. scatterFor resolves the
                    // matched segment, reads whichever sigma field the paper
                    // publishes, and applies the 1/|b| Jacobian on an inverse
                    // solve - so the caller never has to know which of the
                    // three equation forms it is looking at.
                    scatter = scatterFor(params, inputValue, inputUnit, modelInfo.direction);
                    sigmaIsIntercept = scatter ? scatter.fromIntercept : false;

                    warning = checkIfExtrapolating(params, inputValue, inputUnit, modelInfo.direction);
                }

                // Convert result to target output unit
                let finalResult = result;
                let finalUnit = resultUnit;
                if (outputUnit !== 'N/A' && resultUnit) {
                    try {
                        finalResult = convertUnits(result, resultUnit, outputUnit);
                        finalUnit = outputUnit;
                    } catch (e) { /* keep original */ }
                }
                if (outputParam === 'Mw' && resultUnit) {
                    finalResult = m0ToMw(result, resultUnit);
                    finalUnit = null;
                }

                // Sigma bounds, in model-native units, then carried through the
                // same conversions as the result itself.
                //
                // The band is built in the space the sigma actually lives in:
                // additive for a magnitude, multiplicative for a quantity whose
                // scatter is published in log10. Building every band in log10
                // raised 10 to the power of a magnitude, which printed a +-1
                // sigma range of 3.86-11.67 Mw on a result of 6.71.
                //
                // scatterBounds takes the two sides separately: a published
                // range of the intercept (Leonard 2014) need not be centred on
                // it, so the lower and upper bounds can sit at different
                // distances from the result.
                let sigmaLower = null, sigmaUpper = null;
                if (scatter !== null && result !== null) {
                    const rawBounds = scatterBounds(result, scatter);
                    const rawLower = rawBounds ? rawBounds.lower : null;
                    const rawUpper = rawBounds ? rawBounds.upper : null;

                    if (rawLower !== null) {
                        try {
                            sigmaLower = (outputUnit !== 'N/A' && resultUnit)
                                ? convertUnits(rawLower, resultUnit, outputUnit) : rawLower;
                            sigmaUpper = (outputUnit !== 'N/A' && resultUnit)
                                ? convertUnits(rawUpper, resultUnit, outputUnit) : rawUpper;
                        } catch (e) {
                            sigmaLower = rawLower;
                            sigmaUpper = rawUpper;
                        }

                        // If the result was converted from M0 to a magnitude,
                        // the bounds have to make the same trip or the table
                        // prints a magnitude beside moment error bars.
                        if (outputParam === 'Mw' && resultUnit) {
                            sigmaLower = m0ToMw(sigmaLower, resultUnit);
                            sigmaUpper = m0ToMw(sigmaUpper, resultUnit);
                        }
                    }
                }

                // Validity range, expressed in the INPUT variable. range_x is
                // always stated in X, so for an inverse solve it must be mapped
                // through the forward equation first - otherwise, say, a
                // rupture-length range is printed as a displacement range.
                let validRange = 'Not specified';
                if (modelInfo.paper !== 'virtual') {
                    const params2 = getRelationshipParams(modelInfo.paper, modelInfo.fault, modelInfo.key);
                    if (params2) {
                        validRange = describeDomain(
                            getInputDomain(params2, modelInfo.direction), inputParam, inputUnit);
                    }
                }

                const dashIdx = modelId.indexOf(' - ');
                const paperDisplay = dashIdx !== -1 ? modelId.substring(0, dashIdx) : modelId;
                const faultDisplay = dashIdx !== -1 ? modelId.substring(dashIdx + 3) : '';

                rows.push({
                    model: paperDisplay,
                    faultType: faultDisplay,
                    modelId,
                    result: finalResult,
                    unit: finalUnit,
                    sigmaLower,
                    sigmaUpper,
                    sigmaIsIntercept,
                    validRange,
                    inRange: !warning,
                    warning
                });
            });

            if (rows.length === 0) {
                showError('cmpResults', 'No results could be calculated for the selected models.');
                return;
            }

            displayComparisonResults(rows, inputParam, outputParam, inputValue, inputUnit, outputUnit);
        } catch (err) {
            console.error('Comparison error:', err);
            showError('cmpResults', `Comparison failed: ${err.message}`);
        }
    }, 50);
}

function displayComparisonResults(rows, inputParam, outputParam, inputValue, inputUnit, outputUnit) {
    const unitDisplay = formatUnit(outputUnit) ? ` (${formatUnit(outputUnit)})` : '';
    const inputUnitDisplay = inputUnit && inputUnit !== 'N/A' ? ` ${inputUnit}` : '';

    let tableHtml = `
        <div class="table-scroll-wrapper">
        <table class="stat-table cmp-table" id="cmpResultTable">
            <thead>
                <tr>
                    <th>Model</th>
                    <th>Fault Type</th>
                    <th>Result${unitDisplay}</th>
                    <th>−1σ${unitDisplay}</th>
                    <th>+1σ${unitDisplay}</th>
                    <th>Valid ${inputParam} range</th>
                    <th>In Range?</th>
                </tr>
            </thead>
            <tbody>
    `;

    rows.forEach(row => {
        const resultStr = row.result !== null ? formatQuantity(row.result, outputParam) : 'N/A';
        const lowerStr = row.sigmaLower !== null ? formatQuantity(row.sigmaLower, outputParam) : 'N/A';
        const upperStr = row.sigmaUpper !== null ? formatQuantity(row.sigmaUpper, outputParam) : 'N/A';
        const inRangeStr = row.inRange ? 'In range' : 'Extrapolated';
        const inRangeClass = row.inRange ? 'cmp-in-range' : 'cmp-out-of-range';
        // Mark sigmas derived from intercept uncertainty: a narrower quantity
        // than the total scatter in log10(Y) the other models publish.
        const mark = row.sigmaIsIntercept && row.sigmaLower !== null
            ? '<span class="cmp-footnote-mark" title="Intercept uncertainty, not total scatter">†</span>' : '';
        tableHtml += `
            <tr>
                <td class="cmp-model-name">${row.model}</td>
                <td class="cmp-model-name">${row.faultType}</td>
                <td><strong>${resultStr}</strong></td>
                <td>${lowerStr}${mark}</td>
                <td>${upperStr}${mark}</td>
                <td class="cmp-range">${row.validRange}</td>
                <td class="${inRangeClass}">${inRangeStr}</td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table></div>';

    if (rows.some(r => r.sigmaIsIntercept && r.sigmaLower !== null)) {
        tableHtml += `<p class="cmp-footnote">† Uncertainty on the regression intercept, which the
            source publishes in place of the total scatter in log₁₀(Y) reported by the other models.
            It is the narrower quantity, so these intervals are not directly comparable with the rest
            of the column. The bounds are the published one-standard-deviation range of the intercept,
            which need not be centred on it, so the two sides can differ.</p>`;
    }

    tableHtml += `<p class="cmp-footnote">A validity range is the range of applicability claimed by
        the authors, not the extent of the data they fitted. A relation may publish no upper bound
        and still have no observations anywhere near your input.</p>`;

    const html = `
        <div class="result-box">
            <h3>Comparison: ${inputParam} = ${inputValue}${inputUnitDisplay} → ${outputParam}</h3>
            <div class="cmp-toolbar">
                <button class="btn-secondary" onclick="copyComparisonCSV()">Copy as CSV</button>
            </div>
            ${tableHtml}
            <div id="cmpChart" class="cmp-chart"></div>
        </div>
    `;

    document.getElementById('cmpResults').innerHTML = html;

    // Build Plotly bar chart with error bars
    const validRows = rows.filter(r => r.result !== null);
    const errorBarsLower = validRows.map(r =>
        r.sigmaLower !== null ? Math.abs(r.result - r.sigmaLower) : 0);
    const errorBarsUpper = validRows.map(r =>
        r.sigmaUpper !== null ? Math.abs(r.sigmaUpper - r.result) : 0);

    const trace = {
        type: 'bar',
        x: validRows.map(r => `${r.model}<br><i>${r.faultType}</i>`),
        y: validRows.map(r => r.result),
        error_y: {
            type: 'data',
            symmetric: false,
            array: errorBarsUpper,
            arrayminus: errorBarsLower,
            visible: true,
            color: THEME.inkMute,
            thickness: 1,
            width: 4
        },
        marker: {
            // In-range bars are solid accent; extrapolated bars are outlined
            // in the warning colour, so the distinction survives greyscale.
            color: validRows.map(r => r.inRange
                ? 'rgba(138,51,36,0.80)' : 'rgba(168,99,28,0.28)'),
            line: {
                color: validRows.map(r => r.inRange ? THEME.accent : THEME.warn),
                width: 1
            }
        },
        hovertemplate: '<b>%{x}</b><br>%{y:.4g}<extra></extra>'
    };

    const layout = plotLayout({
        xaxis: { title: 'Model', tickangle: -25 },
        yaxis: { title: `${outputParam}${unitDisplay}` },
        bargap: 0.35,
        margin: { b: 150, t: 20, l: 72, r: 24 }
    });

    Plotly.newPlot('cmpChart', [trace], layout, PLOT_CONFIG);
}

function copyComparisonCSV() {
    const table = document.getElementById('cmpResultTable');
    if (!table) return;

    const rows = [];
    for (const row of table.rows) {
        const cells = [];
        for (const cell of row.cells) {
            cells.push('"' + cell.innerText.replace(/"/g, '""').trim() + '"');
        }
        rows.push(cells.join(','));
    }
    const csvText = rows.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(csvText).then(() => {
            const btn = document.querySelector('.cmp-toolbar .btn-secondary');
            if (btn) {
                btn.textContent = 'Copied';
                setTimeout(() => { btn.textContent = 'Copy as CSV'; }, 2000);
            }
        });
    } else {
        const ta = document.createElement('textarea');
        ta.value = csvText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

// ─────────────────────────────────────────────
// FEATURE 3: CHAIN CALCULATIONS
// ─────────────────────────────────────────────

let chainSteps = [];
const MAX_CHAIN_STEPS = 5;

function updateChainStartUnit() {
    const param = document.getElementById('chainStartParam').value;
    const units = getUnitsForParam(param);
    populateUnitSelect('chainStartUnit', units, units[0]);
}

function resetChain() {
    chainSteps = [];
    document.getElementById('chainSteps').innerHTML = '';
    document.getElementById('chainResults').innerHTML = '';
    document.getElementById('chainAddBtn').disabled = false;
    updateChainStartUnit();
}

/**
 * Return all output parameters reachable from the given input parameter.
 */
function getOutputParamsFor(inputParam) {
    const outputs = new Set();
    const allParams = getAllParameters();
    for (const p of allParams) {
        if (p === inputParam) continue;
        const models = findAvailableModels(inputParam, p);
        if (Object.keys(models).length > 0) outputs.add(p);
    }
    return Array.from(outputs).sort();
}

function addChainStep() {
    if (chainSteps.length >= MAX_CHAIN_STEPS) {
        document.getElementById('chainAddBtn').disabled = true;
        return;
    }

    const stepIndex = chainSteps.length;
    const currentInputParam = stepIndex === 0
        ? document.getElementById('chainStartParam').value
        : chainSteps[stepIndex - 1].outputParam;

    const availableOutputs = getOutputParamsFor(currentInputParam);

    if (availableOutputs.length === 0) {
        document.getElementById('chainSteps').insertAdjacentHTML('beforeend',
            `<div class="warning">No further calculations available from <strong>${currentInputParam}</strong>.</div>`);
        document.getElementById('chainAddBtn').disabled = true;
        return;
    }

    const step = { outputParam: availableOutputs[0], selectedModelId: null };
    chainSteps.push(step);

    const stepsDiv = document.getElementById('chainSteps');
    const stepDiv = document.createElement('div');
    stepDiv.className = 'chain-step';
    stepDiv.id = `chainStep_${stepIndex}`;

    stepDiv.innerHTML = `
        <div class="chain-step-header">
            <span class="chain-step-number">Step ${stepIndex + 1}</span>
            <span class="chain-step-arrow">→</span>
            <button class="btn-remove-step" onclick="removeChainStep(${stepIndex})" title="Remove this step" aria-label="Remove this step">&times;</button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Input (from previous)</label>
                <div class="chain-input-display">${currentInputParam}</div>
            </div>
            <div class="form-group">
                <label for="chainStepOutput_${stepIndex}">Output Parameter</label>
                <select id="chainStepOutput_${stepIndex}" onchange="onChainStepOutputChange(${stepIndex})">
                    ${availableOutputs.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="chainStepModel_${stepIndex}">Model</label>
                <select id="chainStepModel_${stepIndex}"></select>
            </div>
        </div>
    `;

    stepsDiv.appendChild(stepDiv);
    updateChainStepModels(stepIndex);

    if (chainSteps.length >= MAX_CHAIN_STEPS) {
        document.getElementById('chainAddBtn').disabled = true;
    }
}

function updateChainStepModels(stepIndex) {
    const currentInputParam = stepIndex === 0
        ? document.getElementById('chainStartParam').value
        : chainSteps[stepIndex - 1].outputParam;
    const outputParam = chainSteps[stepIndex].outputParam;

    const groupedModels = findAvailableModelsGrouped(currentInputParam, outputParam);
    populateSelectGrouped(`chainStepModel_${stepIndex}`, groupedModels);

    const modelSelect = document.getElementById(`chainStepModel_${stepIndex}`);
    chainSteps[stepIndex].selectedModelId = modelSelect.value || null;
    modelSelect.onchange = () => {
        chainSteps[stepIndex].selectedModelId = modelSelect.value;
    };
}

function onChainStepOutputChange(stepIndex) {
    const select = document.getElementById(`chainStepOutput_${stepIndex}`);
    chainSteps[stepIndex].outputParam = select.value;
    chainSteps[stepIndex].selectedModelId = null;
    updateChainStepModels(stepIndex);
    truncateChainStepsAfter(stepIndex);
}

function truncateChainStepsAfter(stepIndex) {
    for (let i = chainSteps.length - 1; i > stepIndex; i--) {
        const el = document.getElementById(`chainStep_${i}`);
        if (el) el.remove();
        chainSteps.splice(i, 1);
    }
    document.getElementById('chainAddBtn').disabled = chainSteps.length >= MAX_CHAIN_STEPS;
}

function removeChainStep(stepIndex) {
    for (let i = chainSteps.length - 1; i >= stepIndex; i--) {
        const el = document.getElementById(`chainStep_${i}`);
        if (el) el.remove();
        chainSteps.splice(i, 1);
    }
    document.getElementById('chainAddBtn').disabled = chainSteps.length >= MAX_CHAIN_STEPS;
}

function runChain() {
    const startParam = document.getElementById('chainStartParam').value;
    const startValue = parseFloat(document.getElementById('chainStartValue').value);
    const startUnit = document.getElementById('chainStartUnit').value;

    if (isNaN(startValue)) {
        showError('chainResults', 'Please enter a valid starting value.');
        return;
    }
    if (chainSteps.length === 0) {
        showError('chainResults', 'Please add at least one step to the chain.');
        return;
    }

    const chainNodes = [{
        param: startParam,
        value: startValue,
        unit: startUnit,
        modelId: null,
        warning: null
    }];

    let currentParam = startParam;
    let currentValue = startValue;
    let currentUnit = startUnit;

    for (let i = 0; i < chainSteps.length; i++) {
        const step = chainSteps[i];
        const outputParam = step.outputParam;
        const modelId = step.selectedModelId;

        if (!modelId) {
            showError('chainResults', `Step ${i + 1}: No model selected.`);
            return;
        }

        const modelsFlat = findAvailableModels(currentParam, outputParam);
        const modelInfo = modelsFlat[modelId];
        if (!modelInfo) {
            showError('chainResults', `Step ${i + 1}: Model not found.`);
            return;
        }

        let result = null, resultUnit = null, warning = null;

        if (modelInfo.paper === 'virtual') {
            if (currentParam === 'M0') {
                result = m0ToMw(currentValue, currentUnit, modelInfo.mwConstant);
                resultUnit = null;
            } else {
                result = mwToM0(currentValue, 'Nm', modelInfo.mwConstant);
                resultUnit = 'Nm';
            }
        } else {
            const params = getRelationshipParams(modelInfo.paper, modelInfo.fault, modelInfo.key);
            if (!params) {
                showError('chainResults', `Step ${i + 1}: Could not load model parameters.`);
                return;
            }
            const solved = solveRelationship(params, currentValue, currentUnit, modelInfo.direction);
            if (solved.error || solved.result === null) {
                showError('chainResults', `Step ${i + 1}: Calculation failed. ${solved.error || ''}`);
                return;
            }
            result = solved.result;
            resultUnit = solved.unit;
            warning = checkIfExtrapolating(params, currentValue, currentUnit, modelInfo.direction);
        }

        chainNodes.push({
            param: outputParam,
            value: result,
            unit: resultUnit,
            modelId,
            warning
        });

        currentParam = outputParam;
        currentValue = result;
        currentUnit = resultUnit;
    }

    displayChainResults(chainNodes);
}

function displayChainResults(chainNodes) {
    let html = '<div class="result-box"><h3>Chain Result</h3><div class="chain-visual">';

    for (let i = 0; i < chainNodes.length; i++) {
        const node = chainNodes[i];
        const valueStr = node.value !== null ? formatQuantity(node.value, node.param) : 'Error';
        const unitStr = node.unit && node.unit !== 'N/A' ? ` ${node.unit}` : '';

        html += `
            <div class="chain-node ${node.warning ? 'chain-node-warning' : ''}">
                <div class="chain-node-param">${node.param}</div>
                <div class="chain-node-value">${valueStr}${unitStr}</div>
                ${node.warning ? '<div class="chain-node-flag">Extrapolated</div>' : ''}
            </div>
        `;

        if (i < chainNodes.length - 1) {
            const nextNode = chainNodes[i + 1];
            // Show just the fault type portion of the model label
            let modelLabel = '';
            if (nextNode.modelId) {
                const dashIdx = nextNode.modelId.indexOf(' - ');
                modelLabel = dashIdx !== -1
                    ? nextNode.modelId.substring(dashIdx + 3)
                    : nextNode.modelId;
            }
            html += `
                <div class="chain-arrow-group">
                    <div class="chain-model-label">${modelLabel}</div>
                    <div class="chain-arrow">→</div>
                </div>
            `;
        }
    }

    html += '</div>'; // end chain-visual

    // Extrapolation warnings summary
    const warnings = chainNodes.filter(n => n.warning);
    if (warnings.length > 0) {
        html += '<div class="warning" style="margin-top:15px;"><strong>Extrapolation warnings</strong><ul style="margin-top:8px; padding-left:20px;">';
        warnings.forEach(n => {
            const stepIdx = chainNodes.indexOf(n);
            html += `<li>Step ${stepIdx}: ${n.param} — ${n.warning}</li>`;
        });
        html += '</ul></div>';
    }

    html += '</div>'; // end result-box
    document.getElementById('chainResults').innerHTML = html;
}

// ─────────────────────────────────────────────
// Utility functions
function showError(elementId, message) {
    document.getElementById(elementId).innerHTML = `<div class="error">${message}</div>`;
}