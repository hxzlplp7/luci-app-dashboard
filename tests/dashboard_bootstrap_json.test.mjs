import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatePath = path.resolve(__dirname, "../luasrc/view/dashboard/main.htm");
const code = fs.readFileSync(templatePath, "utf8");

assert.doesNotMatch(
  code,
  /data-features="<%=features_json%>"|data-configs="<%=configs_json%>"|data-i18n="<%=i18n_json%>"/,
  "Dashboard bootstrap must not inject raw JSON into HTML attributes."
);

assert.match(
  code,
  /window\.dashboard_features\s*=\s*<%=features_json%>;\s*[\s\S]*window\.dashboard_configs\s*=\s*<%=configs_json%>;\s*[\s\S]*window\.dashboard_i18n\s*=\s*<%=i18n_json%>;/,
  "Dashboard bootstrap should inject JSON directly as JavaScript literals."
);

assert.doesNotMatch(
  code,
  /JSON\.parse\(features\)|JSON\.parse\(configs\)|JSON\.parse\(i18nMap\)/,
  "Dashboard bootstrap should not re-parse HTML attribute fragments."
);
