/* MetaCubeX text rules -> Quantumult X filter resource.
 * API: https://github.com/crossutility/Quantumult-X/blob/master/resource-parser.js
 * Input: $resource.link, $resource.content (UTF-8 string).
 * Output: $done({content: string}) or $done({error: string}).
 * Use force-policy in [filter_remote] to replace the fallback "proxy" policy.
 */

function qxDomainValid(domain) {
  if (!domain || domain.length > 253 || domain.charAt(domain.length - 1) === '.') return false;
  var parts = domain.split('.');
  var partPattern = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/i;
  for (var i = 0; i < parts.length; i++) {
    if (!partPattern.test(parts[i])) return false;
  }
  return true;
}

function qxIPv4Valid(address) {
  var parts = address.split('.');
  if (parts.length !== 4) return false;
  for (var i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i]) || Number(parts[i]) > 255) return false;
  }
  return true;
}

function qxIPv6Valid(address) {
  if (!/^[0-9a-f:]+$/i.test(address) || address.indexOf(':') < 0 || address.indexOf(':::') >= 0) return false;
  if ((address.charAt(0) === ':' && address.charAt(1) !== ':') ||
      (address.charAt(address.length - 1) === ':' && address.charAt(address.length - 2) !== ':')) return false;
  var compressed = address.indexOf('::') >= 0;
  if (compressed && address.indexOf('::', address.indexOf('::') + 2) >= 0) return false;
  var chunks = address.split(':');
  var count = 0;
  for (var i = 0; i < chunks.length; i++) {
    if (!chunks[i]) continue;
    if (!/^[0-9a-f]{1,4}$/i.test(chunks[i])) return false;
    count++;
  }
  return compressed ? count < 8 : count === 8 && chunks.length === 8;
}

function qxConvertLine(line, kind) {
  if (kind === 'geosite') {
    var suffix = line.indexOf('+.') === 0;
    var domain = suffix ? line.substring(2) : line;
    if (!qxDomainValid(domain)) throw new Error('unsupported geosite entry: ' + line);
    return (suffix ? 'host-suffix, ' : 'host, ') + domain.toLowerCase() + ', proxy';
  }
  var match = /^(.+)\/(\d{1,3})$/.exec(line);
  if (!match) throw new Error('invalid geoip entry: ' + line);
  var ip = match[1];
  var mask = Number(match[2]);
  if (qxIPv4Valid(ip) && mask <= 32) return 'ip-cidr, ' + ip + '/' + mask + ', proxy';
  if (qxIPv6Valid(ip) && mask <= 128) return 'ip6-cidr, ' + ip.toLowerCase() + '/' + mask + ', proxy';
  throw new Error('invalid CIDR: ' + line);
}

function qxParseResource(resource) {
  if (!resource || typeof resource.link !== 'string' || typeof resource.content !== 'string') {
    throw new Error('missing resource link or content');
  }
  var url = resource.link.split(/[?#]/)[0];
  var match = /^https:\/\/raw\.githubusercontent\.com\/MetaCubeX\/meta-rules-dat\/meta\/geo\/(geosite|geoip)\/([a-z0-9_@!+.-]+)\.(list|yaml)$/i.exec(url);
  if (!match) throw new Error('only MetaCubeX meta/geo geosite/geoip .list/.yaml URLs are supported');
  var kind = match[1].toLowerCase();
  var isYaml = match[3].toLowerCase() === 'yaml';
  var lines = resource.content.replace(/^\uFEFF/, '').split(/\r?\n/);
  var foundPayload = !isYaml;
  var output = [];
  var seen = Object.create(null);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || /^(#|\/\/|;)/.test(line)) continue;
    if (isYaml && !foundPayload) {
      if (line !== 'payload:') throw new Error('line ' + (i + 1) + ': expected payload:');
      foundPayload = true;
      continue;
    }
    if (isYaml) {
      var entry = /^-\s+(.+)$/.exec(line);
      if (!entry) throw new Error('line ' + (i + 1) + ': expected YAML payload item');
      line = entry[1].trim();
      var quote = line.charAt(0);
      if (quote === '"' || quote === "'") {
        if (line.length < 2 || line.charAt(line.length - 1) !== quote) {
          throw new Error('line ' + (i + 1) + ': unclosed quoted item');
        }
        line = line.substring(1, line.length - 1);
      }
    }
    var converted;
    try { converted = qxConvertLine(line, kind); }
    catch (e) { throw new Error('line ' + (i + 1) + ': ' + e.message); }
    if (!seen[converted]) {
      seen[converted] = true;
      output.push(converted);
    }
  }
  if (!foundPayload) throw new Error('missing YAML payload:');
  if (!output.length) throw new Error('empty rule set');
  return output.join('\n');
}

var qxResult;
try {
  qxResult = {content: qxParseResource(typeof $resource === 'undefined' ? null : $resource)};
} catch (e) {
  qxResult = {error: 'MetaCubeX QX parser: ' + e.message};
}
$done(qxResult);
