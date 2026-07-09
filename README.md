# 每日睡眠自我报告统计网站

这是一个问卷形式的每日睡眠自我报告网站，用来收集不同受试者的每日记录，并按研究编号汇总统计。

## 推荐免费方案

推荐使用：

- GitHub Pages：免费托管网页
- Google Sheets：免费保存受试者提交数据
- Google Apps Script：免费接收问卷提交、提供研究端读取接口

完整步骤见：

```text
FREE_GOOGLE_SHEETS_SETUP.md
```

核心流程：

1. 创建 Google Sheet。
2. 把 `google-apps-script/Code.gs` 复制到 Google Sheet 的 Apps Script。
3. 设置 `ADMIN_PIN`。
4. 部署 Apps Script Web App。
5. 把 Web App URL 填到 `config.js`。
6. 把网站上传到 GitHub Pages。

受试者打开 GitHub Pages 网址填写问卷；研究人员打开同一个网址，在“统计概览”或“研究记录”输入 PIN 后查看和导出数据。

## 本地预览

双击 `index.html` 可以直接预览界面。

注意：如果 `config.js` 还没有填 Google Apps Script URL，提交只会暂存在当前浏览器，不能跨电脑汇总。

## 可选 Node 服务器方案

如果以后想用自己的服务器，也可以运行：

```bash
node server.js
```

然后打开：

```text
http://localhost:8080
```

正式部署 Node 版本时建议设置：

```bash
HOST=0.0.0.0
ADMIN_PIN=your-pin
DATA_DIR=/var/data
```

Node 版本需要支持持久化磁盘或数据库。免费方案优先使用 Google Sheets。

## 数据字段

导出的 CSV 包含研究编号、填写日期、睡眠日期、上床时间、准备入睡时间、醒来时间、起床时间、睡眠时长、在床时间、睡眠效率、入睡用时、夜醒次数、午睡、运动、咖啡因、饮酒、药物、身体不适、压力、环境、设备状态、主观睡眠质量、恢复程度和白天困倦等字段。
