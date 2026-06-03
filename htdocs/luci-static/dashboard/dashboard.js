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
            '12306': '10018',
            '1688': '4052',
            '17173游戏': '2070',
            '1905电影': '3100',
            '1号店': '4008',
            '2345': '8010',
            '2345游戏': '2085',
            '360文库': '8144',
            '37网游': '2071',
            '4366页游': '2077',
            '4399游戏': '2068',
            '51游戏': '2075',
            '58同城': '10014',
            '7k7k游戏': '2069',
            '9377游戏': '2067',
            '阿里云盘': '7032',
            '艾米直播': '3117',
            '爱卡汽车': '8031',
            '爱奇艺': '3004',
            '爱企查': '8142',
            '安徽电视台': '3107',
            '安居客': '10012',
            '百度': '8001',
            '百度贴吧': '8145',
            '百度文库': '8143',
            '百度页游': '2078',
            '百度游戏': '2076',
            '百度知道': '8146',
            '百度直播': '3085',
            '保卫萝卜4': '2042',
            '爆米花视频': '3111',
            '北京银行': '14013',
            '必应': '8090',
            '哔哩哔哩': '3014',
            '缤客': '8044',
            '波波视频': '3028',
            '播聊': '3019',
            '唱吧': '5010',
            '唱鸭': '3126',
            '传奇页游': '2084',
            '大街网': '6012',
            '当当网': '4007',
            '地下城与勇士': '2109',
            '嘀哩嘀哩': '3124',
            '第五人格': '2014',
            '第一财经': '8036',
            '第一视频': '3112',
            '叮咚买菜': '4013',
            '钉钉': '1006',
            '动漫之家': '10015',
            '抖音': '3001',
            '抖音商城': '4055',
            '斗米': '6007',
            '斗鱼': '3006',
            '豆瓣': '10004',
            '豆瓣电影': '3101',
            '豆瓣FM': '5009',
            '豆丁': '8041',
            '度小视': '3086',
            '多闪': '1010',
            '饿了么': '10034',
            '翻咔': '3116',
            '房天下': '10013',
            '飞书': '1019',
            '飞猪': '10017',
            '风行视频': '3026',
            '凤凰网': '8005',
            '赶集网': '6004',
            '谷歌': '8079',
            '光明网': '8132',
            '光遇': '2041',
            '国际在线': '8135',
            '国美': '4040',
            '哈利波特': '2040',
            '韩剧TV': '3021',
            '好省': '4018',
            '和讯': '8035',
            '红警OL': '2039',
            '虎扑体育': '8066',
            '虎牙直播': '3008',
            '花椒直播': '3011',
            '华数TV': '3089',
            '华为官网': '8111',
            '华为商城': '8108',
            '华为云': '7011',
            '欢乐斗地主': '2005',
            '皇室战争': '2016',
            '坚果云': '7009',
            '建设银行': '14001',
            '江苏卫视': '3104',
            '交通银行': '14004',
            '京东': '4002',
            '京东钱包': '10003',
            '晶核': '2057',
            '竞彩网': '8094',
            '酒仙网': '4041',
            '开心消消乐': '2010',
            '看准': '6008',
            '考拉海购': '4024',
            '酷6网': '3113',
            '酷狗短酷': '3029',
            '酷狗音乐': '5003',
            '酷狗直播': '3030',
            '酷米网': '3125',
            '酷我音乐': '5004',
            '狂野飙车': '2011',
            '拉勾网': '6011',
            '蓝奏云': '7010',
            '懒人听书': '5012',
            '狼人杀': '2019',
            '乐逗游戏': '2080',
            '乐嗨秀场': '3120',
            '乐视视频': '3110',
            '梨视频': '3121',
            '荔枝网': '3105',
            '恋与深空': '2099',
            '链家': '10006',
            '猎聘': '6003',
            '领英': '6006',
            '六间房': '3084',
            '龙珠直播': '3102',
            '炉石传说': '2017',
            '驴妈妈': '8027',
            '率土之滨': '2012',
            '马蜂窝': '10019',
            '芒果tv': '3016',
            '猫和老鼠': '2053',
            '猫扑': '8046',
            '美团': '10035',
            '梦幻西游': '2006',
            '梦想城镇': '2107',
            '咪咕视频': '3020',
            '迷你世界': '2028',
            '明日之后': '2007',
            '蘑菇街': '4005',
            '陌陌': '1004',
            '南瓜电影': '3094',
            '农业银行': '14002',
            '派派': '1011',
            '跑跑卡丁车': '2009',
            '拼多多': '4004',
            '平安银行': '14011',
            '苹果官网': '8112',
            '朴朴超市': '4009',
            '浦发银行': '14008',
            '企鹅电竞': '3027',
            '汽车之家': '10016',
            '千千音乐': '5006',
            '前程无忧': '6001',
            '穷游网': '8026',
            '求是网': '8137',
            '全景网': '8037',
            '人民网': '8006',
            '人民银行': '14012',
            '人人视频': '3022',
            '三角洲&穿越火线': '2056',
            '山东电视台': '3106',
            '上海银行': '14010',
            '什么值得买': '4019',
            '神都夜行录': '2034',
            '识货': '4023',
            '搜狗拼音': '10022',
            '搜狐': '8003',
            '搜狐视频': '3018',
            '搜视网': '3115',
            '苏宁易购': '4006',
            '太平洋电脑': '8104',
            '太平洋汽车': '8029',
            '坦克世界': '2083',
            '探探': '1009',
            '淘宝': '4001',
            '腾讯加速器': '2051',
            '腾讯微云': '7008',
            '腾讯智影': '8100',
            '体育彩票': '8039',
            '天涯明月刀': '2025',
            '天涯社区': '8020',
            '天眼查': '10007',
            '天翼云盘': '7007',
            '同城急聘': '6005',
            '途牛': '10020',
            '王者荣耀': '2001',
            '王者荣耀更新': '7006',
            '网易': '8004',
            '网易严选': '4022',
            '网易云音乐': '5001',
            '微博': '1003',
            '微店': '4015',
            '微信': '1002',
            '唯品会': '4003',
            '我的世界': '2015',
            '我叫MT4': '2033',
            '我秀': '3118',
            '西瓜视频': '3017',
            '喜马拉雅': '5005',
            '虾米音乐': '5007',
            '闲鱼': '4012',
            '向日葵': '7030',
            '潇湘书院': '8064',
            '小爱音箱': '10021',
            '小爱音响': '10021',
            '小度互娱': '3109',
            '小黑盒': '2059',
            '小红书': '3010',
            '小米官网': '8098',
            '小米有品': '4014',
            '小森生活': '2020',
            '小象优品': '4026',
            '小镇大厨': '2106',
            '新华网': '8133',
            '新浪': '8002',
            '新浪彩票': '8093',
            '新浪视频': '3114',
            '新浪体育': '8096',
            '兴业银行': '14007',
            '迅游加速器': '2054',
            '亚马逊': '4053',
            '央视频': '3023',
            '央视网': '8134',
            '一刀传世': '2013',
            '一刻短剧': '3119',
            '伊对': '1008',
            '宜家家居': '4025',
            '易车网': '8030',
            '音悦台': '5008',
            '银联在线': '14014',
            '应届生求职': '6009',
            '英雄联盟手游': '2027',
            '萤石云': '10010',
            '映客直播': '3012',
            '优酷': '3024',
            '邮政储蓄': '14006',
            '游民星空': '2072',
            '游侠网': '2073',
            '有道词典': '10008',
            '元梦之星': '2100',
            '原神': '2023',
            '云原神': '2111',
            '战舰世界': '2082',
            '掌阅': '10011',
            '招商银行': '14005',
            '折800': '4016',
            '浙江卫视': '3103',
            '支付宝': '1005',
            '知乎': '10005',
            '知网': '8077',
            '智联招聘': '6002',
            '中彩网': '8038',
            '中国电信': '8107',
            '中国福利彩': '8092',
            '中国联通': '8106',
            '中国移动': '8105',
            '中国银行': '14003',
            '中华网': '8008',
            '中华英才网': '6010',
            '中经网': '8136',
            '中青网': '8138',
            '中信银行': '14009',
            '转转': '4021',
            '最右': '3025',
            'alipay': '1005',
            'aliyundrive': '7032',
            'apple': '8112',
            'AppStore': '7002',
            'baidu': '8001',
            'BBC': '8099',
            'bilibili': '3014',
            'bing': '8090',
            'biubiu加速器': '2055',
            'boss直聘': '6013',
            'cctv': '3023',
            'cctv5': '8065',
            'dingtalk': '1006',
            'DJ嗨嗨网': '3123',
            'douban': '10004',
            'douyin': '3001',
            'douyu': '3006',
            'eleme': '10034',
            'feishu': '1019',
            'ftp文件传输': '11002',
            'genshin': '2023',
            'gitee': '8089',
            'github': '8087',
            'google': '8079',
            'hao123': '8009',
            'hao123小游戏': '2081',
            'hao123页游': '2079',
            'hao123游戏': '2074',
            'honor of kings': '2001',
            'honorofkings': '2001',
            'huya': '3008',
            'iqiyi': '3004',
            'IT之家': '8103',
            'jd': '4002',
            'kugou': '5003',
            'Lazada': '4054',
            'meituan': '10035',
            'mgtv': '3016',
            'microsoft': '7020',
            'miui': '8123',
            'netease music': '5001',
            'neteasemusic': '5001',
            'netflix': '3024',
            'pinduoduo': '4004',
            'qq': '1001',
            'QQ飞车': '2008',
            'QQ音乐': '5002',
            'qqmusic': '5002',
            'samba共享': '11001',
            'Soul': '1007',
            'SSH': '11003',
            'sunlogin': '7030',
            'taobao': '4001',
            'teamviewer': '7031',
            'TeamViewer': '7031',
            'tiktok': '3001',
            'uu加速器': '2050',
            'vimeo': '3098',
            'vivo官网': '8110',
            'vivo应用商店': '7005',
            'wechat': '1002',
            'weibo': '1003',
            'windows更新': '7020',
            'xiaohongshu': '3010',
            'xiaomi': '8123',
            'xigua': '3017',
            'youku': '3024',
            'youtube': '3023',
            'zhihu': '10005',
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
