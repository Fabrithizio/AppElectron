const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const configPath = path.join(projectRoot, 'config', 'app-config.json');

const defaultConfig = {
  company: {
    name: 'Minha Empresa',
    appTitle: 'Controle Comercial',
    logo: 'assets/imgs/logo-nice.png',
    whatsappUrl: 'https://web.whatsapp.com/',
  },
  auth: {
    sessionTimeoutMinutes: 30,
    users: [],
  },
  theme: {
    primaryColor: '#0f766e',
    accentColor: '#2563eb',
  },
  modules: {
    manualSales: true,
    clients: true,
    payments: true,
    finance: true,
    backup: true,
    simpleProducts: false,
    stockControl: false,
    barcode: false,
  },
  businessProfile: {
    level: 'simple',
    allowManualItems: true,
    allowProductCatalog: true,
    requireStockForSale: false,
  },
};

function mergeConfig(base, override) {
  return {
    ...base,
    ...override,
    company: { ...base.company, ...override.company },
    auth: { ...base.auth, ...override.auth },
    theme: { ...base.theme, ...override.theme },
    modules: { ...base.modules, ...override.modules },
    businessProfile: { ...base.businessProfile, ...override.businessProfile },
  };
}

function loadAppConfig() {
  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }

  const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return mergeConfig(defaultConfig, fileConfig);
}

function saveAppConfig(nextConfig) {
  const merged = mergeConfig(loadAppConfig(), nextConfig);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return merged;
}

module.exports = { configPath, loadAppConfig, saveAppConfig };
