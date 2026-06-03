        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        } else {
            console.warn('[Dashboard] lucide is not loaded.');
        }

        function initNavButtons() {
            const navButtons = document.querySelectorAll('.dash-nav-button[data-nav-target]');
            navButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const target = button.getAttribute('data-nav-target');
                    if (target) window.location.href = target;
                });
            });
        }

        const getApiBase = () => {
            const h = window.location.pathname;
            return h.includes('/admin/') ? h.split('/admin/')[0] + '/admin/dashboard/api' : '/cgi-bin/luci/admin/dashboard/api';
        };

        const dashboardData = window.DashboardData || {};
        const pickActiveAppState = typeof dashboardData.pickActiveAppState === 'function'
            ? dashboardData.pickActiveAppState
            : function(databus, oafData) {
                const apps = (databus && databus.online_apps && databus.online_apps.list) || (oafData && oafData.active_apps) || [];
                let classStats = (databus && databus.app_recognition && databus.app_recognition.class_stats) || (oafData && oafData.class_stats) || [];
                
                // 若无分类统计数据但有活跃应用，则动态根据应用分类生成自聚合数据
                if (classStats.length === 0 && apps.length > 0) {
                    const statsMap = {};
                    apps.forEach(app => {
                        const rawClass = app.class_label || app.class || 'others';
                        const weight = 1;
                        statsMap[rawClass] = (statsMap[rawClass] || 0) + weight;
                    });
                    classStats = Object.keys(statsMap).map(key => ({
                        name: key,
                        time: statsMap[key]
                    }));
                }

                return {
                    apps: apps,
                    classStats: classStats,
                    source: (databus && databus.app_recognition && databus.app_recognition.source) || (oafData && oafData.active_source) || 'none',
                };
            };
        const deriveTrafficSnapshot = typeof dashboardData.deriveTrafficSnapshot === 'function'
            ? dashboardData.deriveTrafficSnapshot
            : function(sample, previousState, nowMs) {
                const now = Number(nowMs);
                const nextState = {
                    interface: sample && sample.interface ? String(sample.interface) : '',
                    tx_bytes: Math.max(0, Number(sample && sample.tx_bytes) || 0),
                    rx_bytes: Math.max(0, Number(sample && sample.rx_bytes) || 0),
                    at: Number.isFinite(now) && now > 0 ? now : Date.now(),
                };

                const backendTxRate = Number(sample && sample.tx_rate);
                const backendRxRate = Number(sample && sample.rx_rate);
                if (Number.isFinite(backendTxRate) || Number.isFinite(backendRxRate)) {
                    return {
                        txRate: Number.isFinite(backendTxRate) ? Math.max(0, backendTxRate) : 0,
                        rxRate: Number.isFinite(backendRxRate) ? Math.max(0, backendRxRate) : 0,
                        nextState: nextState,
                    };
                }

                if (!previousState || previousState.interface !== nextState.interface) {
                    return { txRate: 0, rxRate: 0, nextState: nextState };
                }

                const prevAt = Math.max(0, Number(previousState.at) || 0);
                const prevTx = Math.max(0, Number(previousState.tx_bytes) || 0);
                const prevRx = Math.max(0, Number(previousState.rx_bytes) || 0);
                const diffSeconds = (nextState.at - prevAt) / 1000;
                if (!(diffSeconds > 0)) {
                    return { txRate: 0, rxRate: 0, nextState: nextState };
                }

                const txDelta = nextState.tx_bytes - prevTx;
                const rxDelta = nextState.rx_bytes - prevRx;
                if (txDelta < 0 || rxDelta < 0) {
                    return { txRate: 0, rxRate: 0, nextState: nextState };
                }

                return {
                    txRate: txDelta / diffSeconds,
                    rxRate: rxDelta / diffSeconds,
                    nextState: nextState,
                };
            };
        const filterDomainRows = typeof dashboardData.filterDomainRows === 'function'
            ? dashboardData.filterDomainRows
            : function(rows) {
                const blockedFileSuffixes = new Set([
                    'cfg', 'conf', 'css', 'dat', 'eot', 'gz', 'ipk', 'js', 'json',
                    'ko', 'list', 'lock', 'log', 'lua', 'map', 'pid', 'rules', 'sh', 'so',
                    'tar', 'tmp', 'ttf', 'txt', 'woff', 'woff2', 'zip',
                ]);
                const syslogFacilities = new Set([
                    'auth', 'authpriv', 'cron', 'daemon', 'kern', 'kernel', 'local0',
                    'local1', 'local2', 'local3', 'local4', 'local5', 'local6',
                    'local7', 'mail', 'news', 'syslog', 'user', 'uucp',
                ]);
                const syslogLevels = new Set([
                    'alert', 'crit', 'debug', 'emerg', 'err', 'error', 'info',
                    'notice', 'warn', 'warning',
                ]);

                function isLikelyDomain(value) {
                    const domain = String(value || '').trim().toLowerCase();
                    if (!domain || domain.length > 253 || !domain.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
                        return false;
                    }
                    const labels = domain.split('.');
                    if (labels.length < 2) return false;
                    for (const label of labels) {
                        if (!label || label.length > 63 || !/^[a-z0-9-]+$/.test(label) || label.startsWith('-') || label.endsWith('-')) {
                            return false;
                        }
                    }
                    const tld = labels[labels.length - 1];
                    if (!/^[a-z]/.test(tld)) return false;
                    if (!tld.startsWith('xn--') && !/^[a-z-]+$/.test(tld)) return false;
                    if (blockedFileSuffixes.has(tld)) return false;
                    if (syslogLevels.has(tld) && syslogFacilities.has(labels[0])) return false;
                    return labels.some((label) => /[a-z]/.test(label));
                }

                return Array.isArray(rows) ? rows.filter((item) => item && isLikelyDomain(item.domain)) : [];
            };

        let mockTx = 1024 * 1024 * 50;
        let mockRx = 1024 * 1024 * 300;
        const getMockData = (endpoint) => {
            switch(endpoint) {
                case 'netinfo': return { wanStatus: 'up', wanIp: '100.64.12.34', lanIp: '192.168.100.1', dns: ['202.103.24.68', '202.103.44.150'], network_uptime_raw: 445800, publicIp: '1.2.3.4', publicCountry: 'Local' };
                case 'sysinfo': return { model: '仅用于本地测试', firmware: 'iStoreOS 24.10.2', kernel: '6.6.93', temp: 40, systime_raw: Math.floor(Date.now() / 1000), uptime_raw: 84942, cpuUsage: 3, memUsage: 12 };
                case 'traffic':
                    mockTx += Math.floor(Math.random() * 2000000);
                    mockRx += Math.floor(Math.random() * 15000000);
                    return { interface: 'eth0', tx_bytes: mockTx, rx_bytes: mockRx, tx_rate: 240000, rx_rate: 960000 };
                case 'devices': return [
                    { mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.100.101', name: 'iPhone-13', type: 'mobile', active: true },
                    { mac: '11:22:33:44:55:66', ip: '192.168.100.105', name: 'MacBook-Pro', type: 'laptop', active: true },
                    { mac: '22:33:44:55:66:77', ip: '192.168.100.120', name: 'Smart-TV', type: 'other', active: false }
                ];
                case 'domains': return { 
                    source: 'mock', 
                    top: [ { domain: 'daemon.info', count: 2514 }, { domain: 'apple.com', count: 201 } ],
                    realtime: [ { domain: 'baidu.com', count: 12 }, { domain: 'github.com', count: 843 } ]
                };
                case 'apps': return [
                    { name: 'Meituan', color: 'bg-yellow-400', text: 'M', textColor: 'text-black' },
                    { name: 'WeChat', color: 'bg-green-500', icon: 'message-circle', textColor: 'text-white' }
                ];
                case 'databus': return {
                    online_apps: {
                        total: 2,
                        list: [
                            { name: 'Microsoft', source: 'domain-heuristic' },
                            { name: 'Google', source: 'domain-heuristic' }
                        ]
                    },
                    app_recognition: {
                        available: true,
                        source: 'domain-heuristic',
                        engine: 'domain-heuristic',
                        class_stats: [
                            { name: 'cloud', time: 8 },
                            { name: 'search', time: 4 }
                        ]
                    }
                };
                default: return null;
            }
        };

        function extractDatabusEndpoint(endpoint, databus) {
            const data = databus || {};
            if (endpoint === 'databus' || endpoint === 'backend' || endpoint === 'common') return data;
            if (endpoint === 'sysinfo') return data.system_status || null;
            if (endpoint === 'traffic') return data.interface_traffic || null;
            if (endpoint === 'devices') return (data.devices && data.devices.list) || [];
            if (endpoint === 'domains') {
                const domains = data.domains || {};
                if ((!domains.realtime || domains.realtime.length === 0) && data.realtime_urls && Array.isArray(data.realtime_urls.list) && data.realtime_urls.list.length > 0) {
                    domains.realtime = data.realtime_urls.list.map((item) => ({
                        domain: item.domain,
                        count: Number(item.count || item.hits) || 0,
                    }));
                    domains.realtime_source = domains.realtime_source || data.realtime_urls.source || 'dashboard-core';
                }
                if ((!domains.realtime || domains.realtime.length === 0) && Array.isArray(domains.recent) && domains.recent.length > 0) {
                    domains.realtime = domains.recent;
                    domains.realtime_source = domains.realtime_source || domains.source || 'dashboard-core';
                }
                return domains;
            }
            if (endpoint === 'netinfo') {
                const status = data.status || {};
                const network = data.network_status || {};
                const lan = network.lan || {};
                const wan = network.wan || {};
                const online = Boolean(status.online);
                const internet = status.internet || (online ? 'up' : 'down');
                return {
                    wanStatus: internet === 'up' || online ? 'up' : 'down',
                    wanIp: wan.ip || '',
                    wanIpv6: wan.ipv6 || '',
                    lanIp: lan.ip || '',
                    dns: wan.dns || lan.dns || [],
                    network_uptime_raw: Number(network.network_uptime_raw || network.uptime_raw) || 0,
                    connCount: Number(status.conn_count || status.connCount) || 0,
                    interfaceName: network.interface || '',
                    gateway: wan.gateway || '',
                    linkUp: Boolean(status.link_up),
                    routeReady: Boolean(status.route_ready),
                    probeOk: Boolean(status.probe_ok),
                    onlineReason: status.online_reason || network.online_reason || '',
                };
            }
            return data;
        }

        async function apiRequest(ep) {
            const hostname = window.location.hostname || '';
            const protocol = window.location.protocol || '';
            const isLocalHtml = protocol === 'file:' || protocol === 'blob:' || hostname === 'localhost' || hostname === '' || hostname.includes('usercontent');
            const isLuciEnv = window.location.pathname.includes('/admin/');

            if (isLocalHtml && !isLuciEnv) return getMockData(ep);

            try {
                const API_BASE = getApiBase();
                const url = `${API_BASE}/databus?t=${Date.now()}`;
                const res = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const databus = await res.json();
                if (databus && databus.error) throw new Error(databus.error);
                return extractDatabusEndpoint(ep, databus);
            } catch (e) {
                console.error(`[API Error] ${ep}:`, e.message);
                return null;
            }
        }

        // Normalize raw source labels.
        function formatSourceLabel(raw) {
            if (!raw || raw === 'none' || raw === '-') return '-';
            const SOURCE_MAP = {
                'conntrack+dnsmasq': 'conntrack', 'dnsmasq-logread': 'dnsmasq',
                'logread-dns': 'logread', 'logread-proxy': 'proxy', 'appfilter': 'appfilter',
                'smartdns': 'smartdns', 'adguardhome': 'AdGuardHome', 'mosdns': 'mosdns',
                'openclash': 'openclash', 'passwall': 'passwall', 'passwall2': 'passwall2',
                'homeproxy': 'homeproxy', 'mihomo': 'mihomo', 'sing-box': 'sing-box'
            };
            if (SOURCE_MAP[raw]) return SOURCE_MAP[raw];
            for (const key of Object.keys(SOURCE_MAP)) if (raw.indexOf(key) !== -1) return SOURCE_MAP[key];
            return raw.length > 20 ? raw.slice(0, 20) + '...' : raw;
        }

        function formatBytes(b) {
            const bytes = Number(b);
            if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
            const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.max(0, Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k))));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function formatUptime(s) {
            if (!s || s <= 0) return '-';
            const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
            return `${d > 0 ? d + '天 ' : ''}${h}小时 ${m}分`;
        }

        function formatSysTime(unixSeconds) {
            const d = new Date(unixSeconds * 1000);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
        }

        let sysUptimeGlobal = 0, netUptimeGlobal = 0, sysTimeGlobal = 0;
        setInterval(() => {
            if (sysUptimeGlobal > 0) document.getElementById('sys-uptime').innerText = '在线时间: ' + formatUptime(++sysUptimeGlobal);
            if (netUptimeGlobal > 0) document.getElementById('network-uptime').innerText = formatUptime(++netUptimeGlobal);
            if (sysTimeGlobal > 0) document.getElementById('sys-time').innerText = formatSysTime(++sysTimeGlobal);
        }, 1000);

        async function loadStaticInfo() {
            const net = await apiRequest('netinfo');
            if (net) {
                document.getElementById('wan-ip').innerText = net.wanIp || '-';
                document.getElementById('lan-ip').innerText = net.lanIp || '-';
                document.getElementById('gateway').innerText = net.gateway || '-';
                document.getElementById('internet-status-text').innerText = net.wanStatus === 'up' ? (net.wanIp ? '已联网' : '网关就绪') : '未联网';
                const REASON_TRANSLATIONS = {
                    'default-route': '默认路由就绪',
                    'no-default-route': '无默认路由',
                    'probe-ok': '连接正常',
                    'online': '已联网',
                    'offline': '已断网'
                };
                const translateReason = (reason) => {
                    if (!reason) return '-';
                    const lower = reason.toLowerCase();
                    return REASON_TRANSLATIONS[lower] || reason;
                };
                document.getElementById('internet-status-desc').innerText = translateReason(net.onlineReason);
                if(document.getElementById('summary-connections') && net.connCount) document.getElementById('summary-connections').innerText = net.connCount;

                document.getElementById('dns-servers').innerHTML = net.dns && net.dns.length > 0 ? net.dns.join(' ') : '-';
                netUptimeGlobal = net.network_uptime_raw;
                document.getElementById('network-uptime').innerText = formatUptime(netUptimeGlobal);
                if(net.wanStatus === 'up') document.getElementById('wan-status-dot').classList.remove('hidden');
            }

            const sys = await apiRequest('sysinfo');
            if (sys) {
                document.getElementById('sys-model').innerText = sys.model || '-';
                document.getElementById('sys-firmware').innerText = sys.firmware || '-';
                sysUptimeGlobal = sys.uptime_raw;
                document.getElementById('sys-uptime').innerText = '在线时间: ' + formatUptime(sysUptimeGlobal);
                sysTimeGlobal = sys.systime_raw;
                document.getElementById('sys-time').innerText = formatSysTime(sysTimeGlobal);
                updateCpuMem(sys);
            }
        }

        function updateCpuMem(s) {
            document.getElementById('cpu-text').innerText = s.cpuUsage + '%';
            document.getElementById('cpu-bar').style.width = s.cpuUsage + '%';
            document.getElementById('cpu-temp').innerText = s.temp > 0 ? s.temp + ' C' : '-';
            const tb = document.getElementById('temp-bar');
            const tv = s.temp || 0;
            tb.style.width = Math.min(tv, 100) + '%';
            tb.className = `h-1.5 rounded-full transition-all duration-500 ${tv > 75 ? 'bg-red-500' : (tv > 55 ? 'bg-orange-500' : 'bg-green-500')}`;
            document.getElementById('mem-text').innerText = s.memUsage + '%';
            const mb = document.getElementById('mem-bar');
            mb.style.width = s.memUsage + '%';
            mb.className = `h-1.5 rounded-full transition-all duration-500 ${s.memUsage > 85 ? 'bg-red-500' : 'bg-green-500'}`;
        }

        async function loadDevices() {
            const devs = await apiRequest('devices');
            if (!devs) return;
            const activeCount = devs.filter(d => d.active).length;
            document.getElementById('active-device-count').innerText = activeCount;
            if (document.getElementById('summary-devices')) document.getElementById('summary-devices').innerText = activeCount;

            document.getElementById('devices-list').innerHTML = devs.map(d => {
                let isMobile = d.type === 'mobile';
                let isRouter = d.type === 'router';

                // 网关对比：100% 确定为上级路由器
                const gatewayEl = document.getElementById('gateway');
                const gatewayIp = gatewayEl ? gatewayEl.innerText.trim() : '';
                if (d.ip && gatewayIp && d.ip === gatewayIp && gatewayIp !== '-') {
                    isRouter = true;
                }

                if (!isMobile && !isRouter && d.name) {
                    const nameLower = d.name.toLowerCase();
                    // 优先判定路由器、中继和AP
                    if (nameLower.includes("router") || nameLower.includes("route") || nameLower.includes("openwrt") ||
                        nameLower.includes("tplink") || nameLower.includes("tp-link") || nameLower.includes("dlink") ||
                        nameLower.includes("d-link") || nameLower.includes("netgear") || nameLower.includes("linksys") ||
                        nameLower.includes("mercury") || nameLower.includes("tenda") || nameLower.includes("totolink") ||
                        nameLower.includes("fast") || nameLower.includes("miwifi") || nameLower.includes("ikuai") ||
                        nameLower.includes("phicomm") || nameLower.includes("gl-inet") || nameLower.includes("gl.inet") ||
                        nameLower.includes("repeater") || nameLower.includes("extender") ||
                        nameLower.includes("ap-") || nameLower.includes("-ap")) {
                        isRouter = true;
                    } else if (nameLower.includes("iphone") || nameLower.includes("ipad") || nameLower.includes("android") ||
                        nameLower.includes("phone") || nameLower.includes("mobile") ||
                        nameLower.includes("huawei") || nameLower.includes("honor") || nameLower.includes("xiaomi") ||
                        nameLower.includes("redmi") || nameLower.includes("oppo") || nameLower.includes("vivo") ||
                        nameLower.includes("oneplus") || nameLower.includes("samsung") || nameLower.includes("meizu") ||
                        nameLower.includes("realme") || nameLower.includes("iqoo") || nameLower.includes("galaxy") ||
                        nameLower.includes("pad") || nameLower.includes("tab") ||
                        nameLower.includes("yi-jia") || nameLower.includes("yijia")) {
                        isMobile = true;
                    }
                }

                let iconName = 'laptop';
                if (isMobile) {
                    iconName = 'smartphone';
                } else if (isRouter) {
                    iconName = 'router';
                }

                return `
                <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                    <div class="flex items-center space-x-2">
                        <div class="${d.active ? 'text-blue-500' : 'text-gray-300'}"><i data-lucide="${iconName}" class="w-4 h-4"></i></div>
                        <div>
                            <div class="text-xs font-medium ${d.active ? 'text-gray-800' : 'text-gray-400'}">${d.name || d.mac}</div>
                            <div class="text-[10px] text-gray-400 font-mono">${d.ip}</div>
                        </div>
                    </div>
                </div>`;
            }).join('');
            if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
                lucide.createIcons();
            }
        }

        let domainData = { top: [], recent: [], realtime: [] };
        async function loadDomains() {
            const res = await apiRequest('domains');
            if (res) domainData = res;
            
            document.getElementById('domain-source').innerText = formatSourceLabel(domainData.source);
            document.getElementById('realtime-domain-source').innerText = formatSourceLabel(domainData.realtime_source);

            // 渲染热门域名列表
            const topList = filterDomainRows(domainData.top);
            const maxTopCount = topList.reduce((max, item) => Math.max(max, item.count), 0);
            document.getElementById('top-domains-list').innerHTML = topList.slice(0, 10).map((item) => {
                const percent = maxTopCount > 0 ? (item.count / maxTopCount) * 100 : 0;
                return `
                <div class="mb-3 px-1 group cursor-default">
                    <div class="flex justify-between text-xs mb-1.5">
                        <span class="text-gray-600 truncate max-w-[75%] font-mono group-hover:text-blue-600 transition-colors">${item.domain}</span>
                        <span class="text-gray-800 font-medium">${item.count}</span>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div class="bg-blue-400 h-full rounded-full transition-all duration-700" style="width: ${percent}%"></div>
                    </div>
                </div>`;
            }).join('') || '<div class="text-center text-gray-400 text-xs mt-4">暂无热门域名数据</div>';

            // 渲染最近/实时域名列表
            const rtList = filterDomainRows(domainData.realtime);
            document.getElementById('recent-domains-list').innerHTML = rtList.slice(0, 25).map((item) => `
                <div class="flex items-center justify-between px-2 py-1.5 hover:bg-teal-50 rounded-md group transition-colors">
                    <div class="flex items-center space-x-2 truncate">
                        <div class="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-teal-400"></div>
                        <div class="text-[11px] text-gray-600 truncate font-mono">${item.domain}</div>
                    </div>
                    <div class="text-[10px] text-gray-400 font-mono">${item.count}</div>
                </div>`).join('') || '<div class="text-center text-gray-400 text-xs mt-4">暂无实时域名数据</div>';

            // 活跃域名刷新后，同步触发活跃应用的刷新
            await loadActiveApps();
        }

        // 基于应用名称的图标映射（fallback：用于 domain-heuristic 模式下后端未提供 icon 时）
        const APP_ICON_MAP = {
            // 聊天类
            '微信': '1002', 'wechat': '1002', '微博': '1003', 'weibo': '1003',
            '支付宝': '1005', 'alipay': '1005', '钉钉': '1006', 'dingtalk': '1006',
            '飞书': '1019', 'feishu': '1019', 'qq': '1001',
            // 视频类
            '抖音': '3001', 'douyin': '3001', 'tiktok': '3001',
            '哔哩哔哩': '3014', 'bilibili': '3014', '爱奇艺': '3004', 'iqiyi': '3004',
            '优酷': '3024', 'youku': '3024', '小红书': '3010', 'xiaohongshu': '3010',
            '央视频': '3023', 'cctv': '3023', '西瓜视频': '3017', 'xigua': '3017',
            '芒果tv': '3016', 'mgtv': '3016', '虎牙直播': '3008', 'huya': '3008',
            '斗鱼': '3006', 'douyu': '3006',
            // 游戏类
            '王者荣耀': '2001', 'honor of kings': '2001', 'honorofkings': '2001', '原神': '2023', 'genshin': '2023',
            '欢乐斗地主': '2005',
            // 购物类
            '淘宝': '4001', 'taobao': '4001', '京东': '4002', 'jd': '4002',
            '拼多多': '4004', 'pinduoduo': '4004', '美团': '10035', 'meituan': '10035',
            '饿了么': '10034', 'eleme': '10034',
            // 音乐类
            '网易云音乐': '5001', 'netease music': '5001', 'neteasemusic': '5001',
            'qq音乐': '5002', 'qqmusic': '5002',
            '酷狗音乐': '5003', 'kugou': '5003', '喜马拉雅': '5005',
            // 常用网站
            '谷歌': '8079', 'google': '8079', '百度': '8001', 'baidu': '8001',
            'github': '8087', 'gitee': '8089',
            '苹果官网': '8112', 'apple': '8112',
            '必应': '8090', 'bing': '8090',
            '知乎': '10005', 'zhihu': '10005', '豆瓣': '10004', 'douban': '10004',
            '小米': '8123', 'xiaomi': '8123', 'miui': '8123',
            '联想': '8124', 'lenovo': '8124', '360文库': '8144',
            // 下载/工具类
            'windows更新': '7020', 'microsoft': '7020',
            '阿里云盘': '7032', 'aliyundrive': '7032',
            '向日葵': '7030', 'sunlogin': '7030', 'teamviewer': '7031',
            'youtube': '3023', 'netflix': '3024', '华为云': '7011',
            // 特殊智能硬件
            '小爱音箱': '10021', '小爱音响': '10021',
        };
        function resolveAppIcon(app) {
            // 优先使用后端已返回的 icon（特征库匹配模式直接提供了准确的图标URL）
            if (app.icon && !app.icon.endsWith('default.png')) return app.icon;
            if (!app.name) return null;
            // 精确匹配
            const nameLower = app.name.toLowerCase();
            if (APP_ICON_MAP[nameLower]) return '/luci-static/resources/app_icons/' + APP_ICON_MAP[nameLower] + '.png';
            if (APP_ICON_MAP[app.name]) return '/luci-static/resources/app_icons/' + APP_ICON_MAP[app.name] + '.png';
            // 模糊匹配
            for (const [key, id] of Object.entries(APP_ICON_MAP)) {
                if (nameLower.includes(key) || key.includes(nameLower)) {
                    return '/luci-static/resources/app_icons/' + id + '.png';
                }
            }
            return null;
        }

        async function loadActiveApps() {
            // 活跃应用列表来自统一的 databus 接口
            const databus = await apiRequest('databus');
            const appsElement = document.getElementById('active-apps-container');
            const cntElement = document.getElementById('app-count');
            const appState = pickActiveAppState(databus, null);
            const apps = appState.apps || [];
            const classStats = appState.classStats || [];
            
            if (apps.length > 0) {
                if (cntElement) cntElement.innerText = apps.length;
                appsElement.innerHTML = apps.slice(0, 12).map((app) => {
                    const iconUrl = resolveAppIcon(app);
                    const firstChar = app.name.charAt(0);
                    // 有图标时：img + 隐藏的首字母 fallback；加载失败时切换显示
                    // 无图标时：直接显示首字母渐变背景
                    const iconHtml = iconUrl 
                        ? `<img src="${iconUrl}" class="w-10 h-10 rounded-[12px] shadow-sm" alt="${app.name}" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='';this.parentElement.classList.remove('bg-white','border','border-gray-100');this.parentElement.classList.add('bg-gradient-to-br','from-blue-400','to-indigo-500');"><span class="text-white text-lg font-bold" style="display:none">${firstChar}</span>` 
                        : `<span class="text-white text-lg font-bold">${firstChar}</span>`;
                    const bgClass = iconUrl 
                        ? 'bg-white border border-gray-100' 
                        : 'bg-gradient-to-br from-blue-400 to-indigo-500';
                        
                    return `
                    <div class="flex flex-col items-center gap-2 cursor-pointer group">
                        <div class="w-12 h-12 rounded-[14px] ${bgClass} flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:-translate-y-1 overflow-hidden">
                            ${iconHtml}
                        </div>
                        <span class="text-[11px] font-medium text-gray-500 group-hover:text-gray-800 transition-colors w-14 text-center truncate">${app.name}</span>
                    </div>
                `}).join('');
            } else {
                if (cntElement) cntElement.innerText = "0";
                appsElement.innerHTML = '<div class="w-full text-center text-gray-400 text-xs mt-4">暂无活跃应用数据</div>';
            }
            
            // 使用 databus 返回的分类统计更新应用分布饼图
            if (typeof donutChart !== 'undefined' && classStats.length > 0) {
                const CLASS_TRANSLATIONS = {
                    'video': '视频娱乐',
                    'social': '社交沟通',
                    'developer': '开发编程',
                    'game': '游戏娱乐',
                    'cloud': '云端服务',
                    'search': '搜索引擎',
                    'shopping': '网络购物',
                    'music': '音乐欣赏',
                    'download': '文件下载',
                    'others': '其他应用',
                    'other': '其他应用',
                    '视频': '视频娱乐',
                    '社交': '社交沟通',
                    '游戏': '游戏娱乐',
                    '云服务': '云端服务',
                    '搜索': '搜索引擎',
                    '购物': '网络购物',
                    '音乐': '音乐欣赏',
                    '下载': '文件下载'
                };
                const translateClass = (name) => {
                    if (!name) return '其他应用';
                    const lower = name.toLowerCase();
                    return CLASS_TRANSLATIONS[lower] || name;
                };

                donutChart.setOption({
                    series: [{
                        data: classStats.map(s => ({ name: translateClass(s.name), value: Number(s.time) || 0 }))
                    }]
                });
            }
        }

        // Initialize charts
        const hasEcharts = typeof echarts !== 'undefined';
        const emptyChart = { setOption: function () {}, resize: function () {} };
        if (!hasEcharts) console.error('[Dashboard] echarts is not loaded.');
        const lineChart = hasEcharts ? echarts.init(document.getElementById('traffic-line-chart')) : emptyChart;
        lineChart.setOption({
            tooltip: { trigger: 'axis', backgroundColor: 'rgba(255, 255, 255, 0.95)', textStyle: { color: '#1e293b' }, formatter: function (p) {
                let r = `<div style="font-weight:bold;margin-bottom:4px;color:#475569;">${p[0].axisValue}</div>`;
                p.forEach(x => { r += `<div style="display:flex;align-items:center;margin-top:2px;"><span style="display:inline-block;margin-right:5px;border-radius:10px;width:9px;height:9px;background-color:${x.color};"></span><span style="margin-right:12px;color:#64748b;">${x.seriesName}:</span><span style="font-family:monospace;font-weight:500;color:#1e293b;">${formatBytes(x.value)}/s</span></div>`; });
                return r;
            }}, 
            legend: { data: ['Down', 'Up'], top: 0, itemWidth: 10, textStyle: { color: '#64748b' } },
            grid: { left: '1%', right: '2%', bottom: '0%', top: '15%', containLabel: true },
            xAxis: { type: 'category', boundaryGap: false, data: [], axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: { color: '#64748b' } },
            yAxis: { type: 'value', axisLabel: { formatter: (v) => formatBytes(v) + '/s', fontSize: 9, color: '#64748b' }, splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } } },
            series: [{ name: 'Down', type: 'line', smooth: true, symbol: 'none', itemStyle: { color: '#3b82f6' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(59, 130, 246, 0.3)' }, { offset: 1, color: 'rgba(59, 130, 246, 0.01)' }]) }, data: [] },
                     { name: 'Up', type: 'line', smooth: true, symbol: 'none', itemStyle: { color: '#10b981' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(16, 185, 129, 0.3)' }, { offset: 1, color: 'rgba(16, 185, 129, 0.01)' }]) }, data: [] }]
        });

        // 初始化应用分布饼图 (ECharts)
        const donutChart = hasEcharts ? echarts.init(document.getElementById('app-dist-chart')) : emptyChart;
        donutChart.setOption({
            tooltip: { trigger: 'item' },
            color: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#cbd5e1'],
            series: [{
                name: '应用分布',
                type: 'pie',
                radius: ['55%', '85%'],
                avoidLabelOverlap: false,
                itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
                label: { show: false, position: 'center' },
                emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold', formatter: '{d}%' } },
                labelLine: { show: false },
                data: [{ value: 100, name: '等待应用统计数据' }]
            }]
        });

        window.addEventListener('resize', () => { lineChart.resize(); donutChart.resize(); });

        let tD = [], dD = [], uD = [], trafficState = null;
        async function refresh() {
            const sys = await apiRequest('sysinfo');
            if(sys) updateCpuMem(sys);
            const tr = await apiRequest('traffic');
            if (tr) {
                const now = Date.now();
                const sample = deriveTrafficSnapshot(tr, trafficState, now);
                const uS = Math.max(0, Number(sample.txRate) || 0);
                const dS = Math.max(0, Number(sample.rxRate) || 0);
                const tm = new Date().toTimeString().split(' ')[0];

                if (tD.length > 0 && tD[tD.length - 1] === tm) {
                    dD[dD.length - 1] = dS;
                    uD[uD.length - 1] = uS;
                } else {
                    tD.push(tm);
                    dD.push(dS);
                    uD.push(uS);
                    if (tD.length > 20) {
                        tD.shift();
                        dD.shift();
                        uD.shift();
                    }
                }
                lineChart.setOption({ xAxis: { data: tD }, series: [{ data: dD }, { data: uD }] });
                trafficState = sample.nextState;
                
                const fmtTx = formatBytes(tr.tx_bytes).split(' ');
                const fmtRx = formatBytes(tr.rx_bytes).split(' ');
                if(document.getElementById('summary-tx')) document.getElementById('summary-tx').innerText = fmtTx[0];
                if(document.getElementById('summary-tx-unit')) document.getElementById('summary-tx-unit').innerText = fmtTx[1];
                if(document.getElementById('summary-rx')) document.getElementById('summary-rx').innerText = fmtRx[0];
                if(document.getElementById('summary-rx-unit')) document.getElementById('summary-rx-unit').innerText = fmtRx[1];

                document.getElementById('total-up').innerText = formatBytes(uS) + '/s';
                document.getElementById('total-down').innerText = formatBytes(dS) + '/s';
            }
        }

        initNavButtons();
        loadStaticInfo(); loadDevices(); loadDomains(); refresh();
        setInterval(refresh, 2000); setInterval(loadDomains, 2000);
        setInterval(loadStaticInfo, 10000); setInterval(loadDevices, 10000);
