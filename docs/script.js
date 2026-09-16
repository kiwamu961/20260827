const MAX_FILES = 50;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png"]);
const CATEGORIES = ["すべて", "浴室", "トイレ", "リビング", "玄関", "キッチン", "洗面所", "バルコニー", "未分類"];

// COCOの標準80クラスのうち、物件写真の判定に使う候補クラス（日本語表示名付き）。
// COCOには「浴槽」「玄関ドア」に相当するクラスがないため、関連性の高いクラスで代用する。
const COCO_OBJECT_POOL = [
  { name: "toilet", label: "便器" },
  { name: "sink", label: "シンク" },
  { name: "toothbrush", label: "歯ブラシ" },
  { name: "hair drier", label: "ドライヤー" },
  { name: "oven", label: "オーブン" },
  { name: "microwave", label: "電子レンジ" },
  { name: "refrigerator", label: "冷蔵庫" },
  { name: "toaster", label: "トースター" },
  { name: "couch", label: "ソファ" },
  { name: "tv", label: "テレビ" },
  { name: "dining table", label: "ダイニングテーブル" },
  { name: "bed", label: "ベッド" },
  { name: "backpack", label: "バックパック" },
  { name: "umbrella", label: "傘" },
  { name: "potted plant", label: "観葉植物" },
  { name: "bench", label: "ベンチ" },
];

// カテゴリ判定ルール。優先順に評価し、対象クラスの検出個数の合計が
// threshold（N個）以上になった最初のカテゴリを採用する。
// COCOに存在しないクラス（浴槽・シャワー等）は、代用クラスで近似している。
const CATEGORY_RULES = [
  { category: "キッチン", objects: ["oven", "microwave", "refrigerator", "toaster"], threshold: 1 },
  { category: "浴室", objects: ["toothbrush", "hair drier"], threshold: 1 },
  { category: "トイレ", objects: ["toilet"], threshold: 1 },
  { category: "洗面所", objects: ["sink"], threshold: 1 },
  { category: "リビング", objects: ["couch", "tv", "dining table", "bed"], threshold: 1 },
  { category: "玄関", objects: ["backpack", "umbrella"], threshold: 1 },
  { category: "バルコニー", objects: ["potted plant", "bench"], threshold: 1 },
];

const uploadView = document.getElementById("uploadView");
const processingView = document.getElementById("processingView");
const resultsView = document.getElementById("resultsView");
const uploadForm = document.getElementById("uploadForm");
const propertyIdInput = document.getElementById("propertyId");
const photoInput = document.getElementById("photoInput");
const dropZone = document.getElementById("dropZone");
const fileSummary = document.getElementById("fileSummary");
const fileCount = document.getElementById("fileCount");
const fileList = document.getElementById("fileList");
const errorMessage = document.getElementById("errorMessage");
const statusMessage = document.getElementById("statusMessage");
const startButton = document.getElementById("startButton");
const clearButton = document.getElementById("clearButton");
const processingProperty = document.getElementById("processingProperty");
const progressBar = document.getElementById("progressBar");
const progressCount = document.getElementById("progressCount");
const progressLabel = document.getElementById("progressLabel");
const processingFiles = document.getElementById("processingFiles");
const showResultsButton = document.getElementById("showResultsButton");
const resultsProperty = document.getElementById("resultsProperty");
const categoryTabs = document.getElementById("categoryTabs");
const resultsGrid = document.getElementById("resultsGrid");
const backToUploadButton = document.getElementById("backToUploadButton");

let selectedFiles = [];
let classifiedPhotos = [];
let activeCategory = "すべて";
let processingTimer;

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ファイル名とサイズから決定的な擬似乱数を生成する（同じ写真は常に同じ検出結果になる）。
function createSeededRandom(seedText) {
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  }
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

// YOLO推論の代わりに、写真ごとにCOCOクラスの検出結果を疑似生成する。
// 実際のモデル・学習データを接続する際は、この関数の戻り値だけを差し替えればよい。
function detectObjects(file, index) {
  const random = createSeededRandom(`${file.name}-${file.size}-${index}`);
  const detected = [];

  COCO_OBJECT_POOL.forEach((object) => {
    if (random() < 0.32) {
      const count = 1 + Math.floor(random() * 2);
      const confidence = Math.round((0.6 + random() * 0.35) * 100) / 100;
      detected.push({ ...object, count, confidence });
    }
  });

  return detected;
}

// 検出物の個数がルールのthreshold（N個）以上になった最初のカテゴリを採用する。
// 該当するルールがなければ未分類として扱う。
function classifyDetections(detectedObjects) {
  for (const rule of CATEGORY_RULES) {
    const matchedObjects = detectedObjects.filter((object) => rule.objects.includes(object.name));
    const totalCount = matchedObjects.reduce((sum, object) => sum + object.count, 0);
    if (totalCount >= rule.threshold) {
      return { category: rule.category, matchedObjects };
    }
  }
  return { category: "未分類", matchedObjects: [] };
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function renderFiles() {
  fileList.replaceChildren();
  fileSummary.hidden = selectedFiles.length === 0;
  fileCount.textContent = `${selectedFiles.length}枚`;
  startButton.disabled = selectedFiles.length === 0 || !propertyIdInput.value.trim();

  selectedFiles.forEach((file) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const size = document.createElement("span");
    name.textContent = file.name;
    size.className = "file-size";
    size.textContent = formatFileSize(file.size);
    item.append(name, size);
    fileList.append(item);
  });
}

function addFiles(fileListLike) {
  const incomingFiles = Array.from(fileListLike);
  const invalidFiles = incomingFiles.filter((file) => !ACCEPTED_TYPES.has(file.type));
  const validFiles = incomingFiles.filter((file) => ACCEPTED_TYPES.has(file.type));

  showError(invalidFiles.length > 0 ? "JPGまたはPNG形式の写真だけを選択してください。" : "");
  const mergedFiles = [...selectedFiles, ...validFiles];
  if (mergedFiles.length > MAX_FILES) {
    showError(`アップロードできる写真は最大${MAX_FILES}枚です。`);
    selectedFiles = mergedFiles.slice(0, MAX_FILES);
  } else {
    selectedFiles = mergedFiles;
  }
  renderFiles();
}

function switchView(view) {
  uploadView.hidden = view !== "upload";
  processingView.hidden = view !== "processing";
  resultsView.hidden = view !== "results";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProcessingFiles() {
  processingFiles.replaceChildren();
  selectedFiles.forEach((file) => {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const state = document.createElement("span");
    row.className = "processing-file";
    name.textContent = file.name;
    state.className = "file-state";
    state.textContent = "待機中";
    row.append(name, state);
    processingFiles.append(row);
  });
}

function startProcessing() {
  const total = selectedFiles.length;
  let processed = 0;
  processingProperty.textContent = `${propertyIdInput.value.trim()} / ${total}枚を処理中`;
  progressBar.style.width = "0%";
  progressCount.textContent = `0 / ${total}枚`;
  progressLabel.textContent = "YOLO検出を準備中";
  showResultsButton.hidden = true;
  renderProcessingFiles();
  switchView("processing");

  clearInterval(processingTimer);
  processingTimer = setInterval(() => {
    const row = processingFiles.children[processed];
    if (row) {
      row.classList.add("is-complete");
      row.querySelector(".file-state").textContent = "分類済み";
    }
    processed += 1;
    const percentage = Math.round((processed / total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressCount.textContent = `${processed} / ${total}枚`;
    progressLabel.textContent = processed === total ? "分類が完了しました" : "画像を分類中";

    if (processed === total) {
      clearInterval(processingTimer);
      classifiedPhotos = selectedFiles.map((file, index) => {
        const detectedObjects = detectObjects(file, index);
        const { category, matchedObjects } = classifyDetections(detectedObjects);
        return { file, category, detectedObjects, matchedObjects };
      });
      showResultsButton.hidden = false;
    }
  }, 280);
}

function renderCategoryTabs() {
  categoryTabs.replaceChildren();
  CATEGORIES.forEach((category) => {
    const button = document.createElement("button");
    const count = category === "すべて"
      ? classifiedPhotos.length
      : classifiedPhotos.filter((photo) => photo.category === category).length;
    button.className = "category-tab";
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(category === activeCategory));
    button.innerHTML = `${category}<small>${count}</small>`;
    button.addEventListener("click", () => {
      activeCategory = category;
      renderResults();
    });
    categoryTabs.append(button);
  });
}

function renderResults() {
  renderCategoryTabs();
  resultsGrid.replaceChildren();
  const visiblePhotos = activeCategory === "すべて"
    ? classifiedPhotos
    : classifiedPhotos.filter((photo) => photo.category === activeCategory);

  if (visiblePhotos.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "このカテゴリに写真はありません。";
    resultsGrid.append(emptyState);
    return;
  }

  visiblePhotos.forEach(({ file, category, matchedObjects }) => {
    const card = document.createElement("article");
    const placeholder = document.createElement("div");
    const placeholderText = document.createElement("span");
    const body = document.createElement("div");
    const name = document.createElement("strong");
    const label = document.createElement("p");
    const reason = document.createElement("p");

    card.className = "photo-card";
    placeholder.className = "photo-placeholder";
    placeholderText.textContent = file.name;
    name.textContent = file.name;
    label.textContent = `分類: ${category}`;
    reason.className = "detected-tags";
    reason.textContent = matchedObjects.length > 0
      ? `検出根拠: ${matchedObjects.map((object) => `${object.label}×${object.count}`).join("、")}`
      : "検出根拠なし（信頼度不足）";
    placeholder.append(placeholderText);
    body.className = "photo-card-body";
    body.append(name, label, reason);
    card.append(placeholder, body);
    resultsGrid.append(card);
  });
}

photoInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
  event.target.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
dropZone.addEventListener("click", (event) => {
  if (event.target !== photoInput && event.target.tagName !== "LABEL") photoInput.click();
});
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    photoInput.click();
  }
});

propertyIdInput.addEventListener("input", () => {
  startButton.disabled = selectedFiles.length === 0 || !propertyIdInput.value.trim();
});

clearButton.addEventListener("click", () => {
  selectedFiles = [];
  showError("");
  statusMessage.hidden = true;
  renderFiles();
});

uploadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!propertyIdInput.value.trim() || selectedFiles.length === 0) return;
  startProcessing();
});

showResultsButton.addEventListener("click", () => {
  resultsProperty.textContent = `${propertyIdInput.value.trim()} / ${classifiedPhotos.length}枚`;
  activeCategory = "すべて";
  renderResults();
  switchView("results");
});

backToUploadButton.addEventListener("click", () => {
  clearInterval(processingTimer);
  selectedFiles = [];
  classifiedPhotos = [];
  propertyIdInput.value = "";
  showError("");
  statusMessage.hidden = true;
  renderFiles();
  switchView("upload");
});
