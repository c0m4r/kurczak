#!/usr/bin/env bash

BASEDIR=$(dirname "$0")

cd "$BASEDIR" || exit 1
cd ..

if ! command -v docker &>/dev/null ; then
    echo "docker not found" ; exit 1
fi

docker build -t kurczak .
