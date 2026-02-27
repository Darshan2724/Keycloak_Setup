# 📖 Keycloak MFA Setup Guide

A complete, step-by-step guide to set up Keycloak with TOTP and Email OTP authentication on Ubuntu 22.04.

---

## Table of Contents

1. [Phase 1 — Install Java & Keycloak](#phase-1--install-java--keycloak)
2. [Phase 2 — Create Realm, Client & User](#phase-2--create-realm-client--user)
3. [Phase 3 — Configure SMTP](#phase-3--configure-smtp)
4. [Phase 4 — Enable TOTP](#phase-4--enable-totp)
5. [Phase 5 — Deploy Email OTP Plugin](#phase-5--deploy-email-otp-plugin)
6. [Phase 6 — Configure Authentication Flows](#phase-6--configure-authentication-flows)
7. [Phase 7 — Demo Application Setup](#phase-7--demo-application-setup)
8. [Phase 8 — Testing the Complete Flow](#phase-8--testing-the-complete-flow)
9. [Troubleshooting](#troubleshooting)
10. [Keycloak Folder Structure](#keycloak-folder-structure)

---

## Phase 1 — Install Java & Keycloak

### 1.1 Install OpenJDK 21

Keycloak 26.x requires Java 21. If you have an older version, install 21 alongside it:

```bash
sudo apt update
sudo apt install -y openjdk-21-jdk
```

If you have multiple Java versions, set 21 as default:

```bash
sudo update-alternatives --config java
# Select the java-21 option
```

Verify:

```bash
java -version
# Should show: openjdk version "21.x.x"
```

### 1.2 Download Keycloak

```bash
export KC_VERSION=26.1.0
cd ~
wget "https://github.com/keycloak/keycloak/releases/download/${KC_VERSION}/keycloak-${KC_VERSION}.tar.gz"
```

### 1.3 Install Keycloak

```bash
tar -xzf keycloak-${KC_VERSION}.tar.gz
sudo mv keycloak-${KC_VERSION} /opt/keycloak
```

### 1.4 Configure Environment

```bash
echo 'export KEYCLOAK_HOME=/opt/keycloak' >> ~/.bashrc
echo 'export PATH=$PATH:$KEYCLOAK_HOME/bin' >> ~/.bashrc
source ~/.bashrc
```

### 1.5 Start Keycloak

```bash
export KEYCLOAK_ADMIN=admin
export KEYCLOAK_ADMIN_PASSWORD=admin123
/opt/keycloak/bin/kc.sh start-dev --http-port=8082
```

> ⚠️ We use port **8082** because 8080 may be occupied by other services.

### 1.6 Verify

Open **http://localhost:8082/admin** in your browser and log in with `admin` / `admin123`.

---

## Phase 2 — Create Realm, Client & User

### 2.1 Create Realm (GUI)

1. Open **http://localhost:8082/admin**
2. Click the **dropdown in the top-left** (says "Keycloak" or "master")
3. Click **Create Realm**
4. **Realm name:** `local_demo`
5. Click **Create**

### 2.2 Create Client (GUI)

1. Make sure you're in the `local_demo` realm (top-left dropdown)
2. Left sidebar → **Clients** → **Create client**
3. **Client ID:** `demo-app` → Click **Next**
4. **Client authentication:** `OFF` (public client) → Click **Next**
5. Set:
   - **Root URL:** `http://localhost:3000`
   - **Valid redirect URIs:** `http://localhost:3000/*`
   - **Web origins:** `http://localhost:3000`
6. Click **Save**

### 2.3 Create Test User (GUI)

1. Left sidebar → **Users** → **Add user**
2. Fill in:
   - **Username:** `testuser`
   - **Email:** `testuser@example.com`
   - **Email verified:** toggle **ON**
   - **First name:** `Test`, **Last name:** `User`
3. Click **Create**
4. Go to **Credentials** tab → **Set password**
   - **Password:** `test123`
   - **Temporary:** toggle **OFF**
   - Click **Save** → **Confirm**

### Alternative: Create via CLI

```bash
# Authenticate CLI
/opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8082 \
  --realm master \
  --user admin \
  --password admin123

# Create realm
/opt/keycloak/bin/kcadm.sh create realms \
  -s realm=local_demo \
  -s enabled=true

# Create client
/opt/keycloak/bin/kcadm.sh create clients \
  -r local_demo \
  -s clientId=demo-app \
  -s enabled=true \
  -s publicClient=true \
  -s 'redirectUris=["http://localhost:3000/*"]' \
  -s 'webOrigins=["http://localhost:3000"]' \
  -s standardFlowEnabled=true \
  -s directAccessGrantsEnabled=true

# Create user
/opt/keycloak/bin/kcadm.sh create users \
  -r local_demo \
  -s username=testuser \
  -s enabled=true \
  -s emailVerified=true \
  -s 'email=testuser@example.com' \
  -s firstName=Test \
  -s lastName=User

# Set password
/opt/keycloak/bin/kcadm.sh set-password \
  -r local_demo \
  --username testuser \
  --new-password test123
```

---

## Phase 3 — Configure SMTP

SMTP is required for Email OTP. We use **Mailtrap** for sandbox testing.

1. In Keycloak admin → `local_demo` realm → **Realm settings** → **Email** tab
2. Configure:

| Field | Value |
|---|---|
| **From** | `keycloak@localdemo.com` |
| **From display name** | `Keycloak Local` |
| **Host** | `sandbox.smtp.mailtrap.io` |
| **Port** | `587` |
| **Enable StartTLS** | `ON` |
| **Enable SSL** | `OFF` |
| **Authentication** | `ON` |
| **Username** | `<your-mailtrap-username>` |
| **Password** | `<your-mailtrap-password>` |

3. Before testing: add email to admin user:
   - Switch to **master** realm → **Users** → click **admin**
   - Set **Email:** `admin@localdemo.com` → **Save**
   - Switch back to `local_demo` realm
4. Click **Test connection** → should say "Email sent successfully"
5. Click **Save**

---

## Phase 4 — Enable TOTP

### 4.1 Configure OTP Policy

1. In `local_demo` realm → **Authentication** → **Policies** tab → **OTP Policy**
2. Set:
   - **OTP Type:** `totp`
   - **Number of Digits:** `6`
   - **Look Ahead Window:** `1`
   - **OTP Token Period:** `30`
3. Click **Save**

### 4.2 Enable Required Action

1. **Authentication** → **Required Actions** tab
2. Find **Configure OTP** → ensure it's **enabled** (toggle ON)

### 4.3 Force TOTP for a User

1. **Users** → click on a user → **Required user actions** → select **Configure OTP**
2. Click **Save**
3. Next login, the user will be prompted to set up TOTP via QR code scan

---

## Phase 5 — Deploy Email OTP Plugin

We use the [5-stones/keycloak-email-otp](https://github.com/5-stones/keycloak-email-otp) plugin.

### 5.1 Clone & Build

```bash
cd ~
git clone https://github.com/5-stones/keycloak-email-otp.git
cd keycloak-email-otp

# Update Keycloak version to match yours
sed -i 's/22.0.5/26.1.0/' pom.xml

# Build
mvn clean install
```

### 5.2 Deploy

```bash
# Copy JAR to Keycloak providers
sudo cp target/*.jar /opt/keycloak/providers/

# Remove duplicate JAR if present
sudo rm -f /opt/keycloak/providers/original-*.jar
```

### 5.3 Rebuild & Restart Keycloak

```bash
# Stop Keycloak (Ctrl+C in the Keycloak terminal)

# Rebuild
/opt/keycloak/bin/kc.sh build

# Start
export KEYCLOAK_ADMIN=admin
export KEYCLOAK_ADMIN_PASSWORD=admin123
/opt/keycloak/bin/kc.sh start-dev --http-port=8082
```

### 5.4 Verify

In Keycloak admin → **Authentication** → **Flows** → any flow → **Add step** → search for `Email TOTP`. You should see **"Email TOTP Authentication"** in the list.

---

## Phase 6 — Configure Authentication Flows

### 6.1 Create the Email OTP Flow

1. **Authentication** → **Flows** → **Create flow**
   - Name: `email-otp-flow`
   - Click **Create**

2. Add steps:

```
email-otp-flow
├── Cookie                          → ALTERNATIVE
├── login-forms (sub-flow)          → ALTERNATIVE
│   ├── Username Password Form      → REQUIRED
│   └── Email TOTP Authentication   → REQUIRED
```

Step by step:
- Click **Add step** → `Cookie` → Add → set **ALTERNATIVE**
- Click **Add sub-flow** → Name: `login-forms` → Add → set **ALTERNATIVE**
- Expand `login-forms`:
  - **Add step** → `Username Password Form` → Add → **REQUIRED**
  - **Add step** → `Email TOTP Authentication` → Add → **REQUIRED**

3. Configure Email TOTP: click the **⚙️ gear icon** next to it:
   - **Alias:** `email-otp`
   - **Simulation mode:** `OFF`
   - **Code length:** `6`
   - **Time-to-live:** `300`
   - Click **Save**

### 6.2 Bind the Flow

1. Click **⋮** (three dots) next to `email-otp-flow`
2. **Bind flow** → **Browser flow** → **Save**

### 6.3 Flow with TOTP (Alternative)

To let users use either TOTP or Email OTP, create a flow like:

```
mfa-flow
├── Cookie                              → ALTERNATIVE
├── mfa-forms (sub-flow)                → ALTERNATIVE
│   ├── Username Password Form          → REQUIRED
│   ├── mfa-options (sub-flow)          → REQUIRED
│   │   ├── OTP Form                    → ALTERNATIVE
│   │   └── Email TOTP Authentication   → ALTERNATIVE
```

This way, if the user has TOTP configured, they use the OTP Form. If not, they get the Email OTP.

---

## Phase 7 — Demo Application Setup

### 7.1 Create the App

```bash
mkdir -p ~/demo-app && cd ~/demo-app
```

### 7.2 Create `package.json`

```json
{
  "name": "keycloak-demo-app",
  "version": "1.0.0",
  "description": "Keycloak OIDC demo app with landing page",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "express-session": "^1.17.3",
    "openid-client": "^5.7.0"
  }
}
```

### 7.3 Create `index.js`

See the `demo-app/index.js` file in this repository. Key configuration:

```javascript
const KEYCLOAK_URL = 'http://localhost:8082';
const REALM = 'local_demo';
const CLIENT_ID = 'demo-app';
const REDIRECT_URI = 'http://localhost:3000/callback';
```

> **Important:** The `token_endpoint_auth_method` must be set to `'none'` since `demo-app` is a public client.

### 7.4 Install & Run

```bash
cd ~/demo-app
npm install
node index.js
# App runs at http://localhost:3000
```

---

## Phase 8 — Testing the Complete Flow

### 8.1 Test Email OTP

1. Open **http://localhost:3000** in an **Incognito/Private window**
2. Click **Login with Keycloak**
3. Enter `testuser` / `test123`
4. You should see the Email OTP form
5. Check your **Mailtrap inbox** (https://mailtrap.io) for the code
6. Enter the code → **Welcome, testuser!** 🎉

### 8.2 Test TOTP

1. In Keycloak admin → **Users** → `testuser` → **Required user actions** → add **Configure OTP**
2. Login again → you'll be prompted to scan a QR code with Google Authenticator
3. Enter the 6-digit code from the authenticator app → **Welcome, testuser!** 🎉

### 8.3 Test Logout

1. Click the **Logout** button on the Welcome page
2. You should be redirected back to the login page

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|---|---|
| **Port 8080 in use** | Use `--http-port=8082` when starting Keycloak |
| **"Realm does not exist"** | Check realm name in Keycloak admin matches `local_demo` |
| **"client_secret_basic requires a client_secret"** | Set `token_endpoint_auth_method: 'none'` in index.js AND ensure Client authentication is OFF in Keycloak |
| **"Connection security" warning** | Normal for HTTP — safe on localhost, just proceed |
| **Node.js "Unexpected token '.'"** | Upgrade Node.js to v14+ (`curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt install -y nodejs`) |
| **Email send failed** | Verify SMTP settings in Realm settings → Email tab, and configure Email TOTP alias |
| **TOTP not showing** | Add "Configure OTP" to user's Required user actions |
| **Login skips MFA** | Clear cookies / use Incognito. Check the auth flow is bound as Browser flow |

### Useful Commands

```bash
# Start Keycloak with debug logging
/opt/keycloak/bin/kc.sh start-dev --http-port=8082 \
  --log-level=org.keycloak.authentication:DEBUG

# Check Java version
java -version

# Check Keycloak providers
ls /opt/keycloak/providers/

# Keycloak admin CLI auth
/opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8082 \
  --realm master \
  --user admin \
  --password admin123
```

---

## Keycloak Folder Structure

```
/opt/keycloak/
├── bin/                    # Scripts (kc.sh, kcadm.sh)
│   ├── kc.sh               # Main startup script
│   └── kcadm.sh            # Admin CLI tool
├── conf/                   # Configuration files
│   ├── keycloak.conf        # Main config (ports, DB, hostname)
│   └── cache-ispn.xml       # Infinispan cache config
├── data/                   # Runtime data (H2 database in dev mode)
│   └── h2/                  # H2 database files
├── lib/                    # Core libraries
├── providers/              # Custom SPI JARs go here
│   └── *.jar                # Email OTP plugin JAR
├── themes/                 # UI themes (login, account, admin)
│   ├── base/                # Base theme
│   └── keycloak/            # Default theme
└── version.txt             # Keycloak version info
```

---

## Quick Reference

| Resource | URL |
|---|---|
| Keycloak Admin Console | http://localhost:8082/admin |
| Demo App | http://localhost:3000 |
| Keycloak Account Console | http://localhost:8082/realms/local_demo/account |
| OIDC Discovery | http://localhost:8082/realms/local_demo/.well-known/openid-configuration |
| Mailtrap Inbox | https://mailtrap.io |
