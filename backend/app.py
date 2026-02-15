from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import os
import traceback
import warnings
import shutil

warnings.filterwarnings('ignore')

# -------------------------------
# Import Predictors
# -------------------------------

try:
    from utils.wearout_predictor import WearoutPredictor
    from utils.thermal_predictor import ThermalPredictor
    from utils.power_predictor import PowerPredictor
    from utils.controller_predictor import ControllerPredictor
    from system_info_extractor import get_system_info

    wearout_predictor = WearoutPredictor()
    thermal_predictor = ThermalPredictor()
    power_predictor = PowerPredictor()
    controller_predictor = ControllerPredictor()

    PREDICTORS_LOADED = True
    print("✓ Predictors loaded successfully")

except Exception as e:
    print(f"⚠️ Predictor loading failed: {e}")
    PREDICTORS_LOADED = False

    class FallbackPredictor:
        def predict(self, df):
            return {
                "risk_percentage": 25.0,
                "contributions": {"Fallback": 100},
                "status": "Fallback Mode"
            }

    wearout_predictor = thermal_predictor = power_predictor = controller_predictor = FallbackPredictor()

# -------------------------------
# App Init
# -------------------------------

app = Flask(__name__)
CORS(app)

DEFAULT_TEMP_THRESHOLD = 84

FEATURES = [
    "Power_On_Hours",
    "Total_TBW_TB",
    "Total_TBR_TB",
    "Temperature_C",
    "Percent_Life_Used",
    "Media_Errors",
    "Unsafe_Shutdowns",
    "CRC_Errors",
    "Read_Error_Rate",
    "Write_Error_Rate"
]

# -------------------------------
# Routes
# -------------------------------

@app.route('/')
def index():
    return jsonify({
        "message": "NVMe Failure Prediction API",
        "status": "running"
    })

# -------------------------------
# Features Endpoint
# -------------------------------

@app.route('/api/features', methods=['GET'])
def get_features():
    """Return list of features and default values for the frontend"""
    try:
        features = [
            "Power_On_Hours",
            "Total_TBW_TB",
            "Total_TBR_TB",
            "Temperature_C",
            "Percent_Life_Used",
            "Media_Errors",
            "Unsafe_Shutdowns",
            "CRC_Errors",
            "Read_Error_Rate",
            "Write_Error_Rate"
        ]
        
        # Default values for initialization
        defaults = {
            "Power_On_Hours": 1000,
            "Total_TBW_TB": 50.0,
            "Total_TBR_TB": 40.0,
            "Temperature_C": 35.0,
            "Percent_Life_Used": 5.0,
            "Media_Errors": 0,
            "Unsafe_Shutdowns": 0,
            "CRC_Errors": 0,
            "Read_Error_Rate": 0.5,
            "Write_Error_Rate": 0.3
        }
        
        return jsonify({
            "success": True,
            "features": features,
            "defaults": defaults
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# -------------------------------
# System Info Endpoint
# -------------------------------

@app.route('/api/system-info', methods=['GET'])
def system_info():
    try:
        result = get_system_info()
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# -------------------------------
# Prediction Endpoint
# -------------------------------

@app.route('/api/predict', methods=['POST'])
def predict():

    try:
        if not request.is_json:
            return jsonify({"success": False, "error": "JSON required"}), 400

        data = request.get_json()

        # Validate input
        input_df = pd.DataFrame([data])

        for feature in FEATURES:
            if feature not in input_df.columns:
                input_df[feature] = 0

        results = {}

        # ---------------- Wearout ----------------
        try:
            results['wearout'] = wearout_predictor.predict(input_df)
        except:
            results['wearout'] = {
                "risk_percentage": 25,
                "contributions": {"Power_On_Hours": 50, "Percent_Life_Used": 50},
                "status": "Fallback"
            }

        # ---------------- Thermal (AUTO threshold) ----------------
        try:
            system_info_data = get_system_info()
            temp_threshold = system_info_data.get("temp_threshold", DEFAULT_TEMP_THRESHOLD)

            if hasattr(thermal_predictor, "predict_with_threshold"):
                results['thermal'] = thermal_predictor.predict_with_threshold(
                    input_df,
                    temp_threshold
                )
            else:
                results['thermal'] = thermal_predictor.predict(input_df)

        except Exception as e:
            results['thermal'] = {
                "risk_percentage": 25,
                "contributions": {"Temperature_C": 100},
                "status": "Thermal fallback"
            }

        # ---------------- Power ----------------
        try:
            results['power'] = power_predictor.predict(input_df)
        except:
            results['power'] = {
                "risk_percentage": 20,
                "contributions": {"Unsafe_Shutdowns": 100},
                "status": "Fallback"
            }

        # ---------------- Controller ----------------
        try:
            results['controller'] = controller_predictor.predict(input_df)
        except:
            results['controller'] = {
                "risk_percentage": 20,
                "contributions": {"Media_Errors": 50, "CRC_Errors": 50},
                "status": "Fallback"
            }

        # ---------------- Summary ----------------
        results["summary"] = generate_summary(results)

        results["metadata"] = {
            "timestamp": pd.Timestamp.now().isoformat(),
            "predictors_loaded": PREDICTORS_LOADED
        }

        return jsonify({
            "success": True,
            "results": results
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


# -------------------------------
# Summary Generator
# -------------------------------

def generate_summary(results):

    predictions = {
        "Wear-Out": results["wearout"]["risk_percentage"],
        "Thermal": results["thermal"]["risk_percentage"],
        "Power": results["power"]["risk_percentage"],
        "Controller": results["controller"]["risk_percentage"]
    }

    highest = max(predictions.items(), key=lambda x: x[1])

    if highest[1] < 50:
        status = "Healthy"
    elif highest[1] < 70:
        status = "Warning"
    else:
        status = "Critical"

    # Generate recommendations based on risk levels
    recommendations = []
    if highest[1] >= 70:
        recommendations.append("Immediate backup recommended")
        recommendations.append("Consider drive replacement")
        recommendations.append("Monitor system closely")
    elif highest[1] >= 50:
        recommendations.append("Backup data soon")
        recommendations.append("Monitor drive health regularly")
        recommendations.append("Consider preventive maintenance")
    else:
        recommendations.append("Drive health is good")
        recommendations.append("Continue regular monitoring")
        recommendations.append("No immediate action required")

    return {
        "status": status,
        "overall_risk": highest[1],
        "predictions": predictions,
        "recommendation": recommendations,
        "highest_risk": highest[0],
        "risk_percentage": highest[1]
    }


# -------------------------------
# Training Endpoints
# -------------------------------

@app.route('/api/train/wearout', methods=['POST'])
def train_wearout():
    """Train the wearout prediction model"""
    try:
        result = wearout_predictor.train_model()
        return jsonify({
            "success": True,
            "result": result
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/api/train/controller', methods=['POST'])
def train_controller():
    """Train the controller prediction model"""
    try:
        result = controller_predictor.train_model()
        return jsonify({
            "success": True,
            "result": result
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# -------------------------------
# Health Check
# -------------------------------

@app.route('/api/health')
def health():
    return jsonify({
        "status": "healthy",
        "predictors_loaded": PREDICTORS_LOADED,
        "smartctl_available": shutil.which("smartctl") is not None
    })


# -------------------------------
# Run Server
# -------------------------------

if __name__ == "__main__":

    print("\nNVMe Failure Prediction Backend")
    print("Running on http://localhost:8080\n")

    app.run(
        debug=True,
        port=8080,
        host="0.0.0.0"
    )
