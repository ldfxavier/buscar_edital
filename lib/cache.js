// Cache simples em memória com TTL (Time To Live)

const cache = new Map();

export function get(key) {
  const cached = cache.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expiry) {
    cache.delete(key);
    return null;
  }

  return cached.value;
}

export function set(key, value, ttlSeconds) {
  const expiry = Date.now() + ttlSeconds * 1000;
  cache.set(key, { value, expiry });
}

export function clear() {
  cache.clear();
}
