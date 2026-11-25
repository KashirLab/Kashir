#!/bin/bash
set -e

ubrn build android --config ubrn.cdk.config.yaml --and-generate --targets arm64-v8a "$@"

# The generated Gradle file always declares consumer rules. UniFFI only
# generates the rules file for native bindings.
if [[ ! -f android/proguard-rules.pro ]]; then
    touch android/proguard-rules.pro
fi

yarn codegen
