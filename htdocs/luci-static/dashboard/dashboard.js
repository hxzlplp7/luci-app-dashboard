        lucide.createIcons();

        // --- Gemini AI 诊断逻辑 ---
        const apiKey = ""; // 建议用户自行填入或走后端代理

        async function fetchGeminiWithRetry(prompt, retries = 5) {
            const delays = [1000, 2000, 4000, 8000, 16000];
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            
            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: {
                    parts: [{
                        text: "你是一个专业的家庭网络和高级路由器诊断专家。请根据用户提供的路由器实时状态面板数据，用通俗、专业的中文输出一份简短的【网络健康报告】。报告结构如下：1. 总体评价（网络是否健康） 2. 异常诊断（重点分析异常高频域名、CPU或流量） 3. 极客优化建议。要求：排版清晰，使用Markdown列表，并在每个重点结论旁加上适合的Emoji表情。字数控制在300字以内。"
                    }]
                }
            };

            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) throw new Error(`HTTP 异常! 状态码: ${response.status}`);
                    const data = await response.json();
                    return data.candidates[0].content.parts[0].text;
                } catch (error) {
                    if (i === retries - 1) throw error;
                    await new Promise(resolve => setTimeout(resolve, delays[i]));
                }
            }
        }

        async function openAIAssistant() {
            if (!apiKey) {
                alert("未配置 Gemini API Key，请在 dashboard.js 中填写。");
                return;
            }
            const modal = document.getElementById('aiModal');
            const loading = document.getElementById('aiLoading');
            const content = document.getElementById('aiContent');
            
            modal.classList.remove('hidden');
            void modal.offsetWidth;
            modal.classList.remove('opacity-0');
            modal.firstElementChild.classList.remove('scale-95');
            modal.classList.add('flex');

            content.innerHTML = '';
            loading.classList.remove('hidden');
            loading.classList.add('flex');

            const domainsListText = domainData.top && domainData.top.length > 0 
                ? domainData.top.slice(0, 5).map((d, i) => `${i + 1}. ${d.domain} (请求量: ${d.count}次)`).join('\n                  ')
                : '暂无数据';

            const systemPrompt = `
                【当前路由器状态数据】
                - 在线设备数：${document.getElementById('active-device-count').innerText}台
                - 当前WAN IP：${document.getElementById('wan-ip').innerText}
                - 实时速率：上传 ${document.getElementById('total-up').innerText}，下载 ${document.getElementById('total-down').innerText}
                - CPU 占用率：${document.getElementById('cpu-text').innerText}
                - 内存占用率：${document.getElementById('mem-text').innerText}
                - 热门访问域名Top 5：
                  ${domainsListText}
            `;

            try {
                const resultText = await fetchGeminiWithRetry(systemPrompt);
                content.innerHTML = marked.parse(resultText);
            } catch (error) {
                content.innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg border border-red-100"><p class="font-bold mb-1">获取诊断结果失败</p><p class="text-sm">网络请求或解析时发生错误，请稍后再试。</p></div>`;
            } finally {
                loading.classList.add('hidden');
                loading.classList.remove('flex');
            }
        }

        function closeAIAssistant() {
            const modal = document.getElementById('aiModal');
            modal.classList.add('opacity-0');
            modal.firstElementChild.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 300);
        }
        // --- 诊断逻辑结束 ---

        const getApiBase = () => {
            const h = window.location.pathname;
            return h.includes('/admin/') ? h.split('/admin/')[0] + '/admin/dashboard/api' : '/cgi-bin/luci/admin/dashboard/api';
        };

        const getMockData = (endpoint) => {
            let mockTx = 1024 * 1024 * 50;
            let mockRx = 1024 * 1024 * 300;
            switch(endpoint) {
                case 'netinfo': return { wanStatus: 'up', wanIp: '100.64.12.34', lanIp: '192.168.100.1', dns: ['202.103.24.68', '202.103.44.150'], network_uptime_raw: 445800, publicIp: '1.2.3.4', publicCountry: 'Local' };
                case 'sysinfo': return { model: '纯离线预览(假数据)', firmware: 'iStoreOS 24.10.2', kernel: '6.6.93', temp: 40, systime_raw: Math.floor(Date.now() / 1000), uptime_raw: 84942, cpuUsage: 3, memUsage: 12, hasSamba4: false };
                case 'traffic': mockTx += Math.floor(Math.random() * 2000000); mockRx += Math.floor(Math.random() * 15000000); return { tx_bytes: mockTx, rx_bytes: mockRx };
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
                    { name: '美团', color: 'bg-yellow-400', text: '美', textColor: 'text-black' },
                    { name: '微信', color: 'bg-green-500', icon: 'message-circle', textColor: 'text-white' }
                ];
                default: return null;
            }
        };

        async function apiRequest(ep) {
            const hostname = window.location.hostname || '';
            const protocol = window.location.protocol || '';
            const isLocalHtml = protocol === 'file:' || protocol === 'blob:' || hostname === 'localhost' || hostname === '' || hostname.includes('usercontent');
            const isLuciEnv = window.location.pathname.includes('/admin/');

            if (isLocalHtml && !isLuciEnv) return getMockData(ep);

            try {
                const API_BASE = getApiBase();
                const url = `${API_BASE}/${ep}?t=${Date.now()}`;
                const res = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (e) {
                console.error(`[API Error] ${ep}:`, e.message);
                return null;
            }
        }

        // 标签友好化函数
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
            return raw.length > 20 ? raw.slice(0, 20) + '…' : raw;
        }

        function formatBytes(b) {
            if (!b || b === 0) return '0 B';
            const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(b) / Math.log(k));
            return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function formatUptime(s) {
            if (!s || s <= 0) return '-';
            const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
            return `${d > 0 ? d + 'd ' : ''}${h}h ${m}m`;
        }

        function formatSysTime(unixSeconds) {
            const d = new Date(unixSeconds * 1000);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
        }

        let sysUptimeGlobal = 0, netUptimeGlobal = 0, sysTimeGlobal = 0;
        setInterval(() => {
            if (sysUptimeGlobal > 0) document.getElementById('sys-uptime').innerText = 'UP: ' + formatUptime(++sysUptimeGlobal);
            if (netUptimeGlobal > 0) document.getElementById('network-uptime').innerText = formatUptime(++netUptimeGlobal);
            if (sysTimeGlobal > 0) document.getElementById('sys-time').innerText = formatSysTime(++sysTimeGlobal);
        }, 1000);

        async function loadStaticInfo() {
            const net = await apiRequest('netinfo');
            if (net) {
                document.getElementById('wan-ip').innerText = net.wanIp || '-';
                document.getElementById('lan-ip').innerText = net.lanIp || '-';
                document.getElementById('gateway').innerText = net.gateway || '-';
                document.getElementById('internet-status-text').innerText = net.wanStatus === 'up' ? (net.wanIp ? '外网畅通' : '线路就绪') : '外网断开';
                document.getElementById('internet-status-desc').innerText = net.onlineReason ? net.onlineReason : '-';
                if(document.getElementById('summary-connections') && net.connCount) document.getElementById('summary-connections').innerText = net.connCount;

                document.getElementById('dns-servers').innerHTML = net.dns && net.dns.length > 0 ? net.dns.join(' ') : '-';
                netUptimeGlobal = net.network_uptime_raw;
                if(net.wanStatus === 'up') document.getElementById('wan-status-dot').classList.remove('hidden');
            }

            const sys = await apiRequest('sysinfo');
            if (sys) {
                document.getElementById('sys-model').innerText = sys.model || '-';
                document.getElementById('sys-firmware').innerText = sys.firmware || '-';
                sysUptimeGlobal = sys.uptime_raw;
                sysTimeGlobal = sys.systime_raw;
                updateCpuMem(sys);
            }
        }

        function updateCpuMem(s) {
            document.getElementById('cpu-text').innerText = s.cpuUsage + '%';
            document.getElementById('cpu-bar').style.width = s.cpuUsage + '%';
            document.getElementById('cpu-temp').innerText = s.temp > 0 ? s.temp + '℃' : '-';
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

            document.getElementById('devices-list').innerHTML = devs.map(d => `
                <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                    <div class="flex items-center space-x-2">
                        <div class="${d.active ? 'text-blue-500' : 'text-gray-300'}"><i data-lucide="${d.type === 'mobile' ? 'smartphone' : 'laptop'}" class="w-4 h-4"></i></div>
                        <div>
                            <div class="text-xs font-medium ${d.active ? 'text-gray-800' : 'text-gray-400'}">${d.name || d.mac}</div>
                            <div class="text-[10px] text-gray-400 font-mono">${d.ip}</div>
                        </div>
                    </div>
                </div>`).join('');
            lucide.createIcons(); 
        }

        let domainData = { top: [], recent: [], realtime: [] };
        async function loadDomains() {
            const res = await apiRequest('domains');
            if (res) domainData = res;
            
            document.getElementById('domain-source').innerText = formatSourceLabel(domainData.source);
            document.getElementById('realtime-domain-source').innerText = formatSourceLabel(domainData.realtime_source);

            // 渲染 热门域名
            const topList = domainData.top || [];
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
            }).join('') || '<div class="text-center text-gray-400 text-xs mt-4">暂无数据</div>';

            // 渲染 实时域名
            const rtList = domainData.realtime && domainData.realtime.length > 0 ? domainData.realtime : (domainData.recent || []);
            document.getElementById('recent-domains-list').innerHTML = rtList.slice(0, 25).map((item) => `
                <div class="flex items-center justify-between px-2 py-1.5 hover:bg-teal-50 rounded-md group transition-colors">
                    <div class="flex items-center space-x-2 truncate">
                        <div class="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-teal-400"></div>
                        <div class="text-[11px] text-gray-600 truncate font-mono">${item.domain}</div>
                    </div>
                    <div class="text-[10px] text-gray-400 font-mono">${item.count}ms</div>
                </div>`).join('') || '<div class="text-center text-gray-400 text-xs mt-4">暂无活动</div>';
        }

        const OAF_COLORS = ['bg-orange-500','bg-green-500','bg-blue-500','bg-pink-500','bg-yellow-400','bg-indigo-500'];
        async function loadActiveApps() {
            // 通过获取原有 OAF 接口数据兼容活跃应用展示
            const oafData = await apiRequest('oaf/status');
            const appsElement = document.getElementById('active-apps-container');
            const cntElement = document.getElementById('app-count');
            
            if (oafData && oafData.active_apps && oafData.active_apps.length > 0) {
                const apps = oafData.active_apps;
                if (cntElement) cntElement.innerText = apps.length;
                appsElement.innerHTML = apps.slice(0, 12).map((app, i) => {
                    const color = OAF_COLORS[i % OAF_COLORS.length];
                    const iconHtml = app.icon 
                        ? `<img src="${app.icon}" class="w-8 h-8 rounded-lg" alt="${app.name}">` 
                        : `<span class="text-white text-lg font-bold">${app.name.charAt(0)}</span>`;
                        
                    return `
                    <div class="flex flex-col items-center gap-2 cursor-pointer group">
                        <div class="w-12 h-12 rounded-[14px] ${color} flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:-translate-y-1">
                            ${iconHtml}
                        </div>
                        <span class="text-[11px] font-medium text-gray-500 group-hover:text-gray-800 transition-colors w-14 text-center truncate">${app.name}</span>
                    </div>
                `}).join('');
            } else {
                if (cntElement) cntElement.innerText = "0";
                appsElement.innerHTML = '<div class="w-full text-center text-gray-400 text-xs mt-4">无活跃应用或未开启 OAF</div>';
            }
            
            // 更新应用分布饼图，兼容 OAF 的分类耗时数据
            if (typeof donutChart !== 'undefined' && oafData && oafData.class_stats && oafData.class_stats.length > 0) {
                donutChart.setOption({
                    series: [{
                        data: oafData.class_stats.map(s => ({ name: s.name, value: Number(s.time) || 0 }))
                    }]
                });
            }
        }

        // 初始化图表
        const lineChart = echarts.init(document.getElementById('traffic-line-chart'));
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

        // 环形图 (应用分布)
        const donutChart = echarts.init(document.getElementById('app-dist-chart'));
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
                data: [{ value: 100, name: '等待统计数据' }]
            }]
        });

        window.addEventListener('resize', () => { lineChart.resize(); donutChart.resize(); });

        let tD = [], dD = [], uD = [], pTx = 0, pRx = 0, pT = 0;
        async function refresh() {
            const sys = await apiRequest('sysinfo');
            if(sys) updateCpuMem(sys);
            const tr = await apiRequest('traffic');
            if (tr) {
                const now = Date.now();
                if (pT !== 0) {
                    const diff = (now - pT) / 1000;
                    if (diff > 0) {
                        const uS = Math.max(0, (tr.tx_bytes - pTx) / diff);
                        const dS = Math.max(0, (tr.rx_bytes - pRx) / diff);
                        const tm = new Date().toTimeString().split(' ')[0];
                        tD.push(tm); dD.push(dS); uD.push(uS);
                        if (tD.length > 20) { tD.shift(); dD.shift(); uD.shift(); }
                        lineChart.setOption({ xAxis: { data: tD }, series: [{ data: dD }, { data: uD }] });
                    }
                }
                
                const fmtTx = formatBytes(tr.tx_bytes).split(' ');
                const fmtRx = formatBytes(tr.rx_bytes).split(' ');
                if(document.getElementById('summary-tx')) document.getElementById('summary-tx').innerText = fmtTx[0];
                if(document.getElementById('summary-tx-unit')) document.getElementById('summary-tx-unit').innerText = fmtTx[1];
                if(document.getElementById('summary-rx')) document.getElementById('summary-rx').innerText = fmtRx[0];
                if(document.getElementById('summary-rx-unit')) document.getElementById('summary-rx-unit').innerText = fmtRx[1];

                document.getElementById('total-up').innerText = formatBytes(uD.length ? uD[uD.length-1] : 0) + '/s';
                document.getElementById('total-down').innerText = formatBytes(dD.length ? dD[dD.length-1] : 0) + '/s';

                pTx = tr.tx_bytes; pRx = tr.rx_bytes; pT = now;
            }
        }

        loadStaticInfo(); loadDevices(); loadDomains(); loadActiveApps(); refresh();
        setInterval(refresh, 2000); setInterval(loadDomains, 5000); setInterval(loadActiveApps, 15000);
