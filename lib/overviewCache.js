const { overviewOperation } = require('./operations');

const caches = new Map();

const getCacheKey = (installation) => installation.giid || installation.config?.alias || 'default';

const getOverview = async (installation, ttlMs) => {
  const key = getCacheKey(installation);
  const now = Date.now();
  const entry = caches.get(key);

  if (entry?.data && entry.expires > now) {
    return entry.data;
  }

  if (entry?.promise) {
    return entry.promise;
  }

  const promise = installation.client(overviewOperation)
    .then((data) => {
      caches.set(key, {
        data,
        expires: Date.now() + ttlMs,
        promise: null,
      });
      return data;
    })
    .catch((error) => {
      const current = caches.get(key);
      if (current?.promise === promise) {
        caches.delete(key);
      }
      throw error;
    });

  caches.set(key, {
    data: null,
    expires: now + ttlMs,
    promise,
  });

  return promise;
};

const clearOverviewCache = () => {
  caches.clear();
};

module.exports = {
  getOverview,
  clearOverviewCache,
  getCacheKey,
};
