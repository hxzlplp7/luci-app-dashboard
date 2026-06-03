const fs = require('fs');
const path = require('path');

const userRulesPath = 'd:/workspace/luci-app-dashboard/app_rules.c';
const coreCPath = 'd:/workspace/luci-app-dashboard/dashboard-core/src/dashboard_core.c';

// Helper to parse rules from file content
function parseRules(content) {
    const rules = [];
    const lines = content.split('\n');
    // Regex matches: {"AppName", "Class", "Pattern"}
    const regex = /\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\}/;
    
    lines.forEach(line => {
        const match = line.match(regex);
        if (match) {
            rules.push({
                app: match[1],
                class: match[2],
                pattern: match[3]
            });
        }
    });
    return rules;
}

// 1. Read and parse rules from user's app_rules.c
const userRulesContent = fs.readFileSync(userRulesPath, 'utf8');
const userRules = parseRules(userRulesContent);
console.log(`Parsed ${userRules.length} rules from app_rules.c`);

// 2. Read and parse current rules from dashboard_core.c
const coreCContent = fs.readFileSync(coreCPath, 'utf8');
const startMarker = 'static const struct app_rule APP_RULES[] = {';
const endMarker = '    {NULL, NULL, NULL}\n};';

const startIndex = coreCContent.indexOf(startMarker);
if (startIndex === -1) {
    console.error('Could not find start of APP_RULES in dashboard_core.c');
    process.exit(1);
}
const endIndex = coreCContent.indexOf(endMarker, startIndex);
if (endIndex === -1) {
    console.error('Could not find end of APP_RULES in dashboard_core.c');
    process.exit(1);
}

const currentCArrayPart = coreCContent.substring(startIndex + startMarker.length, endIndex);
const currentCoreRules = parseRules(currentCArrayPart);
console.log(`Parsed ${currentCoreRules.length} rules from dashboard_core.c`);

// 3. Merge & Deduplicate (Keyed by app + pattern)
const mergedMap = new Map();

// Insert user rules first (so we don't omit them)
userRules.forEach(r => {
    const key = `${r.app}|${r.pattern}`;
    mergedMap.set(key, r);
});

// Insert core rules if they are not already present
currentCoreRules.forEach(r => {
    const key = `${r.app}|${r.pattern}`;
    if (!mergedMap.has(key)) {
        mergedMap.set(key, r);
    }
});

const mergedRules = Array.from(mergedMap.values());
console.log(`Merged total rules count: ${mergedRules.length}`);

// Sort rules: group by app name (locale compare for Chinese/English), then by pattern
mergedRules.sort((a, b) => {
    if (a.app !== b.app) return a.app.localeCompare(b.app, 'zh-CN');
    return a.pattern.localeCompare(b.pattern);
});

// 4. Format C array content
const formattedCArray = mergedRules.map(r => `    {"${r.app}", "${r.class}", "${r.pattern}"},`).join('\n');

// 5. Update dashboard_core.c
const beforePart = coreCContent.substring(0, startIndex + startMarker.length + 1);
const afterPart = coreCContent.substring(endIndex);

const updatedCContent = beforePart + formattedCArray + '\n' + afterPart;
fs.writeFileSync(coreCPath, updatedCContent, 'utf8');

console.log('Successfully merged all rules and updated dashboard_core.c!');
