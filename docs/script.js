const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png"]);
const ACCEPTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const CATEGORIES = ["すべて", "浴室", "トイレ", "リビング", "玄関", "キッチン", "洗面所", "バルコニー", "未分類"];
const YOLO_API_BASE_URL = "http://127.0.0.1:8000";
const PLANS = {
  normal: { label: "Normal", maxFiles: 50 },
  pro: { label: "Pro", maxFiles: 100 },
};

// 複数要素の組み合わせを優先し、単独でもカテゴリ固有性が高い検出は
// 信頼度を確認して分類する。
const CATEGORY_RULES = [
  { category: "キッチン", objects: ["oven", "microwave", "refrigerator", "toaster"], minDistinctObjects: 2, singleObjectConfidence: 0.72 },
  { category: "浴室", objects: ["toothbrush", "hair drier"], minDistinctObjects: 2, singleObjectConfidence: 0.8 },
  { category: "トイレ", objects: ["toilet"], minDistinctObjects: 1, singleObjectConfidence: 0.55 },
  { category: "洗面所", objects: ["sink", "toothbrush", "hair drier"], minDistinctObjects: 2, singleObjectConfidence: 0.78 },
  { category: "リビング", objects: ["couch", "tv", "dining table", "bed"], minDistinctObjects: 2, singleObjectConfidence: 0.7 },
  { category: "玄関", objects: ["backpack", "umbrella"], minDistinctObjects: 2, singleObjectConfidence: 0.82 },
  { category: "バルコニー", objects: ["potted plant", "bench"], minDistinctObjects: 2, singleObjectConfidence: 0.8 },
];

const uploadView = document.getElementById("uploadView");
const processingView = document.getElementById("processingView");
const resultsView = document.getElementById("resultsView");
const confirmationView = document.getElementById("confirmationView");
const correctionView = document.getElementById("correctionView");
const uploadForm = document.getElementById("uploadForm");
const propertyIdInput = document.getElementById("propertyId");
const photoInput = document.getElementById("photoInput");
const folderInput = document.getElementById("folderInput");
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
const openManualCorrectionButton = document.getElementById("openManualCorrectionButton");
const openConfirmationButton = document.getElementById("openConfirmationButton");
const categoryTabs = document.getElementById("categoryTabs");
const resultsGrid = document.getElementById("resultsGrid");
const backToUploadButton = document.getElementById("backToUploadButton");
const planTabs = document.querySelectorAll(".plan-tab");
const planSwitch = document.querySelector(".plan-switch");
const limitBadge = document.getElementById("limitBadge");
const uploadLimitHint = document.getElementById("uploadLimitHint");
const confirmationProperty = document.getElementById("confirmationProperty");
const summaryProcessed = document.getElementById("summaryProcessed");
const summaryClassified = document.getElementById("summaryClassified");
const summaryUnclassified = document.getElementById("summaryUnclassified");
const summaryCategories = document.getElementById("summaryCategories");
const backToResultsButton = document.getElementById("backToResultsButton");
const discardFromConfirmationButton = document.getElementById("discardFromConfirmationButton");
const correctionProperty = document.getElementById("correctionProperty");
const correctionPreviewImage = document.getElementById("correctionPreviewImage");
const correctionFileName = document.getElementById("correctionFileName");
const correctionForm = document.getElementById("correctionForm");
const currentCategoryLabel = document.getElementById("currentCategoryLabel");
const correctionReason = document.getElementById("correctionReason");
const correctionCategory = document.getElementById("correctionCategory");
const cancelCorrectionButton = document.getElementById("cancelCorrectionButton");

let selectedFiles = [];
let classifiedPhotos = [];
let activeCategory = "すべて";
let currentCorrectionPhoto = null;
let activePlan = "normal";

function getActivePlan() {
  return PLANS[activePlan];
}

function renderPlan() {
  const plan = getActivePlan();
  planSwitch.classList.toggle("is-pro", activePlan === "pro");
  planTabs.forEach((tab) => {
    const isActive = tab.dataset.plan === activePlan;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  limitBadge.textContent = `${plan.label} / JPEG・JPG・PNG・最大${plan.maxFiles}枚`;
  uploadLimitHint.textContent = `JPEG・JPG・PNG形式 / 1回につき最大${plan.maxFiles}枚`;
}

planSwitch.addEventListener("click", (event) => {
  const tab = event.target.closest(".plan-tab");
  if (!tab) return;
  activePlan = tab.dataset.plan;
  if (!PLANS[activePlan]) return;
    const maxFiles = getActivePlan().maxFiles;
    if (selectedFiles.length > maxFiles) {
      selectedFiles = selectedFiles.slice(0, maxFiles);
      showError(`${getActivePlan().label}でアップロードできる写真は最大${maxFiles}枚です。`);
    }
    renderPlan();
    renderFiles();
});

renderPlan();

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function detectObjects(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${YOLO_API_BASE_URL}/api/infer`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    let detail = "YOLO推論に失敗しました。";
    try {
      const error = await response.json();
      detail = error.detail || detail;
    } catch {
      // APIがJSONを返さない場合は既定のメッセージを使用する。
    }
    throw new Error(detail);
  }
  const result = await response.json();
  return result.detectedObjects;
}

// 同じ物体が複数検出されても、異なる検出クラスの組み合わせを優先する。
function classifyDetections(detectedObjects) {
  const candidates = [];
  for (const rule of CATEGORY_RULES) {
    const matchedObjects = detectedObjects.filter((object) => rule.objects.includes(object.name));
    const distinctObjectNames = new Set(matchedObjects.map((object) => object.name));
    if (distinctObjectNames.size === 0) continue;
    const confidenceTotal = matchedObjects.reduce((sum, object) => sum + (object.confidence || 0), 0);
    const averageConfidence = confidenceTotal / matchedObjects.length;
    const isCombination = distinctObjectNames.size >= rule.minDistinctObjects;
    const isReliableSingle = distinctObjectNames.size === 1 && averageConfidence >= rule.singleObjectConfidence;
    if (isCombination || isReliableSingle) {
      candidates.push({
        category: rule.category,
        matchedObjects,
        score: confidenceTotal + (isCombination ? 1 : 0),
      });
    }
  }
  if (candidates.length > 0) {
    candidates.sort((left, right) => right.score - left.score);
    return candidates[0];
  }
  return { category: "未分類", matchedObjects: [] };
}

function formatMatchedObjects(matchedObjects) {
  return matchedObjects.map((object) => {
    const name = object.label || object.name || "unknown";
    const confidence = typeof object.confidence === "number" ? `(${Math.round(object.confidence * 100)}%)` : "";
    return `${name}${confidence}`;
  }).join("、");
}

function revokePhotoPreviews() {
  classifiedPhotos.forEach((photo) => {
    if (photo.previewUrl) {
      URL.revokeObjectURL(photo.previewUrl);
    }
  });
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
  const isAcceptedFile = (file) => {
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    return ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.has(extension);
  };
  const invalidFiles = incomingFiles.filter((file) => !isAcceptedFile(file));
  const validFiles = incomingFiles.filter(isAcceptedFile);

  showError(invalidFiles.length > 0 ? "JPEG、JPGまたはPNG形式の写真だけを選択してください。" : "");
  const mergedFiles = [...selectedFiles, ...validFiles];
  const maxFiles = getActivePlan().maxFiles;
  if (mergedFiles.length > maxFiles) {
    showError(`${getActivePlan().label}でアップロードできる写真は最大${maxFiles}枚です。`);
    selectedFiles = mergedFiles.slice(0, maxFiles);
  } else {
    selectedFiles = mergedFiles;
  }
  renderFiles();
}

function switchView(view) {
  uploadView.hidden = view !== "upload";
  processingView.hidden = view !== "processing";
  resultsView.hidden = view !== "results";
  confirmationView.hidden = view !== "confirmation";
  correctionView.hidden = view !== "correction";
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

async function startProcessing() {
  revokePhotoPreviews();
  const total = selectedFiles.length;
  processingProperty.textContent = `${propertyIdInput.value.trim()} / ${total}枚を処理中`;
  progressBar.style.width = "0%";
  progressCount.textContent = `0 / ${total}枚`;
  progressLabel.textContent = "YOLO検出を準備中";
  showResultsButton.hidden = true;
  renderProcessingFiles();
  switchView("processing");

  classifiedPhotos = [];
  for (let index = 0; index < selectedFiles.length; index += 1) {
    const file = selectedFiles[index];
    const row = processingFiles.children[index];
    if (row) {
      row.querySelector(".file-state").textContent = "YOLO推論中";
    }
    let photo;
    try {
      const detectedObjects = await detectObjects(file);
      const { category, matchedObjects } = classifyDetections(detectedObjects);
      photo = {
        file,
        previewUrl: URL.createObjectURL(file),
        category,
        detectedObjects,
        matchedObjects,
        corrected: false,
        failed: false,
      };
      if (row) row.querySelector(".file-state").textContent = "分類済み";
    } catch (error) {
      photo = {
        file,
        previewUrl: URL.createObjectURL(file),
        category: "未分類",
        detectedObjects: [],
        matchedObjects: [],
        corrected: false,
        failed: true,
        errorMessage: error instanceof Error ? error.message : "推論に失敗しました。",
      };
      if (row) row.querySelector(".file-state").textContent = "失敗";
    }
    classifiedPhotos.push(photo);
    const processed = index + 1;
    const percentage = Math.round((processed / total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressCount.textContent = `${processed} / ${total}枚`;
    progressLabel.textContent = processed === total ? "分類が完了しました" : "画像を分類中";

  }
  progressLabel.textContent = classifiedPhotos.some((photo) => photo.failed)
    ? "一部の写真で推論に失敗しました"
    : "分類が完了しました";
  showResultsButton.hidden = false;
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

function getResultSummary() {
  const processed = classifiedPhotos.length;
  const classified = classifiedPhotos.filter((photo) => !photo.failed && photo.category !== "未分類").length;
  const unclassified = classifiedPhotos.filter((photo) => photo.failed || photo.category === "未分類").length;
  const categoryCounts = CATEGORIES.filter((category) => category !== "すべて").map((category) => ({
    category,
    count: classifiedPhotos.filter((photo) => photo.category === category).length,
  }));

  return { processed, classified, unclassified, categoryCounts };
}

function renderConfirmation() {
  const summary = getResultSummary();
  confirmationProperty.textContent = `${propertyIdInput.value.trim()} / ${classifiedPhotos.length}枚`;
  summaryProcessed.textContent = `${summary.processed}枚`;
  summaryClassified.textContent = `${summary.classified}枚`;
  summaryUnclassified.textContent = `${summary.unclassified}枚`;

  summaryCategories.replaceChildren();
  summary.categoryCounts.forEach(({ category, count }) => {
    const item = document.createElement("div");
    const name = document.createElement("span");
    const value = document.createElement("strong");
    item.className = "summary-category";
    name.textContent = category;
    value.textContent = `${count}枚`;
    item.append(name, value);
    summaryCategories.append(item);
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

  visiblePhotos.forEach((photo) => {
    const { file, category, matchedObjects } = photo;
    const card = document.createElement("article");
    const preview = document.createElement("img");
    const body = document.createElement("div");
    const name = document.createElement("strong");
    const label = document.createElement("p");
    const reason = document.createElement("p");
    const actionRow = document.createElement("div");
    const correctionButton = document.createElement("button");
    const correctionBadge = document.createElement("span");

    card.className = "photo-card";
    preview.className = "photo-preview";
    preview.src = photo.previewUrl;
    preview.alt = `${file.name} のプレビュー`;
    name.textContent = file.name;
    label.textContent = `分類: ${category}`;
    reason.className = "detected-tags";
    reason.textContent = matchedObjects.length > 0
      ? `検出根拠: ${formatMatchedObjects(matchedObjects)}`
      : photo.failed ? `推論失敗: ${photo.errorMessage}` : "検出根拠なし（信頼度不足）";
    correctionBadge.className = "correction-badge";
    correctionBadge.textContent = photo.corrected ? "修正済み" : "自動分類";
    correctionButton.className = "text-button save-category-button";
    correctionButton.type = "button";
    correctionButton.textContent = "手動修正";
    correctionButton.addEventListener("click", () => openCorrectionView(photo));
    actionRow.className = "photo-actions";
    actionRow.append(correctionBadge, correctionButton);
    body.className = "photo-card-body";
    body.append(name, label, reason, actionRow);
    card.append(preview, body);
    resultsGrid.append(card);
  });
}

function populateCorrectionCategorySelect(category) {
  correctionCategory.replaceChildren();
  CATEGORIES.filter((option) => option !== "すべて").forEach((option) => {
    const selectOption = document.createElement("option");
    selectOption.value = option;
    selectOption.textContent = option;
    selectOption.selected = option === category;
    correctionCategory.append(selectOption);
  });
}

function openCorrectionView(photo) {
  currentCorrectionPhoto = photo;
  correctionProperty.textContent = `${propertyIdInput.value.trim()} / ${classifiedPhotos.length}枚`;
  correctionPreviewImage.src = photo.previewUrl;
  correctionPreviewImage.alt = `${photo.file.name} の修正対象プレビュー`;
  correctionFileName.textContent = photo.file.name;
  currentCategoryLabel.textContent = `${photo.category}${photo.corrected ? "（修正済み）" : ""}`;
  correctionReason.textContent = photo.failed
    ? `推論失敗: ${photo.errorMessage}`
    : photo.matchedObjects.length > 0
      ? `検出根拠: ${formatMatchedObjects(photo.matchedObjects)}`
      : "検出根拠なし（信頼度不足）";
  populateCorrectionCategorySelect(photo.category);
  switchView("correction");
}

function openNextCorrectionView() {
  const nextPhoto = classifiedPhotos.find((photo) => !photo.corrected) || classifiedPhotos[0];
  if (nextPhoto) openCorrectionView(nextPhoto);
}

function openConfirmationView() {
  renderConfirmation();
  switchView("confirmation");
}

function discardResults() {
  revokePhotoPreviews();
  selectedFiles = [];
  classifiedPhotos = [];
  activeCategory = "すべて";
  currentCorrectionPhoto = null;
  propertyIdInput.value = "";
  showError("");
  statusMessage.hidden = true;
  renderFiles();
  switchView("upload");
}

photoInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
  event.target.value = "";
});

folderInput.addEventListener("change", (event) => {
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
  if (event.target !== photoInput && event.target !== folderInput && event.target.tagName !== "LABEL") photoInput.click();
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
  revokePhotoPreviews();
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

openManualCorrectionButton.addEventListener("click", () => {
  openNextCorrectionView();
});

openConfirmationButton.addEventListener("click", () => {
  renderResults();
  openConfirmationView();
});

backToResultsButton.addEventListener("click", () => {
  resultsProperty.textContent = `${propertyIdInput.value.trim()} / ${classifiedPhotos.length}枚`;
  renderResults();
  switchView("results");
});

discardFromConfirmationButton.addEventListener("click", () => {
  discardResults();
});

correctionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentCorrectionPhoto) return;
  const nextCategory = correctionCategory.value;
  if (!CATEGORIES.includes(nextCategory) || nextCategory === "すべて") return;
  currentCorrectionPhoto.category = nextCategory;
  currentCorrectionPhoto.corrected = true;
  currentCorrectionPhoto = null;
  resultsProperty.textContent = `${propertyIdInput.value.trim()} / ${classifiedPhotos.length}枚`;
  renderResults();
  switchView("results");
});

cancelCorrectionButton.addEventListener("click", () => {
  currentCorrectionPhoto = null;
  switchView("results");
});

backToUploadButton.addEventListener("click", () => {
  discardResults();
});
