/* MetaCubeX -> Quantumult X resource parser (geosite/geoip .list/.yaml only).
 * QX globals: $resource {type,link,content} and $done({content}|{error}).
 * Set force-policy on each [filter_remote] item; "proxy" below is a fallback.
 * No network calls, no external dependencies, and no host-wildcard generation.
 */
(function () {
  'use strict';

  function validDomain(domain) {
    if (!domain || domain.length > 253 || domain.charAt(domain.length - 1) === '.') return false;
    var labels = domain.split('.');
    var label = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/i;
    for (var i = 0; i < labels.length; i++) {
      if (!label.test(labels[i])) return false;
    }
    return true;
  }

  function validIPv4(ip) {
    var parts = ip.split('.');
    if (parts.length !== 4) return false;
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(parts[i]) || Number(parts[i]) > 255) return false;
    }
    return true;
  }

  function validIPv6(ip) {
    if (!/^[0-9a-f:]+$/i.test(ip) || ip.indexOf(':') < 0 || ip.indexOf(':::') >= 0) return false;
    if ((ip.charAt(0) === ':' && ip.charAt(1) !== ':') ||
        (ip.charAt(ip.length - 1) === ':' && ip.charAt(ip.length - 2) !== ':')) return false;
    var compressed = ip.indexOf('::') >= 0;
    if (compressed && ip.indexOf('::', ip.indexOf('::') + 2) >= 0) return false;
    var chunks = ip.split(':');
    var count = 0;
    for (var i = 0; i < chunks.length; i++) {
      if (!chunks[i]) continue;
      if (!/^[0-9a-f]{1,4}$/i.test(chunks[i])) return false;
      count++;
    }
    return compressed ? count < 8 : count === 8 && chunks.length === 8;
  }

  function convert(record, kind) {
    if (kind === 'geosite') {
      var isSuffix = record.indexOf('+.') === 0;
      var domain = isSuffix ? record.substring(2) : record;
      if (!validDomain(domain)) throw new Error('unsupported geosite entry: ' + record);
      return (isSuffix ? 'host-suffix,' : 'host,') + domain.toLowerCase() + ',proxy';
    }
    var cidr = /^(.+)\/(\d{1,3})$/.exec(record);
    if (!cidr) throw new Error('unsupported geoip entry: ' + record);
    var ip = cidr[1];
    var mask = Number(cidr[2]);
    if (validIPv4(ip) && mask <= 32) return 'ip-cidr,' + ip + '/' + mask + ',proxy';
    if (validIPv6(ip) && mask <= 128) return 'ip6-cidr,' + ip.toLowerCase() + '/' + mask + ',proxy';
    throw new Error('invalid CIDR entry: ' + record);
  }

  try {
    if (typeof $resource === 'undefined' || typeof $resource.content !== 'string' ||
        typeof $resource.link !== 'string') throw new Error('missing QX resource content/link');
    if ($resource.type && $resource.type !== 'filter') throw new Error('unsupported QX resource type');

    // Only published MetaCubeX meta-branch text resources are accepted.
    var url = $resource.link.split(/[?#]/)[0];
    var match = /^https:\/\/raw\.githubusercontent\.com\/MetaCubeX\/meta-rules-dat\/meta\/geo\/(geosite|geoip)\/([a-z0-9_@!+.-]+)\.(list|yaml)$/i.exec(url);
    if (!match) throw new Error('unsupported source URL; expected MetaCubeX meta/geo/*.list or *.yaml');
    var kind = match[1].toLowerCase();
    var yaml = match[3].toLowerCase() === 'yaml';
    var input = $resource.content.replace(/^\uFEFF/, '').split(/\r?\n/);
    var rows = [];
    var seen = Object.create(null);
    var header = !yaml;

    for (var i = 0; i < input.length; i++) {
      var line = input[i].trim();
      if (!line || /^#|^\/\/|^;/.test(line)) continue;
      try {
        if (yaml && !header) {
          if (line !== 'payload:') throw new Error('expected payload: header');
          header = true;
          continue;
        }
        if (yaml) {
          var item = /^-\s+(.+)$/.exec(line);
          if (!item) throw new Error('expected a YAML payload item');
          line = item[1].trim();
          // MetaCubeX emits a simple flat payload; quoted single values are okay.
          var first = line.charAt(0);
          if (first === '"' || first === "'") {
            if (line.length < 2 || line.charAt(line.length - 1) !== first)
              throw new Error('unclosed quoted item');
            line = line.substring(1, line.length - 1);
          }
        }
        var output = convert(line, kind);
        if (!seen[output]) { seen[output] = true; rows.push(output); }
      } catch (error) {
        throw new Error('line ' + (i + 1) + ': ' + error.message);
      }
    }
    if (!header) throw new Error('missing payload: header');
    if (!rows.length) throw new Error('empty rule set');
    $done({ content: rows.join('\n') });
  } catch (error) {
    $done({ error: 'MetaCubeX QX parser: ' + error.message });
  }
}());
