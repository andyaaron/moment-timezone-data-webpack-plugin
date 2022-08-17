const crypto = require('crypto');
const findCacheDir = require('find-cache-dir');
const fs = require('fs');
const mkdir = require('make-dir');
const os = require('os');
const path = require('path');

const pluginName = 'moment-timezone-data-webpack-plugin';

// https://github.com/benjamingr/RegExp.escape/blob/master/polyfill.js
if (!RegExp.escape) {
  RegExp.escape = function (s) {
    return String(s).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
  };
}

/**
 * A rough equivalent of Array.prototype.flatMap, which is Node >= 11 only.
 * This isn't a spec-compliant polyfill, just a small helper for my specific use cases.
 */
function flatMap(arr, mapper) {
  if (typeof arr.flatMap === 'function') {
    return arr.flatMap(mapper);
  }
  let ret = [];
  arr.forEach((...args) => {
    let result = mapper.call(this, ...args);
    if (Array.isArray(result)) {
      for (let thing of result) {
        ret.push(thing);
      }
    } else {
      ret.push(result);
    }
  });
  return ret;
}

/**
 * Get all unique values in an array or string.
 * unique([1, 2, 3, 1, 5, 2, 4]) -> [1, 2, 3, 5, 4]
 * unique('this is a string') -> ['t', 'h', 'i', 's', ' ', 'a', 'r', 'n', 'g']
 */
function unique(items) {
  if (!Array.isArray(items) && typeof items !== 'string') {
    return [];
  }
  return Array.from(new Set(items));
}

/**
 * Create regexps for matching zone names.
 * Returns an array of regexps matching the values of `matchZones` or `matchCountries`:
 * - createMatchers(undefined) => [/.?/]
 * - createMatchers(string) => [RegExpToMatchString]
 * - createMatchers(RegExp) => [RegExp]
 * - createMatchers([RegExp, RegExp, ...]) => [RegExp, RegExp, ...]
 * - createMatchers([string, string, ...]) => [RegExpMatchingAllStrings]
 */
function createMatchers(matchItems) {
  if (!matchItems) {
    // For invalid input, return a RegExp that matches anything
    return [/.?/];
  }
  const exactRegExp = (pattern) => new RegExp('^(?:' + pattern + ')$');
  const arrayRegExp = (arr) => exactRegExp(
    arr.map(value =>
      RegExp.escape(value.toString())
    ).join('|')
  );

  if (matchItems instanceof RegExp) {
    return [matchItems];
  }
  if (Array.isArray(matchItems)) {
    const hasRegExp = matchItems.some(mz => mz instanceof RegExp);
    // Quick shortcut — combine array of strings into a single regexp
    if (!hasRegExp) {
      return [arrayRegExp(matchItems)];
    }
    // Find all string values and combine them
    let ret = [];
    let strings = [];
    matchItems.forEach(mz => {
      (mz instanceof RegExp ? ret : strings).push(mz);
    });
    if (strings.length) {
      ret.push(arrayRegExp(strings));
    }
    return ret;
  }
  return [exactRegExp(RegExp.escape(matchItems.toString()))];
}

/**
 * Return `true` if `item` matches any of the RegExps in an array of matchers.
 * If optional `extraMatchers` array is provided, `item` must match BOTH sets of matchers.
 * If either array is empty, it's counted as matching everything.
 */
function anyMatch(item, regExpMatchers, extraMatchers) {
  if (extraMatchers !== undefined) {
    return (
      anyMatch(item, regExpMatchers) &&
      anyMatch(item, extraMatchers)
    );
  }
  if (!regExpMatchers || !regExpMatchers.length) {
    return true;
  }
  return regExpMatchers.some(matcher => matcher.test(item));
}

function cacheKey(tzdata, config) {
  return JSON.stringify({
    version: tzdata.version,
    zones: String(config.matchZones),
    countries: String(config.matchCountries),
    dates: [config.startYear, config.endYear],
  });
}

const autoGeneratedCacheDir = (function () {
  let cacheDirPath;

  return function () {
    if (!cacheDirPath) {
      try {
        cacheDirPath = findCacheDir({ name: pluginName, create: true });
      } catch (e) {
        cacheDirPath = path.join(os.tmpdir(), pluginName);
      }
    }
    mkdir.sync(cacheDirPath);
    return cacheDirPath;
  };
})();

function cacheDir(cacheDirPath) {
  if (cacheDirPath) {
    mkdir.sync(cacheDirPath);
    return cacheDirPath;
  }

  return autoGeneratedCacheDir();
}

function cacheFile(tzdata, config, cacheDirPath) {
  const key = cacheKey(tzdata, config);
  const filename = crypto.createHash('md5')
    .update(key)
    .digest('hex') + '.json';
  const filepath = path.join(cacheDir(cacheDirPath), filename);
  return {
    path: filepath,
    exists: fs.existsSync(filepath),
  };
}

module.exports = {
  pluginName,
  flatMap,
  unique,
  createMatchers,
  anyMatch,
  cacheDir,
  cacheFile,
};
