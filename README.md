# MERI DUKAAN (मेरी दुकान)
### Offline-First Stock & Reorder Assistant
**Tagline:** *Kam Taps. Sahi Stock. Zyada Munafa.* (कम टैप्स। सही स्टॉक। ज़्यादा मुनाफ़ा।)

---

## 📌 Overview
Meri Dukaan is a lightweight, mobile-first inventory assistant tailored for neighbourhood retailers (Kirana stores, chemists, hardware shops, stationery stores) who currently manage inventory in a paper notebook or from memory.

It directly solves the two most costly inventory failures:
1. **Dead Stock:** Capital locked up in products that have stopped moving.
2. **Stockouts:** Fast-moving items running out before being reordered, causing lost sales and lost customers.

Built strictly according to the hackathon specification, Meri Dukaan is **100% offline-first**, requires **no signup/backend**, keeps all business data locally on the shopkeeper’s device via **IndexedDB**, and is installable as a **Progressive Web App (PWA)**.

---

## 🚀 Key Features

### P0 Core Essentials
- **Quick Stock & Sales:**
  - Add products with name, quantity, unit, and minimum stock threshold (optional cost price). Supports decimals (e.g., 0.5 kg, 1.25 L).
  - Restock existing items (*"माल आया / Stock Received"*).
  - Rapid 2-tap sales recording (*"बिक्री दर्ज करें / Record Sale"*).
  - Instant Undo (*"पिछली बिक्री वापस करें / Undo Last Sale"*) that restores quantity, marks the movement undone, and recalculates the last-sale date.
  - Stock adjustment (*"स्टॉक सुधारें / Correct Stock"*) for recounts or damages.
- **Actionable Lists:**
  - **Low Stock (*कम स्टॉक*):** Items at or below minimum threshold with one-tap restock action.
  - **Not Moving (*काफ़ी समय से नहीं बिका*):** Flags products with no sales within a configurable period (default: 30 days, demo: 1 day). Distinguishes items that *never sold* vs *stopped selling*, and ignores newly added items.
- **100% Offline Resilience:**
  - Service Worker caching ensures full functionality in aeroplane mode.
  - IndexedDB local storage with persistent storage request.
- **No Technical Jargon:**
  - Hindi and English bilingual labels (no "SKU", no confusing accounting terminology).

### P1 Enhancements
- **Tied-Up Capital:** Shows exact ₹ tied up in non-moving stock (`quantity × cost price`).
- **Shareable WhatsApp Reorder List:** One-tap generated plain text reorder list with suggested order quantities (`suggested = 2 * min - current`).
- **One-Tap JSON Backup:** Export and import full database backup.
- **Instant Demo Loader:** Loads 15 realistic shop items with backdated sales for instant judging and live demonstration.

---

## 🛠️ Technology Stack
- **Structure:** HTML5 (Semantic, accessible, mobile-first)
- **Styling:** Vanilla CSS3 (Custom properties, thumb-friendly touch targets ≥ 48px, high contrast)
- **Application Logic:** Vanilla JavaScript (ES modules)
- **Database:** IndexedDB (Atomic transactions for stock and movement logs)
- **PWA Shell:** Web App Manifest + Service Worker (Stale-While-Revalidate caching)

---

## 📱 60-Second Demo Flow
1. Turn on **Aeroplane Mode** to prove 100% offline operation.
2. Tap **"डेमो डेटा / Load Demo Data"** to populate 15 realistic products and history.
3. Record a quick sale in **two taps**.
4. Tap **"Undo Last Sale"** or view the sold product in **Low Stock**.
5. Switch to **Not Moving** to see dead stock and total money tied up (₹).
6. Close and reopen the browser offline to verify data persistence.