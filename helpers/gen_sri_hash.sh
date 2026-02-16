#!/usr/bin/env bash

BASEDIR=$(dirname "$0")

cd "$BASEDIR" || exit 1
cd ..

if ! command -v openssl &>/dev/null ; then
    echo "openssl not found" ; exit 1
fi

HASH=$(cat public/app.js | openssl dgst -sha384 -binary | openssl base64 -A)
echo "app.js: sha384-${HASH}"
echo "<script src=\"/app.js\" integrity=\"sha384-${HASH}\" crossorigin=\"anonymous\"></script>"
sed -i "s|\/app.js\"\ integrity=\".*\"|\/app.js\"\ integrity=\"sha384-${HASH}\"|g;" public/index.html
