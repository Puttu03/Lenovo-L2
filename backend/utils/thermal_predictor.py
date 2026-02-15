import math

class ThermalPredictor:

    def predict_with_threshold(self, input_df, temp_threshold):
        """Predict thermal failure using dynamic temperature threshold"""

        row = input_df.iloc[0]

        temperature = float(row.get('Temperature_C', 45))
        power_hours = float(row.get('Power_On_Hours', 10000))
        life_used = float(row.get('Percent_Life_Used', 50))

        # Temperature stress ratio
        temp_ratio = temperature / temp_threshold if temp_threshold > 0 else 0.5

        # Dynamic temperature stress scale
        if temp_ratio < 0.4:
            temp_stress = 0.05
        elif temp_ratio < 0.5:
            temp_stress = 0.10
        elif temp_ratio < 0.6:
            temp_stress = 0.20
        elif temp_ratio < 0.7:
            temp_stress = 0.35
        elif temp_ratio < 0.75:
            temp_stress = 0.50
        elif temp_ratio < 0.8:
            temp_stress = 0.65
        elif temp_ratio < 0.85:
            temp_stress = 0.80
        elif temp_ratio < 0.9:
            temp_stress = 0.90
        elif temp_ratio < 0.95:
            temp_stress = 0.97
        else:
            temp_stress = 1.00

        # Age stress
        age_stress = math.log10(1 + power_hours) / math.log10(1 + 50000)
        age_stress = min(age_stress, 1.0)

        # Wear stress
        wear_stress = min(life_used / 100, 1.0)

        # Weighted contributions
        temp_contrib = 0.5 * temp_stress
        age_contrib = 0.3 * age_stress
        wear_contrib = 0.2 * wear_stress

        total_risk = temp_contrib + age_contrib + wear_contrib

        contributions = {}
        if total_risk > 0:
            contributions = {
                'Temperature_C': round((temp_contrib / total_risk) * 100, 2),
                'Power_On_Hours': round((age_contrib / total_risk) * 100, 2),
                'Percent_Life_Used': round((wear_contrib / total_risk) * 100, 2)
            }

        return {
            'risk_percentage': round(total_risk * 100, 2),
            'contributions': contributions,
            'status': 'High Risk' if total_risk * 100 > 50 else 'Normal',
            'temp_threshold_used': temp_threshold
        }

    def predict(self, input_df):
        """Fallback default threshold"""
        return self.predict_with_threshold(input_df, 84)
