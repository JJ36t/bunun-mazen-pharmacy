import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the cache module — we mock the Stale-While-Revalidate extension
// by importing the class directly from MemoryCache.ts
import { cache, CacheInvalidator } from '../cache/MemoryCache';

describe('MemoryCache', () => {
  beforeEach(() => {
    cache.clear();
  });

  describe('basic set/get', () => {
    it('should store and retrieve a value', () => {
      cache.set('foo', 'bar');
      expect(cache.get('foo')).toBe('bar');
    });

    it('should return null for missing key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should store objects by value', () => {
      const obj = { a: 1, b: [2, 3] };
      cache.set('obj', obj);
      expect(cache.get('obj')).toEqual(obj);
    });

    it('should overwrite existing values', () => {
      cache.set('key', 'v1');
      cache.set('key', 'v2');
      expect(cache.get('key')).toBe('v2');
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('temp', 'value', 50); // 50ms TTL
      expect(cache.get('temp')).toBe('value');

      await new Promise(r => setTimeout(r, 60));
      expect(cache.get('temp')).toBeNull();
    });

    it('should not expire entries without TTL', () => {
      cache.set('persistent', 'value');
      expect(cache.get('persistent')).toBe('value');
    });
  });

  describe('getOrSet', () => {
    it('should call factory only on cache miss', async () => {
      const factory = vi.fn(async () => 'computed');
      const result1 = await cache.getOrSet('k1', factory);
      const result2 = await cache.getOrSet('k1', factory);

      expect(result1).toBe('computed');
      expect(result2).toBe('computed');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should call factory again after TTL expires', async () => {
      const factory = vi.fn(async () => Date.now());
      await cache.getOrSet('k2', factory, 50);
      await new Promise(r => setTimeout(r, 60));
      await cache.getOrSet('k2', factory, 50);

      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete operations', () => {
    it('should delete a single key', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.delete('a');
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBe(2);
    });

    it('should delete by prefix', () => {
      cache.set('med:1', 'a');
      cache.set('med:2', 'b');
      cache.set('inv:1', 'c');
      cache.deleteByPrefix('med:');
      expect(cache.get('med:1')).toBeNull();
      expect(cache.get('med:2')).toBeNull();
      expect(cache.get('inv:1')).toBe('c');
    });

    it('should clear all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
    });
  });
});

describe('CacheInvalidator', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should invalidate medicines cache', () => {
    cache.set('medicines:all', []);
    cache.set('medicines:top', []);
    CacheInvalidator.invalidateMedicines();
    expect(cache.get('medicines:all')).toBeNull();
    expect(cache.get('medicines:top')).toBeNull();
  });

  it('should invalidate accounting cache', () => {
    cache.set('accounting:summary', {});
    CacheInvalidator.invalidateAccounting();
    expect(cache.get('accounting:summary')).toBeNull();
  });

  it('should invalidate all cache', () => {
    cache.set('medicines:all', []);
    cache.set('accounting:summary', {});
    cache.set('dashboard:stats', {});
    CacheInvalidator.invalidateAll();
    expect(cache.get('medicines:all')).toBeNull();
    expect(cache.get('accounting:summary')).toBeNull();
    expect(cache.get('dashboard:stats')).toBeNull();
  });
});
