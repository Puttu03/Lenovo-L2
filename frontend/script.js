// Configuration
const API_BASE_URL = 'http://localhost:8080/api';
let featureDefaults = {};
let radarCharts = {};
let currentInputData = {};

// Initialize application
document.addEventListener('DOMContentLoaded', async function() {
    await initializeApp();
    setupEventListeners();
});

async function initializeApp() {
    try {
        // Load feature list and defaults from backend
        const response = await fetch(`${API_BASE_URL}/features`);
        const data = await response.json();
        
        featureDefaults = data.defaults;
        createInputFields(data.features);
        populateDefaultValues();
        
        // Initialize radar charts
        initializeRadarCharts();
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize application. Please check if backend is running.');
    }
}

function createInputFields(features) {
    const formGrid = document.getElementById('inputForm');
    formGrid.innerHTML = '';
    
    features.forEach(feature => {
        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group';
        
        const label = document.createElement('label');
        label.htmlFor = feature;
        label.textContent = formatLabel(feature);
        
        const input = document.createElement('input');
        input.type = 'number';
        input.id = feature;
        input.name = feature;
        input.step = feature.includes('Error') ? '1' : '0.01';
        input.min = '0';
        input.addEventListener('input', () => saveCurrentInputData());
        
        inputGroup.appendChild(label);
        inputGroup.appendChild(input);
        formGrid.appendChild(inputGroup);
    });
}

function formatLabel(text) {
    // First replace underscores with spaces
    let formatted = text.replace(/_/g, ' ');
    
    // Then capitalize first letters of words
    formatted = formatted.replace(/\b\w/g, l => l.toUpperCase());
    
    // Then replace Tb with TB (for Total_TBW_TB, Total_TBR_TB)
    formatted = formatted.replace('Tb', 'TB');
    
    // Finally, replace the temperature designation specifically
    formatted = formatted.replace(/ C(?=\s|$)/g, ' (°C)');
    
    return formatted;
}

function populateDefaultValues() {
    Object.entries(featureDefaults).forEach(([feature, value]) => {
        const input = document.getElementById(feature);
        if (input) {
            input.value = value;
        }
    });
    saveCurrentInputData();
}

function saveCurrentInputData() {
    currentInputData = collectInputData();
}

function initializeRadarCharts() {
    const chartIds = ['wearoutRadar', 'thermalRadar', 'powerRadar', 'controllerRadar'];
    
    chartIds.forEach(id => {
        const ctx = document.getElementById(id);
        if (!ctx) return;
        
        radarCharts[id] = new Chart(ctx.getContext('2d'), {
            type: 'radar',
            data: {
                labels: Object.keys(featureDefaults).map(f => formatLabel(f)),
                datasets: [{
                    label: 'Feature Values',
                    data: Object.values(featureDefaults).map(v => normalizeFeatureValue(v, 0)),
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(52, 152, 219, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(52, 152, 219, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            display: false,
                            stepSize: 20
                        },
                        pointLabels: {
                            font: {
                                size: 10
                            },
                            color: '#666'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        angleLines: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const feature = context.chart.data.labels[context.dataIndex];
                                const value = getOriginalValueFromNormalized(context.parsed.r, feature);
                                return `${feature}: ${value}`;
                            }
                        }
                    }
                }
            }
        });
    });
}

function normalizeFeatureValue(value, index) {
    // Define normalization rules for each feature
    const featureNames = Object.keys(featureDefaults);
    const featureName = featureNames[index];
    
    // Get max values for normalization
    const maxValues = {
        'Power_On_Hours': 60000,
        'Total_TBW_TB': 1000,
        'Total_TBR_TB': 800,
        'Temperature_C': 90,
        'Percent_Life_Used': 150,
        'Media_Errors': 10,
        'Unsafe_Shutdowns': 10,
        'CRC_Errors': 5,
        'Read_Error_Rate': 20,
        'Write_Error_Rate': 15
    };
    
    const maxValue = maxValues[featureName] || 100;
    return Math.min((value / maxValue) * 100, 100);
}

function getOriginalValueFromNormalized(normalizedValue, featureLabel) {
    // Convert normalized value back to original
    const featureName = featureLabel.replace(/\s*\(°C\)/g, ' C').replace(/\s+/g, '_').toLowerCase().replace('tbw_tb', 'tbw_tb').replace('tbr_tb', 'tbr_tb');
    
    const maxValues = {
        'power_on_hours': 60000,
        'total_tbw_tb': 1000,
        'total_tbr_tb': 800,
        'temperature_c': 90,
        'percent_life_used': 150,
        'media_errors': 10,
        'unsafe_shutdowns': 10,
        'crc_errors': 5,
        'read_error_rate': 20,
        'write_error_rate': 15
    };
    
    const maxValue = maxValues[featureName] || 100;
    return ((normalizedValue / 100) * maxValue).toFixed(2);
}

function setupEventListeners() {
    // Predict button
    document.getElementById('predictBtn').addEventListener('click', predictAllFailures);
    
    // Reset button
    document.getElementById('resetBtn').addEventListener('click', resetForm);
    
    // Auto-fill button
    document.getElementById('autoFillBtn').addEventListener('click', autoFillSystemData);
    
    // Training buttons
    document.getElementById('trainWearoutBtn').addEventListener('click', () => trainModel('wearout'));
    document.getElementById('trainControllerBtn').addEventListener('click', () => trainModel('controller'));
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
}

async function autoFillSystemData() {
    const button = document.getElementById('autoFillBtn');
    const originalText = button.innerHTML;
    
    button.innerHTML = '<span class="loading"></span> Scanning...';
    button.disabled = true;
    
    const statusElement = document.getElementById('autoFillStatus');
    statusElement.innerHTML = '<p><i class="fas fa-search"></i> Scanning system for NVMe drive info...</p>';
    statusElement.style.color = '#f39c12';
    
    try {
        const response = await fetch(`${API_BASE_URL}/system-info`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            // Fill the form with retrieved data
            Object.entries(result.data).forEach(([feature, value]) => {
                const input = document.getElementById(feature);
                if (input && value !== null && value !== undefined) {
                    input.value = value;
                }
            });
            
            // Save the current input data
            saveCurrentInputData();
            
            statusElement.innerHTML = `
                <p><i class="fas fa-check-circle"></i> System info retrieved successfully!</p>
                <p><i class="fas fa-thermometer"></i> Temperature threshold: ${result.temp_threshold}°C</p>
                <p class="auto-fill-note">Click "Predict All Failures" to analyze</p>
            `;
            statusElement.style.color = '#27ae60';
            
            // Store temp threshold for thermal prediction
            if (result.temp_threshold) {
                window.tempThreshold = result.temp_threshold;
                console.log(`Temperature threshold set to: ${window.tempThreshold}°C`);
            }
            
        } else {
            throw new Error(result.message || 'Failed to retrieve system info');
        }
        
    } catch (error) {
        console.error('Error auto-filling:', error);
        
        // Provide sample data as fallback
        provideSampleData();
        
        statusElement.innerHTML = `
            <p><i class="fas fa-exclamation-triangle"></i> Could not scan system. Using sample data instead.</p>
            <p class="auto-fill-note">${error.message}</p>
        `;
        statusElement.style.color = '#f39c12';
        
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

function provideSampleData() {
    // Sample realistic NVMe data
    const sampleData = {
        'Power_On_Hours': 15000,
        'Total_TBW_TB': 245.7,
        'Total_TBR_TB': 198.3,
        'Temperature_C': 47.5,
        'Percent_Life_Used': 65.2,
        'Media_Errors': 1,
        'Unsafe_Shutdowns': 2,
        'CRC_Errors': 0,
        'Read_Error_Rate': 3.7,
        'Write_Error_Rate': 2.4
    };
    
    // Fill the form with sample data
    Object.entries(sampleData).forEach(([feature, value]) => {
        const input = document.getElementById(feature);
        if (input) {
            input.value = value;
        }
    });
    
    // Save the current input data
    saveCurrentInputData();
    
    // Set a default temp threshold
    window.tempThreshold = 84;
    console.log(`Using default temperature threshold: ${window.tempThreshold}°C`);
}

async function predictAllFailures() {
    const inputData = collectInputData();
    
    if (!validateInputs(inputData)) {
        showError('Please fill all fields with valid numbers');
        return;
    }
    
    showLoading(true);
    
    try {
        // Send temp threshold if available
        const payload = {
            ...inputData,
            ...(window.tempThreshold && { temp_threshold: window.tempThreshold })
        };
        
        const response = await fetch(`${API_BASE_URL}/predict`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const results = await response.json();
        if (!results.success) {
            throw new Error(results.error || 'Prediction failed');
        }
        
        displayResults(results.results, inputData);
        
    } catch (error) {
        console.error('Error predicting:', error);
        showError('Failed to get predictions. Please try again.');
    } finally {
        showLoading(false);
    }
}

function collectInputData() {
    const inputs = {};
    const inputElements = document.querySelectorAll('#inputForm input');
    
    inputElements.forEach(input => {
        const value = parseFloat(input.value);
        inputs[input.id] = isNaN(value) ? 0 : value;
    });
    
    return inputs;
}

function validateInputs(data) {
    return Object.values(data).every(value => 
        typeof value === 'number' && !isNaN(value) && isFinite(value)
    );
}

function displayResults(results, inputData) {
    // Display summary
    displaySummary(results.summary);
    
    // Display individual predictions
    displayPrediction('wearout', results.wearout, inputData);
    displayPrediction('thermal', results.thermal, inputData);
    displayPrediction('power', results.power, inputData);
    displayPrediction('controller', results.controller, inputData);
    
    // Switch to summary tab
    switchTab('summary');
}

function displaySummary(summary) {
    const statusElement = document.getElementById('overallStatus');
    const riskMeters = document.getElementById('riskMeters');
    const recommendationsList = document.getElementById('recommendationsList');
    
    // Update overall status
    statusElement.innerHTML = `
        <i class="fas ${summary.overall_risk >= 50 ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>
        ${summary.status}
    `;
    
    // Update risk class
    statusElement.className = 'status-healthy';
    if (summary.overall_risk > 50) statusElement.className = 'status-warning';
    if (summary.overall_risk > 70) statusElement.className = 'status-danger';
    
    // Update risk meters
    riskMeters.innerHTML = '';
    Object.entries(summary.predictions).forEach(([type, risk]) => {
        const meterHtml = `
            <div class="risk-meter">
                <h4>${type}</h4>
                <div class="speed-meter-small">
                    <div class="speed-meter-track">
                        <div class="speed-meter-fill" style="width: ${risk}%"></div>
                    </div>
                    <div class="speed-meter-value">${risk.toFixed(1)}%</div>
                </div>
                <div class="meter-label">${risk < 50 ? 'Low' : risk < 70 ? 'Medium' : 'High'} Risk</div>
            </div>
        `;
        riskMeters.innerHTML += meterHtml;
    });
    
    // Update recommendations
    recommendationsList.innerHTML = '';
    summary.recommendation.forEach(rec => {
        const li = document.createElement('li');
        li.textContent = rec;
        recommendationsList.appendChild(li);
    });
}

function displayPrediction(type, data, inputData) {
    // Update risk indicator
    const riskValueElement = document.getElementById(`${type}RiskIndicator`).querySelector('.risk-value');
    const riskPercentage = data.risk_percentage || 0;
    riskValueElement.textContent = `${riskPercentage.toFixed(1)}%`;
    
    // Update linear meter
    const meterFill = document.getElementById(`${type}Meter`).querySelector('.meter-fill');
    meterFill.style.width = `${Math.min(riskPercentage, 100)}%`;
    
    // Update speed meter
    updateSpeedMeter(type, riskPercentage);
    
    // Update radar chart with input data
    updateRadarChart(type, inputData);
    
    // Display top 5 contributions as speed meters
    displayTopContributions(type, data.contributions);
}

function updateSpeedMeter(type, riskPercentage) {
    const needle = document.getElementById(`${type}Needle`);
    const meterValue = document.getElementById(`${type}SpeedMeterValue`);
    
    if (!needle || !meterValue) return;
    
    // Update value display
    meterValue.textContent = `${riskPercentage.toFixed(1)}%`;
    
    // Calculate needle rotation (-135deg to 135deg)
    const minAngle = -135;
    const maxAngle = 135;
    const angle = minAngle + (riskPercentage / 100) * (maxAngle - minAngle);
    
    // Update needle rotation
    needle.style.transform = `rotate(${angle}deg)`;
    
    // Update value color based on risk
    let color;
    if (riskPercentage < 30) {
        color = '#27ae60'; // Green
    } else if (riskPercentage < 70) {
        color = '#f39c12'; // Orange
    } else {
        color = '#e74c3c'; // Red
    }
    
    meterValue.style.color = color;
}

function updateRadarChart(type, inputData) {
    const chartId = `${type}Radar`;
    const chart = radarCharts[chartId];
    
    if (!chart) return;
    
    // Convert input data to normalized values for radar chart
    const normalizedValues = Object.values(inputData).map((value, index) => 
        normalizeFeatureValue(value, index)
    );
    
    // Update chart data
    chart.data.datasets[0].data = normalizedValues;
    chart.update();
}

function displayTopContributions(type, contributions) {
    const container = document.getElementById(`${type}Contributions`);
    
    if (!contributions || Object.keys(contributions).length === 0) {
        container.innerHTML = `
            <div class="contribution-item">
                <div class="contribution-info">
                    <span class="contribution-name">No data available</span>
                    <span class="contribution-value">0%</span>
                </div>
                <div class="speed-meter-mini">
                    <div class="speed-meter-track-mini">
                        <div class="speed-meter-fill-mini" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    // Get top 5 contributions
    const sortedContributions = Object.entries(contributions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    let html = '';
    
    sortedContributions.forEach(([feature, percentage]) => {
        const formattedFeature = formatLabel(feature);
        const barWidth = Math.min(percentage, 100);
        
        // Determine color based on percentage
        let barColor = '#3498db'; // Blue for low
        if (percentage > 30) barColor = '#f39c12'; // Orange for medium
        if (percentage > 60) barColor = '#e74c3c'; // Red for high
        
        html += `
            <div class="contribution-item">
                <div class="contribution-info">
                    <span class="contribution-name">${formattedFeature}</span>
                    <span class="contribution-value">${percentage.toFixed(1)}%</span>
                </div>
                <div class="speed-meter-mini">
                    <div class="speed-meter-track-mini">
                        <div class="speed-meter-fill-mini" style="width: ${barWidth}%; background: ${barColor}"></div>
                    </div>
                    <div class="speed-meter-mini-labels">
                        <span>0</span>
                        <span>50</span>
                        <span>100</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function trainModel(modelType) {
    const button = document.getElementById(`train${modelType.charAt(0).toUpperCase() + modelType.slice(1)}Btn`);
    const originalText = button.innerHTML;
    
    button.innerHTML = '<span class="loading"></span> Training...';
    button.disabled = true;
    
    const statusElement = document.getElementById('trainingStatus');
    statusElement.innerHTML = `<p>Training ${modelType} model... This may take a minute or two.</p>`;
    statusElement.style.color = '#f39c12';
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout
        
        const response = await fetch(`${API_BASE_URL}/train/${modelType}`, {
            method: 'POST',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.result && result.result.status === 'success') {
            statusElement.innerHTML = `
                <p><i class="fas fa-check-circle"></i> ${modelType} model trained successfully!</p>
                <p>Accuracy: ${(result.result.accuracy * 100).toFixed(2)}%</p>
            `;
            statusElement.style.color = '#27ae60';
        } else {
            throw new Error(result.message || result.error || 'Training failed');
        }
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`Error training ${modelType} model: Request timed out`);
            statusElement.innerHTML = `<p><i class="fas fa-times-circle"></i> Error: Training took too long. Please try again.</p>`;
        } else {
            console.error(`Error training ${modelType} model:`, error);
            statusElement.innerHTML = `<p><i class="fas fa-times-circle"></i> Error: ${error.message}</p>`;
        }
        statusElement.style.color = '#e74c3c';
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

function resetForm() {
    populateDefaultValues();
    
    // Reset all displays
    document.getElementById('overallStatus').innerHTML = 
        '<i class="fas fa-check-circle"></i> No analysis performed yet';
    document.getElementById('overallStatus').className = 'status-healthy';
    
    // Reset meters and charts
    ['wearout', 'thermal', 'power', 'controller'].forEach(type => {
        // Reset linear meter
        const meterFill = document.getElementById(`${type}Meter`);
        if (meterFill) {
            meterFill.querySelector('.meter-fill').style.width = '0%';
        }
        
        // Reset risk indicator
        const riskIndicator = document.getElementById(`${type}RiskIndicator`);
        if (riskIndicator) {
            riskIndicator.querySelector('.risk-value').textContent = '0%';
        }
        
        // Reset speed meter
        const needle = document.getElementById(`${type}Needle`);
        const speedMeterValue = document.getElementById(`${type}SpeedMeterValue`);
        if (needle) {
            needle.style.transform = 'rotate(-135deg)';
        }
        if (speedMeterValue) {
            speedMeterValue.textContent = '0%';
            speedMeterValue.style.color = '#27ae60';
        }
        
        // Reset radar chart
        const chart = radarCharts[`${type}Radar`];
        if (chart) {
            chart.data.datasets[0].data = Object.values(featureDefaults).map(v => normalizeFeatureValue(v, 0));
            chart.update();
        }
        
        // Reset contributions
        const contributionsContainer = document.getElementById(`${type}Contributions`);
        if (contributionsContainer) {
            contributionsContainer.innerHTML = `
                <div class="contribution-item">
                    <div class="contribution-info">
                        <span class="contribution-name">No data</span>
                        <span class="contribution-value">0%</span>
                    </div>
                    <div class="speed-meter-mini">
                        <div class="speed-meter-track-mini">
                            <div class="speed-meter-fill-mini" style="width: 0%"></div>
                        </div>
                        <div class="speed-meter-mini-labels">
                            <span>0</span>
                            <span>50</span>
                            <span>100</span>
                        </div>
                    </div>
                </div>
            `;
        }
    });
    
    // Reset recommendations
    document.getElementById('recommendationsList').innerHTML = 
        '<li>Enter drive parameters and click "Predict All Failures"</li>';
    
    document.getElementById('riskMeters').innerHTML = '';
    
    // Reset auto-fill status
    document.getElementById('autoFillStatus').innerHTML = '';
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Show selected tab content
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === tabName);
    });
}

function showLoading(show) {
    const button = document.getElementById('predictBtn');
    if (show) {
        button.innerHTML = '<span class="loading"></span> Predicting...';
        button.disabled = true;
    } else {
        button.innerHTML = '<i class="fas fa-chart-line"></i> Predict All Failures';
        button.disabled = false;
    }
}

function showError(message) {
    alert(`Error: ${message}`);
}