(function() {
    'use strict';

    const API_BASE = window.location.pathname.replace(/\/+$/, '') + '/api';
    const REFRESH_RATE = 2000;
    const MAX_BW = 1000; // 1000Mbps
    const RADIUS = 120;
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

    const state = {
        lastRx: 0,
        lastTx: 0,
        initialized: false
    };

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024, units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
    }

    function updateGauge(elId, valMbps) {
        const box = document.getElementById(elId);
        if (!box) return;
        
        const progress = Math.min(valMbps / MAX_BW, 1);
        const offset = CIRCUMFERENCE - (progress * CIRCUMFERENCE);
        
        const mainLine = box.querySelector('.gauge-progress');
        const glowLine = box.querySelector('.gauge-glow');
        
        if (mainLine) mainLine.style.strokeDashoffset = offset;
        if (glowLine) glowLine.style.strokeDashoffset = offset;
        
        const valDisp = box.querySelector('.g-value');
        if (valDisp) {
            animateValue(valDisp, parseFloat(valDisp.textContent) || 0, valMbps, 800);
        }
    }

    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = (progress * (end - start) + start).toFixed(1);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    async function fetchData() {
        try {
            const res = await fetch(`${API_BASE}/network_traffic?_=${Date.now()}`);
            const data = await res.json();
            if (data.success !== 200) return;
            const r = data.result;

            const downMbps = (r.speed.rx * 8) / 1000000;
            const upMbps = (r.speed.tx * 8) / 1000000;

            updateGauge('gauge-down', downMbps);
            updateGauge('gauge-up', upMbps);

            document.getElementById('total-rx').textContent = formatBytes(r.totals.rx);
            document.getElementById('total-tx').textContent = formatBytes(r.totals.tx);
            document.getElementById('wan-dev').textContent = r.active_dev || 'Unknown';

            // Top Domains
            const dList = document.getElementById('domain-list');
            if (r.top_domains.length > 0) {
                dList.innerHTML = r.top_domains.map(d => `
                    <div class="data-row">
                        <span class="data-label">${d.name}</span>
                        <span class="data-val">${formatBytes(d.value)}</span>
                    </div>
                `).join('');
            } else {
                dList.innerHTML = '<div class="data-row"><span class="data-label" style="opacity:0.5">Collecting data...</span></div>';
            }

            // Traffic Types
            const tList = document.getElementById('type-list');
            const total = r.traffic_types.reduce((a, b) => a + b.value, 0) || 1;
            if (r.traffic_types.length > 0) {
                tList.innerHTML = r.traffic_types.sort((a,b) => b.value - a.value).slice(0, 5).map(t => `
                    <div class="data-row">
                        <span class="data-label">${t.name}</span>
                        <div class="data-val">
                            ${formatBytes(t.value)}
                            <span class="data-meta">${Math.floor(t.value*100/total)}%</span>
                        </div>
                    </div>
                `).join('');
            } else {
                tList.innerHTML = '<div class="data-row"><span class="data-label" style="opacity:0.5">Waiting for nlbwmon...</span></div>';
            }

        } catch (e) { console.error('API Error', e); }
    }

    async function fetchSys() {
        try {
            const res = await fetch(`${API_BASE}/system_status`);
            const data = await res.json();
            if (data.success === 200) {
                document.getElementById('cpu-val').textContent = data.result.cpu_usage + '%';
                document.getElementById('mem-val').textContent = data.result.mem_usage + '%';
            }
        } catch (e) {}
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Init SVG radii
        document.querySelectorAll('.gauge-progress, .gauge-glow').forEach(el => {
            el.setAttribute('r', RADIUS);
            el.style.strokeDasharray = CIRCUMFERENCE;
            el.style.strokeDashoffset = CIRCUMFERENCE;
        });

        // Intro animation dummy
        setTimeout(() => {
            fetchData();
            fetchSys();
        }, 500);

        setInterval(fetchData, REFRESH_RATE);
        setInterval(fetchSys, 10000);
    });

})();
