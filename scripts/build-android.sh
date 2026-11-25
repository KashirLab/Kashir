#!/bin/bash
set -e

ubrn build android --config ubrn.cdk.config.yaml --and-generate --targets arm64-v8a "$@"
yarn codegen
