#!/usr/bin/env node

import yargs from 'yargs';
import readline from 'readline';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import {
    log,
    makeHttpProxyRequest,
    parseRequest,
} from './utils.js';

const argv = yargs(hideBin(process.argv))
    .option('proxy', {
        describe: 'Http proxy to use',
        type: 'string',
        default: ':'
    })
    .option('timeout', {
        describe: 'Connection timeout in milliseconds',
        type: 'number',
        default: 5000
    })
    .option('outFile', {
        describe: 'Output file for response',
        type: 'string',
        default: null
    })
    .option('fix', {
        describe: 'Whether to fix the HTTP request',
        type: 'boolean',
        default: true
    })
    .option('tls', {
        describe: 'Whether to make a TLS connection',
        type: 'boolean',
        default: true
    })
    .option('port', {
        describe: 'Whether to use a custom target port',
        type: 'number',
        default: null
    })
    .option('debug', {
        describe: 'Whether to print debug logs',
        type: 'boolean',
        default: false
    })
    .argv;
const outFile = argv.outFile;
const proxy = argv.proxy;
const [proxyHost, proxyPort] = proxy.split(':');
const timeout = argv.timeout;
const fixRequest = argv.fix;
const useTls = argv.tls;
const port = argv.port;
const debug = argv.debug;
global.debug = debug;

// Read STDIN
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  

// Output file
let fileStream;
if (outFile) {
    fileStream = fs.createWriteStream(outFile, { flags: 'w' });
    fileStream.on('error', (err) => {
        log('An error occurred:', err);
    });
}

const lines = [];
rl.on('line', (line) => {
    lines.push(line);
});
rl.on('close', () => {
    const rawRequest = lines.join('\r\n');
    const request = parseRequest(rawRequest);

    // Port selection priority
    // 1. Custom set port via argv
    // 2. Infer port from host header
    // 3. Default to default http ports
    let targetHost = request.hostHeader;
    let targetPort = useTls ? 443 : 80;
    if (port) targetPort = port;
    else if (request.hostHeader.indexOf(':') !== -1) {
        const [host, port] = request.hostHeader.split(':', 2);
        targetHost = host;
        targetPort = parseInt(port) || targetPort;
    }

    log(request);
    log({fixRequest});
    log({targetPort});
    makeHttpProxyRequest({
        targetHost,
        targetPort,
        proxyHost,
        proxyPort,
        rawRequest: fixRequest ? request.fixedRawRequest : rawRequest,
        fileStream,
        useTls,
        timeout,
    })
        .then(data => {
            log('');
            log('===== Received =====');
            log('');
            console.log(data);
        })
        .catch(err => {
            log('');
            log('===== ERROR =====');
            log('');
            console.error(err);
        });
});
