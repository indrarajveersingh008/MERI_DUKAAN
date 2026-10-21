/**
 * Meri Dukaan - Application Logic
 * Mobile-First, Offline-First Stock & Reorder Assistant
 */

import {
  openDB,
  addProduct,
  getAllProducts,
  getProductById,
  restockProduct,
  recordSale,
  undoLastSale,
  correctStock,
  getAllMovements,
  getLowStockProducts,
  getNotMovingProducts,
  calculateTiedUpCapital,
  getSetting,
  setSetting,
  loadDemoData,
  exportDatabaseJSON,
  importDatabaseJSON
} from "./db.js";

// --- STATE MANAGEMENT ---
let currentLang = "hi";
let currentView = "stock";
let inactivityDays = 30;
let lastSaleMovement = null;
let undoTimer = null;
let isProcessingSale = false;

// --- TRANSLATIONS (Hindi / English) ---
const I18N = {
  hi: {
    appTitle: "मेरी दुकान",
    tagline: "कम टैप्स। सही स्टॉक। ज़्यादा मुनाफ़ा।",
    online: "ऑनलाइन",
    offline: "ऑफ़लाइन (एरोप्लेन मोड)",
    tabStock: "स्टॉक",
    tabSale: "तुरंत बिक्री",
    tabLowStock: "कम स्टॉक",
    tabNotMoving: "रुका माल",
    tabSettings: "सेटिंग्स",
    addStock: "सामान जोड़ें",
    restock: "माल आया",
    correctStock: "स्टॉक सुधारें",
    saleRecorded: "बिक्री दर्ज हुई",
    undo: "वापस करें",
    undoSuccess: "पिछली बिक्री सफलतापूर्वक वापस कर दी गई",
    restockSuccess: "माल स्टॉक में जोड़ दिया गया",
    correctSuccess: "स्टॉक ठीक कर दिया गया",
    productAdded: "नया सामान सफलतापूर्वक जोड़ा गया",
    demoLoaded: "15 डेमो सामान लोड हो गए!",
    tiedUpIn: "अटका हुआ धन",
    itemsWithoutCost: "सामान बिना खरीद भाव के",
    stoppedSelling: "बिकना रुक गया",
    neverSold: "कभी नहीं बिका",
    currentStock: "वर्तमान स्टॉक",
    minStock: "कम से कम (न्यूनतम)",
    suggestedOrder: "सुझाया गया ऑर्डर",
    daysAgo: "दिन पहले",
    neverSoldLabel: "कभी बिक्री नहीं हुई",
    shareOrderTitle: "ऑर्डर सूची भेजें",
    reorderHeading: "*ऑर्डर सूची / Restock Order - मेरी दुकान*",
    whatsappSend: "व्हाट्सएप पर भेजें",
    copied: "ऑर्डर सूची कॉपी हो गई!",
    noLowStock: "बहुत बढ़िया! कोई भी सामान कम स्टॉक में नहीं है।",
    noNotMoving: "कोई रुका हुआ माल नहीं है! सब सामान बिक रहा है।",
    noProducts: "अभी कोई सामान नहीं है। नीचे दिए बटन से सामान जोड़ें या डेमो डेटा लोड करें।"
  },
  en: {
    appTitle: "Meri Dukaan",
    tagline: "Kam Taps. Sahi Stock. Zyada Munafa.",
    online: "Online",
    offline: "Offline (Aeroplane Mode)",
    tabStock: "Stock",
    tabSale: "Quick Sale",
    tabLowStock: "Low Stock",
    tabNotMoving: "Not Moving",
    tabSettings: "Settings",
    addStock: "Add Stock",
    restock: "Stock Received",
    correctStock: "Correct Stock",
    saleRecorded: "Sale recorded",
    undo: "Undo",
    undoSuccess: "Last sale undone successfully",
    restockSuccess: "Restock recorded successfully",
    correctSuccess: "Stock adjusted successfully",
    productAdded: "Product added successfully",
    demoLoaded: "15 demo products loaded!",
    tiedUpIn: "Capital Tied Up",
    itemsWithoutCost: "items without cost price",
    stoppedSelling: "Stopped selling",
    neverSold: "Never sold",
    currentStock: "Current Stock",
    minStock: "Minimum Stock",
    suggestedOrder: "Suggested Order",
    daysAgo: "days ago",
    neverSoldLabel: "Never sold",
    shareOrderTitle: "Share Order List",
    reorderHeading: "*Reorder List - Meri Dukaan*",
    whatsappSend: "Send on WhatsApp",
    copied: "Order list copied to clipboard!",
    noLowStock: "Great! No products currently below minimum stock threshold.",
    noNotMoving: "No dead stock found! Everything is moving smoothly.",
    noProducts: "No products added yet. Tap Add Stock or load Demo Data below."
  }
};

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || (I18N.en && I18N.en[key]) || key;
}

// --- DOM ELEMENTS ---
const elements = {
  app: document.getElementById("app"),
  statusPill: document.getElementById("status-pill"),
  statusText: document.getElementById("status-text"),
  btnLangToggle: document.getElementById("btn-lang-toggle"),
  langLabel: document.getElementById("lang-label"),
  btnToggleFrame: document.getElementById("btn-toggle-frame"),
  
  // Tabs & Views
  tabBtns: document.querySelectorAll(".bottom-nav .nav-item"),
  views: {
    stock: document.getElementById("view-stock"),
    sale: document.getElementById("view-quick-sale"),
    lowStock: document.getElementById("view-low-stock"),
    notMoving: document.getElementById("view-not-moving"),
    settings: document.getElementById("view-settings")
  },

  // Counts & Badges
  countAllStock: document.getElementById("count-all-stock"),
  countSaleItems: document.getElementById("count-sale-items"),
  countLowStock: document.getElementById("count-low-stock"),
  countNotMoving: document.getElementById("count-not-moving"),
  badgeLowStock: document.getElementById("badge-low-stock"),

  // Lists
  listAllStock: document.getElementById("list-all-stock"),
  listQuickSale: document.getElementById("list-quick-sale"),
  listLowStock: document.getElementById("list-low-stock"),
  listNotMoving: document.getElementById("list-not-moving"),
  listRecentActivity: document.getElementById("list-recent-activity"),

  // Empty States
  emptyAllStock: document.getElementById("empty-all-stock"),
  emptyQuickSale: document.getElementById("empty-quick-sale"),
  emptyLowStock: document.getElementById("empty-low-stock"),
  emptyNotMoving: document.getElementById("empty-not-moving"),

  // Search Inputs
  searchStock: document.getElementById("search-stock"),
  clearStockSearch: document.getElementById("clear-stock-search"),
  searchSale: document.getElementById("search-sale"),
  clearSaleSearch: document.getElementById("clear-sale-search"),

  // Capital Card
  capitalSummaryCard: document.getElementById("capital-summary-card"),
  txtCapitalAmount: document.getElementById("txt-capital-amount"),
  txtCapitalSub: document.getElementById("txt-capital-sub"),

  // FAB & Modals
  fabAddProduct: document.getElementById("fab-add-product"),
  modalAddProduct: document.getElementById("modal-add-product"),
  formAddProduct: document.getElementById("form-add-product"),
  unitPillsAdd: document.querySelectorAll("#unit-pills-add .pill-btn"),
  inpAddUnit: document.getElementById("inp-add-unit"),

  modalRestock: document.getElementById("modal-restock"),
  formRestock: document.getElementById("form-restock"),
  restockProdId: document.getElementById("restock-prod-id"),
  restockProdName: document.getElementById("restock-prod-name"),
  restockCurrentQty: document.getElementById("restock-current-qty"),
  inpRestockQty: document.getElementById("inp-restock-qty"),
  btnRestockMinus: document.getElementById("btn-restock-minus"),
  btnRestockPlus: document.getElementById("btn-restock-plus"),

  modalCorrect: document.getElementById("modal-correct"),
  formCorrect: document.getElementById("form-correct"),
  correctProdId: document.getElementById("correct-prod-id"),
  correctProdName: document.getElementById("correct-prod-name"),
  correctCurrentQty: document.getElementById("correct-current-qty"),
  inpCorrectActualQty: document.getElementById("inp-correct-actual-qty"),
  selectCorrectReason: document.getElementById("select-correct-reason"),

  modalShare: document.getElementById("modal-share"),
  txtShareOrderContent: document.getElementById("txt-share-order-content"),
  btnSendWhatsapp: document.getElementById("btn-send-whatsapp"),
  btnCopyOrderText: document.getElementById("btn-copy-order-text"),
  btnShareOrderTop: document.getElementById("btn-share-order-top"),

  // Toast
  undoToast: document.getElementById("undo-toast"),
  undoToastText: document.getElementById("undo-toast-text"),
  btnToastUndo: document.getElementById("btn-toast-undo"),

  // Settings Controls
  btnLoadDemo: document.getElementById("btn-load-demo"),
  btnEmptyLoadDemo: document.getElementById("btn-empty-load-demo"),
  selectInactivityDays: document.getElementById("select-inactivity-days"),
  btnExportBackup: document.getElementById("btn-export-backup"),
  btnImportTrigger: document.getElementById("btn-import-trigger"),
  fileImportBackup: document.getElementById("file-import-backup"),
  storageStatusInfo: document.getElementById("storage-status-info")
};

// --- INITIALIZATION ---
window.addEventListener("DOMContentLoaded", async () => {
  initServiceWorker();
  initNetworkListeners();
  
  await openDB();
  
  // Load saved preferences
  inactivityDays = await getSetting("inactivityDays", 30);
  if (elements.selectInactivityDays) {
    elements.selectInactivityDays.value = inactivityDays.toString();
  }

  currentLang = await getSetting("language", "hi");
  updateLanguageUI();

  // Storage check
  checkStorageQuota();

  // Bind events
  bindEvents();

  // Initial render
  await refreshAllViews();
});

// --- SERVICE WORKER & PERSISTENCE ---
function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then((reg) => console.log("[SW] Registered with scope:", reg.scope))
      .catch((err) => console.warn("[SW] Registration failed:", err));
  }
}

function initNetworkListeners() {
  const updateStatus = () => {
    const isOnline = navigator.onLine;
    if (elements.statusPill) {
      if (isOnline) {
        elements.statusPill.classList.remove("offline");
        elements.statusPill.classList.add("online");
        elements.statusText.textContent = t("online");
      } else {
        elements.statusPill.classList.remove("online");
        elements.statusPill.classList.add("offline");
        elements.statusText.textContent = t("offline");
      }
    }
  };

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  updateStatus();
}

async function checkStorageQuota() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
      const isPersistent = navigator.storage.persist ? await navigator.storage.persisted() : false;
      if (elements.storageStatusInfo) {
        elements.storageStatusInfo.textContent = 
          "IndexedDB Storage: " + usedMB + " MB used | Persistent Storage: " + (isPersistent ? "Active (सुरक्षित)" : "Standard");
      }
    } catch {
      // Ignore
    }
  }
}

// --- LANGUAGE TOGGLE ---
function updateLanguageUI() {
  if (elements.langLabel) {
    elements.langLabel.textContent = currentLang === "hi" ? "English" : "हिन्दी";
  }
  document.documentElement.lang = currentLang;
  
  // Update static headers & tabs
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key && I18N[currentLang][key]) {
      el.textContent = I18N[currentLang][key];
    }
  });

  initNetworkListeners();
}

async function toggleLanguage() {
  currentLang = currentLang === "hi" ? "en" : "hi";
  await setSetting("language", currentLang);
  updateLanguageUI();
  await refreshAllViews();
}

// --- EVENT BINDINGS ---
function bindEvents() {
  // Lang Toggle
  if (elements.btnLangToggle) {
    elements.btnLangToggle.addEventListener("click", toggleLanguage);
  }

  // Frame toggle (desktop preview vs full width)
  if (elements.btnToggleFrame) {
    elements.btnToggleFrame.addEventListener("click", () => {
      elements.app.classList.toggle("desktop-frame");
    });
  }

  // Tab Navigation
  elements.tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetView = btn.getAttribute("data-tab");
      switchView(targetView);
    });
  });

  // FAB Add Product
  if (elements.fabAddProduct) {
    elements.fabAddProduct.addEventListener("click", () => openAddModal());
  }

  // Unit Pills inside Add modal
  elements.unitPillsAdd.forEach((pill) => {
    pill.addEventListener("click", () => {
      elements.unitPillsAdd.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const unit = pill.getAttribute("data-unit");
      if (elements.inpAddUnit) elements.inpAddUnit.value = unit;
    });
  });

  // Add Product Form Submit
  if (elements.formAddProduct) {
    elements.formAddProduct.addEventListener("submit", handleAddProductSubmit);
  }

  // Restock Form Stepper & Submit
  if (elements.btnRestockMinus) {
    elements.btnRestockMinus.addEventListener("click", () => {
      const cur = parseFloat(elements.inpRestockQty.value) || 0;
      if (cur > 1) elements.inpRestockQty.value = cur - 1;
    });
  }
  if (elements.btnRestockPlus) {
    elements.btnRestockPlus.addEventListener("click", () => {
      const cur = parseFloat(elements.inpRestockQty.value) || 0;
      elements.inpRestockQty.value = cur + 1;
    });
  }
  if (elements.formRestock) {
    elements.formRestock.addEventListener("submit", handleRestockSubmit);
  }

  // Correct Stock Form Submit
  if (elements.formCorrect) {
    elements.formCorrect.addEventListener("submit", handleCorrectSubmit);
  }

  // Modal Closers
  document.querySelectorAll(".modal .modal-close, .modal .btn-modal-cancel").forEach((btn) => {
    btn.addEventListener("click", closeAllModals);
  });
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAllModals();
    });
  });

  // Search Filters
  if (elements.searchStock) {
    elements.searchStock.addEventListener("input", () => renderStockList());
  }
  if (elements.clearStockSearch) {
    elements.clearStockSearch.addEventListener("click", () => {
      elements.searchStock.value = "";
      renderStockList();
    });
  }

  if (elements.searchSale) {
    elements.searchSale.addEventListener("input", () => renderQuickSaleList());
  }
  if (elements.clearSaleSearch) {
    elements.clearSaleSearch.addEventListener("click", () => {
      elements.searchSale.value = "";
      renderQuickSaleList();
    });
  }

  // Undo Toast Action
  if (elements.btnToastUndo) {
    elements.btnToastUndo.addEventListener("click", handleUndoLastSale);
  }

  // Share Order list
  if (elements.btnShareOrderTop) {
    elements.btnShareOrderTop.addEventListener("click", openShareOrderModal);
  }
  if (elements.btnSendWhatsapp) {
    elements.btnSendWhatsapp.addEventListener("click", shareViaWhatsApp);
  }
  if (elements.btnCopyOrderText) {
    elements.btnCopyOrderText.addEventListener("click", copyOrderText);
  }

  // Demo Data Buttons
  const handleLoadDemo = async () => {
    if (confirm("डेमो डेटा लोड करें? (इससे मौजूदा डेटा 15 नए डेमो सामानों से बदल जाएगा)")) {
      await loadDemoData();
      showToast(t("demoLoaded"));
      await refreshAllViews();
    }
  };
  if (elements.btnLoadDemo) elements.btnLoadDemo.addEventListener("click", handleLoadDemo);
  if (elements.btnEmptyLoadDemo) elements.btnEmptyLoadDemo.addEventListener("click", handleLoadDemo);

  // Inactivity Days Select
  if (elements.selectInactivityDays) {
    elements.selectInactivityDays.addEventListener("change", async (e) => {
      inactivityDays = parseInt(e.target.value, 10) || 30;
      await setSetting("inactivityDays", inactivityDays);
      await renderNotMovingList();
    });
  }

  // Backup Export / Import
  if (elements.btnExportBackup) {
    elements.btnExportBackup.addEventListener("click", async () => {
      await exportDatabaseJSON();
      showToast("JSON बैकअप डाउनलोड हो गया! / Backup downloaded");
    });
  }
  if (elements.btnImportTrigger) {
    elements.btnImportTrigger.addEventListener("click", () => {
      if (elements.fileImportBackup) elements.fileImportBackup.click();
    });
  }
  if (elements.fileImportBackup) {
    elements.fileImportBackup.addEventListener("change", handleImportBackupFile);
  }
}

// --- VIEW SWITCHING ---
function switchView(viewName) {
  currentView = viewName;

  // Update tabs
  elements.tabBtns.forEach((btn) => {
    if (btn.getAttribute("data-tab") === viewName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update view containers
  Object.keys(elements.views).forEach((key) => {
    if (elements.views[key]) {
      if (key === viewName) {
        elements.views[key].classList.add("active");
      } else {
        elements.views[key].classList.remove("active");
      }
    }
  });

  // Refresh active view
  if (viewName === "stock") renderStockList();
  if (viewName === "sale") renderQuickSaleList();
  if (viewName === "lowStock") renderLowStockList();
  if (viewName === "notMoving") renderNotMovingList();
  if (viewName === "settings") renderRecentActivity();
}

// --- REFRESH ALL VIEWS ---
async function refreshAllViews() {
  await Promise.all([
    renderStockList(),
    renderQuickSaleList(),
    renderLowStockList(),
    renderNotMovingList(),
    renderRecentActivity(),
    checkStorageQuota()
  ]);
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, duration = 3000) {
  let toast = document.getElementById("general-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "general-toast";
    toast.className = "general-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), duration);
}

function showUndoToast(productName, quantity, unit, movementId) {
  if (undoTimer) clearTimeout(undoTimer);

  elements.undoToastText.innerHTML = "<strong>" + t("saleRecorded") + ":</strong> " + escapeHTML(productName) + " (" + quantity + " " + unit + ")";
  elements.undoToast.classList.add("visible");
  lastSaleMovement = movementId;

  // Auto dismiss after 8 seconds
  undoTimer = setTimeout(() => {
    elements.undoToast.classList.remove("visible");
    lastSaleMovement = null;
  }, 8000);
}

// --- MODAL HANDLERS ---
function closeAllModals() {
  document.querySelectorAll(".modal").forEach((m) => m.classList.remove("active"));
}

function openAddModal() {
  closeAllModals();
  if (elements.formAddProduct) elements.formAddProduct.reset();
  // Select default unit (pkt)
  elements.unitPillsAdd.forEach((p) => p.classList.remove("active"));
  const defaultPill = document.querySelector("#unit-pills-add [data-unit="pkt"]");
  if (defaultPill) defaultPill.classList.add("active");
  if (elements.inpAddUnit) elements.inpAddUnit.value = "pkt";

  elements.modalAddProduct.classList.add("active");
  setTimeout(() => {
    const nameInput = document.getElementById("inp-add-name");
    if (nameInput) nameInput.focus();
  }, 100);
}

function openRestockModal(product) {
  closeAllModals();
  elements.restockProdId.value = product.id;
  elements.restockProdName.textContent = product.name;
  elements.restockCurrentQty.textContent = product.quantity + " " + product.unit;
  elements.inpRestockQty.value = "5";
  elements.modalRestock.classList.add("active");
}

function openCorrectModal(product) {
  closeAllModals();
  elements.correctProdId.value = product.id;
  elements.correctProdName.textContent = product.name;
  elements.correctCurrentQty.textContent = product.quantity + " " + product.unit;
  elements.inpCorrectActualQty.value = product.quantity;
  elements.modalCorrect.classList.add("active");
}

// --- ADD PRODUCT SUBMIT ---
async function handleAddProductSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("inp-add-name").value.trim();
  const qty = parseFloat(document.getElementById("inp-add-qty").value) || 0;
  const unit = elements.inpAddUnit.value || "pkt";
  const minStock = parseFloat(document.getElementById("inp-add-min").value) || 0;
  const costPrice = document.getElementById("inp-add-cost").value ? parseFloat(document.getElementById("inp-add-cost").value) : null;

  if (!name) return;

  await addProduct({
    name,
    quantity: qty,
    unit,
    minimumStock: minStock,
    costPrice: costPrice
  });

  closeAllModals();
  showToast(t("productAdded"));
  await refreshAllViews();
}

// --- RESTOCK SUBMIT ---
async function handleRestockSubmit(e) {
  e.preventDefault();
  const prodId = elements.restockProdId.value;
  const qty = parseFloat(elements.inpRestockQty.value) || 0;

  if (!prodId || qty <= 0) return;

  await restockProduct(prodId, qty);
  closeAllModals();
  showToast(t("restockSuccess"));
  await refreshAllViews();
}

// --- CORRECT STOCK SUBMIT ---
async function handleCorrectSubmit(e) {
  e.preventDefault();
  const prodId = elements.correctProdId.value;
  const actualQty = parseFloat(elements.inpCorrectActualQty.value);
  const reason = elements.selectCorrectReason.value || "गिनती सुधार / Stock recount";

  if (!prodId || isNaN(actualQty) || actualQty < 0) return;

  await correctStock(prodId, actualQty, reason);
  closeAllModals();
  showToast(t("correctSuccess"));
  await refreshAllViews();
}

// --- QUICK SALE LOGIC (2-TAP RAPID SALE) ---
async function handleQuickSale(productId, quantity = 1, triggerBtn = null) {
  if (isProcessingSale) return;
  isProcessingSale = true;

  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.classList.add("loading");
  }

  try {
    const opId = "mov_sale_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const result = await recordSale(productId, quantity, opId);
    
    if (navigator.vibrate) navigator.vibrate(40);

    showUndoToast(result.product.name, quantity, result.product.unit, result.movement.id);

    await refreshAllViews();
  } catch (err) {
    console.error("Sale failed:", err);
    alert(err.message);
  } finally {
    isProcessingSale = false;
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.classList.remove("loading");
    }
  }
}

// --- UNDO LAST SALE ---
async function handleUndoLastSale() {
  try {
    const result = await undoLastSale(lastSaleMovement);
    if (elements.undoToast) elements.undoToast.classList.remove("visible");
    lastSaleMovement = null;
    showToast(t("undoSuccess"));
    if (navigator.vibrate) navigator.vibrate([30, 30, 30]);
    await refreshAllViews();
  } catch (err) {
    alert(err.message);
  }
}

// --- RENDER STOCK LIST ---
async function renderStockList() {
  const products = await getAllProducts();
  const query = (elements.searchStock ? elements.searchStock.value : "").trim().toLowerCase();

  const filtered = products.filter((p) => p.name.toLowerCase().includes(query));

  if (elements.countAllStock) {
    elements.countAllStock.textContent = products.length.toString();
  }

  if (filtered.length === 0) {
    elements.listAllStock.innerHTML = "";
    elements.emptyAllStock.style.display = "block";
    return;
  }
  elements.emptyAllStock.style.display = "none";

  elements.listAllStock.innerHTML = filtered
    .map((prod) => {
      const isLow = prod.quantity <= prod.minimumStock;
      const lowBadge = isLow
        ? "<span class="badge badge-danger">कम स्टॉक / Low Stock</span>"
        : "<span class="badge badge-success">उपलब्ध / In Stock</span>";

      return (
        "<div class="product-card " + (isLow ? "is-low" : "") + "" data-id="" + prod.id + "">" +
          "<div class="card-header-row">" +
            "<h4 class="prod-title">" + escapeHTML(prod.name) + "</h4>" +
            lowBadge +
          "</div>" +
          "<div class="card-meta-row">" +
            "<div class="qty-display">" +
              "<span class="qty-num " + (isLow ? "text-danger" : "") + "">" + prod.quantity + "</span>" +
              "<span class="qty-unit">" + escapeHTML(prod.unit) + "</span>" +
            "</div>" +
            "<div class="threshold-display">" +
              "<span class="meta-label">न्यूनतम: " + prod.minimumStock + " " + escapeHTML(prod.unit) + "</span>" +
              (prod.costPrice ? "<span class="cost-label">खरीद: ₹" + prod.costPrice + "</span>" : "") +
            "</div>" +
          "</div>" +
          "<div class="card-actions-row">" +
            "<button class="btn btn-sm btn-outline btn-restock-trigger" data-id="" + prod.id + "">" +
              "<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>" +
              " माल आया (Restock)" +
            "</button>" +
            "<button class="btn btn-sm btn-secondary btn-correct-trigger" data-id="" + prod.id + "">" +
              "<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>" +
              " सुधारें" +
            "</button>" +
          "</div>" +
        "</div>"
      );
    })
    .join("");

  elements.listAllStock.querySelectorAll(".btn-restock-trigger").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const prod = await getProductById(btn.getAttribute("data-id"));
      if (prod) openRestockModal(prod);
    });
  });

  elements.listAllStock.querySelectorAll(".btn-correct-trigger").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const prod = await getProductById(btn.getAttribute("data-id"));
      if (prod) openCorrectModal(prod);
    });
  });
}

// --- RENDER QUICK SALE LIST (2 TAPS ONLY!) ---
async function renderQuickSaleList() {
  const products = await getAllProducts();
  const query = (elements.searchSale ? elements.searchSale.value : "").trim().toLowerCase();

  const sorted = [...products].sort((a, b) => {
    const aTime = a.lastSaleAt ? new Date(a.lastSaleAt).getTime() : 0;
    const bTime = b.lastSaleAt ? new Date(b.lastSaleAt).getTime() : 0;
    return bTime - aTime;
  });

  const filtered = sorted.filter((p) => p.name.toLowerCase().includes(query));

  if (elements.countSaleItems) {
    elements.countSaleItems.textContent = products.length.toString();
  }

  if (filtered.length === 0) {
    elements.listQuickSale.innerHTML = "";
    elements.emptyQuickSale.style.display = "block";
    return;
  }
  elements.emptyQuickSale.style.display = "none";

  elements.listQuickSale.innerHTML = filtered
    .map((prod) => {
      const isOut = prod.quantity <= 0;
      return (
        "<div class="sale-card " + (isOut ? "is-out" : "") + "" data-id="" + prod.id + "">" +
          "<div class="sale-info">" +
            "<h4 class="prod-title">" + escapeHTML(prod.name) + "</h4>" +
            "<div class="stock-pill">" +
              "स्टॉक: <strong>" + prod.quantity + "</strong> " + escapeHTML(prod.unit) +
            "</div>" +
          "</div>" +
          "<div class="sale-action-box">" +
            "<button class="btn btn-primary btn-quick-sell" data-id="" + prod.id + "" " + (isOut ? "disabled" : "") + ">" +
              "<span class="sell-text">बिक्री (1 " + escapeHTML(prod.unit) + ")</span>" +
              "<span class="sell-sub">1-Tap Sale</span>" +
            "</button>" +
            "<button class="btn btn-outline btn-custom-sell" data-id="" + prod.id + "" title="कस्टम मात्रा">" +
              "..." +
            "</button>" +
          "</div>" +
        "</div>"
      );
    })
    .join("");

  elements.listQuickSale.querySelectorAll(".btn-quick-sell").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      handleQuickSale(id, 1, btn);
    });
  });

  elements.listQuickSale.querySelectorAll(".btn-custom-sell").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const prod = await getProductById(id);
      if (!prod) return;
      const customQty = prompt("कितनी मात्रा बेची? / Enter quantity sold (" + prod.unit + "):", "1");
      if (customQty !== null) {
        const val = parseFloat(customQty);
        if (val > 0) {
          handleQuickSale(id, val, btn);
        }
      }
    });
  });
}

// --- RENDER LOW STOCK LIST ---
async function renderLowStockList() {
  const lowProducts = await getLowStockProducts();

  if (elements.countLowStock) {
    elements.countLowStock.textContent = lowProducts.length.toString();
  }
  if (elements.badgeLowStock) {
    elements.badgeLowStock.textContent = lowProducts.length.toString();
    elements.badgeLowStock.style.display = lowProducts.length > 0 ? "inline-block" : "none";
  }

  if (lowProducts.length === 0) {
    elements.listLowStock.innerHTML = "";
    elements.emptyLowStock.style.display = "block";
    return;
  }
  elements.emptyLowStock.style.display = "none";

  elements.listLowStock.innerHTML = lowProducts
    .map((prod) => {
      const suggested = Math.max(1, Math.ceil(2 * prod.minimumStock - prod.quantity));
      return (
        "<div class="low-stock-card" data-id="" + prod.id + "">" +
          "<div class="card-header-row">" +
            "<h4 class="prod-title">" + escapeHTML(prod.name) + "</h4>" +
            "<span class="badge badge-danger">ऑर्डर चाहिए / Reorder</span>" +
          "</div>" +
          "<div class="low-stock-metrics">" +
            "<div class="metric-col">" +
              "<span class="metric-label">वर्तमान स्टॉक</span>" +
              "<span class="metric-val text-danger">" + prod.quantity + " " + escapeHTML(prod.unit) + "</span>" +
            "</div>" +
            "<div class="metric-col">" +
              "<span class="metric-label">न्यूनतम तय</span>" +
              "<span class="metric-val">" + prod.minimumStock + " " + escapeHTML(prod.unit) + "</span>" +
            "</div>" +
            "<div class="metric-col highlight">" +
              "<span class="metric-label">सुझाया गया ऑर्डर</span>" +
              "<span class="metric-val text-primary"><strong>+" + suggested + " " + escapeHTML(prod.unit) + "</strong></span>" +
            "</div>" +
          "</div>" +
          "<div class="card-actions-row">" +
            "<button class="btn btn-sm btn-primary btn-restock-trigger" data-id="" + prod.id + "">" +
              "<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>" +
              " माल आया (Restock)" +
            "</button>" +
          "</div>" +
        "</div>"
      );
    })
    .join("");

  elements.listLowStock.querySelectorAll(".btn-restock-trigger").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const prod = await getProductById(btn.getAttribute("data-id"));
      if (prod) openRestockModal(prod);
    });
  });
}

// --- RENDER NOT MOVING LIST (SECTION 9.2 & 9.3) ---
async function renderNotMovingList() {
  const notMoving = await getNotMovingProducts(inactivityDays);

  if (elements.countNotMoving) {
    elements.countNotMoving.textContent = notMoving.length.toString();
  }

  const capital = calculateTiedUpCapital(notMoving);
  if (elements.capitalSummaryCard) {
    if (notMoving.length > 0) {
      elements.capitalSummaryCard.style.display = "block";
      elements.txtCapitalAmount.textContent = "₹" + capital.totalRupees.toLocaleString("en-IN");
      elements.txtCapitalSub.textContent = 
        notMoving.length + " सामान जो पिछले " + inactivityDays + " दिनों से नहीं बिके (" + (capital.itemsWithoutCost > 0 ? (capital.itemsWithoutCost + " सामान बिना खरीद भाव") : "सभी भाव दर्ज") + ")";
    } else {
      elements.capitalSummaryCard.style.display = "none";
    }
  }

  if (notMoving.length === 0) {
    elements.listNotMoving.innerHTML = "";
    elements.emptyNotMoving.style.display = "block";
    return;
  }
  elements.emptyNotMoving.style.display = "none";

  elements.listNotMoving.innerHTML = notMoving
    .map((prod) => {
      const isNeverSold = prod.statusType === "never_sold";
      const statusBadge = isNeverSold
        ? "<span class="badge badge-warning">कभी नहीं बिका / Never Sold</span>"
        : "<span class="badge badge-muted">" + prod.daysSinceSale + " दिनों से नहीं बिका</span>";

      const tiedCapital = (prod.costPrice && prod.costPrice > 0)
        ? ("₹" + Math.round(prod.quantity * prod.costPrice).toLocaleString("en-IN"))
        : "भाव नहीं जुड़ा";

      return (
        "<div class="not-moving-card" data-id="" + prod.id + "">" +
          "<div class="card-header-row">" +
            "<h4 class="prod-title">" + escapeHTML(prod.name) + "</h4>" +
            statusBadge +
          "</div>" +
          "<div class="not-moving-details">" +
            "<div class="detail-item">" +
              "<span class="detail-label">बचा हुआ स्टॉक:</span>" +
              "<span class="detail-value font-bold">" + prod.quantity + " " + escapeHTML(prod.unit) + "</span>" +
            "</div>" +
            "<div class="detail-item">" +
              "<span class="detail-label">अटका हुआ पैसा:</span>" +
              "<span class="detail-value text-accent font-bold">" + tiedCapital + "</span>" +
            "</div>" +
            "<div class="detail-item">" +
              "<span class="detail-label">अंतिम बिक्री तारीख:</span>" +
              "<span class="detail-value">" + (prod.lastSaleAt ? new Date(prod.lastSaleAt).toLocaleDateString("hi-IN") : "कभी नहीं") + "</span>" +
            "</div>" +
          "</div>" +
        "</div>"
      );
    })
    .join("");
}

// --- RENDER RECENT ACTIVITY (SETTINGS) ---
async function renderRecentActivity() {
  const movements = await getAllMovements();
  const products = await getAllProducts();
  const prodMap = new Map(products.map((p) => [p.id, p]));

  const sorted = movements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 15);

  if (!elements.listRecentActivity) return;

  if (sorted.length === 0) {
    elements.listRecentActivity.innerHTML = "<div class="empty-text">कोई हालिया गतिविधि नहीं है।</div>";
    return;
  }

  elements.listRecentActivity.innerHTML = sorted
    .map((m) => {
      const prod = prodMap.get(m.productId);
      const prodName = prod ? prod.name : "अज्ञात सामान";
      const unit = prod ? prod.unit : "";

      let typeBadge = "";
      let sign = "";
      if (m.type === "sale") {
        typeBadge = "<span class="badge badge-primary">बिक्री / Sale</span>";
        sign = "-";
      } else if (m.type === "restock") {
        typeBadge = "<span class="badge badge-success">माल आया / Restock</span>";
        sign = "+";
      } else {
        typeBadge = "<span class="badge badge-warning">सुधार / Adjust</span>";
        sign = m.quantity >= 0 ? "+" : "";
      }

      const isUndone = m.undone;
      const canUndo = m.type === "sale" && !isUndone;

      return (
        "<div class="activity-row " + (isUndone ? "is-undone" : "") + "">" +
          "<div class="activity-info">" +
            "<div class="act-title-row">" +
              "<span class="act-name font-bold">" + escapeHTML(prodName) + "</span>" +
              typeBadge +
              (isUndone ? "<span class="badge badge-muted">वापस लिया (Undone)</span>" : "") +
            "</div>" +
            "<div class="act-meta">" +
              "<span>" + new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "</span>" +
              "<span>•</span>" +
              "<span>" + escapeHTML(m.notes || "") + "</span>" +
            "</div>" +
          "</div>" +
          "<div class="activity-qty-box">" +
            "<span class="act-qty font-bold">" + sign + Math.abs(m.quantity) + " " + escapeHTML(unit) + "</span>" +
            (canUndo ? (
              "<button class="btn btn-xs btn-outline btn-inline-undo" data-id="" + m.id + "" title="यह बिक्री वापस करें">" +
                "वापस लें" +
              "</button>"
            ) : "") +
          "</div>" +
        "</div>"
      );
    })
    .join("");

  elements.listRecentActivity.querySelectorAll(".btn-inline-undo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const movId = btn.getAttribute("data-id");
      try {
        await undoLastSale(movId);
        showToast(t("undoSuccess"));
        await refreshAllViews();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

// --- SHARE REORDER LIST (P1) ---
async function openShareOrderModal() {
  const lowProducts = await getLowStockProducts();
  if (lowProducts.length === 0) {
    alert("कोई भी सामान कम स्टॉक में नहीं है जिसे ऑर्डर किया जा सके।");
    return;
  }

  let text = "📦 *" + t("reorderHeading") + "*
";
  text += "तारीख: " + new Date().toLocaleDateString("hi-IN") + "
";
  text += "दुकान के लिए आवश्यक सामान की सूची:

";

  lowProducts.forEach((p, idx) => {
    const suggested = Math.max(1, Math.ceil(2 * p.minimumStock - p.quantity));
    text += (idx + 1) + ". *" + p.name + "*
";
    text += "   - वर्तमान स्टॉक: " + p.quantity + " " + p.unit + "
";
    text += "   - सुझाया गया नया ऑर्डर: *" + suggested + " " + p.unit + "*

";
  });

  text += "_Meri Dukaan ऐप द्वारा सुझाई गई ऑर्डर सूची_";

  elements.txtShareOrderContent.value = text;
  elements.modalShare.classList.add("active");
}

function shareViaWhatsApp() {
  const text = elements.txtShareOrderContent.value;
  const encoded = encodeURIComponent(text);
  window.open("https://api.whatsapp.com/send?text=" + encoded, "_blank");
}

function copyOrderText() {
  const text = elements.txtShareOrderContent.value;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(t("copied"));
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  elements.txtShareOrderContent.select();
  document.execCommand("copy");
  showToast(t("copied"));
}

// --- BACKUP RESTORE HANDLER ---
function handleImportBackupFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      await importDatabaseJSON(event.target.result);
      showToast("बैकअप सफलतापूर्वक लोड हो गया! / Backup restored successfully");
      await refreshAllViews();
    } catch (err) {
      alert("बैकअप लोड करने में त्रुटि: " + err.message);
    }
  };
  reader.readAsText(file);
}

// --- HELPER: HTML ESCAPING ---
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/x27/g, "&#039;");
}