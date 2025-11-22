// utils/checkReachable.js
const dns = require('dns').promises;

// Prefer global fetch (Node 18+). Fallback to node-fetch if available.
let fetchImpl;
if (typeof globalThis !== 'undefined' && globalThis.fetch) {
  fetchImpl = globalThis.fetch.bind(globalThis);
} else {
  try {
    // node-fetch v2 is CommonJS compatible
    fetchImpl = require('node-fetch');
  } catch (e) {
    // If fetch isn't available, we'll surface a clear error when httpCheck is called.
    fetchImpl = null;
  }
}

// Utility to identify private/local IPs
function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '::1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const n = parseInt(ip.split('.')[1], 10);
    if (!Number.isNaN(n) && n >= 16 && n <= 31) return true;
  }
  return false;
}

async function dnsResolveAll(hostname) {
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.map(a => a.address);
  } catch (err) {
    throw new Error('DNS lookup failed');
  }
}

async function httpCheck(url, timeoutMs = 3000) {
  if (!fetchImpl) {
    throw new Error('No fetch implementation available (install node-fetch or use Node 18+)');
  }

  // Use AbortController if available (global or from node-fetch)
  const AbortControllerGlobal = globalThis.AbortController || (fetchImpl && fetchImpl.AbortController) || null;

  if (AbortControllerGlobal) {
    const ac = new AbortControllerGlobal();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      // HEAD first (faster, lighter). Many servers support HEAD.
      let res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: ac.signal });
      clearTimeout(t);
      if (res && (res.status >= 200 && res.status < 400)) return true;

      // Fallback to GET if HEAD not allowed
      const ac2 = new AbortControllerGlobal();
      const t2 = setTimeout(() => ac2.abort(), timeoutMs);
      res = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: ac2.signal });
      clearTimeout(t2);
      return res && (res.status >= 200 && res.status < 400);
    } catch (err) {
      clearTimeout(t);
      throw new Error('HTTP request failed');
    }
  } else {
    // Best-effort fallback: node-fetch v2 supports timeout option
    try {
      let res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', timeout: timeoutMs });
      if (res && (res.status >= 200 && res.status < 400)) return true;
      res = await fetchImpl(url, { method: 'GET', redirect: 'follow', timeout: timeoutMs });
      return res && (res.status >= 200 && res.status < 400);
    } catch (err) {
      throw new Error('HTTP request failed');
    }
  }
}

async function checkReachable(targetUrl, opts = {}) {
  const { timeoutMs = 3000, allowPrivate = false } = opts;

  let u;
  try {
    u = new URL(targetUrl);
  } catch (e) {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('Only http/https URLs are allowed');
  }

  const addrs = await dnsResolveAll(u.hostname);
  if (!addrs || addrs.length === 0) throw new Error('No DNS address');

  for (const ip of addrs) {
    if (!allowPrivate && isPrivateIp(ip)) {
      throw new Error('Hostname resolves to private/local IP');
    }
  }

  // Perform HTTP HEAD/GET check
  await httpCheck(targetUrl, timeoutMs);
  return true;
}

module.exports = { checkReachable };
