import subprocess
import shutil
import re

DEFAULT_TEMP_THRESHOLD = 84

def get_system_info():
    try:
        smartctl_path = shutil.which("smartctl")

        if smartctl_path is None:
            return {
                'success': False,
                'data': None,
                'temp_threshold': DEFAULT_TEMP_THRESHOLD,
                'message': 'smartctl not installed'
            }

        cmd = [smartctl_path, "-a", "-d", "nvme", "/dev/disk0"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        output = result.stdout

        data = {
            "Power_On_Hours": 0,
            "Total_TBW_TB": 0,
            "Total_TBR_TB": 0,
            "Temperature_C": 45,
            "Percent_Life_Used": 25,
            "Media_Errors": 0,
            "Unsafe_Shutdowns": 0,
            "CRC_Errors": 0,
            "Read_Error_Rate": 0,
            "Write_Error_Rate": 0
        }

        temp_threshold = DEFAULT_TEMP_THRESHOLD

        for line in output.splitlines():

            if "Temperature:" in line:
                match = re.search(r"(\d+)", line)
                if match:
                    data["Temperature_C"] = int(match.group(1))

            elif "Percentage Used:" in line:
                match = re.search(r"(\d+)", line)
                if match:
                    data["Percent_Life_Used"] = int(match.group(1))

            elif "Data Units Written:" in line:
                units = int(re.findall(r"\d+", line.replace(",", ""))[0])
                data["Total_TBW_TB"] = round(units * 512000 / 1e12, 2)

            elif "Data Units Read:" in line:
                units = int(re.findall(r"\d+", line.replace(",", ""))[0])
                data["Total_TBR_TB"] = round(units * 512000 / 1e12, 2)

            elif "Power On Hours:" in line:
                data["Power_On_Hours"] = int(re.findall(r"\d+", line)[0])

            elif "Unsafe Shutdowns:" in line:
                data["Unsafe_Shutdowns"] = int(re.findall(r"\d+", line)[0])

            elif "Media and Data Integrity Errors:" in line:
                data["Media_Errors"] = int(re.findall(r"\d+", line)[0])

            elif "CRC Errors:" in line:
                data["CRC_Errors"] = int(re.findall(r"\d+", line)[0])

        # Extract threshold OUTSIDE loop
        match = re.search(
            r"Warning\s+Comp\.\s+Temp\.\s+Threshold:\s+(\d+)\s*([CF])",
            output,
            re.IGNORECASE
        )

        if match:
            value = int(match.group(1))
            unit = match.group(2).upper()

            if unit == "F":
                temp_threshold = round((value - 32) * 5 / 9, 2)
            else:
                temp_threshold = value

        return {
            'success': True,
            'data': data,
            'temp_threshold': temp_threshold,
            'message': 'System info extracted'
        }

    except Exception as e:
        return {
            'success': False,
            'data': None,
            'temp_threshold': DEFAULT_TEMP_THRESHOLD,
            'message': str(e)
        }
