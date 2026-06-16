# TikSaver — TikTok Video Endirici

TikTok videolarını **logo, watermark və tanıtım olmadan** HD keyfiyyətdə endirmək üçün veb tətbiq.

## 🚀 Xüsusiyyətlər

- ✅ **Watermark-siz endirmə** — TikTok loqosu olmadan
- ✅ **HD keyfiyyət** — maksimum keyfiyyət qorunur
- ✅ **Birbaşa qalereyaya** — fayl kimi deyil, birbaşa endirilir
- ✅ **Thumbnail görüntüsü** — video önizleme
- ✅ **Video statistikası** — baxış, bəyənmə, şərh sayları
- ✅ **Mobil uyğun** — responsive dizayn
- ✅ **Pulsuz**

## 🛠️ Texnologiyalar

- **Backend:** Node.js + Express.js
- **API:** tikwm.com (watermark-siz HD)
- **Frontend:** Vanilla HTML/CSS/JS
- **Deploy:** Render.com

## 📦 Quraşdırma

```bash
npm install
npm start
```

## 🌐 URL-lər

- **Production:** https://your-app.onrender.com
- **Health Check:** /health
- **Video Info API:** POST /api/video-info
- **Download API:** GET /api/download

## 📡 API Endpoint-ləri

### POST /api/video-info
```json
{ "url": "https://www.tiktok.com/@user/video/123..." }
```

### GET /api/download
```
/api/download?url=<encoded_video_url>&filename=video_title
```

## ⚙️ Render.com Deploy

1. Repo-nu GitHub-a yüklə
2. Render.com-da "New Web Service" yarat
3. `npm start` start command-i qeyd et
4. `PORT` env var avtomatik təyin edilir

## 📁 Struktur

```
tiksaver/
├── server.js          # Express backend
├── public/
│   └── index.html     # Frontend
├── package.json
└── README.md
```
