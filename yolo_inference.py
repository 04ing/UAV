import sys
import json
import os
import base64

os.environ['ULTRALYTICS_SETTINGS'] = r'e:\无人机智能巡检系统\ultralytics_settings.yaml'
os.environ['HOME'] = r'e:\无人机智能巡检系统'
os.environ['USERPROFILE'] = r'e:\无人机智能巡检系统'
os.environ['TMP'] = r'e:\无人机智能巡检系统\temp'
os.environ['TEMP'] = r'e:\无人机智能巡检系统\temp'
os.environ['PYTHONUSERBASE'] = r'e:\无人机智能巡检系统'

os.makedirs(r'e:\无人机智能巡检系统\temp', exist_ok=True)

import torch
import numpy as np
import cv2

MODEL_PATH = r"e:\无人机智能巡检系统\best.pt"
LABELS = {0: '裂缝', 1: '剥落'}

def load_model():
    try:
        model_dict = torch.load(MODEL_PATH, map_location='cpu', weights_only=False)
        if 'model' not in model_dict:
            print(json.dumps({"error": "模型文件格式错误，缺少model键"}), flush=True)
            sys.exit(1)
        model = model_dict['model']
        model.float()
        model.eval()
        return model
    except Exception as e:
        print(json.dumps({"error": f"模型加载失败: {str(e)}"}), flush=True)
        sys.exit(1)

def letterbox(img, new_shape=(640, 640), color=(114, 114, 114)):
    shape = img.shape[:2]
    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
    dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
    dw /= 2
    dh /= 2
    img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    img = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return img, r, (dw, dh)

def scale_coords(img1_shape, coords, img0_shape, ratio_pad=None):
    if ratio_pad is None:
        gain = min(img1_shape[0] / img0_shape[0], img1_shape[1] / img0_shape[1])
        pad = (img1_shape[1] - img0_shape[1] * gain) / 2, (img1_shape[0] - img0_shape[0] * gain) / 2
    else:
        gain = ratio_pad[0]
        pad = ratio_pad[1]
    coords[:, [0, 2]] -= pad[0]
    coords[:, [1, 3]] -= pad[1]
    coords[:, :4] /= gain
    clip_coords(coords, img0_shape)
    return coords

def clip_coords(boxes, img_shape):
    boxes[:, 0].clamp_(0, img_shape[1])
    boxes[:, 1].clamp_(0, img_shape[0])
    boxes[:, 2].clamp_(0, img_shape[1])
    boxes[:, 3].clamp_(0, img_shape[0])

def detect_image(model, img):
    try:
        if img is None:
            return {"error": "无法解码图片"}
        
        img_h, img_w = img.shape[:2]
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img_resized, ratio, pad = letterbox(img_rgb, new_shape=(640, 640))
        
        img_tensor = torch.from_numpy(img_resized).permute(2, 0, 1).unsqueeze(0).float() / 255.0
        
        with torch.no_grad():
            preds = model(img_tensor)
        
        if isinstance(preds, tuple):
            pred_boxes = preds[0]
            proto = preds[1] if len(preds) > 1 else None
        else:
            pred_boxes = preds
            proto = None
        
        if isinstance(pred_boxes, list):
            pred_boxes = torch.cat(pred_boxes, 1)
        
        if pred_boxes.dim() == 4:
            pred_boxes = pred_boxes[0]
        
        nc = 2
        nm = 32
        
        pred_boxes = pred_boxes.permute(0, 2, 1)
        
        xc = pred_boxes[:, :, 4:4+nc].amax(-1) > 0.25
        
        boxes = []
        for batch_idx in range(pred_boxes.shape[0]):
            batch_data = pred_boxes[batch_idx]
            batch_mask = xc[batch_idx]
            selected = batch_data[batch_mask]
            
            for p in selected:
                conf = p[4:4+nc].amax().item()
                if conf < 0.25:
                    continue
                cls = p[4:4+nc].argmax().item()
                if cls not in LABELS:
                    continue
                
                x, y, w, h = p[:4].tolist()
                x1 = x - w / 2
                y1 = y - h / 2
                x2 = x + w / 2
                y2 = y + h / 2
                
                box_tensor = torch.tensor([[x1, y1, x2, y2]])
                box_tensor = scale_coords((640, 640), box_tensor, (img_h, img_w), ratio_pad=(ratio, pad))
                
                x1, y1, x2, y2 = box_tensor[0].tolist()
                
                x_percent = (x1 / img_w) * 100
                y_percent = (y1 / img_h) * 100
                w_percent = ((x2 - x1) / img_w) * 100
                h_percent = ((y2 - y1) / img_h) * 100
                
                boxes.append({
                    "x": round(x_percent, 2),
                    "y": round(y_percent, 2),
                    "w": round(w_percent, 2),
                    "h": round(h_percent, 2),
                    "label": LABELS[cls],
                    "confidence": round(conf, 4),
                    "class_id": cls
                })
        
        categories = {}
        for b in boxes:
            categories[b["label"]] = categories.get(b["label"], 0) + 1
        
        result = {
            "code": 0,
            "msg": "识别完成",
            "data": {
                "boxes": boxes,
                "summary": {
                    "totalCount": len(boxes),
                    "categories": categories,
                    "accuracy": round(sum(b["confidence"] for b in boxes) / max(len(boxes), 1), 4) if boxes else 0
                }
            }
        }
        return result
    except Exception as e:
        import traceback
        return {"error": f"识别失败: {str(e)}\n{traceback.format_exc()}"}

if __name__ == "__main__":
    model = load_model()
    
    input_data = None
    
    if len(sys.argv) > 1:
        input_data = sys.argv[1]
    
    if not input_data:
        input_data = sys.stdin.read().strip()
    
    if not input_data:
        print(json.dumps({"error": "未接收到图片数据"}), flush=True)
        sys.exit(1)
    
    img = None
    
    if os.path.exists(input_data):
        try:
            file_bytes = np.fromfile(input_data, dtype=np.uint8)
            if len(file_bytes) > 0:
                img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        except Exception:
            pass
    
    if img is None:
        try:
            img_bytes = base64.b64decode(input_data)
            img_array = np.frombuffer(img_bytes, dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        except Exception as e:
            print(json.dumps({"error": f"解码图片失败: {str(e)}"}), flush=True)
            sys.exit(1)
    
    if img is None:
        print(json.dumps({"error": "无法解码图片数据"}), flush=True)
        sys.exit(1)
    
    result = detect_image(model, img)
    print(json.dumps(result, ensure_ascii=False), flush=True)