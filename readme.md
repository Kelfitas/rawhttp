# RawHTTP
Takes raw request as input from stdin and executes it, printing raw response to stdout

## Install
```sh
git clone git@github.com:Kelfitas/rawhttp.git
cd rawhttp
npm i
npm link
```

## Usage
- Help: `rawhttp --help`
- Without proxy: `cat req.txt | rawhttp`
- With proxy: `cat req.txt | rawhttp --proxy 127.0.0.1:8080`