# 大疆上云 API 开通指南

## 概述

本项目已集成大疆上云 API（DJI Cloud API）适配层，支持通过 HTTP REST 和 MQTT 协议与大疆无人机进行实时通信。当前使用 Mock 数据运行，配置 DJI 凭证后即可切换到真实数据。

## 前置条件

- 拥有大疆开发者账号（企业级）
- 拥有至少一台已激活的大疆无人机设备
- 设备已绑定到大疆开发者平台

## 开通步骤

### 步骤一：注册大疆开发者账号

1. 访问 [大疆开发者平台](https://developer.dji.com)
2. 点击右上角「注册」按钮
3. 填写注册信息，完成邮箱验证

### 步骤二：创建企业应用

1. 登录后进入「控制台」
2. 点击「创建应用」
3. 选择「企业应用」类型
4. 填写应用信息：
   - 应用名称：无人机智能巡检系统
   - 应用描述：端边云协同的智能巡检平台
   - 应用类型：Web 应用

### 步骤三：获取 API 凭证

创建应用成功后，在应用详情页面获取以下凭证：

| 凭证名称 | 获取位置 | 说明 |
|---------|---------|------|
| App ID | 应用概览页面 | 应用唯一标识 |
| App Key | 应用概览页面 | 应用密钥 |
| App License | 应用授权页面 | 需要申请企业授权 |

### 步骤四：配置回调地址

1. 在应用详情页面找到「回调地址」设置
2. 添加以下回调地址：
   - `http://your-domain.com/api/dji/callback`
   - `http://localhost:3000/api/dji/callback`（开发环境）

### 步骤五：绑定设备

1. 在控制台进入「设备管理」
2. 点击「绑定设备」
3. 输入无人机序列号（SN）完成绑定

## 配置项目

### 修改 .env 文件

打开项目根目录的 `.env` 文件，填入您的 DJI 凭证：

```env
# DJI Cloud API 配置
DJI_APP_ID=your_app_id_here
DJI_APP_KEY=your_app_key_here
DJI_APP_LICENSE=your_app_license_here

# 开启 DJI Cloud API（改为 true）
DJI_CLOUD_ENABLED=true
```

### 配置说明

| 配置项 | 默认值 | 说明 |
|-------|--------|------|
| DJI_APP_ID | 空 | 您的应用 ID |
| DJI_APP_KEY | 空 | 您的应用密钥 |
| DJI_APP_LICENSE | 空 | 您的应用授权码 |
| DJI_API_HOST | https://api.dji.com | DJI Cloud API 服务地址 |
| DJI_MQTT_HOST | mqtts://mqtt.dji.com | MQTT 服务地址 |
| DJI_MQTT_PORT | 8883 | MQTT 服务端口 |
| DJI_CLOUD_ENABLED | false | 是否启用 DJI Cloud API |

## 启动验证

配置完成后，启动服务：

```bash
npm start
```

启动日志应显示：

```
Server running at http://localhost:3000
[DJI] DJI Cloud API is enabled, connecting to MQTT...
[DJI] Access Token acquired, expires in 3600 seconds
[DJI-MQTT] Connected to DJI MQTT broker
[DJI-MQTT] Subscribed to telemetry topic: thing/product/+/osd
[DJI-MQTT] Subscribed to alarm topic: thing/product/+/alarm
```

## API 接口映射

| 项目接口 | DJI Cloud API | 说明 |
|---------|--------------|------|
| GET /api/drones | GET /api/v1/devices | 获取设备列表 |
| GET /api/drones/:id | GET /api/v1/devices/{sn} | 获取设备详情 |
| POST /api/drones/:id/return-home | POST /api/v1/devices/{sn}/commands/return-home | 一键返航 |
| 实时遥测 | MQTT: thing/product/{sn}/osd | 实时遥测数据 |
| 告警推送 | MQTT: thing/product/{sn}/alarm | 告警推送 |

## 常见问题

### Q: App License 如何获取？

A: App License 需要在大疆开发者平台申请企业授权，提交企业资质材料审核通过后获得。

### Q: 设备无法绑定？

A: 确保设备序列号正确，且设备已完成激活并接入互联网。

### Q: 启动后仍然使用 Mock 数据？

A: 检查 `.env` 文件中 `DJI_CLOUD_ENABLED` 是否设置为 `true`，以及三个凭证是否完整填写。

### Q: MQTT 连接失败？

A: 检查网络连接，确保可以访问 `mqtt.dji.com:8883`，并确认 App ID 和 Token 有效。

## 参考文档

- [大疆开发者平台](https://developer.dji.com)
- [DJI Cloud API 文档](https://developer.dji.com/cloud-api)
- [MQTT 协议说明](https://developer.dji.com/cloud-api/docs/en/communication-protocol/mqtt)