#!/usr/bin/env bash

BASEDIR=$(dirname "$0")

if [ ! -d "$BASEDIR" ]; then
    echo "ERROR: $BASEDIR not found"
    exit 1
else
    cd "$BASEDIR"
    npm start
fi
