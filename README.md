# luci-app-dashboard (原 luci-app-quickstart)

这是一个专为 OpenWrt/LEDE 路由器开发的轻量级、独立的仪表盘 (Dashboard) 插件。

本项目是对原版 `luci-app-quickstart` 的深度精简与重构版本。为了让插件能够在所有标准的 OpenWrt 环境中独立运行，我们移除了原版中所有与特定生态绑定的内容。

## 主要变更说明

* **脱离 iStoreOS 依赖**：去除了所有有关 iStoreOS 专属架构的检测与依赖代码。
* **移除第三方云服务集成**：完全剥离了原版配套的 **“易有云” (LinkEase)** 存储服务和 **DDNSTO** 远程访问服务的相关接口及前端入口。
* **独立化运行**：现在这只是一个纯粹、轻量、通用的系统状态 Dashboard 面板组件，不会默默拉起任何无关的后台服务。

## 依赖关系

在编译或安装本插件前，请确保环境中已具备以下依赖：
* `luci-app-nlbwmon`：用于 Dashboard 获取各接口的网络流量统计。

## 如何编译

1. 将本源码目录放置于 OpenWrt 编译环境的 `package` 目录下，或者作为自定义源添加：
   ```bash
   cd package
   git clone <本项目的仓库地址> luci-app-dashboard
   ```
2. 更新 package 列表：
   ```bash
   ./scripts/feeds update -a
   ./scripts/feeds install -a
   ```
3. 进入 `make menuconfig` 配置界面：
   进入 `LuCI` -> `Applications`，找到并勾选 `<*>` `luci-app-dashboard`。
4. 进行编译或单包编译：
   ```bash
   make package/luci-app-dashboard/compile V=s
   ```
5. 编译完成后，将生成的 `ipk` 文件上传至路由器并使用 `opkg install` 进行安装。

## 协议与授权

本代码遵循 Apache License, Version 2.0 协议。详细请参考 `LICENSE` 文件。
