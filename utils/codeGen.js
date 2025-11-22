// utils/codeGen.js
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// generate a random code and check availability via `checkFn` callback (async)
async function generateCode(length = 6, checkFn = async () => true, maxAttempts = 1000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let c = '';
    for (let i = 0; i < length; i++) c += CHARS[Math.floor(Math.random() * CHARS.length)];
    const ok = await checkFn(c);
    if (ok) return c;
  }
  throw new Error('Failed to generate unique code');
}

module.exports = { generateCode };
