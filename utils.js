import tls from 'tls';
import net from 'net';

export async function writeData(stream, data) {
    if (!stream) return;
    return new Promise((resolve, reject) => {
        if (!stream.write(data)) {
            stream.once('drain', resolve);
        } else {
            process.nextTick(resolve);
        }
    });
}

export const log =(...args) => global.debug && console.error(...args);

export function makeHttpProxyRequest(opts) {
    const { targetHost, targetPort, proxyHost, proxyPort, rawRequest, fileStream, useTls, timeout = 500 } = opts;
    return new Promise((resolve, reject) => {
        const options = {
            host: targetHost,
            port: parseInt(targetPort, 10),
            servername: targetHost,
            rejectUnauthorized: false // Allow self-signed certificates
        };
        if (proxyHost) {
            options.host = proxyHost;
            options.port = parseInt(proxyPort, 10);
        }

        const tcpSocket = new net.Socket();
        let socket = tcpSocket;
        if (useTls) {
            socket = tls.connect({...options, tcpSocket}, async () => {
                const cert = socket.getPeerCertificate();
                const valid = socket.authorized || false;
                const certInfo = `subject: O=${cert.subject.O}; ` +
                `OU=${cert.subject.OU}; ` +
                `CN=${cert.subject.CN}; ` +
                `ALT=${cert.subjectaltname}; ` +
                `issuer: C=${cert.issuer.C}; ` +
                `O=${cert.issuer.O}; ` +
                `OU=${cert.issuer.OU}; `;
                log(`Connected to ${options.host}, cert status: ${valid ? 'valid' : 'invalid'}, cert info - ${certInfo}`);
                onSocketConnect(socket);
            });
        } else {
            socket.connect(options.port, options.host, () => {
                onSocketConnect(socket);
            });
        }

        let rawResponse = '';
        const onSocketConnect = (socket) => {
            // Construct the HTTP request for the target server
            log('');
            log('===== Sent =====');
            log('');
            log(rawRequest);
            socket.write(rawRequest);

            let contentLength = -1;
            let parsedResponse = {};
            socket.on('data', async (data) => {
                log('Received: \n' + data);
                if (parsedResponse.transferEncoding === 'chunked') {
                    const matches = '(\d+)\r\n'.match(data);
                    // 7\r\n
                    // Mozilla\r\n
                    // 11\r\n
                    // Developer Network\r\n
                    // 0\r\n
                    // \r\n
                    if (matches.length > 1) {
                        contentLength = parseInt(matches[1]);
                    }
                } else if (parsedResponse.contentLength && parseInt(parsedResponse.contentLength) > 0) {
                    contentLength = parseInt(parsedResponse.contentLength);
                }

                rawResponse += data;
                await writeData(fileStream, data);
                
                parsedResponse = parseResponse(rawResponse);
                log(`${parsedResponse.body.length} === ${contentLength}`);
                if (contentLength === 0 || parsedResponse.body.length === contentLength) {
                    socket.destroy();
                    resolve(rawResponse);
                }
            });
        }
    
        socket.setEncoding('utf8');

        socket.on('error', (err) => {
            log('error', err);
            socket.destroy();
            reject(err);
        });

        socket.on('close', () => {
            log('Connection closed');
            socket.destroy();
            resolve(rawResponse);
        });
        
        socket.setTimeout(timeout, () => {
            socket.destroy();
            reject('Timeout');
        });
    });
}

export function parseRequest(rawRequest) {
    const splitToken = '\r\n';
    let fixedRawRequest = rawRequest;
    if (rawRequest.indexOf(splitToken) === -1) {
        fixedRawRequest = rawRequest.replace(/\n/g, '\r\n');
    }

    // Add missing CRLF
    while(fixedRawRequest.indexOf('\r\n\r\n') === -1) {
        fixedRawRequest += '\r\n';
    }
    log({fixedRawRequest});

    const [rawHeaders, rawBody] = fixedRawRequest.split('\r\n\r\n');
    const headerLines = rawHeaders.split(splitToken);
    const requestLine = headerLines.splice(0, 1)[0];
    const [method, path, proto] = requestLine.split(' ');
    const headers = {};
    let hostHeader = '';
    for (let i = 0; i < headerLines.length; i++) {
        let [key, value] = headerLines[i].split(': ', 2);
        key = key.trim().toLowerCase();
        value = value.trim();
        if (key === 'host') {
            hostHeader = value;
        }
        headers[key] = value;
    }

    return {
        hostHeader,
        headers,
        headerLines,
        requestLine,
        method, path, proto,
        fixedRawRequest,
        body: rawBody,
    }
}

export function parseResponse(rawResponse) {
    const [rawHeaders, rawBody] = rawResponse.split('\r\n\r\n');
    const headerLines = rawHeaders.split('\r\n');
    const statusLine = headerLines.splice(0, 1)[0];
    const [proto, statusCode, statusText] = statusLine.split(' ', 3);
    const headers = {};
    let contentLength = '';
    let transferEncoding = '';
    for (let i = 0; i < headerLines.length; i++) {
        let [key, value] = headerLines[i].split(': ', 2);
        key = key.trim().toLowerCase();
        value = value.trim();
        if (key === 'content-length') {
            contentLength = value;
        } else if (key === 'transfer-encoding') {
            transferEncoding = value;
        }
        headers[key] = value;
    }

    return {
        contentLength,
        transferEncoding,
        headers,
        headerLines,
        statusLine,
        statusCode, statusText, proto,
        body: rawBody + '',
    }
}