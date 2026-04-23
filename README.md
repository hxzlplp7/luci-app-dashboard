# Luci App Dashboard 🚀

![License](https://img.shields.io/github/license/hxzlplp7/luci-app-dashboard)
![Version](https://img.shields.io/github/v/tag/hxzlplp7/luci-app-dashboard?label=version)
![Build Status](https://github.com/hxzlplp7/luci-app-dashboard/actions/workflows/release.yml/badge.svg)

这是一个专为 OpenWrt/LEDE 路由器设计的**现代化、极客风格**的仪表盘 (Dashboard) 插件。它不仅提供了直观的系统状态监控，还采用了先进的前端技术打造了丝滑的交互体验。

本项目是对原版 `luci-app-quickstart` 的深度重构与视觉进化版。

## ✨ 核心特性

- 📈 **实时折线流量监控**：采用 **Apache ECharts** 引擎，支持渐变色实时双向网速监控，精确捕捉每一秒的带宽波动。
- 🌍 **公网 IP 嗅探**：原生集成异步公网 IP 自检功能，并能识别地理位置归属，一眼看穿网络连接质量。
- ⏱️ **丝滑时钟同步**：采用前端计数 + 后端校准技术，实现运行时间、系统时钟的秒级平滑跳动，极低系统负载。
- 🌡️ **全维度硬件健康**：深度获取 CPU 使用率、实时温度、内存占用率，以及固件版本、内核版本、DNS 服务器等核心参数。
- 🛡️ **纯净且独立**：完全移除原版对 iStoreOS 生态、易有云 (LinkEase)、DDNSTO 等专有云服务的依赖，保持系统整洁。
- 🌐 **多语言支持**：完整的 I18n 国际化架构，支持英文主体包与独立的中文化包分布。

## 🛠️ 依赖关系

在使用或编译本插件前，请确保系统中已安装以下核心依赖：
- `luci-app-nlbwmon`：用于获取网络接口流量统计。

## 📦 如何安装/编译

### 1. 直接安装 (推荐)
前往 [Releases 页面](https://github.com/hxzlplp7/luci-app-dashboard/releases) 下载最新的 `.ipk` 文件。
通常需要安装两个包：
* `luci-app-dashboard_xxxx_all.ipk` (项目主体)
* `luci-i18n-dashboard-zh-cn_xxxx_all.ipk` (中文汉化，可选)

安装后请清理 LuCI 缓存：
```bash
rm -f /tmp/luci-indexcache
```

### 2. 源码编译
将源码放入 OpenWrt SDK 的 `package` 目录：
```bash
git clone https://github.com/hxzlplp7/luci-app-dashboard.git package/luci-app-dashboard
./scripts/feeds update -a
./scripts/feeds install -a
make menuconfig # 选择 LuCI -> Applications -> luci-app-dashboard
make package/luci-app-dashboard/compile V=s
```

## 📜 协议与授权

本代码遵循 **Apache License, Version 2.0** 协议。详细内容请参阅 `LICENSE` 文件。

---
*Created with ❤️ by dashboard-community.*

## Active Domains (dnsmasq + conntrack)

Hot Domains now prefers live DNS logs and connection metadata:

1. `appfilter` visit data (if available)
2. `dnsmasq` query/reply logs from `logread`
3. `conntrack` destination flows mapped to DNS replies
4. other DNS logs (`smartdns`, `adguardhome`, `mosdns`, etc.)
5. proxy logs as fallback only (`openclash`, `passwall`, `mihomo`, `sing-box`)

This package does **not** auto-edit DNS config. Enable dnsmasq query logs manually:

```bash
echo 'log-queries=proto' >> /etc/dnsmasq.conf
/etc/init.d/dnsmasq restart
```

Observe DNS and flow activity:

```bash
logread -f | grep dnsmasq
conntrack -E
```

Note: `conntrack` provides flow metadata (`src/dst/proto/port`) and does not contain domain names by itself. Domain attribution comes from DNS log correlation.

## Built-in OAF Feature Library (free-compat)

This package now ships a built-in OAF feature library:

- Default bundle: `feature3.0_cn_20250929-free-compat` (`v25.9.29`)
- Built-in path: `/usr/share/luci-app-dashboard/oaf-default/feature.cfg` + `app_icons/`
- First install behavior:
  - If `/etc/appfilter/feature.cfg` does not exist, it is initialized from the built-in bundle.
  - Icons are initialized to `/www/luci-static/resources/app_icons/`.
  - `/etc/appfilter/version.txt` is initialized to `v25.9.29`.
- Upgrade behavior:
  - If `/etc/appfilter/feature.cfg` already exists (for example, user uploaded a newer library), package upgrade will not overwrite it.

Manual upload update (`.bin`/`.zip`) is still supported through the existing LuCI upload button.

## Optional kmod backend (`kmod-dashboard-monitor`)

This repository now includes an optional kernel backend at:

- `kmod-dashboard-monitor/`
- proc output: `/proc/dashboard_monitor/stats`
- traffic accounting: IPv4 + IPv6 (pre/postrouting hooks)

The LuCI controller (`/admin/dashboard/api/traffic` and `databus.interface_traffic`) will now:

1. read `/proc/dashboard_monitor/stats` first when available
2. fallback to userspace `/sys/class/net/*/statistics` sampling when the module is absent

Proc output format uses `key=value` lines, for example:

```text
source=kmod-dashboard-monitor
interface=pppoe-wan
sampled_at=1713859200
tx_bytes=123456
rx_bytes=654321
tx_rate=1024
rx_rate=4096
```

To build the kmod in OpenWrt SDK/buildroot:

```bash
make package/kmod-dashboard-monitor/compile V=s
```

If you want to pin a specific interface, load module with parameter:

```bash
insmod dashboard_monitor ifname=pppoe-wan
```
