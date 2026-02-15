import pandas as pd
import math

class PowerPredictor:
    def predict(self, input_df, max_unsafe_shutdowns=10, max_crc_errors=20,
                max_write_error_rate=50, max_media_errors=10,
                max_power_on_hours=50000):
        
        row = input_df.iloc[0]
        
        # Extract values
        unsafe = float(row.get('Unsafe_Shutdowns', 0))
        crc = float(row.get('CRC_Errors', 0))
        write_err = float(row.get('Write_Error_Rate', 0))
        media_err = float(row.get('Media_Errors', 0))
        poh = float(row.get('Power_On_Hours', 10000))
        
        # Normalize scores (0-1)
        unsafe_score = min(unsafe / max_unsafe_shutdowns, 1.0)
        crc_score = min(crc / max_crc_errors, 1.0)
        write_score = min(write_err / max_write_error_rate, 1.0)
        media_score = min(media_err / max_media_errors, 1.0)
        
        poh_score = math.log10(1 + poh) / math.log10(1 + max_power_on_hours)
        poh_score = min(poh_score, 1.0)
        
        # Weighted contributions
        unsafe_contrib = 0.35 * unsafe_score
        crc_contrib = 0.20 * crc_score
        write_contrib = 0.15 * write_score
        media_contrib = 0.15 * media_score
        poh_contrib = 0.15 * poh_score
        
        total_risk = unsafe_contrib + crc_contrib + write_contrib + media_contrib + poh_contrib
        
        # Contributions
        contributions = {}
        if total_risk > 0:
            contributions = {
                'Unsafe_Shutdowns': (unsafe_contrib / total_risk) * 100,
                'CRC_Errors': (crc_contrib / total_risk) * 100,
                'Write_Error_Rate': (write_contrib / total_risk) * 100,
                'Media_Errors': (media_contrib / total_risk) * 100,
                'Power_On_Hours': (poh_contrib / total_risk) * 100
            }
        
        return {
            'risk_percentage': float(total_risk * 100),
            'contributions': contributions,
            'status': 'High Risk' if total_risk * 100 > 50 else 'Normal'
        }