#!/usr/bin/env bash

BASEDIR=$(dirname "$0")

if [ ! -d "$BASEDIR" ]; then
    echo "ERROR: $BASEDIR not found"
    exit 1
elif [ ! -f "$BASEDIR/package.json" ]; then
    echo "ERROR: $BASEDIR/package.json not found"
    exit 1
elif [ ! -f "$BASEDIR/server.js" ]; then
    echo "ERROR: $BASEDIR/server.js not found"
    exit 1
else
    cd "$BASEDIR"
    npm start
fi
