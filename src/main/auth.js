const crypto = require('crypto');
const { loadAppConfig, saveAppConfig } = require('./config');

let session = null;

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password || ''), String(salt || ''), 120000, 32, 'sha256').toString('hex');
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active !== false,
  };
}

function isSessionActive() {
  return Boolean(session && Date.now() < session.expiresAt);
}

function getSession() {
  if (!isSessionActive()) {
    session = null;
    return null;
  }

  return session;
}

function login(username, password) {
  const config = loadAppConfig();
  const users = config.auth.users || [];
  const user = users.find((item) => item.username === username && item.active !== false);

  if (!user) {
    return { authenticated: false };
  }

  const hash = hashPassword(password, user.passwordSalt);
  if (!user.passwordHash || hash.length !== user.passwordHash.length) {
    return { authenticated: false };
  }

  const ok = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash));
  if (!ok) {
    return { authenticated: false };
  }

  const timeoutMs = Number(config.auth.sessionTimeoutMinutes || 30) * 60 * 1000;
  session = {
    ...publicUser(user),
    expiresAt: Date.now() + timeoutMs,
  };

  return { authenticated: true, user: publicUser(user), expiresAt: session.expiresAt };
}

function listUsers() {
  const config = loadAppConfig();
  return (config.auth.users || []).map(publicUser);
}

function createPasswordFields(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
  };
}

function saveUser(userData) {
  const config = loadAppConfig();
  const users = [...(config.auth.users || [])];
  const username = String(userData.username || '').trim().toLowerCase();
  const name = String(userData.name || '').trim();
  const role = userData.role === 'owner' ? 'owner' : 'staff';

  if (!username || !name) {
    throw new Error('Informe usuario e nome.');
  }

  const index = users.findIndex((user) => user.username === username);
  const existing = index >= 0 ? users[index] : null;
  const nextUser = {
    ...(existing || {}),
    username,
    name,
    role,
    active: userData.active !== false,
  };

  if (userData.password) {
    Object.assign(nextUser, createPasswordFields(userData.password));
  } else if (!existing) {
    throw new Error('Informe uma senha/PIN para novo usuario.');
  }

  if (index >= 0) {
    users[index] = nextUser;
  } else {
    users.push(nextUser);
  }

  saveAppConfig({
    ...config,
    auth: {
      ...config.auth,
      users,
    },
  });

  return publicUser(nextUser);
}

function deactivateUser(username) {
  const config = loadAppConfig();
  const users = [...(config.auth.users || [])];
  const index = users.findIndex((user) => user.username === username);
  if (index < 0) {
    return { deleted: false };
  }

  const activeOwners = users.filter((user) => user.active !== false && user.role === 'owner' && user.username !== username);
  if (users[index].role === 'owner' && activeOwners.length === 0) {
    throw new Error('Nao e permitido desativar o ultimo administrador.');
  }

  users[index] = { ...users[index], active: false };
  saveAppConfig({
    ...config,
    auth: {
      ...config.auth,
      users,
    },
  });

  return { deleted: true };
}

function logout() {
  session = null;
  return { authenticated: false };
}

function status() {
  const active = getSession();
  return {
    authenticated: Boolean(active),
    user: active ? publicUser(active) : null,
    expiresAt: active ? active.expiresAt : null,
  };
}

function requireRole(role) {
  const active = getSession();
  if (!active || active.role !== role) {
    const err = new Error('Acesso restrito.');
    err.code = 'ACCESS_REQUIRED';
    throw err;
  }
}

function requireAuthenticated() {
  const active = getSession();
  if (!active) {
    const err = new Error('Login necessario.');
    err.code = 'LOGIN_REQUIRED';
    throw err;
  }

  return publicUser(active);
}

module.exports = {
  login,
  logout,
  listUsers,
  requireAuthenticated,
  requireRole,
  saveUser,
  deactivateUser,
  status,
};
