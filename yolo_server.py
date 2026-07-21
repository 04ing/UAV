import sys
import json
import os
import base64

os.environ['ULTRALYTICS_SETTINGS'] = r'e:\无人机智能巡检系统\ultralytics_settings.yaml'
os.environ['HOME'] = r'e:\无人机智能巡检系统'
os.environ['USERPROFILE'] = r'e:\无人机智能巡检系统'
os.environ['TMP'] = r'e:\无人机智能巡检系统\temp'
os.environ['TEMP'] = r'e:\无人机智能巡检系统\temp'

os.makedirs(r'e:\无人机智能巡检系统\temp', exist_ok=True)

import torch
import numpy as np
import cv2
from http.server import HTTPServer, BaseHTTPRequestHandler

MODEL_PATH = r"e:\无人机智能巡检系统\best.pt"
LABELS = {0: '裂缝', 1: '剥落'}

model = None

def load_model():
    try:
        model_dict = torch.load(MODEL_PATH, map_location='cpu', weights_only=False)
        if 'model' not in model_dict:
            return None, "模型文件格式错误，缺少model键"
        model = model_dict['model']
        model.float()
        model.eval()
        return model, None
    except Exception as e:
        return None, f"模型加载失败: {str(e)}"

def letterbox(img, new_shape=(640, 640), color=(114, 114, 114)):
    shape = img.shape[:2]
    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
    dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
    dw /= 2
    dh /= 2
    if shape[::-1] != new_unpad:
        img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    img = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return img, r, (dw, dh)

def preprocess(img):
    img, ratio, pad = letterbox(img)
    img = img[:, :, ::-1].transpose(2, 0, 1)
    img = np.ascontiguousarray(img)
    img = torch.from_numpy(img).unsqueeze(0).float() / 255.0
    return img, ratio, pad

def scale_coords(img1_shape, coords, img0_shape, ratio, pad):
    print(f"SCALE DEBUG: coords type={type(coords)}, value={coords}", flush=True)
    print(f"SCALE DEBUG: ratio={ratio}, pad={pad}, img0_shape={img0_shape}", flush=True)
    
    if not isinstance(coords, np.ndarray):
        coords = np.array(coords)
    
    gain = ratio
    coords[:, [0, 2]] -= pad[0]
    coords[:, [1, 3]] -= pad[1]
    coords[:, :4] /= gain
    coords[:, 0] = np.clip(coords[:, 0], 0, img0_shape[1])
    coords[:, 1] = np.clip(coords[:, 1], 0, img0_shape[0])
    coords[:, 2] = np.clip(coords[:, 2], 0, img0_shape[1])
    coords[:, 3] = np.clip(coords[:, 3], 0, img0_shape[0])
    return coords

def detect_image(model, img):
    try:
        img_tensor, ratio_val, pad_val = preprocess(img)
        
        with torch.no_grad():
            preds = model(img_tensor)
        
        if isinstance(preds, tuple):
            preds = preds[0]
        
        if isinstance(preds, torch.Tensor):
            preds = preds.permute(0, 2, 1).cpu().numpy()
        else:
            preds = np.array(preds)
        
        boxes = []
        
        if len(preds.shape) >= 2:
            det = preds[0]
            if len(det.shape) >= 1:
                for i in range(det.shape[0]):
                    box = det[i]
                    if hasattr(box, '__len__') and len(box) >= 6:
                        x = float(box[0])
                        y = float(box[1])
                        w = float(box[2])
                        h = float(box[3])
                        conf = float(box[4])
                        cls_probs = box[5:5+len(LABELS)]
                        cls = int(np.argmax(cls_probs))
                        cls_conf = float(cls_probs[cls])
                        combined_conf = conf * cls_conf
                        
                        if combined_conf >= 0.2 and cls in LABELS:
                            x_center = x
                            y_center = y
                            width = w
                            height = h
                            x_min = x_center - width / 2
                            y_min = y_center - height / 2
                            x_max = x_center + width / 2
                            y_max = y_center + height / 2
                            
                            coords_np = np.array([[x_min, y_min, x_max, y_max]])
                            
                            gain = ratio_val
                            coords_np[:, [0, 2]] -= pad_val[0]
                            coords_np[:, [1, 3]] -= pad_val[1]
                            coords_np[:, :4] /= gain
                            coords_np[:, 0] = np.clip(coords_np[:, 0], 0, img.shape[1])
                            coords_np[:, 1] = np.clip(coords_np[:, 1], 0, img.shape[0])
                            coords_np[:, 2] = np.clip(coords_np[:, 2], 0, img.shape[1])
                            coords_np[:, 3] = np.clip(coords_np[:, 3], 0, img.shape[0])
                            
                            x_min_out, y_min_out, x_max_out, y_max_out = coords_np[0]
                            
                            boxes.append({
                                "x": float(x_min_out),
                                "y": float(y_min_out),
                                "w": float(x_max_out - x_min_out),
                                "h": float(y_max_out - y_min_out),
                                "label": LABELS[cls],
                                "confidence": float(combined_conf),
                                "class_id": cls
                            })
        
        categories = {}
        for box in boxes:
            label = box["label"]
            categories[label] = categories.get(label, 0) + 1
        
        total_confidence = sum(box["confidence"] for box in boxes)
        avg_confidence = total_confidence / len(boxes) if boxes else 0
        
        return {
            "code": 0,
            "msg": "识别完成",
            "data": {
                "boxes": boxes,
                "summary": {
                    "totalCount": len(boxes),
                    "categories": categories,
                    "accuracy": avg_confidence
                }
            }
        }
    except Exception as e:
        import traceback
        return {"code": 1, "msg": f"识别失败: {str(e)}\n{traceback.format_exc()}", "data": None}

class YOLOHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                img_bytes = base64.b64decode(post_data)
                img_array = np.frombuffer(img_bytes, dtype=np.uint8)
                img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            except:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"code": 1, "msg": "解码图片失败"}).encode('utf-8'))
                return
            
            if img is None:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"code": 1, "msg": "无法解码图片"}).encode('utf-8'))
                return
            
            result = detect_image(model, img)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"code": 1, "msg": str(e)}).encode('utf-8'))
    
    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    model, error = load_model()
    if model is None:
        print(f"模型加载失败: {error}")
        sys.exit(1)
    
    print("模型加载成功，启动YOLO推理服务...")
    
    server = HTTPServer(('localhost', 8080), YOLOHandler)
    print("YOLO推理服务运行在 http://localhost:8080")
    server.serve_forever()