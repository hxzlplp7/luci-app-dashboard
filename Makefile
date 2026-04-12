# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-dashboard
PKG_VERSION:=1.0.2-20230817
PKG_MAINTAINER:=dashboard-community

LUCI_TITLE:=LuCI support for Dashboard
LUCI_DEPENDS:=+luci-app-nlbwmon
LUCI_PKGARCH:=all

LUCI_MINIFY_CSS:=0
LUCI_MINIFY_JS:=0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
