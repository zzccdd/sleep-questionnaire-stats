# 免费公开问卷部署流程

这个方案使用：

- GitHub Pages：免费托管问卷网页
- Google Sheets：免费保存所有受试者提交的数据
- Google Apps Script：免费接收提交、提供研究端读取接口

## 1. 创建 Google Sheet

1. 打开 Google Drive。
2. 新建一个 Google Sheet，命名为 `每日睡眠自我报告数据`。
3. 打开菜单 `扩展程序` -> `Apps Script`。
4. 删除默认代码，把 `google-apps-script/Code.gs` 的全部内容复制进去。
5. 保存项目。

## 2. 设置研究端 PIN

在 Apps Script 左侧进入 `Project Settings`，找到 `Script properties`，添加：

```text
ADMIN_PIN = 你自己的研究端密码
```

如果不设置，默认 PIN 是：

```text
change-me
```

## 3. 初始化表头

在 Apps Script 顶部函数下拉框选择：

```text
setupSheet
```

点击 Run。第一次运行会要求授权，按提示允许。

## 4. 部署为 Web App

1. 点击右上角 `Deploy` -> `New deployment`。
2. 类型选择 `Web app`。
3. `Execute as` 选择 `Me`。
4. `Who has access` 选择 `Anyone`。
5. 点击 Deploy。
6. 复制 Web App URL，形如：

```text
https://script.google.com/macros/s/AKfycb.../exec
```

## 5. 填写网页配置

打开 `config.js`，把 URL 填进去：

```js
window.SLEEP_REPORT_CONFIG = {
  backend: "free-google-sheets",
  googleScriptUrl: "https://script.google.com/macros/s/AKfycb.../exec",
};
```

## 6. 上传到 GitHub Pages

把本文件夹上传到 GitHub 仓库，然后在 GitHub 仓库设置中启用 Pages。

受试者使用 GitHub Pages 的公开网址填写问卷。

## 7. 使用方式

受试者：

1. 打开公开网址。
2. 第一次填写研究编号。
3. 默认勾选“在这台设备记住我的研究编号”。
4. 每天提交睡眠自我报告。

研究人员：

1. 打开同一个公开网址。
2. 点击 `统计概览` 或 `研究记录`。
3. 输入研究端 PIN。
4. 查看统计、记录表或导出 CSV。

## 注意

- 不建议收集姓名、手机号、身份证号等直接身份信息。
- Google Apps Script 有免费配额限制，小规模研究问卷通常够用。
- 如果后续样本量很大，建议升级为数据库版本。
