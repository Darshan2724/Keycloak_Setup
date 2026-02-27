const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');

const app = express();

app.use(session({
    secret: 'keycloak-demo-secret-change-this',
    resave: false,
    saveUninitialized: false,
}));

const KEYCLOAK_URL = 'http://localhost:8082';
const REALM = 'local_demo';
const CLIENT_ID = 'demo-app';
const REDIRECT_URI = 'http://localhost:3000/callback';

let client;

async function initializeClient() {
    const keycloakIssuer = await Issuer.discover(
        `${KEYCLOAK_URL}/realms/${REALM}`
    );
    console.log('Discovered issuer:', keycloakIssuer.issuer);

    client = new keycloakIssuer.Client({
        client_id: CLIENT_ID,
        redirect_uris: [REDIRECT_URI],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
    });
}

// Home page
app.get('/', (req, res) => {
    if (req.session.userInfo) {
        res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Keycloak Demo - Welcome</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .card {
              background: white;
              border-radius: 20px;
              padding: 50px;
              max-width: 600px;
              width: 90%;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
            }
            .success-icon { font-size: 80px; margin-bottom: 25px; }
            h1 { color: #2d3748; font-size: 32px; margin-bottom: 15px; }
            .username { color: #667eea; }
            .subtitle {
              color: #718096;
              font-size: 18px;
              margin-bottom: 35px;
              line-height: 1.6;
            }
            .logout-btn {
              display: inline-block;
              padding: 14px 35px;
              background: linear-gradient(135deg, #e53e3e, #c53030);
              color: white;
              text-decoration: none;
              border-radius: 10px;
              font-size: 16px;
              font-weight: 600;
              transition: transform 0.2s, box-shadow 0.2s;
            }
            .logout-btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 5px 20px rgba(229, 62, 62, 0.4);
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success-icon">🎉</div>
            <h1>Welcome, <span class="username">${req.session.userInfo.preferred_username || 'User'}</span>!</h1>
            <p class="subtitle">You have successfully logged in through Keycloak.</p>
            <a href="/logout" class="logout-btn">Logout</a>
          </div>
        </body>
      </html>
    `);
    } else {
        res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Keycloak Demo - Login</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .card {
              background: white;
              border-radius: 20px;
              padding: 50px;
              max-width: 500px;
              width: 90%;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
            }
            .logo { font-size: 64px; margin-bottom: 20px; }
            h1 { color: #2d3748; font-size: 28px; margin-bottom: 10px; }
            p { color: #718096; font-size: 16px; margin-bottom: 30px; }
            .login-btn {
              display: inline-block;
              padding: 14px 40px;
              background: linear-gradient(135deg, #667eea, #764ba2);
              color: white;
              text-decoration: none;
              border-radius: 10px;
              font-size: 18px;
              font-weight: 600;
              transition: transform 0.2s, box-shadow 0.2s;
            }
            .login-btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="logo">🔐</div>
            <h1>Keycloak OIDC Demo</h1>
            <p>Click below to log in via Keycloak with MFA</p>
            <a href="/login" class="login-btn">Login with Keycloak</a>
          </div>
        </body>
      </html>
    `);
    }
});

// Login endpoint
app.get('/login', (req, res) => {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    req.session.codeVerifier = codeVerifier;

    const authUrl = client.authorizationUrl({
        scope: 'openid profile email',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    });

    res.redirect(authUrl);
});

// Callback endpoint
app.get('/callback', async (req, res) => {
    try {
        const params = client.callbackParams(req);
        const tokenSet = await client.callback(REDIRECT_URI, params, {
            code_verifier: req.session.codeVerifier,
        });

        console.log('ID Token claims:', tokenSet.claims());

        const userInfo = await client.userinfo(tokenSet.access_token);
        req.session.userInfo = userInfo;
        req.session.tokenSet = {
            access_token: tokenSet.access_token,
            id_token: tokenSet.id_token,
        };

        res.redirect('/');
    } catch (err) {
        console.error('Callback error:', err);
        res.status(500).send('Authentication failed: ' + err.message);
    }
});

// Logout
app.get('/logout', (req, res) => {
    const idToken = req.session.tokenSet && req.session.tokenSet.id_token;

    req.session.destroy(() => {
        if (idToken) {
            const logoutUrl = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/logout`
                + `?id_token_hint=${idToken}`
                + `&post_logout_redirect_uri=${encodeURIComponent('http://localhost:3000')}`;
            res.redirect(logoutUrl);
        } else {
            res.redirect('/');
        }
    });
});

// Start server
initializeClient().then(() => {
    app.listen(3000, () => {
        console.log('');
        console.log('===========================================');
        console.log('  Demo app running at http://localhost:3000');
        console.log('===========================================');
        console.log('');
    });
}).catch(err => {
    console.error('Failed to initialize OIDC client:', err);
    process.exit(1);
});

