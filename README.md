# ✅ Requirement (Important)

Before running this code, make sure **Smartmontools / smartctl** is already installed on your system.

---
# Windows SMART Extraction Fix (system_info_extractor.py)

⚠️ **Note:** The current SMART extraction code is only suitable for **macOS**.

✅ If you want to run this project on **Windows**, go to the file:

and **replace the existing code** with the following updated code:

---
## ✅ Updated `system_info_extractor.py` Code (Windows Version)

```python
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

        # UPDATED COMMAND (Windows/Linux format)
        cmd = [smartctl_path, "-a", "/dev/sda"]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            shell=False
        )

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
```

# 🚀 Run Project Locally (Backend + Frontend)

## ✅ Terminal 1: Start Backend Server
Open a terminal and run:

```bash
cd backend
python app.py
```
## ✅ Terminal 2: Start Frontend Server
Open another terminal and run:

```bash
cd frontend
python -m http.server 8000
```

## 🌐 Open Website in Browser
After both servers are running, open:

```bash
http://localhost:8000/
```
# Here are some Screenshots of the web page

## web page before data is entered
<img width="1640" height="1300" alt="image" src="https://github.com/user-attachments/assets/da6cfff9-db4d-4073-a464-71b2875cb3ed" />

## web page when Auto-Fill System data is clicked
<img width="1626" height="1380" alt="image" src="https://github.com/user-attachments/assets/73c0b606-2880-4310-9987-e3934632b9cc" />

## web page when data is entered and predict all features is clicked
<img width="1620" height="1396" alt="image" src="https://github.com/user-attachments/assets/6be36a76-2f53-43d0-88d9-c8e92c10dc7e" />






