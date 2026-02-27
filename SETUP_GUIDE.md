# 📘 Keycloak MFA Setup Guide

> **Target Audience:** Developers & DevOps Engineers setting up Local Keycloak environments.
> **Objective:** A complete, step-by-step graphical guide to set up Keycloak with TOTP and Email OTP authentication on Ubuntu 22.04.

---

## 🗺️ Roadmap / Table of Contents

| Phase | Description | Goal |
| :---: | :--- | :--- |
| **[1](#phase-1--install-java--keycloak)** | **Install Core Stack** | Get Java & Keycloak running |
| **[2](#phase-2--create-realm-client--user)**| **Core Configuration** | Setup Realms, Clients, Users |
| **[3](#phase-3--configure-smtp)** | **SMTP Integration** | Enable email delivery capabilities |
| **[4](#phase-4--enable-totp)** | **TOTP Config** | Enable App-based authentication |
| **[5](#phase-5--deploy-email-otp-plugin)** | **Custom Plugin** | Add Email OTP functionality via SPI |
| **[6](#phase-6--configure-authentication-flows)**| **Auth Flow Design**| Wire up the UI login workflow |
| **[7](#phase-7--demo-application-setup)** | **Demo App Setup** | Connect a Node.js App to Keycloak |
| **[8](#phase-8--testing-the-complete-flow)** | **Validation** | Verify the entire login process works |

---
## 📂 Quick Navigation
- [Troubleshooting](#-troubleshooting)
- [Keycloak Folder Structure](#-keycloak-folder-structure)
---

## Phase 1 — Install Java & Keycloak ☕

### 1.1 Install OpenJDK 21
> **Requirement:** Keycloak 26.x strictly requires Java 21.

```bash
sudo apt update
sudo apt install -y openjdk-21-jdk
```

**Optional:** If you have multiple Java versions, set `21` as default:
```bash
sudo update-alternatives --config java
# Select the java-21 option
```

**Verify Installation:**
```bash
java -version
# Expected Output: openjdk version "21.x.x"
```

### 1.2 Download & Install Keycloak

```bash
export KC_VERSION=26.1.0
cd ~
wget "https://github.com/keycloak/keycloak/releases/download/${KC_VERSION}/keycloak-${KC_VERSION}.tar.gz"

tar -xzf keycloak-${KC_VERSION}.tar.gz
sudo mv keycloak-${KC_VERSION} /opt/keycloak
```

### 1.3 Configure Environment & Start Server

Add paths to your `.bashrc`:
```bash
echo 'export KEYCLOAK_HOME=/opt/keycloak' >> ~/.bashrc
echo 'export PATH=$PATH:$KEYCLOAK_HOME/bin' >> ~/.bashrc
source ~/.bashrc
```

**Start Keycloak Development Server:**
```bash
export KEYCLOAK_ADMIN=admin
export KEYCLOAK_ADMIN_PASSWORD=admin123
/opt/keycloak/bin/kc.sh start-dev --http-port=8082
```
> ⚠️ **Note:** We use port `8082` to avoid conflicts with traditional `8080` services.

**✅ Validation:** Open [http://localhost:8082/admin](http://localhost:8082/admin) and log in with `admin` / `admin123`.

---

## Phase 2 — Create Realm, Client & User 🏢

We will establish our isolated environment (`local_demo`) here. 

### 2.1 Realm & Client Setup (GUI)

> 💡 **Tip:** A Realm manages a set of users, credentials, roles, and groups.

1. In Admin Console, click the top-left dropdown (usually says `master`).
2. Click **Create Realm**. Name it: `local_demo`.
3. In the left panel, go to **Clients** → **Create client**.
4. Configure Client:
   - **Client ID:** `demo-app`
   - **Client authentication:** `OFF` (Makes it a public client)
   - **Root URL / Web Origins:** `http://localhost:3000`
   - **Valid redirect URIs:** `http://localhost:3000/*`
5. Click **Save**.

### 2.2 User Registration

1. Go to **Users** → **Add user**.
2. Profile Settings:
   - **Username:** `testuser`
   - **Email:** `testuser@example.com`
   - **Email verified:** Toggle **ON**
3. Save, then navigate to the **Credentials** tab.
4. Click **Set password**:
   - **Password:** `test123`
   - **Temporary:** Toggle **OFF**
5. Save & Confirm.

---

## Phase 3 — Configure SMTP 📧

Required for sending Email OTPs. We use [Mailtrap](https://mailtrap.io/) for sandbox testing.

### Setup (Admin Console)
1. Navigate to **Realm settings** → **Email** tab (in `local_demo`).
2. Fill the configuration:

| Setting Field | Configuration Value |
| :--- | :--- |
| **From** | `keycloak@localdemo.com` |
| **Host** | `sandbox.smtp.mailtrap.io` |
| **Port** | `587` |
| **Enable StartTLS / Auth** | `ON` |
| **Username/Password** | `<your-mailtrap-credentials>` |

> 🚨 **Prerequisite before testing:** You must add an email address to the `admin` user in the `master` realm before clicking "Test Connection".

---

## Phase 4 — Enable TOTP 📱

### 4.1 Global Policy Setup
1. Go to **Authentication** → **Policies** tab → **OTP Policy**.
2. Configure attributes:
   - **OTP Type:** `totp`
   - **Digits:** `6` 
   - **Period:** `30` (seconds)

### 4.2 Enforce for Users
- **Enable the Action:** In **Authentication** → **Required Actions**, ensure `Configure OTP` is toggled ON.
- **Apply to User:** Go to **Users** → `testuser` → **Required user actions**, select `Configure OTP`, and Save.

---

## Phase 5 — Deploy Email OTP Plugin 🧩

We compile a custom SPI (Service Provider Interface) to handle Email-based codes.

### 5.1 Build the Plugin
```bash
cd ~
git clone https://github.com/5-stones/keycloak-email-otp.git
cd keycloak-email-otp

# Ensure compatibility with KC26
sed -i 's/22.0.5/26.1.0/' pom.xml
mvn clean install
```

### 5.2 Deploy & Reload
```bash
sudo cp target/*.jar /opt/keycloak/providers/
sudo rm -f /opt/keycloak/providers/original-*.jar  # Clean up old artifacts

# Restart Keycloak Process
/opt/keycloak/bin/kc.sh build
/opt/keycloak/bin/kc.sh start-dev --http-port=8082
```

---

## Phase 6 — Configure Authentication Flows 🔄

This defines the exact sequence a user experiences during login.

**Goal:** Require both Username/Password AND an Email OTP.

### Configuration Steps
1. Navigate to **Authentication** → **Flows** → **Create flow** (Name: `email-otp-flow`).
2. Replicate this exact visual structure using the **Add Step** and **Add sub-flow** buttons:

```text
⚙️ email-otp-flow
└── 🍪 Cookie                          [ALTERNATIVE]
└── 📁 login-forms (sub-flow)          [ALTERNATIVE]
    ├── 👤 Username Password Form      [REQUIRED]
    └── ✉️ Email TOTP Authentication   [REQUIRED]
```

### Final Polish
1. On the `Email TOTP Authentication` step, click the **⚙️ Gear Icon**.
   - Input `Alias:` `email-otp` (Crucial for operation)
   - Toggle `Simulation Mode:` `OFF`
2. **Bind the Flow:** Click the **⋮ (three dots)** next to `email-otp-flow` title → **Bind flow** → select **Browser flow**.

---

## Phase 7 — Demo Application Setup 💻

Establish a Node.js server acting as the Relying Party.

### 7.1 Setup Project
```bash
mkdir -p ~/demo-app && cd ~/demo-app
# Ensure you copy package.json and index.js into this folder
npm install
node index.js
```

> **Note:** Application runs successfully bridging `localhost:3000` to Keycloak's `localhost:8082`.

---

## Phase 8 — Testing the Complete Flow 🧪

1. **Clean Slate:** Open an **Incognito/Private** browser window to avoid lingering sessions.
2. **Access App:** Go to `http://localhost:3000` → click **"Login with Keycloak"**.
3. **Step 1 Auth:** Enter `testuser` / `test123`.
4. **Step 2 Auth (MFA):** The Email OTP prompt appears. 
5. **Verify:** Check your Mailtrap dashboard, retrieve the 6-digit code, enter it.
6. **Success!** You land on the authenticated App dashboard.

---

## 🛠 Troubleshooting

| Symptom | Diagnosis & Fix |
| :--- | :--- |
| **Port 8080 conflicts** | Ensure you append `--http-port=8082` to start command |
| **"Realm does not exist"** | Ensure variable/code references `local_demo`, not `local-demo` |
| **"Requires client_secret"** | Set `token_endpoint_auth_method: 'none'` in App code AND verify Client Authentication is OFF in KC |
| **Mail Sending Failed** | Did you add an `email-otp` alias in the flow configuration gear options? |
| **Directly logged in (No MFA)** | An old session cookie exists. Use Incognito Mode. |

---

## 📂 Keycloak Folder Structure

Understanding the underlying `/opt/keycloak` architecture:

```text
/opt/keycloak/
├── 📄 version.txt             # Keycloak version info
├── ⚙️ conf/                   # Configuration files (keycloak.conf)
├── 🗄️ data/                   # Runtime data (H2 DB stored here in dev)
├── 🎨 themes/                 # UI themes to customize login screens
├── 🧩 providers/              # Location for custom SPI JARs (.jar files go here!)
└── 🛠️ bin/                    # Executables
    ├── kc.sh                  # Main start script
    └── kcadm.sh               # CLI Admin tool 
```
