import { isIP } from 'node:net';
import * as dns from 'node:dns/promises';
import * as ipaddr from 'ipaddr.js';

export async function validateDestination(raw: string): Promise<string> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Must be a valid HTTP or HTTPS URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP(S) URLs without credentials are allowed');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Private destinations are not allowed');
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try { addresses = (await dns.lookup(host, { all: true, verbatim: true })).map(a => a.address); }
    catch { throw new Error('Destination hostname could not be resolved'); }
  }
  if (!addresses.length || addresses.some(address => {
    try { return ipaddr.parse(address).range() !== 'unicast'; } catch { return true; }
  })) throw new Error('Private or reserved destinations are not allowed');
  return url.toString();
}
