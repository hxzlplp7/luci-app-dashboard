# LuCI App Dashboard

这是一个面向 OpenWrt/LEDE 的仪表盘插件，提供网络状态、流量、在线设备、应用活跃度、域名活跃度和系统信息等展示能力。

## 安装

推荐使用在线安装：

```sh
sh -c "$(wget -O- https://github.com/hxzlplp7/luci-app-dashboard/releases/latest/download/install.sh)"
```

安装指定版本：

```sh
wget -O /tmp/install-dashboard.sh https://github.com/hxzlplp7/luci-app-dashboard/releases/latest/download/install.sh
VERSION=v0.0.1 sh /tmp/install-dashboard.sh
```

安装脚本会自动下载并安装：

- `luci-app-dashboard.ipk`
- `luci-i18n-dashboard-zh-cn.ipk`
- `dashboard-core-ARCH`（发布时由 `dashboard-core/` 后端一期源码构建）

如果自动识别架构不符合你的设备，请手动指定：

```sh
DASHBOARD_CORE_ARCH=aarch64_cortex-a53 sh /tmp/install-dashboard.sh
```

## 后端约定

`dashboard-core` 是必须的后端二进制，安装路径为 `/usr/bin/dashboard-core`，由 `/etc/init.d/dashboard-core` 管理。

后端服务仅监听本机回环地址：

```text
127.0.0.1:19090
```

前端通过 LuCI 认证后的 API 间接访问后端，不应直接访问后端端口：

```text
/admin/dashboard/api/databus
```

`dashboard-core` 的 `GET /databus` 必须返回 JSON，包含以下字段：

- `status`
- `system_status`
- `network_status`
- `interface_traffic`
- `online_apps`
- `app_recognition`
- `domains`
- `realtime_urls`
- `devices`

`interface_traffic` 字段示例：

```json
{
  "interface": "pppoe-wan",
  "tx_bytes": 123456,
  "rx_bytes": 654321,
  "tx_rate": 1024,
  "rx_rate": 4096,
  "sampled_at": 1713859200,
  "source": "dashboard-core"
}
```

`domains` 字段示例：

```json
{
  "source": "dashboard-core",
  "realtime_source": "dashboard-core",
  "top": [{ "domain": "example.com", "count": 10 }],
  "realtime": [{ "domain": "api.example.com", "count": 1 }]
}
```

## 反向代理

如果你把页面反代到公网，只暴露 LuCI 的 dashboard/API 路径即可，不要暴露 `127.0.0.1:19090`。

可反代以下任一路径到路由器：

```text
/cgi-bin/luci/admin/dashboard/api/databus
/admin/dashboard/api/databus
```

## 编译

将仓库放到 OpenWrt SDK 的 `package` 目录下：

```sh
git clone https://github.com/hxzlplp7/luci-app-dashboard.git package/luci-app-dashboard
./scripts/feeds update -a
./scripts/feeds install -a
make package/luci-app-dashboard/compile V=s
```

GitHub Release 流程会构建 LuCI 包和后端一期，并发布给安装脚本使用的稳定文件名：

- `install.sh`
- `luci-app-dashboard.ipk`
- `luci-i18n-dashboard-zh-cn.ipk`
- `dashboard-core-ARCH`

## OAF 特征库

LuCI 包内置 OAF 兼容特征库：

- 默认特征包：`feature3.0_cn_20250929-free-compat`（`v25.9.29`）
- 内置路径：`/usr/share/luci-app-dashboard/oaf-default/feature.cfg`
- 图标路径：`/www/luci-static/resources/app_icons/`

首次安装时，如果 `/etc/appfilter/feature.cfg` 不存在，程序会自动初始化该文件。升级时不会覆盖用户已存在的特征库。

## 许可证

Apache License 2.0，详见 `LICENSE`。
