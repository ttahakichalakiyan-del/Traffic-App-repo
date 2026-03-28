# CTPL App Installation Guide

## IT Admin ke liye Step-by-Step Guide

---

### STEP 1: Unknown Sources Enable Karein

**Android 8.0 aur upar (2017+):**
1. Settings > Apps > [Browser ya File Manager]
2. "Install unknown apps" > Allow from this source: ON

**Samsung:**
Settings > Biometrics and Security > Install Unknown Apps

**Xiaomi/Redmi:**
Settings > Additional Settings > Privacy > Unknown Sources: ON

**Infinix:**
Settings > Security > Unknown Sources: ON

---

### STEP 2: DSP Command App Install Karein

1. APK file phone mein copy karein (USB ya WhatsApp)
   File: `ctpl_dsp_command_v1.0.0_[date].apk`
2. File Manager mein file dhundein
3. Tap karein > Install
4. "Install anyway" agar warning aaye

**Login credentials:**
- Username: [admin panel se milega]
- Password: [admin ne WhatsApp kiya hoga]

---

### STEP 3: Staff GPS App Install Karein

Same process — file: `ctpl_staff_gps_v1.0.0_[date].apk`

**Login credentials:**
- Badge ID: [staff ka badge number]
- PIN: [4 digit PIN — admin ne set kiya]

---

### STEP 4: CRITICAL — Permissions Setup (Staff App)

**Yeh steps HAR phone pe manually karne hain:**

#### Location — Background:
Settings > Apps > CTPL Staff > Permissions > Location
**"Allow all the time"** select karein
*(Sirf "While using app" NAHI chalega)*

#### Battery Optimization OFF:

**Samsung:**
Settings > Device Care > Battery > App Power Management
CTPL Staff > Unrestricted

**Xiaomi/Redmi/POCO:**
Settings > Apps > Manage Apps > CTPL Staff
Battery Saver > No Restrictions

**Infinix:**
Settings > Battery > Power Saving Exclusions
CTPL Staff add karein

**Other Android:**
Settings > Battery > Battery Optimization
"All Apps" > CTPL Staff > Don't Optimize

#### Autostart Enable (Xiaomi only):
Security App > Autostart > CTPL Staff: ON

---

### STEP 5: GPS Test Karein

Staff App open karein > Permissions screen > **"GPS Test Karein"**

Bahar jayein agar GPS nahi mil raha (indoor coverage weak hoti hai)

Green check aana chahiye ✓

---

### Troubleshooting

| Masla | Wajah | Hall |
|-------|-------|------|
| GPS track nahi ho raha (phone lock ke baad) | Battery optimization off nahi hua | Settings > Apps > CTPL Staff > Battery: Unrestricted |
| App band ho jati hai | Autostart off hai (Xiaomi) | Security App > Autostart enable karein |
| Location galat dikh raha hai | Normal GPS accuracy error | Outdoor areas mein accuracy behtar hoti hai (30-50m normal hai) |
| Login nahi ho raha | Badge ID ya PIN galat | Leading zeros check karein (001 ya 1?), admin se reset karwayein |
