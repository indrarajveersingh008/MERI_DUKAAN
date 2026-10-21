/**
 * Meri Dukaan - IndexedDB Database Module
 * Offline-first, transactional, local storage for Kirana & Retail inventory.
 */

const DB_NAME = "MeriDukaanDB";
const DB_VERSION = 1;

let dbInstance = null;

export async function openDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Products store
      if (!db.objectStoreNames.contains("products")) {
        const prodStore = db.createObjectStore("products", { keyPath: "id" });
        prodStore.createIndex("name", "name", { unique: false });
        prodStore.createIndex("createdAt", "createdAt", { unique: false });
        prodStore.createIndex("lastSaleAt", "lastSaleAt", { unique: false });
      }

      // Stock Movements store
      if (!db.objectStoreNames.contains("movements")) {
        const movStore = db.createObjectStore("movements", { keyPath: "id" });
        movStore.createIndex("productId", "productId", { unique: false });
        movStore.createIndex("timestamp", "timestamp", { unique: false });
        movStore.createIndex("type", "type", { unique: false });
      }

      // Settings store
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      // Request persistent storage if supported
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then((persistent) => {
          console.log(`[Storage] Persistent storage granted: ${persistent}`);
        }).catch(() => {});
      }
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error("[DB] Open failed", event.target.error);
      reject(event.target.error);
    };
  });
}

function generateId(prefix = "item") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// Round float cleanly to 3 decimals to avoid floating point issues
function cleanNumber(val) {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : Math.round(num * 1000) / 1000;
}

// ---------------- PRODUCTS ----------------

export async function addProduct(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["products", "movements"], "readwrite");
    const prodStore = tx.objectStore("products");
    const movStore = tx.objectStore("movements");

    const id = data.id || generateId("prod");
    const now = data.createdAt || new Date().toISOString();
    const qty = cleanNumber(data.quantity);
    const minStock = cleanNumber(data.minimumStock);
    const costPrice = data.costPrice ? cleanNumber(data.costPrice) : null;

    const product = {
      id,
      name: data.name.trim(),
      quantity: qty,
      unit: (data.unit || "pkt").trim(),
      minimumStock: minStock,
      costPrice: costPrice,
      createdAt: now,
      lastSaleAt: data.lastSaleAt || null
    };

    prodStore.put(product);

    // Initial movement if stock > 0
    if (qty > 0) {
      const mov = {
        id: generateId("mov"),
        productId: id,
        type: "restock",
        quantity: qty,
        timestamp: now,
        undone: false,
        notes: "शुरुआती स्टॉक / Initial Stock"
      };
      movStore.put(mov);
    }

    tx.oncomplete = () => resolve(product);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllProducts() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("products", "readonly");
    const store = tx.objectStore("products");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getProductById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("products", "readonly");
    const store = tx.objectStore("products");
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- RESTOCK ("माल आया / Stock Received") ----------------

export async function restockProduct(productId, quantityReceived, notes = "माल आया / Restock") {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["products", "movements"], "readwrite");
    const prodStore = tx.objectStore("products");
    const movStore = tx.objectStore("movements");

    const getReq = prodStore.get(productId);
    getReq.onsuccess = () => {
      const product = getReq.result;
      if (!product) {
        reject(new Error("Product not found"));
        return;
      }

      const received = cleanNumber(quantityReceived);
      if (received <= 0) {
        reject(new Error("Restock quantity must be positive"));
        return;
      }

      const prevQty = product.quantity;
      product.quantity = cleanNumber(product.quantity + received);
      prodStore.put(product);

      const mov = {
        id: generateId("mov"),
        productId: product.id,
        type: "restock",
        quantity: received,
        timestamp: new Date().toISOString(),
        undone: false,
        notes: notes,
        previousQuantity: prevQty,
        newQuantity: product.quantity
      };
      movStore.put(mov);
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- RECORD SALE ("बिक्री दर्ज करें") ----------------

export async function recordSale(productId, quantitySold = 1, opId = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["products", "movements"], "readwrite");
    const prodStore = tx.objectStore("products");
    const movStore = tx.objectStore("movements");

    const getReq = prodStore.get(productId);
    getReq.onsuccess = () => {
      const product = getReq.result;
      if (!product) {
        reject(new Error("Product not found"));
        return;
      }

      const sold = cleanNumber(quantitySold);
      if (sold <= 0) {
        reject(new Error("Sale quantity must be positive"));
        return;
      }

      const prevQty = product.quantity;
      product.quantity = cleanNumber(product.quantity - sold);
      const now = new Date().toISOString();
      product.lastSaleAt = now;

      prodStore.put(product);

      const mov = {
        id: opId || generateId("mov_sale"),
        productId: product.id,
        type: "sale",
        quantity: sold,
        timestamp: now,
        undone: false,
        notes: "बिक्री / Sale",
        previousQuantity: prevQty,
        newQuantity: product.quantity
      };
      movStore.put(mov);

      tx.oncomplete = () => resolve({ product, movement: mov });
    };

    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- UNDO LAST SALE ("पिछली बिक्री वापस करें") ----------------

export async function undoLastSale(movementId = null) {
  const db = await openDB();
  return new Promise(async (resolve, reject) => {
    try {
      const allMovements = await getAllMovements();
      let targetMov = null;

      if (movementId) {
        targetMov = allMovements.find((m) => m.id === movementId && m.type === "sale" && !m.undone);
      } else {
        // Find most recent active sale
        const sales = allMovements
          .filter((m) => m.type === "sale" && !m.undone)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (sales.length > 0) {
          targetMov = sales[0];
        }
      }

      if (!targetMov) {
        reject(new Error("कोई सक्रिय बिक्री नहीं मिली जिसे वापस किया जा सके / No active sale to undo"));
        return;
      }

      const tx = db.transaction(["products", "movements"], "readwrite");
      const prodStore = tx.objectStore("products");
      const movStore = tx.objectStore("movements");

      const getReq = prodStore.get(targetMov.productId);
      getReq.onsuccess = () => {
        const product = getReq.result;
        if (!product) {
          reject(new Error("Product not found"));
          return;
        }

        // Restore quantity
        product.quantity = cleanNumber(product.quantity + targetMov.quantity);

        // Mark movement undone
        targetMov.undone = true;
        targetMov.undoneAt = new Date().toISOString();
        movStore.put(targetMov);

        // Recalculate lastSaleAt from remaining non-undone sales for this product
        const remainingSales = allMovements
          .filter((m) => m.productId === product.id && m.type === "sale" && !m.undone && m.id !== targetMov.id)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        product.lastSaleAt = remainingSales.length > 0 ? remainingSales[0].timestamp : null;
        prodStore.put(product);

        tx.oncomplete = () => resolve({ product, movement: targetMov });
      };

      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------- CORRECT STOCK ("स्टॉक सुधारें") ----------------

export async function correctStock(productId, actualQuantity, reason = "स्टॉक सुधार / Recount") {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["products", "movements"], "readwrite");
    const prodStore = tx.objectStore("products");
    const movStore = tx.objectStore("movements");

    const getReq = prodStore.get(productId);
    getReq.onsuccess = () => {
      const product = getReq.result;
      if (!product) {
        reject(new Error("Product not found"));
        return;
      }

      const newQty = cleanNumber(actualQuantity);
      const diff = cleanNumber(newQty - product.quantity);
      const prevQty = product.quantity;
      product.quantity = newQty;
      prodStore.put(product);

      const mov = {
        id: generateId("mov_adj"),
        productId: product.id,
        type: "adjustment",
        quantity: diff, // Signed difference
        timestamp: new Date().toISOString(),
        undone: false,
        notes: reason,
        previousQuantity: prevQty,
        newQuantity: newQty
      };
      movStore.put(mov);

      tx.oncomplete = () => resolve({ product, movement: mov });
    };

    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- MOVEMENTS & RECENT ACTIVITY ----------------

export async function getAllMovements() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("movements", "readonly");
    const store = tx.objectStore("movements");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- LIST LOGIC: LOW STOCK & NOT MOVING ----------------

export async function getLowStockProducts() {
  const products = await getAllProducts();
  return products.filter((p) => p.quantity <= p.minimumStock);
}

/**
 * Not Moving logic as strictly specified in Section 9.2:
 * Inactivity period (default 30 days) flags products with no recorded sale during that period.
 * - Products that have NEVER sold are labelled separately from products that sold previously but stopped.
 * - Products added WITHIN the period are NOT flagged.
 */
export async function getNotMovingProducts(inactivityDays = 30) {
  const products = await getAllProducts();
  const now = Date.now();
  const cutoffMs = now - inactivityDays * 24 * 60 * 60 * 1000;

  const notMoving = [];

  for (const product of products) {
    const createdMs = new Date(product.createdAt).getTime();

    // Do NOT flag products added within the inactivity period
    if (createdMs > cutoffMs) {
      continue;
    }

    if (product.lastSaleAt) {
      const lastSaleMs = new Date(product.lastSaleAt).getTime();
      if (lastSaleMs < cutoffMs) {
        // Stopped selling: sold previously, but not within inactivityDays
        const daysSinceSale = Math.floor((now - lastSaleMs) / (24 * 60 * 60 * 1000));
        notMoving.push({
          ...product,
          statusType: "stopped_selling",
          daysSinceSale: daysSinceSale
        });
      }
    } else {
      // Never sold: added before cutoff, 0 recorded sales
      const daysSinceCreated = Math.floor((now - createdMs) / (24 * 60 * 60 * 1000));
      notMoving.push({
        ...product,
        statusType: "never_sold",
        daysSinceCreated: daysSinceCreated
      });
    }
  }

  return notMoving;
}

// Tied up capital calculation (Section 9.3)
export function calculateTiedUpCapital(notMovingList) {
  let totalRupees = 0;
  let itemsWithCost = 0;
  let itemsWithoutCost = 0;

  for (const item of notMovingList) {
    if (item.costPrice && item.costPrice > 0 && item.quantity > 0) {
      totalRupees += item.quantity * item.costPrice;
      itemsWithCost++;
    } else {
      itemsWithoutCost++;
    }
  }

  return {
    totalRupees: Math.round(totalRupees),
    itemsWithCost,
    itemsWithoutCost
  };
}

// ---------------- SETTINGS ----------------

export async function getSetting(key, defaultValue) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("settings", "readonly");
    const store = tx.objectStore("settings");
    const req = store.get(key);
    req.onsuccess = () => {
      resolve(req.result !== undefined ? req.result.value : defaultValue);
    };
    req.onerror = () => resolve(defaultValue);
  });
}

export async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    store.put({ key, value });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- DEMO DATA ----------------

export async function loadDemoData() {
  const db = await openDB();
  
  // Clear existing
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["products", "movements"], "readwrite");
    tx.objectStore("products").clear();
    tx.objectStore("movements").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const now = new Date();
  const daysAgo = (d, h = 0) => {
    const dt = new Date(now.getTime() - d * 86400000 - h * 3600000);
    return dt.toISOString();
  };

  // 15 realistic shop items (Kirana staples)
  const demoProducts = [
    // 1. Low stock items
    {
      id: "demo_1",
      name: "Fortune Kachi Ghani Mustard Oil 1L (फॉर्च्यून सरसों तेल)",
      quantity: 2,
      unit: "L",
      minimumStock: 8,
      costPrice: 145,
      createdAt: daysAgo(50),
      lastSaleAt: daysAgo(0, 3) // 3 hours ago
    },
    {
      id: "demo_2",
      name: "Parle-G Gold 250g (पारले-जी बिस्कुट)",
      quantity: 3,
      unit: "pkt",
      minimumStock: 20,
      costPrice: 22,
      createdAt: daysAgo(60),
      lastSaleAt: daysAgo(1)
    },
    {
      id: "demo_3",
      name: "Surf Excel Easy Wash 1kg (सर्फ एक्सेल)",
      quantity: 1,
      unit: "pkt",
      minimumStock: 6,
      costPrice: 130,
      createdAt: daysAgo(40),
      lastSaleAt: daysAgo(2)
    },
    // 2. Healthy fast-moving staples
    {
      id: "demo_4",
      name: "Tata Salt Vacuum Evaporated 1kg (टाटा नमक)",
      quantity: 22,
      unit: "pkt",
      minimumStock: 10,
      costPrice: 24,
      createdAt: daysAgo(90),
      lastSaleAt: daysAgo(0, 1)
    },
    {
      id: "demo_5",
      name: "Aashirvaad Shudh Chakki Atta 10kg (आशीर्वाद आटा)",
      quantity: 14,
      unit: "pkt",
      minimumStock: 5,
      costPrice: 380,
      createdAt: daysAgo(45),
      lastSaleAt: daysAgo(0, 4)
    },
    {
      id: "demo_6",
      name: "Maggi 2-Minute Masala Noodles 70g (मैगी)",
      quantity: 42,
      unit: "pkt",
      minimumStock: 24,
      costPrice: 12,
      createdAt: daysAgo(60),
      lastSaleAt: daysAgo(0, 2)
    },
    {
      id: "demo_7",
      name: "Amul Pasteurised Butter 500g (अमूल मक्खन)",
      quantity: 9,
      unit: "pkt",
      minimumStock: 4,
      costPrice: 260,
      createdAt: daysAgo(30),
      lastSaleAt: daysAgo(0, 5)
    },
    {
      id: "demo_8",
      name: "Dettol Original Soap 75g (डेटॉल साबुन)",
      quantity: 18,
      unit: "pc",
      minimumStock: 8,
      costPrice: 32,
      createdAt: daysAgo(50),
      lastSaleAt: daysAgo(1)
    },
    {
      id: "demo_9",
      name: "Madhur Pure & Hygienic Sugar 1kg (मधुर चीनी)",
      quantity: 25.5,
      unit: "kg",
      minimumStock: 10,
      costPrice: 42,
      createdAt: daysAgo(40),
      lastSaleAt: daysAgo(1)
    },
    {
      id: "demo_10",
      name: "Tata Tea Gold 250g (टाटा टी गोल्ड)",
      quantity: 11,
      unit: "pkt",
      minimumStock: 5,
      costPrice: 140,
      createdAt: daysAgo(35),
      lastSaleAt: daysAgo(2)
    },
    // 3. Not Moving items (stopped selling > 30 days)
    {
      id: "demo_11",
      name: "Lizol Floor Cleaner Citrus 500ml (लिज़ोल)",
      quantity: 12,
      unit: "pc",
      minimumStock: 4,
      costPrice: 98,
      createdAt: daysAgo(70),
      lastSaleAt: daysAgo(45) // Sold 45 days ago!
    },
    {
      id: "demo_12",
      name: "Everest Garam Masala 100g (एवरेस्ट गरम मसाला)",
      quantity: 15,
      unit: "pkt",
      minimumStock: 5,
      costPrice: 75,
      createdAt: daysAgo(80),
      lastSaleAt: daysAgo(52) // Sold 52 days ago!
    },
    {
      id: "demo_13",
      name: "Mortein Powergard Mosquito Coil 10s (मॉर्टिन)",
      quantity: 20,
      unit: "box",
      minimumStock: 5,
      costPrice: 38,
      createdAt: daysAgo(90),
      lastSaleAt: daysAgo(48) // Sold 48 days ago!
    },
    {
      id: "demo_14",
      name: "Hamdard Rooh Afza Sharbat 750ml (रूह अफ़ज़ा)",
      quantity: 8,
      unit: "pc",
      minimumStock: 3,
      costPrice: 165,
      createdAt: daysAgo(85),
      lastSaleAt: daysAgo(39) // Sold 39 days ago!
    },
    // 4. Not Moving - Never sold! (added 45 days ago, 0 sales)
    {
      id: "demo_15",
      name: "Unibic Choco Ripple Cookies 75g (यूनिबिक कुकीज़)",
      quantity: 16,
      unit: "pkt",
      minimumStock: 5,
      costPrice: 30,
      createdAt: daysAgo(45),
      lastSaleAt: null // Never sold!
    }
  ];

  // Save all demo products
  for (const prod of demoProducts) {
    await addProduct(prod);
  }

  // Add realistic backdated sales movements for audit
  const demoMovements = [
    {
      id: "mov_demo_1",
      productId: "demo_1",
      type: "sale",
      quantity: 1,
      timestamp: daysAgo(0, 3),
      undone: false,
      notes: "बिक्री / Sale"
    },
    {
      id: "mov_demo_2",
      productId: "demo_2",
      type: "sale",
      quantity: 2,
      timestamp: daysAgo(1),
      undone: false,
      notes: "बिक्री / Sale"
    },
    {
      id: "mov_demo_3",
      productId: "demo_11",
      type: "sale",
      quantity: 1,
      timestamp: daysAgo(45),
      undone: false,
      notes: "बिक्री / Sale"
    },
    {
      id: "mov_demo_4",
      productId: "demo_12",
      type: "sale",
      quantity: 1,
      timestamp: daysAgo(52),
      undone: false,
      notes: "बिक्री / Sale"
    },
    {
      id: "mov_demo_5",
      productId: "demo_13",
      type: "sale",
      quantity: 2,
      timestamp: daysAgo(48),
      undone: false,
      notes: "बिक्री / Sale"
    },
    {
      id: "mov_demo_6",
      productId: "demo_14",
      type: "sale",
      quantity: 1,
      timestamp: daysAgo(39),
      undone: false,
      notes: "बिक्री / Sale"
    }
  ];

  const tx = db.transaction("movements", "readwrite");
  const movStore = tx.objectStore("movements");
  for (const m of demoMovements) {
    movStore.put(m);
  }

  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
  });
}

// ---------------- EXPORT / IMPORT (P1) ----------------

export async function exportDatabaseJSON() {
  const products = await getAllProducts();
  const movements = await getAllMovements();
  const inactivityDays = await getSetting("inactivityDays", 30);
  const lang = await getSetting("language", "hi");

  const backupData = {
    app: "Meri Dukaan",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { inactivityDays, lang },
    products,
    movements
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateStr = new Date().toISOString().split("T")[0];
  a.download = `Meri_Dukaan_Backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export async function importDatabaseJSON(jsonContent) {
  const data = JSON.parse(jsonContent);
  if (!data.products || !Array.isArray(data.products)) {
    throw new Error("अमान्य बैकअप फ़ाइल / Invalid backup file format");
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["products", "movements", "settings"], "readwrite");
    const prodStore = tx.objectStore("products");
    const movStore = tx.objectStore("movements");
    const setStore = tx.objectStore("settings");

    prodStore.clear();
    movStore.clear();

    for (const p of data.products) {
      prodStore.put(p);
    }

    if (data.movements && Array.isArray(data.movements)) {
      for (const m of data.movements) {
        movStore.put(m);
      }
    }

    if (data.settings) {
      if (data.settings.inactivityDays) {
        setStore.put({ key: "inactivityDays", value: data.settings.inactivityDays });
      }
      if (data.settings.lang) {
        setStore.put({ key: "language", value: data.settings.lang });
      }
    }

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}