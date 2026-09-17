import os
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO

MODEL_PATH = os.getenv("YOLO_MODEL", "yolo11n.pt")
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
DISPLAY_LABELS = {
    "toilet": "便器",
    "sink": "シンク",
    "toothbrush": "歯ブラシ",
    "hair drier": "ドライヤー",
    "oven": "オーブン",
    "microwave": "電子レンジ",
    "refrigerator": "冷蔵庫",
    "toaster": "トースター",
    "couch": "ソファ",
    "tv": "テレビ",
    "dining table": "ダイニングテーブル",
    "bed": "ベッド",
    "backpack": "バックパック",
    "umbrella": "傘",
    "potted plant": "観葉植物",
    "bench": "ベンチ",
}
model: YOLO | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model
    model = YOLO(MODEL_PATH)
    yield
    model = None


app = FastAPI(title="PhotoSort YOLO API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_methods=["POST"],
    allow_headers=["*"],
)


def validate_image(content: bytes, content_type: str | None, filename: str | None) -> Image.Image:
    extension = os.path.splitext(filename or "")[1].lower()
    if content_type not in ALLOWED_CONTENT_TYPES and extension not in {".jpg", ".jpeg", ".png"}:
        raise HTTPException(status_code=400, detail="JPEG、JPGまたはPNG形式の画像だけを受け付けます。")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="画像サイズは10MB以下にしてください。")
    try:
        image = Image.open(BytesIO(content))
        image.verify()
        image = Image.open(BytesIO(content)).convert("RGB")
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="画像を読み込めません。") from error
    return image


def serialize_results(result: Any) -> list[dict[str, Any]]:
    names = result.names
    detections = []
    boxes = result.boxes
    for index in range(len(boxes)):
        class_id = int(boxes.cls[index].item())
        confidence = round(float(boxes.conf[index].item()), 4)
        x1, y1, x2, y2 = [round(float(value), 2) for value in boxes.xyxy[index].tolist()]
        detections.append(
            {
                "name": names[class_id],
                "label": DISPLAY_LABELS.get(names[class_id], names[class_id]),
                "confidence": confidence,
                "box": {
                    "x": x1,
                    "y": y1,
                    "width": round(x2 - x1, 2),
                    "height": round(y2 - y1, 2),
                },
            }
        )
    return detections


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_PATH}


@app.post("/api/infer")
async def infer(file: UploadFile = File(...)) -> dict[str, Any]:
    if model is None:
        raise HTTPException(status_code=503, detail="YOLOモデルを読み込めていません。")
    content = await file.read()
    image = validate_image(content, file.content_type, file.filename)
    try:
        result = model.predict(source=image, verbose=False)[0]
    except Exception as error:
        raise HTTPException(status_code=500, detail="画像の推論に失敗しました。") from error
    return {
        "status": "completed",
        "fileName": file.filename or "image",
        "detectedObjects": serialize_results(result),
    }
