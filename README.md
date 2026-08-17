# 高血壓藥物助手

手機優先、繁體中文的靜態 PWA 原型。資料存放於 `data/medicines.json`，目前僅含 Valsartan / Diovan 的資料結構示例；所有需要醫療專業確認的欄位均明確標示，未自行填寫內容。

## 本機啟動

此專案不需安裝任何套件。請在專案根目錄執行：

```powershell
python -m http.server 8000
```

接著開啟 `http://localhost:8000`。請勿直接雙擊 `index.html`，因為瀏覽器會限制 JSON 載入與 Service Worker。

## iPhone 測試與加入主畫面

將網站部署到 HTTPS 網址後，以 iPhone Safari 開啟，按「分享」→「加入主畫面」。加入後以獨立 App 視窗開啟。Service Worker 需要 HTTPS（localhost 例外）。

## 資料維護

在 `data/medicines.json` 新增藥物物件；搜尋會自動比對 `genericName` 與 `brandNames`，分類按鈕則由 `classification` 自動建立。每筆 `image` 應指向專案內的圖片檔。

## 驗證項目

- 搜尋 `Valsartan` 與 `Diovan` 都會找到範例藥物。
- 可點選分類與藥物卡片，進入詳細頁並返回。
- 瀏覽器 DevTools 的 Application 面板可確認 manifest 與 service worker 已載入。
